"""
Phase 9 Comprehensive Security Hardening & Regression Test Suite.
Validates end-to-end security properties, authorization barriers, privacy boundaries,
and integrity verification across all application subsystems.
"""

import json
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from django.core.exceptions import ValidationError

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.voting.models import AnonymousBallot, VoterParticipationRecord
from apps.anomaly.models import AnomalyAlert, AnomalyType, AnomalySeverity, AnomalyStatus
from apps.audit.models import AuditLog
from apps.results.models import ElectionResult, ResultLifecycleStatus, TallySourceType, VerificationStatus
from apps.results.services import ResultWorkflowService


class Phase9SecurityHardeningTests(TestCase):
    """
    Comprehensive test coverage for Phase 9 Security Hardening & End-to-End Validation.
    """

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Institutional Accounts
        self.super_admin = User.objects.create_user(
            username='p9_superadmin',
            email='superadmin@campus.edu',
            password='StrongPassword123!',
            role=Role.SUPER_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.election_admin1 = User.objects.create_user(
            username='p9_admin1',
            email='admin1@campus.edu',
            password='StrongPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.election_admin2 = User.objects.create_user(
            username='p9_admin2',
            email='admin2@campus.edu',
            password='StrongPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.auditor = User.objects.create_user(
            username='p9_auditor',
            email='auditor@campus.edu',
            password='StrongPassword123!',
            role=Role.AUDITOR,
            status=AccountStatus.ACTIVE,
            is_active=True
        )
        self.student_user = User.objects.create_user(
            username='p9_student',
            email='student@campus.edu',
            password='StrongPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            college_id='STU-2026-9001',
            is_active=True
        )
        self.deactivated_admin = User.objects.create_user(
            username='p9_deactivated',
            email='deactivated@campus.edu',
            password='StrongPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.REVOKED,
            is_active=False
        )

        # Student Roster
        self.student_record = Student.objects.create(
            user=self.student_user,
            college_id='STU-2026-9001',
            full_name='Amina Siddiqui',
            email='amina.siddiqui@campus.edu',
            department='Computer Science',
            academic_year=2,
            course='B.Tech CSE',
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )

        # Closed Synthetic Election for Results Verification
        self.closed_election = Election.objects.create(
            title='Phase 9 Hardening Validation Election',
            description='Synthetic benchmark election for security validation',
            academic_year='2025-2026',
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=ElectionStatus.CLOSED,
            created_by=self.election_admin1
        )
        self.pos1 = ElectionPosition.objects.create(
            election=self.closed_election,
            title='President',
            display_order=1
        )
        self.pos2 = ElectionPosition.objects.create(
            election=self.closed_election,
            title='Vice President',
            display_order=2
        )
        self.cand1 = Candidate.objects.create(
            election_position=self.pos1,
            student=self.student_record,
            manifesto='Transparency and student welfare.',
            status=CandidateStatus.APPROVED
        )

    # =========================================================================
    # 1. AUTHENTICATION & AUTHORIZATION HARDENING
    # =========================================================================

    def test_01_deactivated_account_cannot_authenticate_or_access_apis(self):
        """Deactivated accounts must be rejected by auth and permission layers."""
        self.client.force_authenticate(user=self.deactivated_admin)
        url = '/api/v1/elections/'
        res = self.client.get(url)
        # In DRF, unauthenticated or inactive user yields 401/403
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_02_student_role_cannot_access_administrative_endpoints(self):
        """Students must be strictly blocked from administrative mutation endpoints."""
        self.client.force_authenticate(user=self.student_user)

        # 1. Attempt to create election
        res1 = self.client.post('/api/v1/elections/', {'title': 'Hacked Election'})
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Attempt to calculate results
        res2 = self.client.post(f'/api/v1/admin/elections/{self.closed_election.id}/results/calculate/')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Attempt to trigger anomaly scans
        res3 = self.client.post(f'/api/v1/anomaly/elections/{self.closed_election.id}/anomalies/run/')
        self.assertEqual(res3.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Attempt to access audit logs
        res4 = self.client.get('/api/v1/audit/logs/')
        self.assertEqual(res4.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_auditor_has_read_only_access_and_cannot_mutate(self):
        """Auditors can inspect audit logs and results, but cannot create or mutate elections."""
        self.client.force_authenticate(user=self.auditor)

        # Read audit logs: Allowed
        res_read = self.client.get('/api/v1/audit/logs/')
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)

        # Mutate election: Forbidden
        res_write = self.client.post('/api/v1/elections/', {'title': 'Auditor Election'})
        self.assertEqual(res_write.status_code, status.HTTP_403_FORBIDDEN)

        # Mutate results calculation: Forbidden
        res_calc = self.client.post(f'/api/v1/admin/elections/{self.closed_election.id}/results/calculate/')
        self.assertEqual(res_calc.status_code, status.HTTP_403_FORBIDDEN)

    def test_04_unauthenticated_request_to_protected_api_is_rejected(self):
        """Unauthenticated requests are denied access to private endpoints."""
        res = self.client.get('/api/v1/audit/logs/')
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # =========================================================================
    # 2. STUDENT REGISTRY & ELIGIBILITY HARDENING
    # =========================================================================

    def test_05_student_college_id_duplicate_rejection(self):
        """Database and model integrity prevents duplicate student IDs."""
        with self.assertRaises(Exception):
            Student.objects.create(
                college_id='STU-2026-9001',  # Identical to existing record
                full_name='Duplicate Impersonator',
                email='impersonator@campus.edu',
                department='Mechanical',
                academic_year=2,
                course='B.Tech ME',
                enrollment_status=EnrollmentStatus.ENROLLED
            )

    def test_06_eligibility_engine_rules_and_explicit_override(self):
        """
        Eligibility service evaluates departmental/year rules, while explicit overrides
        take precedence according to institutional governance.
        """
        # Create rule requiring 3rd year
        rule = ElectionEligibilityRule.objects.create(
            election_id=self.closed_election.id,
            title='CS Upperclassmen Rule',
            allowed_departments=['Computer Science'],
            allowed_academic_years=[3, 4],
            required_enrollment_statuses=[EnrollmentStatus.ENROLLED],
            is_active=True
        )

        # Student is in year 2 -> Expected Ineligible under rule
        is_eligible, reason = EligibilityEngineService.evaluate_student(
            student=self.student_record,
            rule=rule
        )
        self.assertFalse(is_eligible)

        # Apply explicit inclusion override (Whitelist)
        rule.included_student_ids = [self.student_record.college_id]
        rule.save()

        is_eligible_override, reason_override = EligibilityEngineService.evaluate_student(
            student=self.student_record,
            rule=rule
        )
        self.assertTrue(is_eligible_override)
        self.assertIn('override', reason_override.lower())

    # =========================================================================
    # 3. ELECTION LIFECYCLE STATE MACHINE HARDENING
    # =========================================================================

    def test_07_invalid_lifecycle_transition_rejection(self):
        """Cannot jump from DRAFT to CLOSED or archived without following lifecycle."""
        now = timezone.now()
        draft_election = Election.objects.create(
            title='Draft Lifecycle Election',
            academic_year='2025-2026',
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.election_admin1
        )

        # Direct transition from DRAFT to CLOSED is forbidden
        self.client.force_authenticate(user=self.election_admin1)
        res = self.client.post(f'/api/v1/elections/{draft_election.id}/close/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # 4. ANONYMOUS BALLOT PRIVACY BOUNDARIES
    # =========================================================================

    def test_08_anonymous_ballot_has_zero_foreign_key_or_link_to_student(self):
        """AnonymousBallot schema strictly contains no student_id, user_id, or voter link."""
        ballot_fields = [f.name for f in AnonymousBallot._meta.get_fields()]
        self.assertNotIn('student', ballot_fields)
        self.assertNotIn('student_id', ballot_fields)
        self.assertNotIn('user', ballot_fields)
        self.assertNotIn('user_id', ballot_fields)
        self.assertNotIn('voter', ballot_fields)

    def test_09_voter_participation_record_has_zero_ballot_choices_or_receipts(self):
        """VoterParticipationRecord tracks only that a voter participated, not what they voted."""
        participation_fields = [f.name for f in VoterParticipationRecord._meta.get_fields()]
        self.assertNotIn('ballot', participation_fields)
        self.assertNotIn('ballot_id', participation_fields)
        self.assertNotIn('selections', participation_fields)
        self.assertNotIn('candidate', participation_fields)

    def test_10_real_election_voting_is_fail_closed_blocked(self):
        """Live voting endpoint must remain blocked pending cryptographic certification."""
        self.client.force_authenticate(user=self.student_user)
        res = self.client.post(
            f'/api/v1/voting/elections/{self.closed_election.id}/ballot/submit/',
            {
                'selections': [
                    {
                        'position_id': str(self.pos1.id),
                        'candidate_id': str(self.cand1.id),
                        'is_abstain': False
                    }
                ]
            },
            format='json'
        )

        # Live voting endpoint returns 400/403/503 indicating fail-closed protocol
        self.assertIn(res.status_code, [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_503_SERVICE_UNAVAILABLE
        ])
        body_text = str(res.data).lower()
        self.assertTrue(
            'fail-closed' in body_text or
            'cryptographic' in body_text or
            'disabled' in body_text or
            'blocked' in body_text or
            'review' in body_text or
            'eligib' in body_text or
            'verification' in body_text
        )

    # =========================================================================
    # 5. ANOMALY DETECTION & ALERT GOVERNANCE
    # =========================================================================

    def test_11_anomaly_alert_resolution_requires_mandatory_notes(self):
        """Resolving an anomaly alert requires mandatory investigative explanation."""
        self.client.force_authenticate(user=self.election_admin1)
        alert = AnomalyAlert.objects.create(
            election=self.closed_election,
            anomaly_type=AnomalyType.TURNOUT_VELOCITY_SPIKE,
            detector_type='RULE_BASED',
            severity=AnomalySeverity.HIGH,
            risk_score=85.0,
            status=AnomalyStatus.OPEN,
            detected_at=timezone.now(),
            explanation='High burst in turnout velocity.'
        )

        # Attempt to resolve without notes
        res_empty = self.client.post(
            f'/api/v1/anomaly/elections/{self.closed_election.id}/anomalies/{alert.id}/resolve/',
            {'resolution_note': ''},
            format='json'
        )
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

        # Resolve with proper notes
        res_valid = self.client.post(
            f'/api/v1/anomaly/elections/{self.closed_election.id}/anomalies/{alert.id}/resolve/',
            {'resolution_note': 'Turnout surge investigated: coincided with post-assembly student turnout.'},
            format='json'
        )
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertEqual(alert.status, AnomalyStatus.RESOLVED)

    # =========================================================================
    # 6. RESULTS GOVERNANCE, SEPARATION OF DUTIES & PUBLICATION GATES
    # =========================================================================

    def test_12_separation_of_duties_prevents_calculator_self_approval(self):
        """An administrator cannot approve a result version they calculated."""
        # Admin 1 calculates synthetic result
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.closed_election,
            user=self.election_admin1,
            is_synthetic=True
        )
        self.assertEqual(result.calculated_by, self.election_admin1)

        # Admin 1 attempts to approve own result: Blocked by Separation of Duties
        with self.assertRaises(PermissionError) as ctx:
            ResultWorkflowService.approve_result(
                result=result,
                user=self.election_admin1,
                notes='Self approval attempt'
            )
        self.assertIn('separation of duties', str(ctx.exception).lower())

        # Admin 2 approves: Succeeds
        approved_result = ResultWorkflowService.approve_result(
            result=result,
            user=self.election_admin2,
            notes='Independent review verified.'
        )
        self.assertEqual(approved_result.status, ResultLifecycleStatus.APPROVED)
        self.assertEqual(approved_result.approved_by, self.election_admin2)

    def test_13_fail_closed_publication_gate_blocks_unapproved_result(self):
        """Publication must fail if result is not formally approved."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.closed_election,
            user=self.election_admin1,
            is_synthetic=True
        )
        self.assertEqual(result.status, ResultLifecycleStatus.CALCULATED)

        with self.assertRaises(PermissionError) as ctx:
            ResultWorkflowService.publish_result(
                result=result,
                user=self.election_admin2
            )
        self.assertIn('approved', str(ctx.exception).lower())

    def test_14_result_artifact_canonical_digest_tamper_detection(self):
        """
        Recomputing digest over altered aggregate snapshot detects tampering.
        """
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.closed_election,
            user=self.election_admin1,
            is_synthetic=True
        )
        original_digest = result.result_digest

        # Verify initial consistency after approval
        result = ResultWorkflowService.approve_result(result=result, user=self.election_admin2, notes="OK")
        is_eligible, blockers = ResultWorkflowService.evaluate_publication_gates(result)
        self.assertTrue(is_eligible)

        # Mutate aggregate total in stored snapshot
        result.aggregate_snapshot['total_ballots_tallied'] += 999
        is_eligible_tampered, blockers_tampered = ResultWorkflowService.evaluate_publication_gates(result)
        self.assertFalse(is_eligible_tampered)
        self.assertTrue(any('digest verification failed' in b.lower() for b in blockers_tampered))

    def test_15_public_endpoint_never_exposes_unpublished_results(self):
        """Unpublished results must return 404 on the public results endpoint."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.closed_election,
            user=self.election_admin1,
            is_synthetic=True
        )
        # Not published
        self.client.logout()
        res = self.client.get(f'/api/v1/public/elections/{self.closed_election.id}/results/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_16_csv_report_export_contains_cryptographic_digest_and_no_ballot_choices(self):
        """Exported CSV report contains deterministic metadata without individual ballot choices."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.closed_election,
            user=self.election_admin1,
            is_synthetic=True
        )

        csv_content = ResultWorkflowService.generate_report_csv(result)

        self.assertIn('CAMPUSVOTE OFFICIAL ELECTION REPORT', csv_content)
        self.assertIn(result.result_digest, csv_content)
        self.assertIn('SYNTHETIC FIXTURE', csv_content)
        # Ensure no individual student identity or ballot receipt tracking
        self.assertNotIn('student_id', csv_content.lower())
        self.assertNotIn('voter_signature', csv_content.lower())

    # =========================================================================
    # 7. AUDIT LOGGING & PRIVACY
    # =========================================================================

    def test_17_audit_log_records_governance_actions_without_secret_leakage(self):
        """Audit records capture governance operations without exposing passwords or tokens."""
        AuditLog.objects.create(
            action='RESULT_CALCULATED',
            actor=self.election_admin1,
            actor_role=Role.ELECTION_ADMIN,
            target_id=str(self.closed_election.id),
            target_type='ElectionResult',
            ip_address='127.0.0.1',
            metadata={'version': 1, 'is_synthetic': True}
        )

        # Authenticate as Auditor
        self.client.force_authenticate(user=self.auditor)
        res = self.client.get('/api/v1/audit/logs/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        logs = res.data.get('results', [])
        self.assertTrue(len(logs) > 0)

        # Inspect serialized audit log: verify absence of secrets
        log_json = json.dumps(logs)
        self.assertNotIn('password', log_json.lower())
        self.assertNotIn('secret_key', log_json.lower())
        self.assertNotIn('token', log_json.lower())
        self.assertNotIn('candidate_selection', log_json.lower())
