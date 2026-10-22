"""
Comprehensive Backend Test Suite for Phase 4:
College ID, OTP, and QR Identity Verification.
CampusVote Smart ID-Based College Voting System.
"""

import time
from datetime import timedelta
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.audit.models import AuditLog, AuditAction
from apps.verification.models import (
    VerificationSession,
    VerificationState,
    VerificationChannel,
    mask_destination
)
from apps.verification.providers import MockDeliveryProvider
from apps.verification.qr_service import generate_signed_qr_payload
from apps.verification.services import VerificationService
from apps.eligibility.services import EligibilityEngineService


@override_settings(
    ALLOW_MOCK_DELIVERY_IN_TESTS=True,
    VERIFICATION_DELIVERY_PROVIDER='mock',
    VERIFICATION_GENERIC_ERRORS=False
)
class VerificationPhase4Tests(TestCase):
    """Unit and integration test cases for Phase 4 Verification Engine."""

    def setUp(self):
        MockDeliveryProvider.clear_log()
        self.client = APIClient()

        # Create active test student
        self.student = Student.objects.create(
            college_id='CS2026001',
            full_name='Aarav Sharma',
            email='aarav.sharma@campusvote.edu',
            department='Computer Science',
            academic_year=3,
            course='B.Tech CS',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )

        # Inactive student
        self.inactive_student = Student.objects.create(
            college_id='EE2026999',
            full_name='Priya Patel',
            email='priya.patel@campusvote.edu',
            department='Electrical Engineering',
            academic_year=2,
            course='B.Tech EE',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=False
        )

        # Suspended student
        self.suspended_student = Student.objects.create(
            college_id='ME2026888',
            full_name='Rohan Verma',
            email='rohan.verma@campusvote.edu',
            department='Mechanical Engineering',
            academic_year=4,
            course='B.Tech ME',
            enrollment_status=EnrollmentStatus.SUSPENDED,
            is_active=True
        )

        # Admin user
        self.admin_user = User.objects.create_user(
            username='admin_tester',
            email='admin@campusvote.edu',
            college_id='FAC9901',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            password='TestPassword123!'
        )

    def tearMock(self):
        MockDeliveryProvider.clear_log()

    # 1. Valid active college ID
    def test_01_valid_active_college_id_generates_challenge(self):
        url = reverse('verification:verification-start')
        response = self.client.post(url, {'college_id': 'CS2026001'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['state'], VerificationState.OTP_PENDING)
        self.assertEqual(response.data['college_id'], 'CS2026001')
        self.assertIn('@', response.data['destination_masked'])
        self.assertIn('session_id', response.data)

        # Check delivery
        last_otp = MockDeliveryProvider.get_last_otp()
        self.assertIsNotNone(last_otp)
        self.assertEqual(len(last_otp), 6)

    # 2. Unknown college ID
    def test_02_unknown_college_id_rejected(self):
        url = reverse('verification:verification-start')
        response = self.client.post(url, {'college_id': 'UNKNOWN9999'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No student registry record found', response.data['error'])

    # 3. Inactive student record
    def test_03_inactive_student_record_rejected(self):
        url = reverse('verification:verification-start')
        response = self.client.post(url, {'college_id': 'EE2026999'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('deactivated', response.data['error'])

    # 4. Malformed college ID
    def test_04_malformed_college_id_rejected(self):
        url = reverse('verification:verification-start')
        response = self.client.post(url, {'college_id': '   '})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # 5. OTP generation and expiry window
    def test_05_otp_expiry_window_enforced(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        session = VerificationSession.objects.get(id=session_id)
        # Manually expire the OTP
        session.otp_expires_at = timezone.now() - timedelta(seconds=10)
        session.save()

        verify_url = reverse('verification:verification-otp-verify')
        v_res = self.client.post(verify_url, {'session_id': session_id, 'otp': otp})
        self.assertEqual(v_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', v_res.data['error'].lower())

    # 6. Correct OTP validation
    def test_06_correct_otp_authenticates_session(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        verify_url = reverse('verification:verification-otp-verify')
        v_res = self.client.post(verify_url, {'session_id': session_id, 'otp': otp})
        self.assertEqual(v_res.status_code, status.HTTP_200_OK)
        self.assertEqual(v_res.data['state'], VerificationState.VERIFIED)
        self.assertEqual(v_res.data['user']['college_id'], 'CS2026001')
        self.assertEqual(v_res.data['user']['role'], Role.STUDENT)

    # 7. Incorrect OTP rejected with remaining attempts
    def test_07_incorrect_otp_rejected_with_attempts_counter(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        verify_url = reverse('verification:verification-otp-verify')
        v_res = self.client.post(verify_url, {'session_id': session_id, 'otp': '000000'})
        self.assertEqual(v_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Incorrect verification code', v_res.data['error'])
        self.assertEqual(v_res.data['details']['attempts_count'], 1)

    # 8. OTP replay after successful verification strictly prevented
    def test_08_otp_replay_after_success_strictly_prevented(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        verify_url = reverse('verification:verification-otp-verify')
        v_res1 = self.client.post(verify_url, {'session_id': session_id, 'otp': otp})
        self.assertEqual(v_res1.status_code, status.HTTP_200_OK)

        # Attempt replay with the same OTP
        v_res2 = self.client.post(verify_url, {'session_id': session_id, 'otp': otp})
        self.assertEqual(v_res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already been completed', v_res2.data['error'])

    # 9. Resending an OTP invalidates previous OTP
    def test_09_resending_otp_invalidates_previous_code(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        old_otp = MockDeliveryProvider.get_last_otp()

        # Clear cooldown for resend test
        session = VerificationSession.objects.get(id=session_id)
        session.resend_cooldown_until = timezone.now() - timedelta(seconds=1)
        session.save()

        resend_url = reverse('verification:verification-otp-resend')
        r_res = self.client.post(resend_url, {'session_id': session_id})
        self.assertEqual(r_res.status_code, status.HTTP_200_OK)
        new_otp = MockDeliveryProvider.get_last_otp()
        self.assertNotEqual(old_otp, new_otp)

        # Old OTP must now fail
        verify_url = reverse('verification:verification-otp-verify')
        v_res = self.client.post(verify_url, {'session_id': session_id, 'otp': old_otp})
        self.assertEqual(v_res.status_code, status.HTTP_400_BAD_REQUEST)

        # New OTP succeeds
        v_res2 = self.client.post(verify_url, {'session_id': session_id, 'otp': new_otp})
        self.assertEqual(v_res2.status_code, status.HTTP_200_OK)

    # 10. Resend cooldown enforced
    def test_10_resend_cooldown_enforced(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        # Immediate resend attempt should hit cooldown
        resend_url = reverse('verification:verification-otp-resend')
        r_res = self.client.post(resend_url, {'session_id': session_id})
        self.assertEqual(r_res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('wait', r_res.data['error'].lower())

    # 11. Maximum OTP attempts triggers lockout
    def test_11_max_attempts_triggers_lockout(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        verify_url = reverse('verification:verification-otp-verify')
        for i in range(5):
            r = self.client.post(verify_url, {'session_id': session_id, 'otp': '999999'})

        self.assertEqual(r.status_code, status.HTTP_423_LOCKED)
        self.assertIn('locked', r.data['error'].lower())

        session = VerificationSession.objects.get(id=session_id)
        self.assertTrue(session.is_locked())
        self.assertEqual(session.state, VerificationState.LOCKED)

    # 12. Locked verification state rejects attempts
    def test_12_locked_state_rejects_subsequent_attempts(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        session = VerificationSession.objects.get(id=session_id)
        session.state = VerificationState.LOCKED
        session.locked_until = timezone.now() + timedelta(minutes=15)
        session.save()

        verify_url = reverse('verification:verification-otp-verify')
        r = self.client.post(verify_url, {'session_id': session_id, 'otp': '123456'})
        self.assertEqual(r.status_code, status.HTTP_423_LOCKED)

    # 13. Max resend limit enforced
    def test_13_max_resend_limit_enforced(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        session = VerificationSession.objects.get(id=session_id)
        session.resend_count = 3
        session.resend_cooldown_until = timezone.now() - timedelta(seconds=1)
        session.save()

        resend_url = reverse('verification:verification-otp-resend')
        r_res = self.client.post(resend_url, {'session_id': session_id})
        self.assertEqual(r_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Maximum OTP resend limit reached', r_res.data['error'])

    # 14. Session status query returns countdowns and attempts
    def test_14_session_status_query(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']

        status_url = reverse('verification:verification-status')
        r = self.client.get(status_url, {'session_id': session_id})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['state'], VerificationState.OTP_PENDING)
        self.assertGreater(r.data['expires_in_seconds'], 0)
        self.assertGreater(r.data['resend_cooldown_seconds'], 0)

    # 15. Plaintext OTP is NEVER stored in the database
    def test_15_otp_not_stored_in_plaintext(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        session = VerificationSession.objects.get(id=session_id)
        # DB fields must contain salt and HMAC hash, never the plaintext OTP
        self.assertNotEqual(session.otp_hash, otp)
        self.assertNotIn(otp, session.otp_hash)
        self.assertNotEqual(session.otp_salt, otp)
        self.assertEqual(len(session.otp_hash), 64)  # SHA-256 hex length

    # 16. In generic error mode, account existence is masked
    @override_settings(VERIFICATION_GENERIC_ERRORS=True)
    def test_16_generic_error_mode_masks_enumeration(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'NONEXISTENT999'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('If this College ID is registered', res.data['message'])

    # 17. Valid structured QR payload recognized
    def test_17_valid_qr_payload_recognized(self):
        qr_url = reverse('verification:verification-qr-validate')
        json_qr = '{"type": "CAMPUSVOTE_ID", "college_id": "CS2026001", "version": 1}'
        res = self.client.post(qr_url, {'qr_payload': json_qr})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['college_id'], 'CS2026001')
        self.assertEqual(res.data['student_name'], 'Aarav Sharma')
        self.assertIn('@', res.data['destination_masked'])

    # 18. Signed institutional QR token validated
    def test_18_signed_institutional_qr_token_validated(self):
        token = generate_signed_qr_payload('CS2026001')
        qr_url = reverse('verification:verification-qr-validate')
        res = self.client.post(qr_url, {'qr_payload': token})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['college_id'], 'CS2026001')

    # 19. Malformed or tampered QR payload rejected
    def test_19_malformed_qr_payload_rejected(self):
        qr_url = reverse('verification:verification-qr-validate')
        res = self.client.post(qr_url, {'qr_payload': 'CAMPUSVOTE:CS2026001:9999999999:tampered_signature'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalid or tampered', res.data['error'].lower())

    # 20. QR scan alone does NOT authenticate the student
    def test_20_qr_scan_alone_does_not_authenticate(self):
        token = generate_signed_qr_payload('CS2026001')
        qr_url = reverse('verification:verification-qr-validate')
        res = self.client.post(qr_url, {'qr_payload': token})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Checking /api/v1/auth/me/ must still return unauthenticated (401 or 403)
        me_url = reverse('api-auth-me')
        me_res = self.client.get(me_url)
        self.assertIn(me_res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # 21. Student signed QR endpoint requires student authentication
    def test_21_student_qr_endpoint_requires_student_auth(self):
        my_qr_url = reverse('verification:verification-my-qr')
        # Unauthenticated request
        res1 = self.client.get(my_qr_url)
        self.assertIn(res1.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Authenticate as admin (admin is not a student)
        self.client.force_authenticate(user=self.admin_user)
        res2 = self.client.get(my_qr_url)
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    # 22. Verification does not grant administrator privileges
    def test_22_verification_does_not_grant_admin_privileges(self):
        # Even if an admin exists with college_id, verification rejects admin logins
        admin_student = Student.objects.create(
            college_id='ADMIN9901',
            full_name='Faculty Admin',
            email='admin_fac@campusvote.edu',
            department='Administration',
            academic_year=1,
            course='Staff',
            is_active=True
        )
        self.admin_user.college_id = 'ADMIN9901'
        self.admin_user.save()
        admin_student.user = self.admin_user
        admin_student.save()

        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'ADMIN9901'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        verify_url = reverse('verification:verification-otp-verify')
        v_res = self.client.post(verify_url, {'session_id': session_id, 'otp': otp})
        self.assertEqual(v_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Administrative accounts cannot sign in', v_res.data['error'])

    # 23. Audit events are recorded accurately
    def test_23_audit_events_recorded_accurately(self):
        initial_logs = AuditLog.objects.count()

        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        session_id = res.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        verify_url = reverse('verification:verification-otp-verify')
        self.client.post(verify_url, {'session_id': session_id, 'otp': otp})

        issued_log = AuditLog.objects.filter(action=AuditAction.OTP_CHALLENGE_ISSUED).first()
        verified_log = AuditLog.objects.filter(action=AuditAction.OTP_VERIFIED).first()

        self.assertIsNotNone(issued_log)
        self.assertIsNotNone(verified_log)
        self.assertEqual(verified_log.metadata['college_id'], 'CS2026001')

    # 24. Suspended student rejected from verification
    def test_24_suspended_student_rejected(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'ME2026888'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Suspended', res.data['error'])

    # 25. Student eligibility remains governed by Phase 2 eligibility engine
    def test_25_student_eligibility_remains_governed_by_phase2_engine(self):
        import uuid
        from apps.eligibility.models import ElectionEligibilityRule

        rule = ElectionEligibilityRule.objects.create(
            election_id=uuid.uuid4(),
            title="General Campus Rule",
            required_enrollment_statuses=['ENROLLED']
        )

        # Verification confirms identity, but EligibilityEngineService remains authoritative for elections
        is_eligible, reason = EligibilityEngineService.evaluate_student(self.student, rule)
        self.assertTrue(is_eligible)

        is_eligible_susp, reason_susp = EligibilityEngineService.evaluate_student(self.suspended_student, rule)
        self.assertFalse(is_eligible_susp)
        self.assertIn('Enrollment status', reason_susp)

    # 26. Mask destination helper properly sanitizes email and sms
    def test_26_mask_destination_privacy_safeguard(self):
        self.assertEqual(mask_destination('aarav.sharma@campusvote.edu'), 'a***a@campusvote.edu')
        self.assertEqual(mask_destination('al@campusvote.edu'), 'a***@campusvote.edu')
        self.assertEqual(mask_destination('+1987654321', channel='SMS'), '+1 *** *** 4321')

    # 27. Production mock provider safely reports delivery failure without crashing server
    @override_settings(DEBUG=False, ALLOW_MOCK_DELIVERY_IN_TESTS=False, VERIFICATION_DELIVERY_PROVIDER='mock')
    def test_27_production_unconfigured_provider_returns_safe_503_not_unhandled_crash(self):
        url = reverse('verification:verification-start')
        res = self.client.post(url, {'college_id': 'CS2026001'})
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(res.data.get('details', {}).get('code'), 'DELIVERY_PROVIDER_UNAVAILABLE')
        self.assertIn('institutional email delivery service', res.data.get('error', ''))

    # 28. SMTP provider network error caught safely with structured 503 response
    @override_settings(DEBUG=False, VERIFICATION_DELIVERY_PROVIDER='email')
    def test_28_smtp_network_failure_handled_gracefully(self):
        from unittest.mock import patch
        with patch('apps.verification.providers.send_mail', side_effect=OSError("Connection refused")):
            url = reverse('verification:verification-start')
            res = self.client.post(url, {'college_id': 'CS2026001'})
            self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertEqual(res.data.get('details', {}).get('code'), 'DELIVERY_PROVIDER_UNAVAILABLE')
            self.assertIn('not configured or unreachable', res.data.get('error', ''))

    # 29. OTP verification provisions User account with student institution for multi-tenant isolation
    def test_29_student_user_provisioning_inherits_institution(self):
        from apps.accounts.models import Institution
        inst = Institution.objects.create(
            code='GMRIT-TEST',
            name='GMR Institute of Technology Test',
            email_domain='gmrit.edu.in'
        )
        self.student.institution = inst
        self.student.save(update_fields=['institution'])

        # Start verification
        url_start = reverse('verification:verification-start')
        res_start = self.client.post(url_start, {'college_id': 'CS2026001'})
        self.assertEqual(res_start.status_code, status.HTTP_200_OK)
        session_id = res_start.data['session_id']
        otp = MockDeliveryProvider.get_last_otp()

        # Verify OTP
        url_verify = reverse('verification:verification-otp-verify')
        res_verify = self.client.post(url_verify, {'session_id': session_id, 'otp': otp})
        self.assertEqual(res_verify.status_code, status.HTTP_200_OK)

        user = User.objects.get(college_id='CS2026001')
        self.assertEqual(user.institution, inst)
        self.assertEqual(user.role, Role.STUDENT)

