"""
Comprehensive Backend Test Suite for Phase 5:
Anonymous Ballot Architecture and Voting Interface.
CampusVote Smart ID-Based College Voting System.
"""

import uuid
from datetime import timedelta
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import (
    Election,
    ElectionStatus,
    ElectionPosition,
    Candidate,
    CandidateStatus
)
from apps.eligibility.models import ElectionEligibilityRule
from apps.verification.models import VerificationSession, VerificationState
from apps.audit.models import AuditLog, AuditAction
from apps.voting.models import VoterParticipationRecord, AnonymousBallot
from apps.voting.services import AnonymousBallotService


class BallotPhase5Tests(TestCase):
    """Integration and unit test cases for Phase 5 Anonymous Ballot System."""

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # 1. Create Active Election
        self.election = Election.objects.create(
            title="Student Senate General Elections 2026",
            academic_year="2026-2027",
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=10),
            status=ElectionStatus.ACTIVE
        )

        # 2. Configure Positions
        self.position_pres = ElectionPosition.objects.create(
            election=self.election,
            title="President",
            display_order=1
        )
        self.position_vp = ElectionPosition.objects.create(
            election=self.election,
            title="Vice President",
            display_order=2
        )

        # 3. Create Another Election (for cross-election rejection test)
        self.other_election = Election.objects.create(
            title="Engineering Association Election",
            academic_year="2026-2027",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=5),
            status=ElectionStatus.ACTIVE
        )
        self.other_position = ElectionPosition.objects.create(
            election=self.other_election,
            title="Secretary",
            display_order=1
        )

        # 4. Create Students for Candidates
        self.cand_student_1 = Student.objects.create(
            college_id="CAND202601",
            full_name="Sarah Connor",
            email="sarah@campusvote.edu",
            department="Computer Science",
            academic_year=3,
            course="B.Tech CS",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )
        self.cand_student_2 = Student.objects.create(
            college_id="CAND202602",
            full_name="John Matrix",
            email="john.matrix@campusvote.edu",
            department="Electrical Engineering",
            academic_year=4,
            course="B.Tech EE",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )
        self.cand_student_unapproved = Student.objects.create(
            college_id="CAND202603",
            full_name="Kyle Reese",
            email="kyle@campusvote.edu",
            department="Mechanical Engineering",
            academic_year=2,
            course="B.Tech ME",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True
        )

        # 5. Create Approved Candidates
        self.candidate_pres_1 = Candidate.objects.create(
            election_position=self.position_pres,
            student=self.cand_student_1,
            manifesto="Forward thinking collegiate leadership.",
            status=CandidateStatus.APPROVED
        )
        self.candidate_vp_1 = Candidate.objects.create(
            election_position=self.position_vp,
            student=self.cand_student_2,
            manifesto="Engineering student union representation.",
            status=CandidateStatus.APPROVED
        )
        # Unapproved candidate
        self.candidate_unapproved = Candidate.objects.create(
            election_position=self.position_pres,
            student=self.cand_student_unapproved,
            manifesto="Pending approval manifesto.",
            status=CandidateStatus.SUBMITTED
        )

        # 6. Create Eligible Verified Voter
        self.voter_user = User.objects.create_user(
            username="voter_alex",
            email="alex@campusvote.edu",
            college_id="STU2026001",
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            password="VoterPassword2026!"
        )
        self.voter_student = Student.objects.create(
            college_id="STU2026001",
            full_name="Alex Rivera",
            email="alex@campusvote.edu",
            department="Computer Science",
            academic_year=3,
            course="B.Tech CS",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True,
            user=self.voter_user
        )
        # Verified Session in Phase 4
        VerificationSession.objects.create(
            college_id="STU2026001",
            student=self.voter_student,
            state=VerificationState.VERIFIED
        )

        # 7. Create Unverified Voter
        self.unverified_user = User.objects.create_user(
            username="voter_unverified",
            email="unverified@campusvote.edu",
            college_id="STU2026002",
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            password="VoterPassword2026!"
        )
        self.unverified_student = Student.objects.create(
            college_id="STU2026002",
            full_name="Maya Lin",
            email="unverified@campusvote.edu",
            department="Computer Science",
            academic_year=2,
            course="B.Tech CS",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=True,
            user=self.unverified_user
        )

        # 8. Create Inactive Student Voter
        self.inactive_user = User.objects.create_user(
            username="voter_inactive",
            email="inactive@campusvote.edu",
            college_id="STU2026003",
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            password="VoterPassword2026!"
        )
        self.inactive_student = Student.objects.create(
            college_id="STU2026003",
            full_name="Dave Miller",
            email="inactive@campusvote.edu",
            department="Computer Science",
            academic_year=1,
            course="B.Tech CS",
            enrollment_status=EnrollmentStatus.ENROLLED,
            is_active=False,
            user=self.inactive_user
        )

    # 1. An authenticated eligible student can retrieve an available ballot definition
    def test_01_eligible_student_can_retrieve_ballot_definition(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-definition', kwargs={'election_id': self.election.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['election']['title'], self.election.title)
        self.assertEqual(res.data['total_positions'], 2)
        self.assertTrue(res.data['voter_status']['is_eligible'])
        # Candidate data check
        pres_pos = next(p for p in res.data['positions'] if p['id'] == str(self.position_pres.id))
        self.assertEqual(len(pres_pos['candidates']), 1)
        self.assertEqual(pres_pos['candidates'][0]['full_name'], "Sarah Connor")

    # 2. An unauthenticated user cannot access a protected ballot workflow
    def test_02_unauthenticated_user_denied_ballot_access(self):
        url = reverse('voting:ballot-definition', kwargs={'election_id': self.election.id})
        res = self.client.get(url)
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # 3. An inactive student cannot proceed
    def test_03_inactive_student_cannot_submit_ballot(self):
        self.client.force_authenticate(user=self.inactive_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('inactive', res.data['error'].lower())

    # 4. An unverified student is rejected where verification is required
    def test_04_unverified_student_rejected_from_voting(self):
        self.client.force_authenticate(user=self.unverified_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('verification required', res.data['error'].lower())

    # 5. An ineligible student cannot proceed
    def test_05_ineligible_student_by_rule_cannot_vote(self):
        # Create an eligibility rule restricting election to Electrical Engineering department only
        ElectionEligibilityRule.objects.create(
            election_id=self.election.id,
            title="EE Department Franchise Only",
            allowed_departments=["Electrical Engineering"],
            is_active=True
        )
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ineligible', res.data['error'].lower())

    # 6. A closed election rejects ballot submissions
    def test_06_closed_election_rejects_ballot_submissions(self):
        self.election.status = ElectionStatus.CLOSED
        self.election.save()

        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('closed', res.data['error'].lower())

    # 7. A cancelled election rejects ballot submissions
    def test_07_cancelled_election_rejects_ballot_submissions(self):
        self.election.status = ElectionStatus.CANCELLED
        self.election.save()

        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cancelled', res.data['error'].lower())

    # 8. A position from another election is rejected
    def test_08_position_from_another_election_rejected(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.other_position.id), 'is_abstain': True},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalid or does not belong to this election', res.data['error'].lower())

    # 9. A candidate who is not approved is rejected
    def test_09_unapproved_candidate_rejected(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_unapproved.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not an approved candidate', res.data['error'].lower())

    # 10. Duplicate position selections are rejected
    def test_10_duplicate_position_selections_rejected(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_pres.id), 'is_abstain': True},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('duplicate selection', res.data['error'].lower())

    # 11. Invalid payload fields are rejected (strict schema)
    def test_11_invalid_payload_fields_rejected(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {
                    'position_id': str(self.position_pres.id),
                    'candidate_id': str(self.candidate_pres_1.id),
                    'is_abstain': False,
                    'injected_voter_field': 'malicious_tracking_id'
                },
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 12. Required position selections are enforced
    def test_12_required_position_selections_enforced(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        # Submit only 1 position when 2 are configured
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expected selections for 2 position(s)', res.data['error'].lower())

    # 13. Abstention is handled according to election rules
    def test_13_abstention_valid_when_permitted(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': None, 'is_abstain': True},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['status'], 'ACCEPTED')
        self.assertTrue(res.data['receipt_id'].startswith('CV-REC-'))

    # 14. Accepted ballot schema contains no direct user or student relationship
    def test_14_ballot_schema_contains_no_identity_foreign_key(self):
        # Inspect model fields on AnonymousBallot
        field_names = [f.name for f in AnonymousBallot._meta.get_fields()]
        self.assertNotIn('student', field_names)
        self.assertNotIn('student_id', field_names)
        self.assertNotIn('user', field_names)
        self.assertNotIn('user_id', field_names)
        self.assertNotIn('email', field_names)
        self.assertNotIn('college_id', field_names)
        self.assertNotIn('participation', field_names)

    # 15. Submission responses do not reveal candidate selections
    def test_15_submission_response_does_not_reveal_selections(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Verify selections are NOT in response
        self.assertNotIn('selections', res.data)
        self.assertNotIn('candidate_id', res.data)
        self.assertNotIn('Sarah Connor', str(res.data))
        self.assertNotIn('John Matrix', str(res.data))

    # 16. Audit logs do not contain candidate selections
    def test_16_audit_logs_do_not_contain_candidate_choices(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        self.client.post(url, payload, format='json')

        audit_entry = AuditLog.objects.filter(
            action=AuditAction.BALLOT_SUBMISSION_ACCEPTED,
            target_id=str(self.election.id)
        ).first()

        self.assertIsNotNone(audit_entry)
        self.assertNotIn('Sarah Connor', str(audit_entry.metadata))
        self.assertNotIn('John Matrix', str(audit_entry.metadata))
        self.assertNotIn('candidate_id', str(audit_entry.metadata))
        self.assertNotIn('selections', audit_entry.metadata)

    # 17. Unexpected failures do not falsely report acceptance
    def test_17_unexpected_failures_do_not_report_acceptance(self):
        # Trigger validation failure on non-existent candidate
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(uuid.uuid4()), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotEqual(res.data.get('status'), 'ACCEPTED')

    # 18. Duplicate submission attempts are rejected safely (one-person-one-vote)
    def test_18_duplicate_submission_attempts_rejected(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        # First submission succeeds
        res1 = self.client.post(url, payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second submission rejected
        res2 = self.client.post(url, payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('already cast a ballot', res2.data['error'].lower())

    # 19. Unapproved duplicate-vote prevention mechanism fail-closed on real production election
    def test_19_real_production_election_fails_closed_without_review(self):
        prod_election = Election.objects.create(
            title="Real Production General Election",
            academic_year="PRODUCTION_REAL",
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=5),
            status=ElectionStatus.ACTIVE
        )
        prod_pos = ElectionPosition.objects.create(
            election=prod_election,
            title="Senator",
            display_order=1
        )
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-submit', kwargs={'election_id': prod_election.id})
        payload = {
            'selections': [
                {'position_id': str(prod_pos.id), 'is_abstain': True}
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('disabled until the cryptographic duplicate-vote prevention', res.data['error'])

    # 20. Participation status endpoint does not leak ballot choices or other students
    def test_20_participation_status_endpoint_reports_status_accurately(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:participation-status', kwargs={'election_id': self.election.id})
        res1 = self.client.get(url)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertFalse(res1.data['has_participated'])

        # Cast vote
        submit_url = reverse('voting:ballot-submit', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'candidate_id': str(self.candidate_vp_1.id), 'is_abstain': False},
            ]
        }
        self.client.post(submit_url, payload, format='json')

        res2 = self.client.get(url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data['has_participated'])
        self.assertIsNotNone(res2.data['participated_at'])
        self.assertNotIn('selections', res2.data)

    # 21. Pre-validation endpoint verifies selections without saving to vote vault
    def test_21_ballot_validate_endpoint_prechecks_without_saving(self):
        self.client.force_authenticate(user=self.voter_user)
        url = reverse('voting:ballot-validate', kwargs={'election_id': self.election.id})
        payload = {
            'selections': [
                {'position_id': str(self.position_pres.id), 'candidate_id': str(self.candidate_pres_1.id), 'is_abstain': False},
                {'position_id': str(self.position_vp.id), 'is_abstain': True},
            ]
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_valid'])

        # Verify nothing was written to vote vault
        self.assertEqual(AnonymousBallot.objects.count(), 0)
        self.assertEqual(VoterParticipationRecord.objects.count(), 0)
