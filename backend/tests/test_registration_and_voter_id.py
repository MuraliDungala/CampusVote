"""
Unit and Integration Tests for Student Self-Registration, Email/ID Resolution,
and Smart Voter ID Card Credential Generation.
CampusVote Smart ID-Based College Voting System.
"""

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus, VoterIdCard
from apps.verification.models import VerificationSession, VerificationState
from apps.verification.services import VerificationService
from apps.verification.qr_service import generate_signed_qr_payload, parse_and_validate_qr_payload, lookup_student_for_qr


@override_settings(
    ALLOW_MOCK_DELIVERY_IN_TESTS=True,
    VERIFICATION_DELIVERY_PROVIDER='mock',
    VERIFICATION_GENERIC_ERRORS=False
)
class RegistrationAndVoterIdTests(TestCase):
    """
    Validates end-to-end registration, authentication lookup rules,
    and Smart Voter ID credential generation workflows.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Approved institutional roster student (no user account provisioned yet)
        self.roster_student = Student.objects.create(
            college_id='STU-2026-901',
            college_name='GMR Institute of Technology',
            full_name='Aaditya Sen',
            email='aaditya.sen@campusvote.edu',
            department='Computer Science and Engineering',
            academic_year=3,
            course='B.Tech Computer Science and Engineering',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True,
        )

        # 2. Existing registered student with linked user account
        self.active_user = User.objects.create_user(
            username='STU-2026-001',
            email='student.demo@campusvote.edu',
            password='TestPassword123!',
            college_id='STU-2026-001',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
        )
        self.active_student = Student.objects.create(
            college_id='STU-2026-001',
            college_name='GMR Institute of Technology',
            full_name='Alex Rivera',
            email='student.demo@campusvote.edu',
            department='Computer Science and Engineering',
            academic_year=3,
            course='B.Tech Computer Science and Engineering',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True,
            user=self.active_user,
        )

        # 3. Pending verification student (registered without prior roster record)
        self.pending_user = User.objects.create_user(
            username='23341A4234',
            email='23341a4234@gmrit.edu.in',
            password='PendingPassword123!',
            college_id='23341A4234',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
        )
        self.pending_student = Student.objects.create(
            college_id='23341A4234',
            college_name='GMR Institute of Technology',
            full_name='Murali Krishna',
            email='23341a4234@gmrit.edu.in',
            department='Information Technology',
            academic_year=2,
            course='B.Tech Information Technology',
            enrollment_status=EnrollmentStatus.PENDING,
            is_active=True,
            user=self.pending_user,
        )

    # ==========================================
    # REGISTRATION TESTS
    # ==========================================

    def test_01_student_registration_matching_roster_auto_verifies(self):
        """Student in official roster self-registers: account created and verified."""
        url = reverse('students:student-register')
        payload = {
            'full_name': 'Aaditya Sen',
            'college_name': 'GMR Institute of Technology',
            'college_id': 'STU-2026-901',
            'email': 'aaditya.sen@campusvote.edu',
            'department': 'Computer Science and Engineering',
            'academic_year': 3,
            'password': 'SecurePassword123!',
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['status'], 'VERIFIED')
        self.assertEqual(res.data['college_name'], 'GMR Institute of Technology')
        self.assertTrue(res.data['is_verified'])

        # Verify User was provisioned and linked to roster student
        user = User.objects.filter(college_id='STU-2026-901').first()
        self.assertIsNotNone(user)
        self.roster_student.refresh_from_db()
        self.assertEqual(self.roster_student.user, user)
        self.assertEqual(self.roster_student.college_name, 'GMR Institute of Technology')

    def test_02_student_registration_not_in_roster_creates_pending_verification(self):
        """New student registering outside approved roster enters pending-verification workflow."""
        url = reverse('students:student-register')
        payload = {
            'full_name': 'New Student',
            'college_name': 'National Engineering College',
            'college_id': 'NEW-2026-777',
            'email': 'new.student@college.edu',
            'department': 'Mechanical Engineering',
            'academic_year': 1,
            'password': 'SecurePassword123!',
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['status'], 'PENDING_VERIFICATION')
        self.assertEqual(res.data['college_name'], 'National Engineering College')
        self.assertFalse(res.data['is_verified'])

        # Verify Student record created with PENDING enrollment status and stored college_name
        student = Student.objects.filter(college_id='NEW-2026-777').first()
        self.assertIsNotNone(student)
        self.assertEqual(student.enrollment_status, EnrollmentStatus.PENDING)
        self.assertEqual(student.college_name, 'National Engineering College')

    def test_03_duplicate_registration_rejected(self):
        """Cannot register with already active College ID or email."""
        url = reverse('students:student-register')
        payload = {
            'full_name': 'Alex Rivera',
            'college_name': 'GMR Institute of Technology',
            'college_id': 'STU-2026-001',
            'email': 'different.email@campusvote.edu',
            'department': 'Computer Science and Engineering',
            'academic_year': 3,
            'password': 'SecurePassword123!',
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already registered', res.data['message'])

    def test_04_registration_field_validation(self):
        """Enforces required fields, email format, year range, and password length."""
        url = reverse('students:student-register')
        # Missing fields
        res = self.client.post(url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('college_id', res.data['details'])
        self.assertIn('college_name', res.data['details'])

        # Password too short
        bad_pw = {
            'full_name': 'Test User',
            'college_name': 'Some Institute',
            'college_id': 'TEST-001',
            'email': 'test@campus.edu',
            'department': 'Civil Engineering',
            'academic_year': 2,
            'password': 'short',
        }
        res = self.client.post(url, bad_pw, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Year out of range
        bad_year = {
            'full_name': 'Test User',
            'college_name': 'Some Institute',
            'college_id': 'TEST-002',
            'email': 'test2@campus.edu',
            'department': 'Civil Engineering',
            'academic_year': 6,
            'password': 'ValidPassword123!',
        }
        res = self.client.post(url, bad_year, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_05_registration_with_other_custom_department(self):
        """Selecting Other and entering a custom department stores the custom department name."""
        url = reverse('students:student-register')
        payload = {
            'full_name': 'Aero Student',
            'college_name': 'Sky High Institute of Technology',
            'college_id': 'AERO-2026-101',
            'email': 'aero.student@skyhigh.edu',
            'department': 'Other',
            'custom_department': 'Aerospace Engineering',
            'academic_year': 2,
            'password': 'SecurePassword123!',
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        student = Student.objects.filter(college_id='AERO-2026-101').first()
        self.assertIsNotNone(student)
        self.assertEqual(student.department, 'Aerospace Engineering')
        self.assertEqual(student.college_name, 'Sky High Institute of Technology')

    def test_06_direct_auth_register_endpoint_is_routed(self):
        """Verifies that /api/v1/auth/register/ routes cleanly without returning 404 HTML."""
        payload = {
            'full_name': 'Auth Register Test',
            'college_name': 'GMR Institute of Technology',
            'college_id': 'AUTH-2026-888',
            'email': 'auth.test@gmrit.edu.in',
            'department': 'Data Science',
            'academic_year': 2,
            'password': 'SecurePassword123!',
        }
        res = self.client.post('/api/v1/auth/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['status'], 'PENDING_VERIFICATION')

    # ==========================================
    # LOGIN & EMAIL/ID RESOLUTION TESTS
    # ==========================================

    @override_settings(VERIFICATION_GENERIC_ERRORS=False)
    def test_07_verification_start_by_college_id(self):
        """Lookup by canonical College ID successfully initiates OTP."""
        ok, data, err = VerificationService.start_verification(
            college_id='STU-2026-001',
            channel='EMAIL'
        )
        self.assertTrue(ok)
        self.assertEqual(data['state'], VerificationState.OTP_PENDING)

    @override_settings(VERIFICATION_GENERIC_ERRORS=False)
    def test_08_verification_start_by_institutional_email(self):
        """Lookup by institutional email address successfully resolves student."""
        ok, data, err = VerificationService.start_verification(
            college_id='student.demo@campusvote.edu',
            channel='EMAIL'
        )
        self.assertTrue(ok)
        self.assertEqual(data['state'], VerificationState.OTP_PENDING)

    @override_settings(VERIFICATION_GENERIC_ERRORS=False)
    def test_09_unregistered_student_returns_clear_not_found(self):
        """Unregistered identifier returns clear error without crashing."""
        ok, data, err = VerificationService.start_verification(
            college_id='UNREGISTERED-ID-999',
            channel='EMAIL'
        )
        self.assertFalse(ok)
        self.assertIn('No student registry record found', err)

    # ==========================================
    # VOTER ID CARD GENERATION TESTS
    # ==========================================

    def test_10_eligible_student_generates_voter_id(self):
        """Enrolled active student generates unique digital Voter ID with verified college name."""
        self.client.force_authenticate(user=self.active_user)
        url = reverse('students:voter-id-generate')
        res = self.client.post(url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        voter_id = res.data['voter_id']

        self.assertTrue(voter_id['voter_id_number'].startswith('CV-2026-'))
        self.assertEqual(voter_id['college_id'], 'STU-2026-001')
        self.assertEqual(voter_id['college_name'], 'GMR Institute of Technology')
        self.assertEqual(voter_id['student_name'], 'Alex Rivera')
        self.assertTrue(len(voter_id['qr_payload']) > 20)

        # Database record created
        card = VoterIdCard.objects.filter(student=self.active_student).first()
        self.assertIsNotNone(card)
        self.assertEqual(card.voter_id_number, voter_id['voter_id_number'])

    def test_11_voter_id_generation_is_idempotent(self):
        """Repeated generation calls return existing card without creating duplicates."""
        self.client.force_authenticate(user=self.active_user)
        url = reverse('students:voter-id-generate')

        res1 = self.client.post(url, {}, format='json')
        res2 = self.client.post(url, {}, format='json')

        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res1.data['voter_id']['voter_id_number'],
            res2.data['voter_id']['voter_id_number']
        )
        self.assertEqual(VoterIdCard.objects.filter(student=self.active_student).count(), 1)

    def test_12_pending_student_can_self_service_generate_voter_id(self):
        """Active student whose institutional verification is PENDING can self-service generate their digital ID."""
        self.client.force_authenticate(user=self.pending_user)
        url = reverse('students:voter-id-generate')
        res = self.client.post(url, {}, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('voter_id', res.data)
        self.assertEqual(res.data['voter_id']['college_id'], '23341A4234')
        self.assertEqual(res.data['voter_id']['enrollment_status'], 'PENDING')
        self.assertEqual(VoterIdCard.objects.filter(student=self.pending_student).count(), 1)

    def test_13_deactivated_student_cannot_generate_voter_id(self):
        """Deactivated student cannot generate voter credential."""
        self.active_student.is_active = False
        self.active_student.save(update_fields=['is_active'])

        self.client.force_authenticate(user=self.active_user)
        url = reverse('students:voter-id-generate')
        res = self.client.post(url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_14_voter_id_me_endpoint(self):
        """Authenticated student retrieves their issued voter ID credential with college name."""
        self.client.force_authenticate(user=self.active_user)
        url = reverse('students:voter-id-me')

        # Prior to generation
        res_before = self.client.get(url)
        self.assertEqual(res_before.status_code, status.HTTP_200_OK)
        self.assertFalse(res_before.data['has_voter_id'])
        self.assertTrue(res_before.data['eligible_to_generate'])

        # After generation
        self.client.post(reverse('students:voter-id-generate'), {}, format='json')
        res_after = self.client.get(url)
        self.assertEqual(res_after.status_code, status.HTTP_200_OK)
        self.assertTrue(res_after.data['has_voter_id'])
        self.assertEqual(res_after.data['voter_id']['college_id'], 'STU-2026-001')
        self.assertEqual(res_after.data['voter_id']['college_name'], 'GMR Institute of Technology')

    def test_15_generated_voter_id_qr_payload_is_validatable(self):
        """The signed QR payload on the generated card passes server-side QR verification."""
        self.client.force_authenticate(user=self.active_user)
        gen_res = self.client.post(reverse('students:voter-id-generate'), {}, format='json')
        qr_payload = gen_res.data['voter_id']['qr_payload']

        is_valid, college_id, msg, meta = parse_and_validate_qr_payload(qr_payload)
        self.assertTrue(is_valid)
        self.assertEqual(college_id, 'STU-2026-001')

        # Student lookup succeeds
        lookup_ok, student, lookup_msg = lookup_student_for_qr(college_id)
        self.assertTrue(lookup_ok)
        self.assertEqual(student.college_id, 'STU-2026-001')

    def test_16_unauthenticated_cannot_access_voter_id(self):
        """Unauthenticated requests to voter-id endpoints are rejected."""
        url = reverse('students:voter-id-me')
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
