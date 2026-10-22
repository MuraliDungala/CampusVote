"""
Identity Verification Models for CampusVote.
Smart ID-Based College Voting System with Real-Time Voter Monitoring.
Provides secure, single-use, salted OTP challenge tracking, lockout thresholds,
and decoupled student verification state management.
"""

import uuid
import secrets
import hmac
import hashlib
from datetime import timedelta
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from apps.students.models import Student


def mask_destination(destination: str, channel: str = 'EMAIL') -> str:
    """Masks contact target to safeguard privacy in UI and logs."""
    if not destination:
        return '***'
    if channel == 'EMAIL' or '@' in destination:
        parts = destination.split('@', 1)
        user_part = parts[0]
        domain = parts[1] if len(parts) > 1 else ''
        if len(user_part) <= 2:
            masked_user = user_part[0] + '***'
        else:
            masked_user = user_part[0] + '***' + user_part[-1]
        return f"{masked_user}@{domain}"
    else:
        # SMS format: +1234567890 -> +1 *** *** 7890
        cleaned = destination.strip()
        if len(cleaned) <= 4:
            return '***'
        return f"{cleaned[:2]} *** *** {cleaned[-4:]}"


class VerificationState(models.TextChoices):
    NOT_STARTED = 'NOT_STARTED', _('Not Started')
    ID_SUBMITTED = 'ID_SUBMITTED', _('College ID Submitted')
    OTP_PENDING = 'OTP_PENDING', _('OTP Verification Pending')
    VERIFIED = 'VERIFIED', _('Identity Verified')
    EXPIRED = 'EXPIRED', _('OTP Expired')
    LOCKED = 'LOCKED', _('Session Locked')
    FAILED = 'FAILED', _('Verification Failed')


class VerificationChannel(models.TextChoices):
    EMAIL = 'EMAIL', _('Institutional Email')
    SMS = 'SMS', _('Registered Mobile SMS')


