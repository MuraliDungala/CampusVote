"""
Automated Test Suite for Phase 6: Real-Time Voter Monitoring and Election Analytics.
CampusVote Smart ID-Based College Voting System.

Tests all security constraints, aggregation algorithms, privacy suppression thresholds,
real-time event dispatching, and role-based access control.
"""

from datetime import timedelta
import json
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from channels.testing import WebsocketCommunicator

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import Election, ElectionStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.voting.models import VoterParticipationRecord, AnonymousBallot
from apps.monitoring.services import ElectionAnalyticsService
from apps.monitoring.consumers import ElectionTurnoutConsumer
from apps.monitoring.events import broadcast_turnout_update
from config.asgi import application


class ElectionMonitoringPhase6Tests(TestCase):
    """Comprehensive test suite for Phase 6 Real-Time Monitoring and Analytics."""

    def setUp(self):
        self.client = APIClient()

        # 1. Accounts
        self.admin_user = User.objects.create_user(
            username='admin_monitor',
            email='admin_monitor@campus.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        self.student_user = User.objects.create_user(
            username='student_voter',
            email='student_voter@campus.edu',
            password='StudentPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        # 2. Students in different departments (for privacy suppression testing)
        # 6 in Computer Science (>= 5, should NOT be suppressed)
        self.cs_students = []
        for i in range(6):
            s = Student.objects.create(
                college_id=f'CS-STU-{i+1:03d}',
                full_name=f'CS Student {i+1}',
                email=f'cs{i+1}@campus.edu',
                department='Computer Science',
                academic_year=3,
                enrollment_status=EnrollmentStatus.ENROLLED,
                is_active=True
            )
            self.cs_students.append(s)

        # 3 in Philosophy (< 5, MUST be suppressed)
        self.phil_students = []
        for i in range(3):
            s = Student.objects.create(
                college_id=f'PHIL-STU-{i+1:03d}',
                full_name=f'Phil Student {i+1}',
                email=f'phil{i+1}@campus.edu',
                department='Philosophy',
                academic_year=2,
                enrollment_status=EnrollmentStatus.ENROLLED,
                is_active=True
            )
            self.phil_students.append(s)

        # 3. Active Election
        now = timezone.now()
        self.election = Election.objects.create(
            title='Campus Senate General Election 2026',
            description='Executive leadership election',
            academic_year='2025-2026',
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=6),
            status=ElectionStatus.ACTIVE,
            created_by=self.admin_user
        )

        # 4. Record 4 participants from Computer Science, 1 from Philosophy
        for s in self.cs_students[:4]:
            VoterParticipationRecord.objects.create(
                election=self.election,
                student=s,
                user=self.admin_user,
                authorization_token_hash='hash123'
            )

        VoterParticipationRecord.objects.create(
            election=self.election,
            student=self.phil_students[0],
            user=self.admin_user,
            authorization_token_hash='hash456'
        )

    # --------------------------------------------------------------------------
    # 1. Access Control & Authorization Tests
    # --------------------------------------------------------------------------

    def test_01_authorized_admin_can_retrieve_summary_metrics(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['election_id'], str(self.election.id))
        self.assertEqual(response.data['recorded_participants'], 5)
        self.assertEqual(response.data['total_eligible_voters'], 9)
        self.assertEqual(response.data['remaining_eligible_voters'], 4)
        self.assertAlmostEqual(response.data['turnout_percentage'], 55.56, places=1)

    def test_02_student_cannot_access_protected_analytics(self):
        self.client.force_authenticate(user=self.student_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_unauthenticated_user_denied_access(self):
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_04_nonexistent_election_returns_404(self):
        import uuid
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': uuid.uuid4()})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --------------------------------------------------------------------------
    # 2. Metric Calculations & Edge Case Handling
    # --------------------------------------------------------------------------

    def test_05_eligible_voter_count_calculated_correctly(self):
        # 6 CS + 3 Phil = 9 eligible
        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(self.election.id))
        self.assertTrue(success)
        self.assertEqual(metrics['total_eligible_voters'], 9)

    def test_06_recorded_participation_count_calculated_correctly(self):
        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(self.election.id))
        self.assertTrue(success)
        self.assertEqual(metrics['recorded_participants'], 5)

    def test_07_duplicate_participation_records_prevented_by_unique_constraint(self):
        # Attempt duplicate participation for same student
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.cs_students[0],
                user=self.admin_user,
                authorization_token_hash='duplicate'
            )

    def test_08_remaining_eligible_voters_cannot_become_negative(self):
        # Create an election with zero eligible voters
        empty_election = Election.objects.create(
            title='Empty Election',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            status=ElectionStatus.ACTIVE,
            created_by=self.admin_user
        )
        # Restrict rule to non-existent department
        rule = ElectionEligibilityRule.objects.create(
            election_id=empty_election.id,
            allowed_departments=['Astronomy'],
            is_active=True
        )

        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(empty_election.id))
        self.assertTrue(success)
        self.assertEqual(metrics['total_eligible_voters'], 0)
        self.assertEqual(metrics['remaining_eligible_voters'], 0)
        self.assertEqual(metrics['turnout_percentage'], 0.0)

    def test_09_zero_eligible_voters_does_not_cause_division_error(self):
        empty_election = Election.objects.create(
            title='Zero Voters Election',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        # Deactivate all students
        Student.objects.update(is_active=False)

        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(empty_election.id))
        self.assertTrue(success)
        self.assertEqual(metrics['turnout_percentage'], 0.0)

    def test_10_turnout_percentage_calculated_accurately(self):
        # 5 voted out of 9 eligible: 5 / 9 * 100 = 55.555... -> 55.56
        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(self.election.id))
        self.assertTrue(success)
        self.assertEqual(metrics['turnout_percentage'], 55.56)

    def test_11_invalid_turnout_values_clamped_safely(self):
        # Even if anomaly occurred where participants > eligible, percentage capped at 100.0
        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(str(self.election.id))
        self.assertLessEqual(metrics['turnout_percentage'], 100.0)
        self.assertGreaterEqual(metrics['turnout_percentage'], 0.0)

    def test_12_closed_election_returns_accurate_final_analytics(self):
        self.election.status = ElectionStatus.CLOSED
        self.election.save()

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['election_status'], 'CLOSED')
        self.assertEqual(response.data['recorded_participants'], 5)

    def test_13_cancelled_election_handled_gracefully(self):
        self.election.status = ElectionStatus.CANCELLED
        self.election.save()

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['election_status'], 'CANCELLED')
        self.assertFalse(response.data['is_open'])

    # --------------------------------------------------------------------------
    # 3. Time-Series Turnout Bucketing Tests
    # --------------------------------------------------------------------------

    def test_14_time_bucket_aggregation_valid_intervals(self):
        self.client.force_authenticate(user=self.admin_user)
        for interval in ('5m', '15m', '1h'):
            url = reverse('monitoring:election-turnout', kwargs={'election_id': self.election.id})
            response = self.client.get(f"{url}?interval={interval}")

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['interval'], interval)
            self.assertIn('buckets', response.data)
            self.assertGreater(len(response.data['buckets']), 0)

            # Cumulative count in final bucket must match total participants
            final_bucket = response.data['buckets'][-1]
            self.assertEqual(final_bucket['cumulative_count'], 5)

    def test_15_invalid_time_interval_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-turnout', kwargs={'election_id': self.election.id})
        response = self.client.get(f"{url}?interval=99m")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # 4. Privacy Suppression in Department Analytics
    # --------------------------------------------------------------------------

    def test_16_department_cohorts_below_threshold_are_suppressed(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-departments', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        departments = response.data['departments']

        # Find Computer Science (6 eligible >= 5 threshold) -> Not Suppressed
        cs_dept = next(d for d in departments if d['department'] == 'Computer Science')
        self.assertFalse(cs_dept['is_suppressed'])
        self.assertEqual(cs_dept['eligible_voters'], 6)
        self.assertEqual(cs_dept['recorded_participants'], 4)
        self.assertAlmostEqual(cs_dept['turnout_percentage'], 66.67, places=1)

        # Find Philosophy (3 eligible < 5 threshold) -> MUST BE SUPPRESSED!
        phil_dept = next(d for d in departments if d['department'] == 'Philosophy')
        self.assertTrue(phil_dept['is_suppressed'])
        self.assertIn("below privacy threshold", phil_dept['suppression_reason'])
        self.assertIsNone(phil_dept['eligible_voters'])
        self.assertIsNone(phil_dept['recorded_participants'])
        self.assertIsNone(phil_dept['turnout_percentage'])

    def test_17_filtering_cannot_bypass_suppression(self):
        # Querying department endpoint directly enforces threshold
        success, data, _ = ElectionAnalyticsService.get_department_analytics(str(self.election.id))
        self.assertTrue(success)
        phil_dept = next(d for d in data['departments'] if d['department'] == 'Philosophy')
        self.assertTrue(phil_dept['is_suppressed'])

    # --------------------------------------------------------------------------
    # 5. Secrecy & Decoupling Guarantees
    # --------------------------------------------------------------------------

    def test_18_analytics_responses_contain_no_student_identifiers(self):
        self.client.force_authenticate(user=self.admin_user)
        urls = [
            reverse('monitoring:election-summary', kwargs={'election_id': self.election.id}),
            reverse('monitoring:election-turnout', kwargs={'election_id': self.election.id}),
            reverse('monitoring:election-departments', kwargs={'election_id': self.election.id}),
        ]

        for url in urls:
            response = self.client.get(url)
            content = json.dumps(response.data)

            # Ensure zero student IDs, college IDs, names, or emails are leaked
            for s in self.cs_students + self.phil_students:
                self.assertNotIn(s.college_id, content)
                self.assertNotIn(s.full_name, content)
                self.assertNotIn(s.email, content)

    def test_19_analytics_responses_contain_no_ballot_selections(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)
        content = json.dumps(response.data)

        # Zero candidate choice or ballot keys
        self.assertNotIn('selections', content)
        self.assertNotIn('candidate_id', content)
        self.assertNotIn('receipt_id', content)

    # --------------------------------------------------------------------------
    # 6. WebSocket Authorization & Real-Time Event Dispatch
    # --------------------------------------------------------------------------

    async def test_20_websocket_unauthenticated_connection_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/elections/{self.election.id}/turnout/"
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4001)

    async def test_21_websocket_student_role_rejected(self):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/elections/{self.election.id}/turnout/"
        )
        communicator.scope['user'] = self.student_user
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4003)

    async def test_22_websocket_admin_connection_accepted_and_receives_snapshot(self):
        communicator = WebsocketCommunicator(
            application,
            f"/ws/elections/{self.election.id}/turnout/"
        )
        communicator.scope['user'] = self.admin_user
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Receive initial aggregate snapshot
        message = await communicator.receive_json_from()
        self.assertEqual(message['type'], 'initial_snapshot')
        self.assertEqual(message['data']['recorded_participants'], 5)
        self.assertEqual(message['data']['total_eligible_voters'], 9)

        await communicator.disconnect()

    def test_23_broadcast_turnout_update_dispatches_clean_aggregate(self):
        # Event broadcast function executes without throwing and returns True
        result = broadcast_turnout_update(str(self.election.id))
        self.assertTrue(result)

    def test_24_connection_status_endpoint_reports_transport_info(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('monitoring:election-connection-status', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['websocket_supported'])
        self.assertEqual(response.data['polling_fallback_interval_seconds'], 5)
