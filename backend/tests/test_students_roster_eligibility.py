"""
Automated Test Suite for Student Roster Management, CSV Ingestion, and Eligibility Engine.
CampusVote Phase 2 Architecture.
"""

import io
import uuid
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User, Role, AccountStatus
from apps.students.models import Student, ImportSession, ImportSessionStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.audit.models import AuditLog, AuditAction


class StudentRosterAndEligibilityTests(APITestCase):
    """Test suite covering student CRUD, CSV preview/commit, RBAC enforcement, and eligibility evaluation."""

    def setUp(self):
        # 1. Create synthetic administrative actor
        self.admin_user = User.objects.create_user(
            username='admin_tester',
            email='admin.tester@campusvote.edu',
            password='AdminPassword123!',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE
        )

        # 2. Create synthetic student actor (unauthorized for admin endpoints)
        self.student_user = User.objects.create_user(
            username='student_tester',
            email='student.tester@campusvote.edu',
            password='StudentPassword123!',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE
        )

        # 3. Create baseline student records
        self.student1 = Student.objects.create(
            college_id='STU-2026-001',
            full_name='Maya Lin',
            email='maya.lin@campusvote.edu',
            department='Computer Science',
            academic_year=2,
            course='B.Tech CS',
            enrollment_status='ENROLLED',
            is_active=True
        )

        self.student2 = Student.objects.create(
            college_id='STU-2026-002',
            full_name='David Kumar',
            email='david.kumar@campusvote.edu',
            department='Electrical Engineering',
            academic_year=3,
            course='B.Tech EE',
            enrollment_status='ENROLLED',
            is_active=True
        )

        self.list_url = reverse('admin-students:student-list-create')
        self.summary_url = reverse('admin-students:student-summary')
        self.preview_url = reverse('admin-students:roster-import-preview')
        self.commit_url = reverse('admin-students:roster-import-commit')
        self.rules_url = reverse('admin-eligibility:rule-list-create')
        self.evaluate_url = reverse('admin-eligibility:evaluate')

    # --------------------------------------------------------------------------
    # 1. Access Control & Authorization Boundaries
    # --------------------------------------------------------------------------

    def test_anonymous_and_student_users_denied_access(self):
        """Verify anonymous and student users are blocked from student roster administration."""
        # Anonymous access
        resp_anon = self.client.get(self.list_url)
        self.assertIn(resp_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Student access
        self.client.force_login(self.student_user)
        resp_student = self.client.get(self.list_url)
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        # Student blocked from import preview
        resp_import = self.client.post(self.preview_url, {})
        self.assertEqual(resp_import.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # 2. Student CRUD Operations & Validations
    # --------------------------------------------------------------------------

    def test_admin_can_create_valid_student_with_normalization(self):
        """Verify admin can create student and college ID is normalized to uppercase."""
        self.client.force_login(self.admin_user)
        payload = {
            'college_id': 'stu-2026-099 ',
            'full_name': 'Sarah Connor',
            'email': 'sarah.connor@campusvote.edu',
            'department': 'Mechanical Engineering',
            'academic_year': 1,
            'course': 'B.Tech Mech',
            'enrollment_status': 'ENROLLED',
        }
        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()['college_id'], 'STU-2026-099')

        # Check audit log created
        audit_entry = AuditLog.objects.filter(action=AuditAction.STUDENT_CREATED).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.actor_username, self.admin_user.username)

    def test_duplicate_college_id_rejected(self):
        """Verify unique college ID constraint is strictly enforced."""
        self.client.force_login(self.admin_user)
        payload = {
            'college_id': 'STU-2026-001',  # Already exists
            'full_name': 'Duplicate Person',
            'email': 'diff.email@campusvote.edu',
            'department': 'Mathematics',
            'academic_year': 2,
        }
        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('college_id', response.json())

    def test_invalid_academic_year_rejected(self):
        """Verify academic years outside 1-5 range are rejected."""
        self.client.force_login(self.admin_user)
        payload = {
            'college_id': 'STU-2026-105',
            'full_name': 'Out of Range',
            'email': 'range@campusvote.edu',
            'department': 'Physics',
            'academic_year': 8,  # Invalid
        }
        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('academic_year', response.json())

    def test_student_search_and_filtering(self):
        """Verify search by ID/name and department filtering works correctly."""
        self.client.force_login(self.admin_user)

        # Search by name
        res_search = self.client.get(f"{self.list_url}?search=Maya")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_search.json()['results']), 1)
        self.assertEqual(res_search.json()['results'][0]['college_id'], 'STU-2026-001')

        # Filter by department
        res_filter = self.client.get(f"{self.list_url}?department=Electrical Engineering")
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filter.json()['results']), 1)
        self.assertEqual(res_filter.json()['results'][0]['college_id'], 'STU-2026-002')

    def test_student_deactivation(self):
        """Verify student deactivation preserves record and sets is_active to False."""
        self.client.force_login(self.admin_user)
        deact_url = reverse('admin-students:student-deactivate', kwargs={'pk': self.student1.id})
        response = self.client.post(deact_url, {'reason': 'Withdrawn from university'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.student1.refresh_from_db()
        self.assertFalse(self.student1.is_active)

        # Verify audit log
        audit_entry = AuditLog.objects.filter(action=AuditAction.STUDENT_DEACTIVATED).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.metadata.get('reason'), 'Withdrawn from university')

    def test_student_summary_counts(self):
        """Verify student summary endpoint computes accurate database statistics."""
        self.client.force_login(self.admin_user)
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['total_students'], 2)
        self.assertEqual(data['active_students'], 2)
        self.assertIn('Computer Science', data['by_department'])

    # --------------------------------------------------------------------------
    # 3. CSV Roster Import Workflow (Upload -> Preview -> Commit)
    # --------------------------------------------------------------------------

    def test_csv_preview_does_not_modify_database(self):
        """Verify that previewing a CSV upload parses rows without writing to Student table."""
        self.client.force_login(self.admin_user)
        initial_student_count = Student.objects.count()

        csv_content = (
            "college_id,full_name,email,department,academic_year,course\n"
            "STU-2026-003,Alice Walker,alice@campusvote.edu,Computer Science,1,B.Tech CS\n"
            "STU-2026-004,Bob Vance,bob@campusvote.edu,Business Administration,2,BBA\n"
        ).encode('utf-8')

        uploaded_file = SimpleUploadedFile("roster.csv", csv_content, content_type="text/csv")
        response = self.client.post(self.preview_url, {'file': uploaded_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['total_rows'], 2)
        self.assertEqual(data['valid_rows'], 2)
        self.assertEqual(data['invalid_rows'], 0)

        # Database count must be unchanged!
        self.assertEqual(Student.objects.count(), initial_student_count)

    def test_csv_preview_detects_duplicates_and_conflicts(self):
        """Verify preview identifies internal duplicates and database conflicts."""
        self.client.force_login(self.admin_user)

        csv_content = (
            "college_id,full_name,email,department,academic_year,course\n"
            # Identical to existing student1
            "STU-2026-001,Maya Lin,maya.lin@campusvote.edu,Computer Science,2,B.Tech CS\n"
            # Conflict with existing student2 (different name and dept)
            "STU-2026-002,David Changed,david.kumar@campusvote.edu,Mathematics,4,B.Sc Math\n"
            # Duplicate internal to file
            "STU-2026-005,First Guy,first@campusvote.edu,Physics,1,B.Sc\n"
            "STU-2026-005,Second Guy,second@campusvote.edu,Physics,1,B.Sc\n"
        ).encode('utf-8')

        uploaded_file = SimpleUploadedFile("test.csv", csv_content, content_type="text/csv")
        response = self.client.post(self.preview_url, {'file': uploaded_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['identical_rows'], 1)
        self.assertEqual(data['conflict_rows'], 1)
        self.assertEqual(data['duplicate_rows'], 1)

    def test_csv_commit_creates_students_atomically(self):
        """Verify committing an import session safely creates new students."""
        self.client.force_login(self.admin_user)

        csv_content = (
            "college_id,full_name,email,department,academic_year,course\n"
            "STU-2026-010,Grace Hopper,grace@campusvote.edu,Computer Science,4,B.Tech CS\n"
            "STU-2026-011,Alan Turing,alan@campusvote.edu,Mathematics,3,B.Sc Math\n"
        ).encode('utf-8')

        uploaded_file = SimpleUploadedFile("new_roster.csv", csv_content, content_type="text/csv")
        preview_resp = self.client.post(self.preview_url, {'file': uploaded_file}, format='multipart')
        session_id = preview_resp.json()['id']

        commit_resp = self.client.post(
            self.commit_url,
            {'session_id': session_id, 'strategy': 'skip_conflicts'},
            format='json'
        )
        self.assertEqual(commit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(commit_resp.json()['created_count'], 2)

        # Verify students exist in DB
        self.assertTrue(Student.objects.filter(college_id='STU-2026-010').exists())
        self.assertTrue(Student.objects.filter(college_id='STU-2026-011').exists())

        # Verify session marked as COMMITTED
        session = ImportSession.objects.get(id=session_id)
        self.assertEqual(session.status, ImportSessionStatus.COMMITTED)

        # Subsequent commit attempt on same session must fail
        recommit_resp = self.client.post(
            self.commit_url,
            {'session_id': session_id, 'strategy': 'skip_conflicts'},
            format='json'
        )
        self.assertEqual(recommit_resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # 4. Eligibility Engine Service & Evaluation Rules
    # --------------------------------------------------------------------------

    def test_eligibility_engine_rules(self):
        """Verify department, year, active status, whitelist, and blacklist logic."""
        election_uuid = uuid.uuid4()

        # Rule 1: Only Computer Science, Year 2
        rule = ElectionEligibilityRule.objects.create(
            election_id=election_uuid,
            title='CS Year 2 Representative',
            allowed_departments=['Computer Science'],
            allowed_academic_years=[2],
            required_enrollment_statuses=['ENROLLED'],
            require_active_account=False
        )

        # Student 1: CS, Year 2 -> Eligible
        is_eligible, reason = EligibilityEngineService.evaluate_student(self.student1, rule)
        self.assertTrue(is_eligible)

        # Student 2: EE, Year 3 -> Ineligible (wrong dept and year)
        is_eligible2, reason2 = EligibilityEngineService.evaluate_student(self.student2, rule)
        self.assertFalse(is_eligible2)

        # Whitelist override: Add Student 2 to included list
        rule.included_student_ids = ['STU-2026-002']
        rule.save()
        is_eligible_override, _ = EligibilityEngineService.evaluate_student(self.student2, rule)
        self.assertTrue(is_eligible_override, "Whitelist override failed to grant eligibility.")

        # Blacklist override: Add Student 1 to excluded list
        rule.excluded_student_ids = ['STU-2026-001']
        rule.save()
        is_eligible_denied, _ = EligibilityEngineService.evaluate_student(self.student1, rule)
        self.assertFalse(is_eligible_denied, "Blacklist override failed to disqualify student.")

    def test_eligibility_evaluation_endpoint(self):
        """Verify administrative eligibility evaluation endpoint."""
        self.client.force_login(self.admin_user)
        rule = ElectionEligibilityRule.objects.create(
            election_id=uuid.uuid4(),
            title='Campus General Council',
            allowed_departments=[],  # All
            allowed_academic_years=[],  # All
            required_enrollment_statuses=['ENROLLED']
        )

        response = self.client.post(
            self.evaluate_url,
            {'college_id': 'STU-2026-001', 'rule_id': str(rule.id)},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()['is_eligible'])

    def test_admin_manual_approve_pending_student(self):
        """Verify election admin can manually approve a student in PENDING enrollment status."""
        from apps.students.models import EnrollmentStatus
        pending_student = Student.objects.create(
            college_id='STU-PENDING-001',
            full_name='Pending Voter',
            email='pending.voter@campusvote.edu',
            department='Computer Science',
            academic_year=1,
            course='B.Tech CS',
            enrollment_status=EnrollmentStatus.PENDING,
            is_active=True
        )

        approve_url = reverse('students:student-approve', kwargs={'pk': pending_student.id})

        # Unauthorized student cannot approve
        self.client.force_login(self.student_user)
        res_unauth = self.client.post(approve_url)
        self.assertEqual(res_unauth.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can approve
        self.client.force_login(self.admin_user)
        res_admin = self.client.post(approve_url)
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        pending_student.refresh_from_db()
        self.assertEqual(pending_student.enrollment_status, EnrollmentStatus.ENROLLED)
        self.assertTrue(pending_student.is_active)