class VerificationSession(models.Model):
    """
    Manages the lifecycle of a student identity verification challenge.
    Enforces rate-limiting, secure salted OTP storage, single-use consumption,
    attempt-based lockout, and automatic session expiry.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique identifier for verification challenge session.")
    )

    college_id = models.CharField(
        max_length=64,
        db_index=True,
        help_text=_("Normalized institutional student identifier.")
    )

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='verification_sessions',
        help_text=_("Linked student registry record if verified/found.")
    )

    state = models.CharField(
        max_length=32,
        choices=VerificationState.choices,
        default=VerificationState.NOT_STARTED,
        db_index=True,
        help_text=_("Current verification state machine status.")
    )

    channel = models.CharField(
        max_length=16,
        choices=VerificationChannel.choices,
        default=VerificationChannel.EMAIL,
        help_text=_("Delivery medium for the OTP challenge.")
    )

    destination_masked = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Masked representation of delivery target (e.g., j***e@univ.edu).")
    )

    # Secure OTP storage - NEVER store plaintext in the database!
    otp_salt = models.CharField(
        max_length=64,
        blank=True,
        help_text=_("Cryptographic random salt for OTP derivation.")
    )

    otp_hash = models.CharField(
        max_length=128,
        blank=True,
        help_text=_("Keyed HMAC-SHA256 hash of the generated OTP.")
    )

    otp_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when active OTP becomes invalid.")
    )

    resend_cooldown_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Cooldown timestamp preventing repeated OTP resend spam.")
    )

    attempts_count = models.PositiveSmallIntegerField(
        default=0,
        help_text=_("Number of incorrect validation attempts made for current challenge.")
    )

    max_attempts = models.PositiveSmallIntegerField(
        default=5,
        help_text=_("Maximum incorrect attempts permitted before lockout.")
    )

    resend_count = models.PositiveSmallIntegerField(
        default=0,
        help_text=_("Number of OTP resends requested in this session.")
    )

    max_resends = models.PositiveSmallIntegerField(
        default=3,
        help_text=_("Maximum permitted resends for this session.")
    )

    locked_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Lockout expiration timestamp if max attempts were exceeded.")
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when OTP was successfully validated.")
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text=_("Client IP initiating the verification request.")
    )

    user_agent = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Client user agent snippet.")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_verification_sessions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['college_id', 'state']),
            models.Index(fields=['created_at']),
        ]

    def is_locked(self) -> bool:
        """Checks if session is currently locked due to attempt exhaustion."""
        if self.state == VerificationState.LOCKED:
            if self.locked_until and timezone.now() < self.locked_until:
                return True
            # Lockout period has elapsed
            return False
        return False

    def is_expired(self) -> bool:
        """Checks if active OTP has passed its expiry window."""
        if not self.otp_expires_at:
            return True
        return timezone.now() > self.otp_expires_at

    def can_resend(self) -> tuple[bool, str]:
        """Validates whether an OTP resend request is permitted."""
        if self.state in (VerificationState.VERIFIED, VerificationState.LOCKED):
            return False, f"Cannot resend code for session in state '{self.state}'."
        if self.resend_count >= self.max_resends:
            return False, "Maximum OTP resend limit reached for this session."
        if self.resend_cooldown_until and timezone.now() < self.resend_cooldown_until:
            wait_seconds = max(1, int((self.resend_cooldown_until - timezone.now()).total_seconds()))
            return False, f"Please wait {wait_seconds} seconds before requesting a new code."
        return True, ""

    def set_otp(self, otp: str, expiry_seconds: int = 300, cooldown_seconds: int = 60):
        """
        Derives and stores a keyed HMAC-SHA256 hash using a cryptographic salt and SECRET_KEY.
        Never stores the raw plaintext OTP.
        """
        self.otp_salt = secrets.token_hex(16)
        secret_key = settings.SECRET_KEY.encode('utf-8')
        payload = f"{self.otp_salt}:{otp}".encode('utf-8')
        self.otp_hash = hmac.new(secret_key, payload, hashlib.sha256).hexdigest()

        now = timezone.now()
        self.otp_expires_at = now + timedelta(seconds=expiry_seconds)
        self.resend_cooldown_until = now + timedelta(seconds=cooldown_seconds)
        self.state = VerificationState.OTP_PENDING

    def verify_otp(self, candidate_otp: str) -> tuple[bool, str]:
        """
        Validates candidate OTP in constant-time.
        Updates session state and attempt counters accordingly.
        """
        now = timezone.now()

        if self.is_locked():
            lockout_mins = max(1, int((self.locked_until - now).total_seconds() / 60)) if self.locked_until else 15
            return False, f"Verification is locked. Please try again in {lockout_mins} minute(s)."

        if self.state == VerificationState.VERIFIED:
            return False, "This verification challenge has already been completed."

        if self.state not in (VerificationState.OTP_PENDING, VerificationState.ID_SUBMITTED):
            return False, f"Invalid session state: {self.state}."

        if not self.otp_expires_at or now > self.otp_expires_at:
            self.state = VerificationState.EXPIRED
            self.save(update_fields=['state', 'updated_at'])
            return False, "Verification code has expired. Please request a new code."

        # Compute candidate HMAC
        secret_key = settings.SECRET_KEY.encode('utf-8')
        payload = f"{self.otp_salt}:{candidate_otp.strip()}".encode('utf-8')
        computed_hash = hmac.new(secret_key, payload, hashlib.sha256).hexdigest()

        if hmac.compare_digest(self.otp_hash, computed_hash):
            self.state = VerificationState.VERIFIED
            self.verified_at = now
            # Invalidate OTP values immediately to prevent replay
            self.otp_hash = ''
            self.otp_salt = ''
            self.save(update_fields=['state', 'verified_at', 'otp_hash', 'otp_salt', 'updated_at'])
            return True, "Verification successful."
        else:
            self.attempts_count += 1
            if self.attempts_count >= self.max_attempts:
                self.state = VerificationState.LOCKED
                lockout_minutes = getattr(settings, 'VERIFICATION_LOCKOUT_MINUTES', 15)
                self.locked_until = now + timedelta(minutes=lockout_minutes)
                self.save(update_fields=['state', 'attempts_count', 'locked_until', 'updated_at'])
                return False, f"Maximum verification attempts exceeded. Session locked for {lockout_minutes} minutes."
            else:
                remaining = self.max_attempts - self.attempts_count
                self.save(update_fields=['attempts_count', 'updated_at'])
                return False, f"Incorrect verification code. {remaining} attempt(s) remaining."

    def __str__(self):
        return f"VerificationSession[{self.id}] - {self.college_id} ({self.state})"
