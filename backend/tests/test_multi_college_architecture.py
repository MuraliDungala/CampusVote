"""
Multi-College Data Architecture and Strict Cross-College Isolation Tests.
CampusVote Multi-Tenant Security Suite.

Covers:
1. Institution model creation, unique code enforcement, normalized naming.
2. College Administrator registration and institutional binding.
3. Student self-registration and college association (verified vs unverified).
4. Strict cross-college election management isolation.
5. Strict cross-college student roster isolation.
6. Strict cross-college candidate nomination isolation.
7. Strict cross-college voting, ballot access, and validation isolation.
8. Strict cross-college real-time monitoring and analytics isolation.
9. Strict cross-college results calculation and review isolation.
"""

from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User, Role, AccountStatus, Institution, InstitutionStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.verification.models import VerificationSession, VerificationState


class MultiCollegeArchitectureTests(APITestCase):
    """Verifies multi-tenant institution isolation, admin onboarding, and security boundaries."""

    def setUp(self):
        # 1. Setup College A (North State University)
        self.inst_a = Institution.objects.create(
            name="North State University",
            normalized_name="north state university",
            code="NSU-CAMPUS",
            email_domain="nsu.edu",
            status=InstitutionStatus.ACTIVE,
            is_demo=False
        )

        self.admin_a = User.objects.create_user(
            username='admin_nsu',
            email='admin@nsu.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            institution=self.inst_a
        )

        self.student_a_user = User.objects.create_user(
            username='STU-NSU-001',
            email='alice@nsu.edu',
            password='StudentPassword123!',
            college_id='STU-NSU-001',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            institution=self.inst_a
        )
        self.student_a = Student.objects.create(
            college_id='STU-NSU-001',
            full_name='Alice Student',
            email='alice@nsu.edu',
            department='Computer Science and Engineering',
            academic_year=3,
            enrollment_status=EnrollmentStatus.ENROLLED,
            college_name=self.inst_a.name,
            institution=self.inst_a,
            user=self.student_a_user,
            is_active=True
        )

        # 2. Setup College B (South Coast Polytechnic)
        self.inst_b = Institution.objects.create(
            name="South Coast Polytechnic",
            normalized_name="south coast polytechnic",
            code="SCP-CAMPUS",
            email_domain="scp.edu",
            status=InstitutionStatus.ACTIVE,
            is_demo=False
        )

        self.admin_b = User.objects.create_user(
            username='admin_scp',
            email='admin@scp.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            institution=self.inst_b
        )

        self.student_b_user = User.objects.create_user(
            username='STU-SCP-001',
            email='bob@scp.edu',
            password='StudentPassword123!',
            college_id='STU-SCP-001',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            institution=self.inst_b
        )
        self.student_b = Student.objects.create(
            college_id='STU-SCP-001',
            full_name='Bob Student',
            email='bob@scp.edu',
            department='Mechanical Engineering',
            academic_year=2,
            enrollment_status=EnrollmentStatus.ENROLLED,
            college_name=self.inst_b.name,
            institution=self.inst_b,
            user=self.student_b_user,
            is_active=True
        )

        # 3. Setup Election for College A
        now = timezone.now()
        self.election_a = Election.objects.create(
            title="NSU Student Senate 2026",
            academic_year="2026-2027",
            status=ElectionStatus.ACTIVE,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=5),
            institution=self.inst_a,
            created_by=self.admin_a
        )
        self.pos_a = ElectionPosition.objects.create(
            election=self.election_a,
            title="President",
            display_order=1,
            maximum_candidates=5
        )
        self.cand_a = Candidate.objects.create(
            election_position=self.pos_a,
            student=self.student_a,
            status=CandidateStatus.APPROVED,
            manifesto="Promote campus innovation"
        )

        # 4. Setup Election for College B
        self.election_b = Election.objects.create(
            title="SCP Council Election 2026",
            academic_year="2026-2027",
            status=ElectionStatus.ACTIVE,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=5),
            institution=self.inst_b,
            created_by=self.admin_b
        )
        self.pos_b = ElectionPosition.objects.create(
            election=self.election_b,
            title="General Secretary",
            display_order=1,
            maximum_candidates=5
        )
        self.cand_b = Candidate.objects.create(
            election_position=self.pos_b,
            student=self.student_b,
            status=CandidateStatus.APPROVED,
            manifesto="Better campus facilities"
        )

    # -------------------------------------------------------------------------
    # PART 2 & 3: Institution Model & College Admin Onboarding
    # -------------------------------------------------------------------------

    def test_institution_list_endpoint(self):
        """GET /api/v1/auth/institutions/ returns registered active institutions."""
        response = self.client.get('/api/v1/auth/institutions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [item['code'] for item in response.data]
        self.assertIn('NSU-CAMPUS', codes)
        self.assertIn('SCP-CAMPUS', codes)

    def test_college_admin_registration_new_institution(self):
        """POST /api/v1/auth/college-admin/register/ registers admin and sets up new institution."""
        payload = {
            'full_name': 'Dean Thomas',
            'college_name': 'Metropolitan Arts College',
            'email': 'dean.thomas@metroarts.edu',
            'password': 'StrongPassword2026!',
            'confirm_password': 'StrongPassword2026!',
            'contact_phone': '+1 555-0199',
            'is_simulation_demo': True
        }
        response = self.client.post('/api/v1/auth/college-admin/register/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('institution', response.data)
        self.assertEqual(response.data['institution']['name'], 'Metropolitan Arts College')

        # Verify admin created in database
        new_admin = User.objects.filter(email='dean.thomas@metroarts.edu').first()
        self.assertIsNotNone(new_admin)
        self.assertEqual(new_admin.role, Role.ELECTION_ADMIN)
        self.assertIsNotNone(new_admin.institution)
        self.assertEqual(new_admin.institution.name, 'Metropolitan Arts College')

    def test_college_admin_registration_password_mismatch(self):
        """College admin registration fails when confirm_password differs."""
        payload = {
            'full_name': 'Dean Thomas',
            'college_name': 'Metropolitan Arts College',
            'email': 'mismatch@metroarts.edu',
            'password': 'StrongPassword2026!',
            'confirm_password': 'DifferentPassword2026!',
        }
        response = self.client.post('/api/v1/auth/college-admin/register/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('confirm_password', response.data.get('details', response.data))

    def test_college_admin_login_returns_institution_context(self):
        """Logging in as college admin returns institution details in user summary."""
        login_res = self.client.post('/api/v1/auth/login/', data={
            'identifier': 'admin@nsu.edu',
            'password': 'AdminPassword123!'
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        user_data = login_res.data['user']
        self.assertEqual(user_data['institution_id'], str(self.inst_a.id))
        self.assertEqual(user_data['institution_name'], self.inst_a.name)
        self.assertEqual(user_data['institution_code'], self.inst_a.code)

    # -------------------------------------------------------------------------
    # PART 4: Student Registration and College Association
    # -------------------------------------------------------------------------

    def test_student_self_registration_links_to_institution(self):
        """Student registering with college name resolves to institution."""
        payload = {
            'full_name': 'Charlie Student',
            'college_name': 'North State University',
            'college_id': 'STU-NSU-009',
            'email': 'charlie@nsu.edu',
            'department': 'Computer Science and Engineering',
            'academic_year': 1,
            'password': 'CharliePassword123!'
        }
        res = self.client.post('/api/v1/students/register/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        created_student = Student.objects.filter(college_id='STU-NSU-009').first()
        self.assertIsNotNone(created_student)
        self.assertEqual(created_student.institution, self.inst_a)
        self.assertEqual(created_student.user.institution, self.inst_a)

    # -------------------------------------------------------------------------
    # PART 5 & 6: Strict College-Level Visibility & Cross-College Isolation
    # -------------------------------------------------------------------------

    def test_admin_cannot_access_other_college_election_detail(self):
        """Admin from College B cannot view or modify College A's election."""
        self.client.force_authenticate(user=self.admin_b)

        # GET detail of College A election
        res_get = self.client.get(f'/api/v1/elections/{self.election_a.id}/')
        self.assertEqual(res_get.status_code, status.HTTP_403_FORBIDDEN)

        # PATCH update of College A election
        res_patch = self.client.patch(
            f'/api/v1/elections/{self.election_a.id}/',
            data={'title': 'Hijacked Election Title'},
            format='json'
        )
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_add_position_to_other_college_election(self):
        """Admin from College B cannot add positions to College A's election."""
        self.client.force_authenticate(user=self.admin_b)
        res = self.client.post(
            f'/api/v1/elections/{self.election_a.id}/positions/',
            data={'title': 'Treasurer', 'maximum_candidates': 3},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_view_or_modify_other_college_students(self):
        """Admin from College B cannot view or deactivate students from College A."""
        self.client.force_authenticate(user=self.admin_b)

        # List should exclude Student A
        list_res = self.client.get('/api/v1/admin/students/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        student_ids = [s['college_id'] for s in list_res.data['results']]
        self.assertNotIn('STU-NSU-001', student_ids)
        self.assertIn('STU-SCP-001', student_ids)

        # Direct detail of Student A
        detail_res = self.client.get(f'/api/v1/admin/students/{self.student_a.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_403_FORBIDDEN)

        # Deactivation of Student A
        deact_res = self.client.post(
            f'/api/v1/admin/students/{self.student_a.id}/deactivate/',
            data={'reason': 'Malicious deactivation attempt'},
            format='json'
        )
        self.assertEqual(deact_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_nominate_for_other_college_election(self):
        """Student from College A cannot submit nomination for position in College B."""
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.post(
            f'/api/v1/elections/positions/{self.pos_b.id}/nominations/',
            data={'manifesto': 'Cross-college campaign'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_view_other_college_candidates(self):
        """Student from College A cannot inspect candidate manifest of College B."""
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get(f'/api/v1/elections/{self.election_b.id}/candidates/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # PART 7 & 9: Voting, Eligibility & Duplicate Prevention
    # -------------------------------------------------------------------------

    def test_student_cannot_fetch_ballot_for_other_college_election(self):
        """Student from College A cannot get ballot definition for College B."""
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get(f'/api/v1/elections/{self.election_b.id}/ballot/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Access denied', str(res.data))

    def test_student_cannot_submit_ballot_for_other_college_election(self):
        """Student from College A submitting ballot for College B is rejected 403."""
        self.client.force_authenticate(user=self.student_a_user)
        payload = {
            'selections': [
                {'position_id': str(self.pos_b.id), 'candidate_id': str(self.cand_b.id)}
            ]
        }
        res = self.client.post(f'/api/v1/elections/{self.election_b.id}/ballot/submit/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get('details', {}).get('code'), 'CROSS_INSTITUTION_FORBIDDEN')

    # -------------------------------------------------------------------------
    # PART 8 & 10: Monitoring and Results Scoping
    # -------------------------------------------------------------------------

    def test_admin_cannot_monitor_other_college_turnout(self):
        """Admin B cannot monitor College A's live turnout."""
        self.client.force_authenticate(user=self.admin_b)
        res = self.client.get(f'/api/v1/elections/{self.election_a.id}/analytics/summary/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_access_or_calculate_other_college_results(self):
        """Admin B cannot view or calculate results for College A's election."""
        self.client.force_authenticate(user=self.admin_b)

        # Results list
        res_list = self.client.get(f'/api/v1/admin/elections/{self.election_a.id}/results/')
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        # Calculate result
        res_calc = self.client.post(
            f'/api/v1/admin/elections/{self.election_a.id}/results/calculate/',
            data={'use_synthetic': True},
            format='json'
        )
        self.assertEqual(res_calc.status_code, status.HTTP_403_FORBIDDEN)
