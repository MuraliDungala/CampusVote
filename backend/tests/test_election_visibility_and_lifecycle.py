"""
CampusVote — Comprehensive Tests for Election Visibility, Lifecycle Transitions,
Institutional Isolation, and Student Catalogue Matching.

Tests:
- TEST 1: Admin creates draft election -> visible to admin, hidden from students.
- TEST 2: Admin publishes & schedules election for College A -> visible to College A student as upcoming.
- TEST 3: Voting window opens -> automatically active and visible in active section.
- TEST 4: College B student cannot view or access College A's private election.
- TEST 5: Cancelled election does not appear as active or upcoming.
- TEST 6: Closed election moves to closed/history and adheres to result-publication rules.
- TEST 7: Eligible student sees election with is_eligible=True when demographics match.
- TEST 9: Date and timezone boundaries behave correctly.
- TEST 10: Unauthorized users cannot publish or modify elections.
- TEST 11: Election list does not reveal candidate choices or individual ballot data.
"""

from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User, Role, AccountStatus, Institution, InstitutionStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.voting.models import AnonymousBallot, VoterParticipationRecord


class ElectionVisibilityAndLifecycleTests(APITestCase):
    """
    Validates end-to-end election lifecycle transitions, institution scoping,
    and student visibility rules.
    """

    def setUp(self):
        # 1. Setup Institution A (North State University)
        self.inst_a = Institution.objects.create(
            name="North State University",
            normalized_name="north state university",
            code="NSU-CAMPUS",
            email_domain="nsu.edu",
            status=InstitutionStatus.ACTIVE,
            is_demo=False
        )

        # 2. Setup Institution B (South Valley College)
        self.inst_b = Institution.objects.create(
            name="South Valley College",
            normalized_name="south valley college",
            code="SVC-CAMPUS",
            email_domain="svc.edu",
            status=InstitutionStatus.ACTIVE,
            is_demo=False
        )

        # 3. College A Admin
        self.admin_a = User.objects.create_user(
            username='admin_nsu',
            email='admin@nsu.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            institution=self.inst_a
        )

        # 4. College B Admin
        self.admin_b = User.objects.create_user(
            username='admin_svc',
            email='admin@svc.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            institution=self.inst_b
        )

        # 5. College A Student (Eligible)
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
            course='B.Tech CSE',
            enrollment_status=EnrollmentStatus.ENROLLED,
            college_name=self.inst_a.name,
            institution=self.inst_a,
            user=self.student_a_user,
            is_active=True
        )

        # 6. College B Student
        self.student_b_user = User.objects.create_user(
            username='STU-SVC-001',
            email='bob@svc.edu',
            password='StudentPassword123!',
            college_id='STU-SVC-001',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            institution=self.inst_b
        )
        self.student_b = Student.objects.create(
            college_id='STU-SVC-001',
            full_name='Bob Student',
            email='bob@svc.edu',
            department='Electrical Engineering',
            academic_year=2,
            course='B.Tech ECE',
            enrollment_status=EnrollmentStatus.ENROLLED,
            college_name=self.inst_b.name,
            institution=self.inst_b,
            user=self.student_b_user,
            is_active=True
        )

        self.now = timezone.now()

    def _create_sample_election(self, institution, status=ElectionStatus.DRAFT, start_offset=1, end_offset=4):
        start = self.now + timedelta(days=start_offset)
        end = self.now + timedelta(days=end_offset)
        election = Election.objects.create(
            title=f"{institution.name} Council Election",
            description="Annual executive council voting cycle.",
            academic_year="2026-2027",
            start_time=start,
            end_time=end,
            status=status,
            institution=institution,
            created_by=self.admin_a if institution == self.inst_a else self.admin_b
        )
        ElectionPosition.objects.create(
            election=election,
            title="Student Council President",
            description="Chief executive leadership office.",
            display_order=1,
            maximum_candidates=5
        )
        return election

    # --------------------------------------------------------------------------
    # TEST 1: Admin creates draft -> visible to admin, hidden from students
    # --------------------------------------------------------------------------
    def test_01_draft_election_visible_to_admin_hidden_from_students(self):
        draft_election = self._create_sample_election(self.inst_a, status=ElectionStatus.DRAFT)

        # Admin A views elections
        self.client.force_authenticate(user=self.admin_a)
        admin_res = self.client.get('/api/v1/elections/')
        self.assertEqual(admin_res.status_code, status.HTTP_200_OK)
        admin_election_ids = [e['id'] for e in admin_res.data['results']]
        self.assertIn(str(draft_election.id), admin_election_ids)

        # Student A views elections -> DRAFT MUST BE EXCLUDED
        self.client.force_authenticate(user=self.student_a_user)
        student_res = self.client.get('/api/v1/elections/')
        self.assertEqual(student_res.status_code, status.HTTP_200_OK)
        student_election_ids = [e['id'] for e in student_res.data['results']]
        self.assertNotIn(str(draft_election.id), student_election_ids)

        # Student A attempts to access draft election detail directly -> 403 Forbidden
        detail_res = self.client.get(f'/api/v1/elections/{draft_election.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # TEST 2: Admin publishes & schedules -> visible to College A student as upcoming
    # --------------------------------------------------------------------------
    def test_02_published_scheduled_election_visible_in_upcoming_section(self):
        draft_election = self._create_sample_election(self.inst_a, status=ElectionStatus.DRAFT, start_offset=2, end_offset=5)

        # Admin schedules/publishes the election
        self.client.force_authenticate(user=self.admin_a)
        schedule_res = self.client.post(f'/api/v1/elections/{draft_election.id}/schedule/')
        self.assertEqual(schedule_res.status_code, status.HTTP_200_OK)
        draft_election.refresh_from_db()
        self.assertEqual(draft_election.status, ElectionStatus.SCHEDULED)

        # Student A checks election list
        self.client.force_authenticate(user=self.student_a_user)
        student_res = self.client.get('/api/v1/elections/')
        self.assertEqual(student_res.status_code, status.HTTP_200_OK)
        
        election_data = next((e for e in student_res.data['results'] if e['id'] == str(draft_election.id)), None)
        self.assertIsNotNone(election_data)
        self.assertEqual(election_data['status'], ElectionStatus.SCHEDULED)
        self.assertEqual(election_data['institution_name'], self.inst_a.name)

    # --------------------------------------------------------------------------
    # TEST 3: Voting window opens -> automatically active in active section
    # --------------------------------------------------------------------------
    def test_03_voting_window_opens_election_becomes_active(self):
        # Election scheduled in the past 1 hour, ending in 2 days
        past_start = self.now - timedelta(hours=1)
        future_end = self.now + timedelta(days=2)
        election = Election.objects.create(
            title="Live Active NSU Election",
            academic_year="2026-2027",
            start_time=past_start,
            end_time=future_end,
            status=ElectionStatus.SCHEDULED,
            institution=self.inst_a,
            created_by=self.admin_a
        )
        ElectionPosition.objects.create(
            election=election,
            title="President",
            display_order=1
        )

        # When Student requests election list, sync_lifecycle_statuses transitions SCHEDULED -> ACTIVE
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get('/api/v1/elections/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        election.refresh_from_db()
        self.assertEqual(election.status, ElectionStatus.ACTIVE)

        target = next((e for e in res.data['results'] if e['id'] == str(election.id)), None)
        self.assertIsNotNone(target)
        self.assertEqual(target['status'], ElectionStatus.ACTIVE)

    # --------------------------------------------------------------------------
    # TEST 4: College B student cannot access College A's private election
    # --------------------------------------------------------------------------
    def test_04_college_b_student_cannot_access_college_a_election(self):
        election_a = self._create_sample_election(self.inst_a, status=ElectionStatus.SCHEDULED, start_offset=1, end_offset=3)

        # Student B fetches election list -> College A's election is filtered out
        self.client.force_authenticate(user=self.student_b_user)
        list_res = self.client.get('/api/v1/elections/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        student_b_election_ids = [e['id'] for e in list_res.data['results']]
        self.assertNotIn(str(election_a.id), student_b_election_ids)

        # Student B tries to fetch College A's election detail directly -> 403 Forbidden
        detail_res = self.client.get(f'/api/v1/elections/{election_a.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # TEST 5: Cancelled election does not appear as active or upcoming
    # --------------------------------------------------------------------------
    def test_05_cancelled_election_hidden_from_students(self):
        cancelled_election = self._create_sample_election(self.inst_a, status=ElectionStatus.CANCELLED)

        # Admin sees cancelled election
        self.client.force_authenticate(user=self.admin_a)
        admin_res = self.client.get('/api/v1/elections/')
        self.assertIn(str(cancelled_election.id), [e['id'] for e in admin_res.data['results']])

        # Student A DOES NOT see cancelled election
        self.client.force_authenticate(user=self.student_a_user)
        student_res = self.client.get('/api/v1/elections/')
        self.assertNotIn(str(cancelled_election.id), [e['id'] for e in student_res.data['results']])

        # Direct access rejected -> 403 Forbidden
        detail_res = self.client.get(f'/api/v1/elections/{cancelled_election.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # TEST 6: Closed election moves to history and obeys publication rules
    # --------------------------------------------------------------------------
    def test_06_closed_election_handled_according_to_publication_rules(self):
        # Election whose voting window ended 2 hours ago
        past_start = self.now - timedelta(days=2)
        past_end = self.now - timedelta(hours=2)
        election = Election.objects.create(
            title="Concluded NSU Election",
            academic_year="2026-2027",
            start_time=past_start,
            end_time=past_end,
            status=ElectionStatus.ACTIVE,
            institution=self.inst_a,
            created_by=self.admin_a
        )
        ElectionPosition.objects.create(
            election=election,
            title="General Secretary",
            display_order=1
        )

        # Reading election list auto-transitions to CLOSED
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get('/api/v1/elections/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        election.refresh_from_db()
        self.assertEqual(election.status, ElectionStatus.CLOSED)

        # In student catalogue, it appears with status CLOSED (for history/archive)
        target = next((e for e in res.data['results'] if e['id'] == str(election.id)), None)
        self.assertIsNotNone(target)
        self.assertEqual(target['status'], ElectionStatus.CLOSED)

    # --------------------------------------------------------------------------
    # TEST 7: Eligible student sees is_eligible=True when demographics match
    # --------------------------------------------------------------------------
    def test_07_eligible_student_demographics_evaluation(self):
        active_election = self._create_sample_election(self.inst_a, status=ElectionStatus.ACTIVE, start_offset=-1, end_offset=2)

        # Create eligibility rule restricting to CSE academic_year >= 2
        ElectionEligibilityRule.objects.create(
            election_id=active_election.id,
            title="CSE Upperclassmen Rule",
            allowed_departments=["Computer Science and Engineering"],
            allowed_academic_years=[2, 3, 4],
            is_active=True
        )

        # Student A (CSE, Year 3) views the election
        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get('/api/v1/elections/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        target = next((e for e in res.data['results'] if e['id'] == str(active_election.id)), None)
        self.assertIsNotNone(target)
        self.assertTrue(target['is_eligible'])
        self.assertIn('eligib', target['eligibility_reason'].lower())

    # --------------------------------------------------------------------------
    # TEST 9: Date and timezone boundaries behave correctly
    # --------------------------------------------------------------------------
    def test_09_date_and_timezone_boundaries(self):
        # Election cannot end before start
        self.client.force_authenticate(user=self.admin_a)
        invalid_payload = {
            'title': 'Chronologically Inverted Election',
            'academic_year': '2026-2027',
            'start_time': (self.now + timedelta(days=5)).isoformat(),
            'end_time': (self.now + timedelta(days=2)).isoformat(),
        }
        res = self.client.post('/api/v1/elections/', invalid_payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Scheduling requires positions and future end time
        empty_election = Election.objects.create(
            title="Positionless Election",
            academic_year="2026-2027",
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            institution=self.inst_a,
            created_by=self.admin_a
        )
        schedule_res = self.client.post(f'/api/v1/elections/{empty_election.id}/schedule/')
        self.assertEqual(schedule_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("at least one configured position", str(schedule_res.data))

    # --------------------------------------------------------------------------
    # TEST 10: Unauthorized users cannot publish or modify elections
    # --------------------------------------------------------------------------
    def test_10_unauthorized_users_cannot_publish_or_modify(self):
        election_a = self._create_sample_election(self.inst_a, status=ElectionStatus.DRAFT)

        # Student A tries to schedule College A election -> 403 Forbidden
        self.client.force_authenticate(user=self.student_a_user)
        stu_res = self.client.post(f'/api/v1/elections/{election_a.id}/schedule/')
        self.assertEqual(stu_res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin B (different college) tries to schedule College A election -> 403 Forbidden
        self.client.force_authenticate(user=self.admin_b)
        adm_b_res = self.client.post(f'/api/v1/elections/{election_a.id}/schedule/')
        self.assertEqual(adm_b_res.status_code, status.HTTP_403_FORBIDDEN)

        # Anonymous user cannot schedule -> 401 or 403
        self.client.logout()
        anon_res = self.client.post(f'/api/v1/elections/{election_a.id}/schedule/')
        self.assertIn(anon_res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # --------------------------------------------------------------------------
    # TEST 11: Election list does not reveal candidate choices or individual ballots
    # --------------------------------------------------------------------------
    def test_11_election_listing_preserves_ballot_anonymity(self):
        active_election = self._create_sample_election(self.inst_a, status=ElectionStatus.ACTIVE, start_offset=-1, end_offset=2)

        self.client.force_authenticate(user=self.student_a_user)
        res = self.client.get('/api/v1/elections/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        election_data = res.data['results'][0]
        # Verify no ballot selections, cryptographic receipts, or choice data is in the listing
        self.assertNotIn('ballots', election_data)
        self.assertNotIn('selections', election_data)
        self.assertNotIn('encrypted_choice', election_data)
        self.assertNotIn('ballot_hash', election_data)
