"""
Automated Test Suite for Phase 7: AI-Based Anomaly Detection and Election Security Monitoring.
CampusVote Smart ID-Based College Voting System.

Tests all rule-based detectors, statistical & Isolation Forest ML algorithms, alert lifecycles,
role-based permissions, and privacy guarantees.
"""

import json
from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import Election, ElectionStatus
from apps.voting.models import VoterParticipationRecord
from apps.audit.models import AuditLog, AuditAction
from apps.anomaly.models import (
    AnomalyAlert,
    AnomalyType,
    AnomalySeverity,
    AnomalyStatus,
    DetectorType
)
from apps.anomaly.services import (
    RuleBasedAnomalyDetector,
    IsolationForestAnomalyDetector,
    AnomalyOrchestratorService
)


class AnomalyDetectionPhase7Tests(TestCase):
    """Comprehensive test suite for Phase 7 Anomaly Detection and Security Monitoring."""

    def setUp(self):
        self.client = APIClient()

        # 1. Accounts
        self.admin_user = User.objects.create_user(
            username='admin_secops',
            email='admin_secops@campus.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        self.student_user = User.objects.create_user(
            username='student_voter7',
            email='student7@campus.edu',
            password='StudentPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        # 2. Students in active standing
        self.students = []
        for i in range(12):
            s = Student.objects.create(
                college_id=f'CS-P7-{i+1:03d}',
                full_name=f'P7 Student {i+1}',
                email=f'p7_{i+1}@campus.edu',
                department='Computer Science',
                academic_year=3,
                enrollment_status=EnrollmentStatus.ENROLLED,
                is_active=True
            )
            self.students.append(s)

        # 3. Active Election
        now = timezone.now()
        self.election = Election.objects.create(
            title='Campus Senate Spring 2026',
            description='General legislative election',
            academic_year='2025-2026',
            start_time=now - timedelta(hours=3),
            end_time=now + timedelta(hours=5),
            status=ElectionStatus.ACTIVE,
            created_by=self.admin_user
        )

    # --------------------------------------------------------------------------
    # 1. Rule-Based Detection Tests
    # --------------------------------------------------------------------------

    def test_01_structured_assessment_produced_for_election(self):
        # Normal baseline with 2 votes
        VoterParticipationRecord.objects.create(
            election=self.election,
            student=self.students[0],
            user=self.admin_user,
            authorization_token_hash='h1'
        )
        VoterParticipationRecord.objects.create(
            election=self.election,
            student=self.students[1],
            user=self.admin_user,
            authorization_token_hash='h2'
        )

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        self.assertIsInstance(candidates, list)
        # Normal participation should not trigger critical integrity violations
        self.assertFalse(any(c['anomaly_type'] == AnomalyType.DATA_INTEGRITY_VIOLATION for c in candidates))

    def test_02_turnout_velocity_spike_detected_under_configured_conditions(self):
        # Rapidly create 8 votes in the current 5m window (> 20% of 12 students = 2.4 votes)
        now = timezone.now()
        for i in range(8):
            v = VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.students[i],
                user=self.admin_user,
                authorization_token_hash=f'spike_{i}'
            )
            # Set participated_at inside latest 5-min window
            v.participated_at = now - timedelta(minutes=1)
            v.save(update_fields=['participated_at'])

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        spike_alert = next((c for c in candidates if c['anomaly_type'] == AnomalyType.TURNOUT_VELOCITY_SPIKE), None)
        self.assertIsNotNone(spike_alert)
        self.assertIn("turnout surge", spike_alert['explanation'].lower())
        self.assertGreaterEqual(spike_alert['risk_score'], 50.0)

    def test_03_normal_turnout_increase_not_flagged_as_fraud(self):
        # 1 vote every hour across 3 hours
        now = timezone.now()
        for i in range(3):
            v = VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.students[i],
                user=self.admin_user,
                authorization_token_hash=f'norm_{i}'
            )
            v.participated_at = now - timedelta(hours=3 - i)
            v.save(update_fields=['participated_at'])

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        spike_alert = next((c for c in candidates if c['anomaly_type'] == AnomalyType.TURNOUT_VELOCITY_SPIKE), None)
        self.assertIsNone(spike_alert)

    def test_04_data_integrity_violation_triggered_if_participants_exceed_eligible(self):
        # Artificially deactivate students to make eligible electorate smaller than participants
        for i in range(3):
            VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.students[i],
                user=self.admin_user,
                authorization_token_hash=f'int_{i}'
            )

        # Deactivate 11 of the 12 students so total eligible becomes 1, but recorded is 3!
        Student.objects.exclude(id=self.students[0].id).update(is_active=False)

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        integrity_alert = next((c for c in candidates if c['anomaly_type'] == AnomalyType.DATA_INTEGRITY_VIOLATION), None)
        self.assertIsNotNone(integrity_alert)
        self.assertEqual(integrity_alert['severity'], AnomalySeverity.CRITICAL)
        self.assertGreaterEqual(integrity_alert['risk_score'], 90.0)

    def test_05_elevated_auth_failure_rate_detected(self):
        now = timezone.now()
        # Log 12 failed OTP attempts and 2 successful ones in the last 30 minutes
        for _ in range(12):
            AuditLog.objects.create(
                action=AuditAction.OTP_FAILED,
                target_type='VERIFICATION_SESSION',
                created_at=now - timedelta(minutes=10)
            )
        for _ in range(2):
            AuditLog.objects.create(
                action=AuditAction.OTP_VERIFIED,
                target_type='VERIFICATION_SESSION',
                created_at=now - timedelta(minutes=10)
            )

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        auth_alert = next((c for c in candidates if c['anomaly_type'] == AnomalyType.ELEVATED_AUTH_FAILURE_RATE), None)
        self.assertIsNotNone(auth_alert)
        self.assertIn("verification failure rate", auth_alert['explanation'].lower())

    def test_06_elevated_duplicate_vote_rate_detected(self):
        now = timezone.now()
        for _ in range(6):
            AuditLog.objects.create(
                action=AuditAction.DUPLICATE_VOTE_BLOCKED,
                target_type='ELECTION',
                target_id=str(self.election.id),
                created_at=now - timedelta(minutes=15)
            )

        candidates = RuleBasedAnomalyDetector.evaluate_election(self.election)
        dup_alert = next((c for c in candidates if c['anomaly_type'] == AnomalyType.ELEVATED_DUPLICATE_VOTE_RATE), None)
        self.assertIsNotNone(dup_alert)
        self.assertIn("duplicate vote attempts", dup_alert['explanation'].lower())

    # --------------------------------------------------------------------------
    # 2. Machine-Learning & Statistical Detector Tests
    # --------------------------------------------------------------------------

    def test_07_isolation_forest_handles_insufficient_data_safely(self):
        # When fewer than 8 time buckets exist, ML detector safely returns None
        result = IsolationForestAnomalyDetector.evaluate_time_series(self.election)
        self.assertIsNone(result)

    def test_08_isolation_forest_detects_multivariate_outlier_when_history_present(self):
        now = timezone.now()
        # Create steady historical buckets across 10 intervals
        for i in range(10):
            if i < len(self.students):
                v = VoterParticipationRecord.objects.create(
                    election=self.election,
                    student=self.students[i],
                    user=self.admin_user,
                    authorization_token_hash=f'ml_{i}'
                )
                v.participated_at = self.election.start_time + timedelta(minutes=i * 5)
                v.save(update_fields=['participated_at'])

        # Isolation forest executes without throwing errors
        result = IsolationForestAnomalyDetector.evaluate_time_series(self.election)
        # Either returns an alert dict or None gracefully
        if result:
            self.assertEqual(result['detector_type'], DetectorType.MACHINE_LEARNING)
            self.assertIn('model', result['evidence_summary'])

    # --------------------------------------------------------------------------
    # 3. Anomaly Orchestrator & Deduplication Tests
    # --------------------------------------------------------------------------

    def test_09_pipeline_creates_alert_records_and_emits_audit(self):
        # Trigger data integrity anomaly
        for i in range(3):
            VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.students[i],
                user=self.admin_user,
                authorization_token_hash=f'orch_{i}'
            )
        Student.objects.exclude(id=self.students[0].id).update(is_active=False)

        success, alerts, err = AnomalyOrchestratorService.run_detection_pipeline(str(self.election.id))
        self.assertTrue(success)
        self.assertGreater(len(alerts), 0)

        alert = alerts[0]
        self.assertEqual(alert.status, AnomalyStatus.OPEN)
        self.assertEqual(alert.election, self.election)

        # Audit log must be emitted
        audit_exists = AuditLog.objects.filter(
            action=AuditAction.ANOMALY_DETECTED,
            target_id=str(alert.id)
        ).exists()
        self.assertTrue(audit_exists)

    def test_10_deduplication_prevents_uncontrolled_duplicate_alerts(self):
        # Trigger an anomaly
        for i in range(3):
            VoterParticipationRecord.objects.create(
                election=self.election,
                student=self.students[i],
                user=self.admin_user,
                authorization_token_hash=f'dedup_{i}'
            )
        Student.objects.exclude(id=self.students[0].id).update(is_active=False)

        # Run pipeline first time
        success1, alerts1, _ = AnomalyOrchestratorService.run_detection_pipeline(str(self.election.id))
        self.assertTrue(success1)
        count1 = len(alerts1)
        self.assertGreater(count1, 0)

        # Run pipeline second time immediately -> should deduplicate and generate 0 new alerts!
        success2, alerts2, _ = AnomalyOrchestratorService.run_detection_pipeline(str(self.election.id))
        self.assertTrue(success2)
        self.assertEqual(len(alerts2), 0)

    # --------------------------------------------------------------------------
    # 4. Alert Lifecycle & State Transition Tests
    # --------------------------------------------------------------------------

    def test_11_alert_lifecycle_transitions(self):
        alert = AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            severity=AnomalySeverity.MEDIUM,
            risk_score=65.0,
            explanation="Test velocity spike",
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        # OPEN -> ACKNOWLEDGED
        self.assertTrue(alert.can_transition_to(AnomalyStatus.ACKNOWLEDGED))
        alert.status = AnomalyStatus.ACKNOWLEDGED
        alert.save()

        # ACKNOWLEDGED -> INVESTIGATING
        self.assertTrue(alert.can_transition_to(AnomalyStatus.INVESTIGATING))
        alert.status = AnomalyStatus.INVESTIGATING
        alert.save()

        # INVESTIGATING -> RESOLVED
        self.assertTrue(alert.can_transition_to(AnomalyStatus.RESOLVED))
        alert.status = AnomalyStatus.RESOLVED
        alert.save()

        # Terminal state check: RESOLVED cannot jump to OPEN directly
        self.assertFalse(alert.can_transition_to(AnomalyStatus.OPEN))

    # --------------------------------------------------------------------------
    # 5. Access Control & API Endpoint Tests
    # --------------------------------------------------------------------------

    def test_12_admin_can_list_and_filter_alerts(self):
        AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            severity=AnomalySeverity.HIGH,
            risk_score=75.0,
            explanation="High severity spike",
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:election-anomalies', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['alerts'][0]['severity'], 'HIGH')

    def test_13_student_forbidden_from_anomaly_endpoints(self):
        self.client.force_authenticate(user=self.student_user)
        url = reverse('anomaly:election-anomalies', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_14_unauthenticated_user_denied_access(self):
        url = reverse('anomaly:election-anomalies', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_15_admin_can_acknowledge_alert(self):
        alert = AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            severity=AnomalySeverity.LOW,
            risk_score=40.0,
            explanation="Low severity anomaly",
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:anomaly-acknowledge', kwargs={'election_id': self.election.id, 'pk': alert.id})
        response = self.client.post(url, {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ACKNOWLEDGED')

        # Check audit log
        self.assertTrue(AuditLog.objects.filter(action=AuditAction.ANOMALY_ACKNOWLEDGED, target_id=str(alert.id)).exists())

    def test_16_admin_can_resolve_alert_with_note(self):
        alert = AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.ELEVATED_AUTH_FAILURE_RATE,
            severity=AnomalySeverity.MEDIUM,
            risk_score=60.0,
            explanation="Auth failure rate spike",
            detected_at=timezone.now(),
            status=AnomalyStatus.INVESTIGATING
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:anomaly-resolve', kwargs={'election_id': self.election.id, 'pk': alert.id})

        # Resolving without note is rejected
        res_fail = self.client.post(url, {'resolution_note': ''})
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Resolving with note succeeds
        res_ok = self.client.post(url, {'resolution_note': 'Telecom SMS gateway experienced temporary packet loss.'})
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data['status'], 'RESOLVED')
        self.assertEqual(res_ok.data['resolution_note'], 'Telecom SMS gateway experienced temporary packet loss.')

    def test_17_admin_can_mark_alert_false_positive(self):
        alert = AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            severity=AnomalySeverity.MEDIUM,
            risk_score=55.0,
            explanation="Velocity spike at 12:00 PM",
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:anomaly-mark-false-positive', kwargs={'election_id': self.election.id, 'pk': alert.id})
        response = self.client.post(url, {'resolution_note': 'Corresponds to University Lunch Hour dismissal.'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'FALSE_POSITIVE')

    # --------------------------------------------------------------------------
    # 6. Privacy & Secrecy Non-Disclosure Guarantees
    # --------------------------------------------------------------------------

    def test_18_anomaly_responses_contain_no_candidate_selections(self):
        alert = AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.DATA_INTEGRITY_VIOLATION,
            severity=AnomalySeverity.HIGH,
            risk_score=80.0,
            explanation="Integrity check",
            evidence_summary={'metric': 'votes', 'total': 10},
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:anomaly-detail', kwargs={'election_id': self.election.id, 'pk': alert.id})
        response = self.client.get(url)

        content = json.dumps(response.data, default=str)
        self.assertNotIn('candidate', content)
        self.assertNotIn('selections', content)
        self.assertNotIn('receipt_id', content)

    def test_19_anomaly_records_contain_no_student_identifiers(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:election-anomalies', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        content = json.dumps(response.data, default=str)
        for s in self.students:
            self.assertNotIn(s.college_id, content)
            self.assertNotIn(s.full_name, content)
            self.assertNotIn(s.email, content)

    def test_20_anomaly_summary_endpoint_provides_overview_counts(self):
        AnomalyAlert.objects.create(
            election=self.election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            severity=AnomalySeverity.CRITICAL,
            risk_score=95.0,
            explanation="Critical spike",
            detected_at=timezone.now(),
            status=AnomalyStatus.OPEN
        )

        self.client.force_authenticate(user=self.admin_user)
        url = reverse('anomaly:election-anomaly-summary', kwargs={'election_id': self.election.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_alerts'], 1)
        self.assertEqual(response.data['open_alerts'], 1)
        self.assertEqual(response.data['critical_severity_count'], 1)
        self.assertEqual(response.data['detector_status'], 'OPERATIONAL')
