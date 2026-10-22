"""
Automated Backend Security and RBAC Test Suite for CampusVote.
Verifies authentication flows, role enforcement, unauthorized access denials,
and profile elevation prevention.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from apps.accounts.models import User, Role, AccountStatus


class AuthenticationAndRBACTests(APITestCase):
    """Verifies authentication boundaries and role-based access control."""

    def setUp(self):
        # Create synthetic users for each security role
        self.student = User.objects.create_user(
            username='test_student',
            email='student@test.edu',
            password='Password123!',
            college_id='STU-TEST-001',
            role=Role.STUDENT,
            status=AccountStatus.ACTIVE,
        )

        self.election_admin = User.objects.create_user(
            username='test_admin',
            email='admin@test.edu',
            password='Password123!',
            college_id='ADM-TEST-001',
            role=Role.ELECTION_ADMIN,
            status=AccountStatus.ACTIVE,
        )

        self.auditor = User.objects.create_user(
            username='test_auditor',
            email='auditor@test.edu',
            password='Password123!',
            college_id='AUD-TEST-001',
            role=Role.AUDITOR,
            status=AccountStatus.ACTIVE,
        )

        self.super_admin = User.objects.create_user(
            username='test_super',
            email='super@test.edu',
            password='Password123!',
            college_id='SUP-TEST-001',
            role=Role.SUPER_ADMIN,
            status=AccountStatus.ACTIVE,
            is_staff=True,
            is_superuser=True,
        )

        self.suspended_user = User.objects.create_user(
            username='test_suspended',
            email='suspended@test.edu',
            password='Password123!',
            college_id='SUS-TEST-001',
            role=Role.STUDENT,
            status=AccountStatus.SUSPENDED,
        )

        self.login_url = reverse('api-auth-login')
        self.logout_url = reverse('api-auth-logout')
        self.me_url = reverse('api-auth-me')
        self.csrf_url = reverse('api-auth-csrf')

        self.student_endpoint = reverse('accounts:student-only')
        self.admin_endpoint = reverse('accounts:admin-only')
        self.auditor_endpoint = reverse('accounts:auditor-only')

    # --------------------------------------------------------------------------
    # 1. Unauthenticated & Anonymous Access Denials
    # --------------------------------------------------------------------------

    def test_anonymous_user_cannot_access_protected_endpoints(self):
        """Verify anonymous users are rejected from /me and role endpoints."""
        endpoints = [
            self.me_url,
            self.student_endpoint,
            self.admin_endpoint,
            self.auditor_endpoint,
        ]
        for url in endpoints:
            response = self.client.get(url)
            self.assertIn(
                response.status_code,
                [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
                f"Anonymous user was not denied on {url}"
            )

    # --------------------------------------------------------------------------
    # 2. Authentication: Login, Logout & Session Lifecycle
    # --------------------------------------------------------------------------

    def test_successful_login_with_username_and_college_id(self):
        """Verify login succeeds with username or college ID and sets session cookie."""
        # Login with username
        resp_username = self.client.post(
            self.login_url,
            {'identifier': 'test_student', 'password': 'Password123!'},
            format='json'
        )
        self.assertEqual(resp_username.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_username.json()['user']['role'], Role.STUDENT)
        self.assertIn('sessionid', self.client.cookies)

        self.client.logout()

        # Login with normalized college_id
        resp_college_id = self.client.post(
            self.login_url,
            {'identifier': 'stu-test-001', 'password': 'Password123!'},
            format='json'
        )
        self.assertEqual(resp_college_id.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_college_id.json()['user']['college_id'], 'STU-TEST-001')

    def test_invalid_credentials_return_uniform_safe_error(self):
        """Verify bad credentials return 401 without leaking account existence."""
        response = self.client.post(
            self.login_url,
            {'identifier': 'nonexistent_user', 'password': 'WrongPassword!'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('Authentication failed', response.json().get('error', ''))

    def test_disabled_or_suspended_account_cannot_login(self):
        """Verify suspended account is rejected during authentication."""
        response = self.client.post(
            self.login_url,
            {'identifier': 'test_suspended', 'password': 'Password123!'},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_invalidates_session(self):
        """Verify logout invalidates server-side session."""
        self.client.force_login(self.student)
        me_resp = self.client.get(self.me_url)
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)

        logout_resp = self.client.post(self.logout_url)
        self.assertEqual(logout_resp.status_code, status.HTTP_200_OK)

        # Subsequent request with invalidated session must fail
        after_logout_resp = self.client.get(self.me_url)
        self.assertIn(
            after_logout_resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
        )

    # --------------------------------------------------------------------------
    # 3. Role-Based Access Control (RBAC) Enforcement
    # --------------------------------------------------------------------------

    def test_student_cannot_access_election_admin_or_auditor_endpoints(self):
        """Verify students are strictly blocked from admin and auditor routes."""
        self.client.force_login(self.student)

        # Student CAN access student endpoint
        resp_student = self.client.get(self.student_endpoint)
        self.assertEqual(resp_student.status_code, status.HTTP_200_OK)

        # Student CANNOT access admin endpoint
        resp_admin = self.client.get(self.admin_endpoint)
        self.assertEqual(resp_admin.status_code, status.HTTP_403_FORBIDDEN)

        # Student CANNOT access auditor endpoint
        resp_auditor = self.client.get(self.auditor_endpoint)
        self.assertEqual(resp_auditor.status_code, status.HTTP_403_FORBIDDEN)

    def test_election_admin_cannot_access_restricted_auditor_endpoint(self):
        """Verify election administrators cannot access restricted auditor functions."""
        self.client.force_login(self.election_admin)

        resp_admin = self.client.get(self.admin_endpoint)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)

        resp_auditor = self.client.get(self.auditor_endpoint)
        self.assertEqual(resp_auditor.status_code, status.HTTP_403_FORBIDDEN)

    def test_auditor_cannot_access_election_management_endpoint(self):
        """Verify auditors cannot perform election management operations."""
        self.client.force_login(self.auditor)

        resp_auditor = self.client.get(self.auditor_endpoint)
        self.assertEqual(resp_auditor.status_code, status.HTTP_200_OK)

        resp_admin = self.client.get(self.admin_endpoint)
        self.assertEqual(resp_admin.status_code, status.HTTP_403_FORBIDDEN)

    def test_super_admin_has_oversight_across_endpoints(self):
        """Verify super administrators have authorized oversight across domains."""
        self.client.force_login(self.super_admin)

        resp_admin = self.client.get(self.admin_endpoint)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)

        resp_auditor = self.client.get(self.auditor_endpoint)
        self.assertEqual(resp_auditor.status_code, status.HTTP_200_OK)

    # --------------------------------------------------------------------------
    # 4. Privilege Elevation & Tampering Prevention
    # --------------------------------------------------------------------------

    def test_user_cannot_elevate_role_via_profile_patch(self):
        """Verify users cannot escalate their own role through profile updates."""
        self.client.force_login(self.student)

        patch_resp = self.client.patch(
            self.me_url,
            {
                'first_name': 'UpdatedAlex',
                'role': Role.SUPER_ADMIN,
                'is_superuser': True,
                'is_staff': True
            },
            format='json'
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        # Refresh from database
        self.student.refresh_from_db()
        self.assertEqual(self.student.first_name, 'UpdatedAlex')
        self.assertEqual(self.student.role, Role.STUDENT, "Role elevation was not blocked!")
        self.assertFalse(self.student.is_superuser)
        self.assertFalse(self.student.is_staff)

    # --------------------------------------------------------------------------
    # 5. CSRF Cookie Generation
    # --------------------------------------------------------------------------

    def test_csrf_cookie_endpoint(self):
        """Verify CSRF token endpoint sets cookie and returns token string."""
        response = self.client.get(self.csrf_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('csrfToken', response.json())
        self.assertIn('csrftoken', self.client.cookies)
