"""
CampusVote End-to-End Automated Scenario Validation Suite.
Executes Scenarios A through G sequentially to certify application integration
across authentication, roster management, election lifecycle, verification,
fail-closed voting, anomaly surveillance, and results governance.
"""

from datetime import timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.voting.models import AnonymousBallot, VoterParticipationRecord
from apps.anomaly.models import AnomalyAlert, AnomalyType, AnomalySeverity, AnomalyStatus
from apps.results.models import ElectionResult, ResultLifecycleStatus
from apps.results.services import ResultWorkflowService
from apps.verification.providers import MockDeliveryProvider


@override_settings(
    ALLOW_MOCK_DELIVERY_IN_TESTS=True,
    VERIFICATION_DELIVERY_PROVIDER='mock',
    VERIFICATION_GENERIC_ERRORS=False
)
class EndToEndScenarioValidationTests(TestCase):
    """
    End-to-End automated validation executing Scenarios A through G.
    """

    def setUp(self):
        self.client = APIClient()
        self.now = timezone.now()

        # Institutional Accounts
        self.admin = User.objects.create_user(
            username='e2e_admin',
            email='admin@campus.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.admin_peer = User.objects.create_user(
            username='e2e_admin_peer',
            email='peer@campus.edu',
            password='PeerPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.student = User.objects.create_user(
            username='e2e_student',
            email='student@campus.edu',
            password='StudentPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            college_id='STU-E2E-001',
            is_active=True
        )
        self.student_record = Student.objects.create(
            user=self.student,
            college_id='STU-E2E-001',
            full_name='Rohan Verma',
            email='student@campus.edu',
            department='Computer Science',
            academic_year=3,
            course='B.Tech CSE',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )

    def test_scenario_a_authentication_and_role_isolation(self):
        """Scenario A: Authentication and role isolation."""
        # 1. Authenticate with student account
        self.client.force_authenticate(user=self.student)

        # 2. Access student-accessible public elections: 200 OK
        res_elections = self.client.get('/api/v1/elections/')
        self.assertEqual(res_elections.status_code, status.HTTP_200_OK)

        # 3. Attempt to access restricted administrative endpoints: 403 Forbidden
        res_admin_students = self.client.get('/api/v1/admin/students/')
        self.assertEqual(res_admin_students.status_code, status.HTTP_403_FORBIDDEN)

        res_audit = self.client.get('/api/v1/audit/logs/')
        self.assertEqual(res_audit.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Sign out / unauthenticate
        self.client.logout()

        # 5. Access protected page: 401/403
        res_protected = self.client.get('/api/v1/admin/students/')
        self.assertIn(res_protected.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_scenario_b_student_and_eligibility_management(self):
        """Scenario B: Student and eligibility management."""
        self.client.force_authenticate(user=self.admin)

        # 1. Create synthetic student via student roster API
        res_create = self.client.post('/api/v1/admin/students/', {
            'college_id': 'STU-E2E-002',
            'full_name': 'Meera Patel',
            'email': 'meera.patel@campus.edu',
            'department': 'Mechanical Engineering',
            'academic_year': 2,
            'course': 'B.Tech ME',
            'enrollment_status': 'ENROLLED'
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Student.objects.filter(college_id='STU-E2E-002').exists())

        # 2. Duplicate college_id rejection
        res_dup = self.client.post('/api/v1/admin/students/', {
            'college_id': 'STU-E2E-002',
            'full_name': 'Duplicate Entry',
            'email': 'dup@campus.edu',
            'department': 'Mechanical Engineering',
            'academic_year': 2,
            'course': 'B.Tech ME',
            'enrollment_status': 'ENROLLED'
        }, format='json')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Evaluate eligibility
        rule = ElectionEligibilityRule.objects.create(
            election_id='00000000-0000-0000-0000-000000000001',
            title='Engineering 3rd/4th Year Rule',
            allowed_departments=['Computer Science', 'Mechanical Engineering'],
            allowed_academic_years=[3, 4],
            required_enrollment_statuses=['ENROLLED']
        )
        meera = Student.objects.get(college_id='STU-E2E-002')
        is_eligible, reason = EligibilityEngineService.evaluate_student(meera, rule)
        # Year 2 is not eligible
        self.assertFalse(is_eligible)

    def test_scenario_c_election_administration_and_nominations(self):
        """Scenario C: Election administration and nominations."""
        self.client.force_authenticate(user=self.admin)

        # 1. Create test election in DRAFT
        election = Election.objects.create(
            title='E2E General Election',
            description='Automated scenario validation election',
            academic_year='2025-2026',
            start_time=self.now + timedelta(days=2),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin
        )

        # 2. Configure position
        pos = ElectionPosition.objects.create(
            election=election,
            title='General Secretary',
            display_order=1
        )
        self.assertEqual(pos.election, election)

        # 3. Submit nomination
        cand = Candidate.objects.create(
            election_position=pos,
            student=self.student_record,
            manifesto='Dedicated student leadership.',
            status=CandidateStatus.UNDER_REVIEW
        )

        # 4. Review and approve nomination
        cand.status = CandidateStatus.APPROVED
        cand.save()
        self.assertEqual(cand.status, CandidateStatus.APPROVED)

        # 5. Transition to SCHEDULED
        res_sched = self.client.post(f'/api/v1/elections/{election.id}/schedule/')
        self.assertEqual(res_sched.status_code, status.HTTP_200_OK)
        election.refresh_from_db()
        self.assertEqual(election.status, ElectionStatus.SCHEDULED)

    def test_scenario_d_verification_provider_and_challenge_handling(self):
        """Scenario D: Verification flows (synthetic/development provider)."""
        # Test start verification with registered student ID
        res_start = self.client.post('/api/v1/verification/id/start/', {
            'college_id': 'STU-E2E-001',
            'channel': 'EMAIL'
        }, format='json')
        self.assertEqual(res_start.status_code, status.HTTP_200_OK)
        session_id = res_start.data.get('session_id')
        self.assertIsNotNone(session_id)

        # Test invalid OTP submission
        res_bad_otp = self.client.post('/api/v1/verification/otp/verify/', {
            'session_id': session_id,
            'otp': '999999'  # Invalid OTP
        }, format='json')
        self.assertEqual(res_bad_otp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scenario_e_voting_fail_closed_behavior(self):
        """Scenario E: Voting fail-closed behavior."""
        # Create active synthetic election
        active_election = Election.objects.create(
            title='Active Synthetic Election',
            academic_year='2025-2026',
            start_time=self.now - timedelta(hours=1),
            end_time=self.now + timedelta(hours=1),
            status=ElectionStatus.ACTIVE,
            created_by=self.admin
        )
        pos = ElectionPosition.objects.create(election=active_election, title='Representative', display_order=1)
        cand = Candidate.objects.create(election_position=pos, student=self.student_record, status=CandidateStatus.APPROVED)

        self.client.force_authenticate(user=self.student)
        # Attempt live ballot submission without completed 2FA verification
        res_submit = self.client.post(
            f'/api/v1/voting/elections/{active_election.id}/ballot/submit/',
            {'selections': [{'position_id': str(pos.id), 'candidate_id': str(cand.id), 'is_abstain': False}]},
            format='json'
        )

        # Must fail-closed (Verification required / Real voting gate blocked)
        self.assertEqual(res_submit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('verification', str(res_submit.data).lower())

        # Confirm 0 ballots cast
        self.assertEqual(AnonymousBallot.objects.filter(election_id=active_election.id).count(), 0)
        self.assertEqual(VoterParticipationRecord.objects.filter(election=active_election).count(), 0)

    def test_scenario_f_monitoring_and_anomalies(self):
        """Scenario F: Monitoring aggregates and anomaly signal lifecycle."""
        closed_election = Election.objects.create(
            title='Monitored Closed Election',
            academic_year='2025-2026',
            start_time=self.now - timedelta(days=2),
            end_time=self.now - timedelta(hours=1),
            status=ElectionStatus.CLOSED,
            created_by=self.admin
        )

        # Generate synthetic anomaly signal
        alert = AnomalyAlert.objects.create(
            election=closed_election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            detector_type='RULE_BASED',
            severity=AnomalySeverity.HIGH,
            risk_score=80.0,
            status=AnomalyStatus.OPEN,
            detected_at=timezone.now(),
            explanation='High burst in turnout velocity.'
        )

        self.client.force_authenticate(user=self.admin)
        # Acknowledge
        res_ack = self.client.post(f'/api/v1/anomaly/elections/{closed_election.id}/anomalies/{alert.id}/acknowledge/')
        self.assertEqual(res_ack.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertEqual(alert.status, AnomalyStatus.ACKNOWLEDGED)

        # Resolve with required notes
        res_res = self.client.post(
            f'/api/v1/anomaly/elections/{closed_election.id}/anomalies/{alert.id}/resolve/',
            {'resolution_note': 'Investigated burst: normal lunch-hour student voting peak.'},
            format='json'
        )
        self.assertEqual(res_res.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertEqual(alert.status, AnomalyStatus.RESOLVED)

    def test_scenario_g_results_management_and_governance(self):
        """Scenario G: Results calculation, separation of duties, and publication isolation."""
        closed_election = Election.objects.create(
            title='Synthetic Election for Results',
            academic_year='2025-2026',
            start_time=self.now - timedelta(days=2),
            end_time=self.now - timedelta(hours=1),
            status=ElectionStatus.CLOSED,
            created_by=self.admin
        )
        pos = ElectionPosition.objects.create(election=closed_election, title='President', display_order=1)
        Candidate.objects.create(election_position=pos, student=self.student_record, status=CandidateStatus.APPROVED)

        # 1. Admin calculates synthetic results
        result = ResultWorkflowService.calculate_and_create_version(
            election=closed_election,
            user=self.admin,
            is_synthetic=True
        )
        self.assertEqual(result.version, 1)
        self.assertEqual(result.status, ResultLifecycleStatus.CALCULATED)

        # 2. Separation of duties: Calculator cannot self-approve
        with self.assertRaises(PermissionError):
            ResultWorkflowService.approve_result(
                result=result,
                user=self.admin,
                notes='Self approval attempt'
            )

        # 3. Independent peer admin approves
        approved_result = ResultWorkflowService.approve_result(
            result=result,
            user=self.admin_peer,
            notes='Independent review verified.'
        )
        self.assertEqual(approved_result.status, ResultLifecycleStatus.APPROVED)

        # 4. Public endpoint 404 isolation before publication
        self.client.logout()
        res_public = self.client.get(f'/api/v1/public/elections/{closed_election.id}/results/')
        self.assertEqual(res_public.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Publish approved synthetic result
        published_result = ResultWorkflowService.publish_result(
            result=approved_result,
            user=self.admin_peer
        )
        self.assertEqual(published_result.status, ResultLifecycleStatus.PUBLISHED)

        # 6. Public endpoint now serves certified results with synthetic label
        res_public_after = self.client.get(f'/api/v1/public/elections/{closed_election.id}/results/')
        self.assertEqual(res_public_after.status_code, status.HTTP_200_OK)
        self.assertTrue(res_public_after.data.get('is_synthetic'))
        self.assertEqual(res_public_after.data.get('result_digest'), published_result.result_digest)
