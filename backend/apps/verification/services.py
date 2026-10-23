"""
Verification Engine and State Machine Service for CampusVote.
Smart ID-Based College Voting System with Real-Time Voter Monitoring.
Coordinates College ID lookup, cryptographically secure OTP generation,
constant-time validation, rate-limiting, audit logging, and session authentication.
"""

import secrets
import logging
from typing import Tuple, Dict, Any, Optional
from datetime import timedelta
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import login

from apps.accounts.models import User, Role, AccountStatus
from apps.accounts.serializers import UserSummarySerializer
from apps.students.models import Student, EnrollmentStatus
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.verification.models import (
    VerificationSession,
    VerificationState,
    VerificationChannel,
    mask_destination
)
from apps.verification.providers import (
    get_delivery_provider,
    EmailConfigurationError,
    EmailDeliveryError,
    is_email_configured
)
from apps.verification.qr_service import parse_and_validate_qr_payload, lookup_student_for_qr

logger = logging.getLogger(__name__)


def generate_secure_numeric_otp(length: int = 6) -> str:
    """Generates an unguessable numeric OTP using cryptographically secure PRNG."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


class VerificationService:
    """
    Orchestrates the entire student identification and verification lifecycle.
    """

    @classmethod
    def start_verification(
        cls,
        college_id: str,
        channel: str = 'EMAIL',
        ip_address: Optional[str] = None,
        user_agent: str = '',
        request=None
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Initiates a verification challenge for a submitted College ID.
        Normalizes input, validates student active status, generates OTP,
        and dispatches challenge via configured delivery provider.
        """
        raw_id = college_id.strip()
        student = None

        if '@' in raw_id:
            email_val = raw_id.lower()
            student = Student.objects.filter(email__iexact=email_val).first()
            if not student:
                student = Student.objects.filter(user__email__iexact=email_val).first()
            if not student:
                prefix = raw_id.split('@')[0].strip().upper()
                student = Student.objects.filter(college_id__iexact=prefix).first()
        else:
            student = Student.objects.filter(college_id__iexact=raw_id.upper()).first()

        if student:
            normalized_id = student.college_id
        else:
            normalized_id = raw_id.upper()

        # Account enumeration defense:
        # In strict production mode, if student doesn't exist, log audit failure and return generic message
        generic_errors = getattr(settings, 'VERIFICATION_GENERIC_ERRORS', not settings.DEBUG)

        if not student:
            # Check if this identifier belongs to a registered Election Administrator or Staff account
            admin_user = None
            if '@' in raw_id:
                admin_user = User.objects.filter(email__iexact=raw_id.lower()).exclude(role=Role.STUDENT).first()
            else:
                admin_user = User.objects.filter(username__iexact=raw_id).exclude(role=Role.STUDENT).first()
                if not admin_user:
                    admin_user = User.objects.filter(college_id__iexact=raw_id.upper()).exclude(role=Role.STUDENT).first()

            if admin_user:
                log_audit_event(
                    action=AuditAction.VERIFICATION_STARTED,
                    target_type='USER',
                    target_id=str(admin_user.id),
                    metadata={'status': 'REDIRECT_ADMIN', 'username': admin_user.username, 'role': admin_user.role},
                    request=request
                )
                college_title = getattr(admin_user.institution, 'name', 'CampusVote')
                return False, {
                    'code': 'ADMIN_ACCOUNT_DETECTED',
                    'role': admin_user.role,
                    'identifier': admin_user.username,
                    'email': admin_user.email,
                    'college_name': college_title
                }, (
                    f"Account '{admin_user.username}' is registered as a College Election Administrator "
                    f"({college_title}). Please sign in with your administrator password under the 'Staff & Admin' tab."
                )

            log_audit_event(
                action=AuditAction.VERIFICATION_STARTED,
                target_type='STUDENT',
                target_id=normalized_id,
                metadata={'status': 'FAILED', 'reason': 'STUDENT_NOT_FOUND', 'channel': channel},
                request=request
            )
            if generic_errors:
                return True, {
                    'message': 'If this College ID is registered and active, a verification code has been dispatched.',
                    'state': VerificationState.ID_SUBMITTED,
                    'destination_masked': '***@institution.edu'
                }, ""
            return False, {'code': 'STUDENT_NOT_FOUND'}, f"No student registry record found for '{raw_id}'. If you are a new student, please complete registration first."

        # Check student active status
        if not student.is_active:
            log_audit_event(
                action=AuditAction.VERIFICATION_STARTED,
                target_type='STUDENT',
                target_id=normalized_id,
                metadata={'status': 'FAILED', 'reason': 'STUDENT_INACTIVE'},
                request=request
            )
            return False, {}, "This student record is administratively deactivated. Please contact the registrar."

        # Check enrollment status
        if student.enrollment_status in (EnrollmentStatus.SUSPENDED, EnrollmentStatus.WITHDRAWN):
            log_audit_event(
                action=AuditAction.VERIFICATION_STARTED,
                target_type='STUDENT',
                target_id=normalized_id,
                metadata={'status': 'FAILED', 'reason': f"ENROLLMENT_{student.enrollment_status}"},
                request=request
            )
            return False, {}, (
                f"Student academic status is '{student.get_enrollment_status_display()}'. "
                f"Active enrollment is required for voting portal access."
            )

        # Check for existing active or locked session
        existing_session = VerificationSession.objects.filter(
            college_id=normalized_id,
            state__in=[VerificationState.OTP_PENDING, VerificationState.LOCKED]
        ).order_by('-created_at').first()

        if existing_session and existing_session.is_locked():
            log_audit_event(
                action=AuditAction.VERIFICATION_LOCKED,
                target_type='VERIFICATION_SESSION',
                target_id=str(existing_session.id),
                metadata={'college_id': normalized_id},
                request=request
            )
            lockout_mins = max(1, int((existing_session.locked_until - timezone.now()).total_seconds() / 60))
            return False, {
                'session_id': str(existing_session.id),
                'state': VerificationState.LOCKED,
            }, f"Verification attempts exceeded. Locked for {lockout_mins} minute(s)."

        # Determine trusted destination
        trusted_destination = student.email
        if not trusted_destination:
            return False, {}, "No registered email address on file for this student record."

        masked_dest = mask_destination(trusted_destination, channel='EMAIL')

        # Configuration constants
        otp_length = getattr(settings, 'VERIFICATION_OTP_LENGTH', 6)
        expiry_seconds = getattr(settings, 'VERIFICATION_OTP_EXPIRY_SECONDS', 300)
        cooldown_seconds = getattr(settings, 'VERIFICATION_RESEND_COOLDOWN_SECONDS', 60)

        # Generate cryptographic OTP
        otp_code = generate_secure_numeric_otp(otp_length)

        # Create or update session inside transaction
        with transaction.atomic():
            session = VerificationSession.objects.create(
                college_id=normalized_id,
                student=student,
                channel=VerificationChannel.EMAIL,
                destination_masked=masked_dest,
                ip_address=ip_address,
                user_agent=user_agent[:255] if user_agent else '',
            )
            session.set_otp(otp_code, expiry_seconds=expiry_seconds, cooldown_seconds=cooldown_seconds)
            session.save()

        # Dispatch OTP via provider
        delivery_ok = False
        try:
            provider = get_delivery_provider(channel='EMAIL')
            delivery_ok = provider.send_otp(
                destination=trusted_destination,
                otp=otp_code,
                student_name=student.full_name
            )
        except EmailConfigurationError as exc:
            log_audit_event(
                action=AuditAction.OTP_DELIVERY_FAILED,
                target_type='VERIFICATION_SESSION',
                target_id=str(session.id),
                metadata={'college_id': normalized_id, 'destination_masked': masked_dest, 'reason': 'PROVIDER_NOT_CONFIGURED'},
                request=request
            )
            session.state = VerificationState.FAILED
            session.save(update_fields=['state', 'updated_at'])
            return False, {
                'code': 'DELIVERY_PROVIDER_NOT_CONFIGURED',
                'channel': channel,
                'destination_masked': masked_dest,
            }, (
                "Unable to deliver verification code. The institutional email delivery service is currently "
                "not configured on the server. Please contact your college election administrator."
            )
        except (EmailDeliveryError, Exception) as exc:
            logger.exception("Verification delivery provider encountered an unhandled exception")
            delivery_ok = False

        if not delivery_ok:
            log_audit_event(
                action=AuditAction.OTP_DELIVERY_FAILED,
                target_type='VERIFICATION_SESSION',
                target_id=str(session.id),
                metadata={'college_id': normalized_id, 'destination_masked': masked_dest, 'reason': 'DELIVERY_FAILED'},
                request=request
            )
            session.state = VerificationState.FAILED
            session.save(update_fields=['state', 'updated_at'])
            return False, {
                'code': 'DELIVERY_PROVIDER_UNAVAILABLE',
                'channel': channel,
                'destination_masked': masked_dest,
            }, (
                "Unable to deliver verification code. The institutional email delivery service is currently "
                "not configured or unreachable. Please contact your college election administrator."
            )

        # Audit success
        log_audit_event(
            action=AuditAction.OTP_CHALLENGE_ISSUED,
            target_type='VERIFICATION_SESSION',
            target_id=str(session.id),
            metadata={
                'college_id': normalized_id,
                'channel': 'EMAIL',
                'destination_masked': masked_dest,
                'expires_in_seconds': expiry_seconds,
            },
            request=request
        )

        response_data = {
            'session_id': str(session.id),
            'college_id': normalized_id,
            'state': session.state,
            'channel': session.channel,
            'destination_masked': masked_dest,
            'expires_in_seconds': expiry_seconds,
            'resend_cooldown_seconds': cooldown_seconds,
            'message': f"Verification code sent to {masked_dest}."
        }

        # Development helper: if DEBUG and explicitly enabled, surface _dev_otp for testing
        if settings.DEBUG and getattr(settings, 'ENABLE_DEV_OTP_INSPECTION', True):
            response_data['_dev_otp'] = otp_code

        return True, response_data, ""

    @classmethod
    def verify_otp(
        cls,
        session_id: str,
        candidate_otp: str,
        request=None
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Validates the candidate OTP in constant time.
        Upon success, transitions state to VERIFIED and establishes authenticated session.
        """
        if not session_id:
            return False, {}, "Session ID is required."
        if not candidate_otp or not candidate_otp.strip():
            return False, {}, "Verification code is required."

        cleaned_otp = candidate_otp.strip()

        with transaction.atomic():
            session = VerificationSession.objects.select_for_update().filter(id=session_id).first()
            if not session:
                return False, {}, "Verification session not found or invalid."

            # Verify OTP
            is_valid, message = session.verify_otp(cleaned_otp)

            if not is_valid:
                log_audit_event(
                    action=AuditAction.OTP_FAILED,
                    target_type='VERIFICATION_SESSION',
                    target_id=str(session.id),
                    metadata={
                        'college_id': session.college_id,
                        'attempts_count': session.attempts_count,
                        'state': session.state
                    },
                    request=request
                )
                return False, {
                    'session_id': str(session.id),
                    'state': session.state,
                    'attempts_count': session.attempts_count,
                    'is_locked': session.is_locked()
                }, message

            # OTP verification succeeded!
            log_audit_event(
                action=AuditAction.OTP_VERIFIED,
                target_type='VERIFICATION_SESSION',
                target_id=str(session.id),
                metadata={'college_id': session.college_id},
                request=request
            )

            # Authenticate student account into the session
            student = session.student
            if not student:
                student = Student.objects.filter(college_id=session.college_id).first()

            if not student or not student.is_active:
                return False, {}, "Verified student record is inactive."

            # Resolve or provision User account
            user = student.user
            if not user:
                # Check if a user with this college_id or email already exists
                user = User.objects.filter(college_id=student.college_id).first()
                if not user:
                    user = User.objects.filter(email__iexact=student.email).first()

                if user:
                    # Link existing user
                    student.user = user
                    student.save(update_fields=['user', 'updated_at'])
                else:
                    # Provision new student user account
                    names = student.full_name.split()
                    first_name = names[0] if names else ''
                    last_name = ' '.join(names[1:]) if len(names) > 1 else ''
                    user = User.objects.create_user(
                        username=student.college_id.lower(),
                        email=student.email,
                        college_id=student.college_id,
                        first_name=first_name,
                        last_name=last_name,
                        role=Role.STUDENT,
                        status=AccountStatus.ACTIVE,
                        institution=student.institution,
                    )
                    student.user = user
                    student.save(update_fields=['user', 'updated_at'])

            # SECURITY GUARD: Never allow an administrative user to be logged in via student OTP
            if user.role != Role.STUDENT:
                return False, {}, (
                    "Administrative accounts cannot sign in through student OTP verification. "
                    "Please use standard administrator sign-in."
                )

            if user.status != AccountStatus.ACTIVE or not user.is_active:
                return False, {}, "User account associated with this student is deactivated."

            # Update login telemetry
            user.last_login_at = timezone.now()
            if request:
                client_ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
                if client_ip:
                    user.last_login_ip = client_ip.split(',')[0].strip()
                login(request, user)
            user.save(update_fields=['last_login_at', 'last_login_ip'])

            user_data = UserSummarySerializer(user).data

            return True, {
                'session_id': str(session.id),
                'state': VerificationState.VERIFIED,
                'user': user_data,
                'message': "Identity verified successfully. Authenticated into student portal."
            }, ""

    @classmethod
    def resend_otp(
        cls,
        session_id: str,
        request=None
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Issues a fresh replacement OTP for an active verification session,
        invalidating any previously generated code and enforcing cooldown.
        """
        if not session_id:
            return False, {}, "Session ID is required."

        with transaction.atomic():
            session = VerificationSession.objects.select_for_update().filter(id=session_id).first()
            if not session:
                return False, {}, "Verification session not found."

            can_resend, reason = session.can_resend()
            if not can_resend:
                return False, {
                    'session_id': str(session.id),
                    'state': session.state,
                    'resend_count': session.resend_count,
                    'max_resends': session.max_resends,
                }, reason

            student = session.student
            if not student or not student.is_active:
                return False, {}, "Associated student record is inactive."

            otp_length = getattr(settings, 'VERIFICATION_OTP_LENGTH', 6)
            expiry_seconds = getattr(settings, 'VERIFICATION_OTP_EXPIRY_SECONDS', 300)
            cooldown_seconds = getattr(settings, 'VERIFICATION_RESEND_COOLDOWN_SECONDS', 60)

            new_otp = generate_secure_numeric_otp(otp_length)
            session.set_otp(new_otp, expiry_seconds=expiry_seconds, cooldown_seconds=cooldown_seconds)
            session.resend_count += 1
            session.save()

        # Send OTP
        delivery_ok = False
        try:
            provider = get_delivery_provider(channel=session.channel)
            delivery_ok = provider.send_otp(
                destination=student.email,
                otp=new_otp,
                student_name=student.full_name
            )
        except Exception as exc:
            logger.exception("Verification resend provider encountered an unhandled exception")
            delivery_ok = False

        if not delivery_ok:
            log_audit_event(
                action=AuditAction.OTP_DELIVERY_FAILED,
                target_type='VERIFICATION_SESSION',
                target_id=str(session.id),
                metadata={'college_id': session.college_id, 'resend': True},
                request=request
            )
            return False, {
                'code': 'DELIVERY_PROVIDER_UNAVAILABLE',
            }, (
                "Unable to deliver verification code. The email delivery service is currently unavailable. "
                "Please try again shortly or contact your administrator."
            )

        log_audit_event(
            action=AuditAction.OTP_CHALLENGE_ISSUED,
            target_type='VERIFICATION_SESSION',
            target_id=str(session.id),
            metadata={'college_id': session.college_id, 'resend': True, 'count': session.resend_count},
            request=request
        )

        resends_remaining = max(0, session.max_resends - session.resend_count)

        response_data = {
            'session_id': str(session.id),
            'state': session.state,
            'resend_count': session.resend_count,
            'resends_remaining': resends_remaining,
            'resend_cooldown_seconds': cooldown_seconds,
            'expires_in_seconds': expiry_seconds,
            'destination_masked': session.destination_masked,
            'message': f"A new verification code has been dispatched to {session.destination_masked}."
        }

        if settings.DEBUG and getattr(settings, 'ENABLE_DEV_OTP_INSPECTION', True):
            response_data['_dev_otp'] = new_otp

        return True, response_data, ""

    @classmethod
    def validate_qr_code(
        cls,
        qr_payload: str,
        request=None
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Validates scanned QR payload content on the backend.
        Extracts College ID, validates student registry record,
        and prepares next verification step.
        """
        is_valid, college_id, message, metadata = parse_and_validate_qr_payload(qr_payload)

        if not is_valid or not college_id:
            log_audit_event(
                action=AuditAction.QR_FAILED,
                target_type='QR_SCAN',
                target_id='',
                metadata={'error': message},
                request=request
            )
            return False, {}, message

        # Look up student in registry
        student_ok, student, lookup_msg = lookup_student_for_qr(college_id)
        if not student_ok or not student:
            log_audit_event(
                action=AuditAction.QR_FAILED,
                target_type='STUDENT',
                target_id=college_id,
                metadata={'error': lookup_msg},
                request=request
            )
            return False, {}, lookup_msg

        log_audit_event(
            action=AuditAction.QR_VALIDATED,
            target_type='STUDENT',
            target_id=student.college_id,
            metadata={'format': metadata.get('format', 'unknown')},
            request=request
        )

        return True, {
            'college_id': student.college_id,
            'student_name': student.full_name,
            'department': student.department,
            'academic_year': student.academic_year,
            'course': student.course,
            'destination_masked': mask_destination(student.email, channel='EMAIL'),
            'message': "Identity card QR recognized. Please proceed to OTP delivery."
        }, ""

    @classmethod
    def get_session_status(cls, session_id: str) -> Tuple[bool, Dict[str, Any], str]:
        """Returns non-sensitive telemetry and current status for a verification session."""
        session = VerificationSession.objects.filter(id=session_id).first()
        if not session:
            return False, {}, "Verification session not found."

        now = timezone.now()
        expires_in = max(0, int((session.otp_expires_at - now).total_seconds())) if session.otp_expires_at else 0
        cooldown = max(0, int((session.resend_cooldown_until - now).total_seconds())) if session.resend_cooldown_until else 0

        return True, {
            'session_id': str(session.id),
            'college_id': session.college_id,
            'state': session.state,
            'channel': session.channel,
            'destination_masked': session.destination_masked,
            'attempts_count': session.attempts_count,
            'max_attempts': session.max_attempts,
            'resend_count': session.resend_count,
            'max_resends': session.max_resends,
            'expires_in_seconds': expires_in,
            'resend_cooldown_seconds': cooldown,
            'is_locked': session.is_locked(),
            'is_expired': session.is_expired(),
        }, ""
