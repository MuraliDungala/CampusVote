"""
Automated Test Suite for Phase 8: Results Management, Election Reports, and Audit Verification.
CampusVote Smart ID-Based College Voting System.

Comprehensive tests covering:
- Deterministic calculation, rankings, percentages, and tie detection
- Ballot schema integrity and malformed input rejection
- Participation reconciliation and NOT_VERIFIABLE safe defaults
- Result versioning, superseding, and canonical SHA-256 digest verification
- Multi-step workflow: Calculate -> Review -> Approve (Separation of Duties) -> Publish
- Fail-closed publication gates and blocking conditions
- RBAC security: Admin vs Student access control
- Public result endpoint isolation (only published results visible, zero voter linkage)
- CSV report export format and data consistency
- Audit logging for all state transitions
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
from apps.elections.models import Election, ElectionStatus, ElectionPosition, Candidate, CandidateStatus
from apps.voting.models import VoterParticipationRecord, AnonymousBallot
from apps.audit.models import AuditLog, AuditAction
from apps.results.models import (
    ElectionResult,
    ElectionPositionResult,
    ResultLifecycleStatus,
    TallySourceType,
    ReconciliationStatus,
    VerificationStatus
)
from apps.results.services import (
    ResultCalculationService,
    ResultWorkflowService,
    BallotIntegrityService,
    ParticipationReconciliationService,
    SyntheticTallySourceProvider,
    LiveVaultTallySourceProvider
)


class ResultsPhase8Tests(TestCase):
    """Unit and Integration tests for Results Calculation, Verification, and Publication."""

    def setUp(self):
        self.client = APIClient()

        # 1. Accounts
        self.super_admin = User.objects.create_user(
            username='super_admin',
            email='super@campus.edu',
            password='Password123!',
            role=Role.SUPER_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        self.election_admin1 = User.objects.create_user(
            username='admin_calc',
            email='admin1@campus.edu',
            password='Password123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        self.election_admin2 = User.objects.create_user(
            username='admin_approver',
            email='admin2@campus.edu',
            password='Password123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        self.student_user = User.objects.create_user(
            username='student_voter8',
            email='student8@campus.edu',
            password='Password123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            is_active=True
        )

        # 2. Election setup (Closed election for results)
        now = timezone.now()
        self.election = Election.objects.create(
            title="Spring 2026 Student Union General Election",
            description="Official General Election for Executive Council",
            academic_year="2025-2026",
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(hours=1),
            status=ElectionStatus.CLOSED,
            created_by=self.super_admin
        )

        # 3. Positions
        self.pos_president = ElectionPosition.objects.create(
            election=self.election,
            title="President",
            display_order=1
        )

        self.pos_vp = ElectionPosition.objects.create(
            election=self.election,
            title="Vice President",
            display_order=2
        )

        # Backing students for candidates
        self.s_p1 = Student.objects.create(
            college_id="CS2023001",
            full_name="Alice Walker",
            email="alice@campus.edu",
            department="Computer Science",
            academic_year=3,
            enrollment_status=EnrollmentStatus.ENROLLED
        )
        self.s_p2 = Student.objects.create(
            college_id="EC2023002",
            full_name="Bob Smith",
            email="bob@campus.edu",
            department="Electrical Engineering",
            academic_year=3,
            enrollment_status=EnrollmentStatus.ENROLLED
        )
        self.s_v1 = Student.objects.create(
            college_id="ME2023003",
            full_name="Charlie Brown",
            email="charlie@campus.edu",
            department="Mechanical Engineering",
            academic_year=2,
            enrollment_status=EnrollmentStatus.ENROLLED
        )
        self.s_v2 = Student.objects.create(
            college_id="EE2023004",
            full_name="Diana Prince",
            email="diana@campus.edu",
            department="Electrical Engineering",
            academic_year=2,
            enrollment_status=EnrollmentStatus.ENROLLED
        )

        # 4. Candidates for President
        self.cand_p1 = Candidate.objects.create(
            election_position=self.pos_president,
            student=self.s_p1,
            status=CandidateStatus.APPROVED
        )
        self.cand_p2 = Candidate.objects.create(
            election_position=self.pos_president,
            student=self.s_p2,
            status=CandidateStatus.APPROVED
        )

        # Candidates for VP
        self.cand_v1 = Candidate.objects.create(
            election_position=self.pos_vp,
            student=self.s_v1,
            status=CandidateStatus.APPROVED
        )
        self.cand_v2 = Candidate.objects.create(
            election_position=self.pos_vp,
            student=self.s_v2,
            status=CandidateStatus.APPROVED
        )


    # =========================================================================
    # 1. DETERMINISTIC CALCULATION & INTEGRITY UNIT TESTS
    # =========================================================================

    def test_deterministic_calculation_identical_inputs(self):
        """Identical ballot inputs must produce identical vote totals, percentages, and digests."""
        ballots = [
            {
                "ballot_id": "b1",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p1.id), "is_abstain": False},
                    {"position_id": str(self.pos_vp.id), "candidate_id": str(self.cand_v1.id), "is_abstain": False}
                ]
            },
            {
                "ballot_id": "b2",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p1.id), "is_abstain": False},
                    {"position_id": str(self.pos_vp.id), "candidate_id": str(self.cand_v2.id), "is_abstain": False}
                ]
            },
            {
                "ballot_id": "b3",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p2.id), "is_abstain": False},
                    {"position_id": str(self.pos_vp.id), "candidate_id": str(self.cand_v1.id), "is_abstain": False}
                ]
            }
        ]

        # Calculate twice independently
        calc1 = ResultCalculationService.calculate(self.election, ballots)
        calc2 = ResultCalculationService.calculate(self.election, ballots)

        self.assertEqual(calc1['totals']['total_ballots_counted'], 3)
        self.assertEqual(calc1['totals']['total_ballots_counted'], calc2['totals']['total_ballots_counted'])
        self.assertEqual(calc1['artifact_digest'], calc2['artifact_digest'])

        # Alice: 2 votes (66.67%), Bob: 1 vote (33.33%)
        p_res = calc1['positions'][str(self.pos_president.id)]
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['vote_count'], 2)
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['percentage'], 66.67)
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['rank'], 1)
        self.assertFalse(p_res['is_tied'])
        self.assertEqual(p_res['winner_candidate_id'], str(self.cand_p1.id))

    def test_tie_detection_never_invents_winner(self):
        """When two candidates have the exact same highest vote count, is_tied must be True and winner None."""
        ballots = [
            {
                "ballot_id": "b1",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p1.id), "is_abstain": False}
                ]
            },
            {
                "ballot_id": "b2",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p2.id), "is_abstain": False}
                ]
            }
        ]

        calc = ResultCalculationService.calculate(self.election, ballots)
        p_res = calc['positions'][str(self.pos_president.id)]

        self.assertTrue(p_res['is_tied'])
        self.assertIsNone(p_res['winner_candidate_id'])
        self.assertEqual(len(p_res['tie_details']), 2)
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['rank'], 1)
        self.assertEqual(p_res['candidate_results'][str(self.cand_p2.id)]['rank'], 1)

    def test_abstention_handling(self):
        """Abstentions must be accurately tallied without attributing to any candidate."""
        ballots = [
            {
                "ballot_id": "b1",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": None, "is_abstain": True}
                ]
            },
            {
                "ballot_id": "b2",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_p1.id), "is_abstain": False}
                ]
            }
        ]

        calc = ResultCalculationService.calculate(self.election, ballots)
        p_res = calc['positions'][str(self.pos_president.id)]
        self.assertEqual(p_res['abstention_count'], 1)
        self.assertEqual(p_res['total_votes_cast'], 2)
        # Alice has 1 vote out of 2 total votes cast = 50.00%
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['vote_count'], 1)
        self.assertEqual(p_res['candidate_results'][str(self.cand_p1.id)]['percentage'], 50.00)

    def test_ballot_integrity_service_rejects_malformed_ballots(self):
        """Integrity service must flag candidate foreign to position and malformed entries."""
        # Candidate v1 belongs to VP, not President
        foreign_ballot = [
            {
                "ballot_id": "bad1",
                "selections": [
                    {"position_id": str(self.pos_president.id), "candidate_id": str(self.cand_v1.id), "is_abstain": False}
                ]
            }
        ]
        status, issues = BallotIntegrityService.validate_ballots(self.election, foreign_ballot)
        self.assertEqual(status, VerificationStatus.FAILED)
        self.assertTrue(any("does not belong to position" in iss for iss in issues))

    def test_participation_reconciliation_real_election_not_verifiable(self):
        """For live vault ballots, reconciliation must report NOT_VERIFIABLE without leaking mapping."""
        rec_status, diff, notes = ParticipationReconciliationService.reconcile(
            self.election,
            total_ballots=50,
            tally_source_type=TallySourceType.LIVE_VAULT
        )
        self.assertEqual(rec_status, ReconciliationStatus.NOT_VERIFIABLE)
        self.assertIn("NOT_VERIFIABLE", notes)
        self.assertIn("voter privacy", notes)

    def test_fail_closed_live_vault_tally_source_blocks_calculation(self):
        """LiveVaultTallySourceProvider must raise PermissionError until cryptographic review approved."""
        with self.assertRaises(PermissionError):
            LiveVaultTallySourceProvider.get_tally_input(self.election)

    # =========================================================================
    # 2. WORKFLOW & SEPARATION OF DUTIES TESTS
    # =========================================================================

    def test_versioned_result_creation_and_audit(self):
        """Calculating results creates version 1, records SHA-256 digest and logs audit event."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True,
            tally_source_type=TallySourceType.SYNTHETIC_DEVELOPMENT
        )

        self.assertEqual(result.version, 1)
        self.assertEqual(result.lifecycle_status, ResultLifecycleStatus.CALCULATED)
        self.assertTrue(result.is_synthetic)
        self.assertEqual(result.calculated_by, self.election_admin1)
        self.assertTrue(len(result.artifact_digest) == 64)

        # Audit log verification
        audit = AuditLog.objects.filter(
            action=AuditAction.RESULT_CALCULATED,
            target_id=str(result.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.metadata.get('version'), 1)
        self.assertEqual(audit.metadata.get('artifact_digest'), result.artifact_digest)

    def test_superseding_previous_result_creates_new_version(self):
        """Recalculating after changes supersedes the prior version and preserves history."""
        r1 = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        r2 = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        r1.refresh_from_db()
        self.assertEqual(r1.lifecycle_status, ResultLifecycleStatus.SUPERSEDED)
        self.assertEqual(r2.version, 2)
        self.assertEqual(r2.supersedes, r1)

    def test_separation_of_duties_approver_cannot_be_calculator(self):
        """The administrator who calculated the result cannot approve their own result."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        # admin1 attempts to approve own calculation -> Should raise PermissionError
        with self.assertRaises(PermissionError) as ctx:
            ResultWorkflowService.approve_result(
                result=result,
                user=self.election_admin1,
                notes="Self approval attempt"
            )
        self.assertIn("Separation of duties violation", str(ctx.exception))

        # Different admin (admin2) approves -> Succeeds
        approved_result = ResultWorkflowService.approve_result(
            result=result,
            user=self.election_admin2,
            notes="Formal peer review completed and approved."
        )
        self.assertEqual(approved_result.lifecycle_status, ResultLifecycleStatus.APPROVED)
        self.assertEqual(approved_result.approved_by, self.election_admin2)

    def test_rejection_requires_notes(self):
        """Rejecting a result requires mandatory notes/reason."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        with self.assertRaises(ValueError):
            ResultWorkflowService.review_result(
                result=result,
                user=self.election_admin2,
                decision='REJECTED',
                notes=''  # Empty notes should fail
            )

    def test_publication_gate_blocks_unapproved_result(self):
        """Publication service must reject an unapproved or pending result."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        is_eligible, blockers = ResultWorkflowService.evaluate_publication_gates(result)
        self.assertFalse(is_eligible)
        self.assertTrue(any("APPROVED" in b for b in blockers))

        with self.assertRaises(PermissionError):
            ResultWorkflowService.publish_result(result, self.election_admin2)

    def test_publication_succeeds_when_all_gates_pass(self):
        """Once approved and verified, synthetic result publishes cleanly and updates election status."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        ResultWorkflowService.approve_result(
            result=result,
            user=self.election_admin2,
            notes="Review verified."
        )

        published = ResultWorkflowService.publish_result(result, self.election_admin2)
        self.assertEqual(published.lifecycle_status, ResultLifecycleStatus.PUBLISHED)
        self.assertIsNotNone(published.published_at)

        self.election.refresh_from_db()
        self.assertEqual(self.election.status, ElectionStatus.RESULTS_PUBLISHED)

    # =========================================================================
    # 3. BACKEND API ENDPOINT & RBAC TESTS
    # =========================================================================

    def test_calculate_endpoint_admin_authorized(self):
        """POST /api/v1/admin/elections/{id}/results/calculate/ creates new version for admin."""
        self.client.force_authenticate(user=self.election_admin1)
        url = reverse('admin-results:election-results-calculate', kwargs={'election_id': self.election.id})

        response = self.client.post(url, {
            'is_synthetic': True,
            'notes': 'Test run calculation'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version'], 1)
        self.assertEqual(response.data['lifecycle_status'], 'CALCULATED')
        self.assertTrue(response.data['is_synthetic'])

    def test_calculate_endpoint_rejects_student(self):
        """Students must receive 403 Forbidden when requesting result calculation."""
        self.client.force_authenticate(user=self.student_user)
        url = reverse('admin-results:election-results-calculate', kwargs={'election_id': self.election.id})

        response = self.client.post(url, {'is_synthetic': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_calculate_endpoint_rejects_active_election(self):
        """Cannot calculate results while election is still ACTIVE."""
        active_election = Election.objects.create(
            title="Active Election Test",
            academic_year="2025-2026",
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            status=ElectionStatus.ACTIVE,
            created_by=self.super_admin
        )

        self.client.force_authenticate(user=self.election_admin1)
        url = reverse('admin-results:election-results-calculate', kwargs={'election_id': active_election.id})

        response = self.client.post(url, {'is_synthetic': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must be in CLOSED", response.data['error'])

    def test_verification_endpoint_returns_integrity_and_blockers(self):
        """GET /api/v1/admin/elections/{id}/results/{result_id}/verification/ returns status."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        self.client.force_authenticate(user=self.election_admin1)
        url = reverse('admin-results:election-results-verification', kwargs={
            'election_id': self.election.id,
            'result_id': result.id
        })

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['integrity_verification_status'], 'PASSED')
        self.assertIn('publication_eligible', response.data)
        self.assertIn('publication_blockers', response.data)
        self.assertIn('reproducibility', response.data)

    def test_full_api_workflow_calculate_approve_publish(self):
        """Full end-to-end API lifecycle: Calculate -> Review/Approve -> Publish."""
        # 1. Calculate
        self.client.force_authenticate(user=self.election_admin1)
        calc_url = reverse('admin-results:election-results-calculate', kwargs={'election_id': self.election.id})
        res1 = self.client.post(calc_url, {'is_synthetic': True}, format='json')
        result_id = res1.data['id']

        # 2. Approve with different admin
        self.client.force_authenticate(user=self.election_admin2)
        app_url = reverse('admin-results:election-results-approve', kwargs={
            'election_id': self.election.id,
            'result_id': result_id
        })
        res2 = self.client.post(app_url, {'notes': 'All checks passed'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['lifecycle_status'], 'APPROVED')

        # 3. Publish
        pub_url = reverse('admin-results:election-results-publish', kwargs={
            'election_id': self.election.id,
            'result_id': result_id
        })
        res3 = self.client.post(pub_url, format='json')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(res3.data['lifecycle_status'], 'PUBLISHED')

    def test_public_endpoint_blocks_unpublished_results(self):
        """Public endpoint returns 404 when election results have not been published."""
        # Result exists but is only CALCULATED
        ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        url = reverse('results-direct:public-election-results', kwargs={'election_id': self.election.id})
        # Unauthenticated public client
        self.client.logout()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("No published results", response.data['detail'])

    def test_public_endpoint_exposes_published_synthetic_result_with_label(self):
        """Public endpoint returns published results clearly labeled synthetic, with no voter leakage."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )
        ResultWorkflowService.approve_result(result, self.election_admin2, notes="Approved")
        ResultWorkflowService.publish_result(result, self.election_admin2)

        url = reverse('results-direct:public-election-results', kwargs={'election_id': self.election.id})
        self.client.logout()
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_synthetic'])
        self.assertEqual(response.data['election_title'], self.election.title)
        self.assertIn('positions', response.data)
        # Ensure zero student / individual ballot linkage in response payload
        dumped = json.dumps(response.json())
        self.assertNotIn('roll_number', dumped)
        self.assertNotIn('student_id', dumped)
        self.assertNotIn('voter_id', dumped)
        self.assertNotIn('ballot_id', dumped)

    def test_report_export_csv_endpoint(self):
        """GET /api/v1/admin/elections/{id}/results/{result_id}/report/ exports valid CSV."""
        result = ResultWorkflowService.calculate_and_create_version(
            election=self.election,
            user=self.election_admin1,
            is_synthetic=True
        )

        self.client.force_authenticate(user=self.election_admin1)
        url = reverse('admin-results:election-results-report', kwargs={
            'election_id': self.election.id,
            'result_id': result.id
        })

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename=', response['Content-Disposition'])

        content = response.content.decode('utf-8')
        self.assertIn("CAMPUSVOTE OFFICIAL ELECTION REPORT", content)
        self.assertIn(str(result.artifact_digest), content)
        self.assertIn("Alice Walker", content)
