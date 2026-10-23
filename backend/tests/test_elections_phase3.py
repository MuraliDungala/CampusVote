"""
Comprehensive Backend Tests for Phase 3:
Election, Position, and Candidate Nomination Management.
"""

from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import Role, AccountStatus
from apps.students.models import Student
from apps.eligibility.models import ElectionEligibilityRule
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.audit.models import AuditLog, AuditAction

User = get_user_model()


class ElectionManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin_user = User.objects.create_user(
            username='admin_elections',
            email='admin@campusvote.edu',
            password='TestPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
        )

        # Student user 1 (Eligible)
        self.student_user1 = User.objects.create_user(
            username='student_eligible',
            email='alice@campusvote.edu',
            password='TestPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            college_id='CS2026001',
        )
        self.student1 = Student.objects.create(
            college_id='CS2026001',
            full_name='Alice Johnson',
            email='alice@campusvote.edu',
            department='CSE',
            academic_year=3,
            course='B.Tech CSE',
            enrollment_status='ENROLLED',
            is_active=True,
            user=self.student_user1
        )

        # Student user 2 (Ineligible: year 1 when rule requires year >= 2)
        self.student_user2 = User.objects.create_user(
            username='student_ineligible',
            email='bob@campusvote.edu',
            password='TestPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            college_id='CS2026002',
        )
        self.student2 = Student.objects.create(
            college_id='CS2026002',
            full_name='Bob Smith',
            email='bob@campusvote.edu',
            department='CSE',
            academic_year=1,
            course='B.Tech CSE',
            enrollment_status='ENROLLED',
            is_active=True,
            user=self.student_user2
        )

        # Student user 3 (Inactive student)
        self.student_user3 = User.objects.create_user(
            username='student_inactive',
            email='charlie@campusvote.edu',
            password='TestPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
            college_id='CS2026003',
        )
        self.student3 = Student.objects.create(
            college_id='CS2026003',
            full_name='Charlie Brown',
            email='charlie@campusvote.edu',
            department='MECH',
            academic_year=2,
            course='B.Tech MECH',
            enrollment_status='SUSPENDED',
            is_active=False,
            user=self.student_user3
        )

        self.now = timezone.now()

    def test_01_admin_creates_election(self):
        """1. Authorized administrator can create an election."""
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'title': 'Student Council 2026-2027',
            'description': 'Annual general student council election',
            'academic_year': '2026-2027',
            'start_time': (self.now + timedelta(days=1)).isoformat(),
            'end_time': (self.now + timedelta(days=3)).isoformat(),
        }
        response = self.client.post('/api/v1/elections/', payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Student Council 2026-2027')
        self.assertEqual(response.data['status'], ElectionStatus.DRAFT)

        # Audit event verified
        audit = AuditLog.objects.filter(action=AuditAction.ELECTION_CREATED).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_username, self.admin_user.username)

    def test_02_unauthorized_student_cannot_create_election(self):
        """2. Unauthorized student cannot create an election."""
        self.client.force_authenticate(user=self.student_user1)
        payload = {
            'title': 'Hacked Election',
            'start_time': (self.now + timedelta(days=1)).isoformat(),
            'end_time': (self.now + timedelta(days=2)).isoformat(),
        }
        response = self.client.post('/api/v1/elections/', payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_election_start_and_end_times_validated(self):
        """3. Election start and end times are validated."""
        self.client.force_authenticate(user=self.admin_user)
        # End time before start time
        payload = {
            'title': 'Invalid Time Election',
            'start_time': (self.now + timedelta(days=2)).isoformat(),
            'end_time': (self.now + timedelta(days=1)).isoformat(),
        }
        response = self.client.post('/api/v1/elections/', payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_04_invalid_lifecycle_transitions_rejected(self):
        """4. Invalid lifecycle transitions are rejected."""
        election = Election.objects.create(
            title='Test Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        self.client.force_authenticate(user=self.admin_user)

        # Direct transition from DRAFT to RESULTS_PUBLISHED is invalid
        response = self.client.post(f'/api/v1/elections/{election.id}/publish-results/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Direct transition from DRAFT to CLOSED is invalid
        response = self.client.post(f'/api/v1/elections/{election.id}/close/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_05_scheduled_election_cannot_be_activated_without_positions(self):
        """5. A scheduled election cannot be activated without configured positions."""
        election = Election.objects.create(
            title='Empty Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        self.client.force_authenticate(user=self.admin_user)

        # Cannot schedule without positions
        response = self.client.post(f'/api/v1/elections/{election.id}/schedule/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_closed_election_cannot_be_reactivated(self):
        """6. Closed elections cannot be reactivated through ordinary endpoints."""
        election = Election.objects.create(
            title='Closed Election',
            start_time=self.now - timedelta(days=2),
            end_time=self.now - timedelta(days=1),
            status=ElectionStatus.CLOSED,
            created_by=self.admin_user
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(f'/api/v1/elections/{election.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_07_position_creation_and_permissions(self):
        """7. Position creation requires appropriate permissions."""
        election = Election.objects.create(
            title='Council 2026',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )

        # Student cannot create position
        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/elections/{election.id}/positions/', {'title': 'President'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can create position
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/v1/elections/{election.id}/positions/', {
            'title': 'President',
            'description': 'Council chief executive',
            'display_order': 1
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'President')

    def test_08_duplicate_position_names_rejected(self):
        """8. Duplicate position names within the same election are rejected."""
        election = Election.objects.create(
            title='Council 2026',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        ElectionPosition.objects.create(election=election, title='President')

        self.client.force_authenticate(user=self.admin_user)
        # Attempt duplicate with different casing
        response = self.client.post(f'/api/v1/elections/{election.id}/positions/', {'title': 'president'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_09_active_election_position_modification_prohibited(self):
        """9. An active election cannot have its positions modified."""
        election = Election.objects.create(
            title='Active Election',
            start_time=self.now - timedelta(hours=1),
            end_time=self.now + timedelta(days=1),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='Secretary')
        election.status = ElectionStatus.ACTIVE
        election.save()

        self.client.force_authenticate(user=self.admin_user)
        # Attempt to add new position
        response = self.client.post(f'/api/v1/elections/{election.id}/positions/', {'title': 'Treasurer'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Attempt to delete existing position
        response = self.client.delete(f'/api/v1/positions/{pos.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_10_eligible_student_can_nominate_and_submit(self):
        """10. An eligible student can create and submit a nomination."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')

        # Configure eligibility rule (requires CSE and year >= 2)
        ElectionEligibilityRule.objects.create(
            election_id=election.id,
            title='Senior CSE Rule',
            allowed_departments=['CSE'],
            allowed_academic_years=[2, 3, 4],
            required_enrollment_statuses=['ENROLLED']
        )

        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/positions/{pos.id}/nominations/', {
            'manifesto': 'Empowering student voices with transparency.',
            'submit_now': True
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], CandidateStatus.SUBMITTED)
        self.assertTrue(response.data['eligibility_snapshot']['is_eligible'])

    def test_11_inactive_student_cannot_nominate(self):
        """11. An inactive student cannot nominate."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='Vice President')

        self.client.force_authenticate(user=self.student_user3)
        response = self.client.post(f'/api/v1/positions/{pos.id}/nominations/', {
            'manifesto': 'I want to run.',
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_12_ineligible_student_cannot_submit_nomination(self):
        """12. An ineligible student cannot submit a nomination."""
        election = Election.objects.create(
            title='Senior Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')

        # Rule requires year >= 2
        ElectionEligibilityRule.objects.create(
            election_id=election.id,
            title='Year 2+ Rule',
            allowed_academic_years=[2, 3, 4],
        )

        # student 2 is Year 1
        self.client.force_authenticate(user=self.student_user2)
        response = self.client.post(f'/api/v1/positions/{pos.id}/nominations/', {
            'manifesto': 'Freshman running for president.',
            'submit_now': True
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('eligibility', str(response.data))

    def test_13_duplicate_nominations_rejected(self):
        """13. Duplicate nominations for same position are rejected."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='Treasurer')
        Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.DRAFT)

        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/positions/{pos.id}/nominations/', {
            'manifesto': 'Duplicate nomination attempt.',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_14_student_cannot_modify_other_student_nomination(self):
        """14. A student cannot modify another student's nomination."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='Senator')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.DRAFT)

        # Student 2 attempts to edit Student 1's nomination
        self.client.force_authenticate(user=self.student_user2)
        response = self.client.patch(f'/api/v1/nominations/{cand.id}/', {'manifesto': 'Tampered manifesto'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_15_student_cannot_approve_own_nomination(self):
        """15. A student cannot approve their own nomination."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.SUBMITTED)

        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/nominations/{cand.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_16_admin_approves_nomination_with_eligibility_recheck(self):
        """16. Admin approves nomination with real-time eligibility recheck."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.SUBMITTED)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/v1/nominations/{cand.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], CandidateStatus.APPROVED)

    def test_17_rejection_requires_reason(self):
        """17. Rejection requires a mandatory reason."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.SUBMITTED)

        self.client.force_authenticate(user=self.admin_user)
        # Attempt rejection without reason
        response = self.client.post(f'/api/v1/nominations/{cand.id}/reject/', {'rejection_reason': ''})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Successful rejection with reason
        response = self.client.post(f'/api/v1/nominations/{cand.id}/reject/', {
            'rejection_reason': 'Failed disciplinary vetting.'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], CandidateStatus.REJECTED)

    def test_18_candidate_eligibility_recheck_blocks_approval_if_ineligible(self):
        """18. Candidate eligibility recheck blocks approval if student became ineligible."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.SUBMITTED)

        # Deactivate student before review
        self.student1.is_active = False
        self.student1.save()

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/v1/nominations/{cand.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('eligibility re-check failed', response.data['error'])

    def test_19_nomination_withdrawal(self):
        """19. Candidate can withdraw nomination."""
        election = Election.objects.create(
            title='Annual Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='Secretary')
        cand = Candidate.objects.create(election_position=pos, student=self.student1, status=CandidateStatus.SUBMITTED)

        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/nominations/{cand.id}/withdraw/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], CandidateStatus.WITHDRAWN)

    def test_20_cancelled_election_rejects_nomination(self):
        """20. Cancelled elections reject nomination actions."""
        election = Election.objects.create(
            title='Cancelled Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.CANCELLED,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President')

        self.client.force_authenticate(user=self.student_user1)
        response = self.client.post(f'/api/v1/positions/{pos.id}/nominations/', {'manifesto': 'Running'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_21_audit_events_created_for_administrative_actions(self):
        """21. Audit events are created for important administrative actions."""
        election = Election.objects.create(
            title='Audited Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        ElectionPosition.objects.create(election=election, title='Representative')

        self.client.force_authenticate(user=self.admin_user)
        self.client.post(f'/api/v1/elections/{election.id}/schedule/')

        audit = AuditLog.objects.filter(
            action=AuditAction.ELECTION_SCHEDULED,
            target_id=str(election.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_username, self.admin_user.username)

    def test_22_election_summary_endpoint(self):
        """22. Election summary returns real aggregate counts."""
        Election.objects.create(
            title='Draft 1',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=2),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/elections/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['total_elections'], 1)
        self.assertGreaterEqual(response.data['draft_elections'], 1)

    def test_23_organizer_can_manage_own_election(self):
        """23. Authorized organizer can update and manage their own election."""
        election = Election.objects.create(
            title='My Organized Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(f'/api/v1/elections/{election.id}/', {'title': 'Updated Title'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Updated Title')

    def test_24_unauthorized_admin_cannot_manage_another_organizers_election(self):
        """24. Unauthorized administrator cannot manage or transition another organizer's election."""
        other_admin = User.objects.create_user(
            username='other_admin',
            email='other@campusvote.edu',
            password='TestPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE
        )
        election = Election.objects.create(
            title='Alice Admin Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )

        self.client.force_authenticate(user=other_admin)
        # Attempt PATCH
        patch_res = self.client.patch(f'/api/v1/elections/{election.id}/', {'title': 'Hijacked Title'})
        self.assertEqual(patch_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not its designated organizer", patch_res.data['detail'])

        # Attempt Transition
        ElectionPosition.objects.create(election=election, title='Secretary')
        trans_res = self.client.post(f'/api/v1/elections/{election.id}/schedule/')
        self.assertEqual(trans_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_25_super_admin_can_manage_any_election(self):
        """25. Super Administrator has institutional oversight and can manage any election."""
        super_admin = User.objects.create_user(
            username='super_admin',
            email='super@campusvote.edu',
            password='TestPassword123!',
            role=Role.SUPER_ADMIN,
            status=AccountStatus.ACTIVE
        )
        election = Election.objects.create(
            title='Regular Organizer Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )

        self.client.force_authenticate(user=super_admin)
        response = self.client.patch(f'/api/v1/elections/{election.id}/', {'title': 'Super Admin Updated'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Super Admin Updated')

    def test_26_my_elections_filter(self):
        """26. Query parameter ?my_elections=true returns only elections organized by the user."""
        other_admin = User.objects.create_user(
            username='other_organizer',
            email='other_org@campusvote.edu',
            password='TestPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE
        )
        Election.objects.create(
            title='My Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        Election.objects.create(
            title='Other Admin Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=other_admin
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/elections/?my_elections=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e['title'] for e in response.data['results']]
        self.assertIn('My Election', titles)
        self.assertNotIn('Other Admin Election', titles)

    def test_27_admin_can_add_candidate_directly(self):
        """27. Election Administrator can directly add/nominate a participating student candidate to a position."""
        election = Election.objects.create(
            title='Executive Council Election',
            start_time=self.now + timedelta(days=1),
            end_time=self.now + timedelta(days=3),
            status=ElectionStatus.DRAFT,
            created_by=self.admin_user
        )
        pos = ElectionPosition.objects.create(election=election, title='President', maximum_candidates=5)

        # Admin adds candidate directly
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/v1/positions/{pos.id}/candidates/', {
            'student_id': self.student1.college_id,
            'manifesto': 'Dedicated leadership and student welfare advocacy.',
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], CandidateStatus.APPROVED)
        self.assertEqual(response.data['student_college_id'], self.student1.college_id)

        # Verify candidate exists and is approved
        cand = Candidate.objects.get(election_position=pos, student=self.student1)
        self.assertEqual(cand.status, CandidateStatus.APPROVED)
        self.assertEqual(cand.reviewed_by, self.admin_user)
