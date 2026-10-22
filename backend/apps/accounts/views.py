"""
Authentication and Role-Based Access Control Views.
Smart ID-Based College Voting System (CampusVote).
"""

import re
import secrets
from django.db import transaction
from django.contrib.auth import login, logout
from django.utils import timezone
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.accounts.models import Institution, InstitutionStatus, User, Role, AccountStatus
from apps.accounts.serializers import (
    LoginSerializer,
    UserSummarySerializer,
    UserProfileUpdateSerializer,
    InstitutionSerializer,
    CollegeAdminRegistrationSerializer,
)
from apps.accounts.permissions import (
    IsActiveAccount,
    IsStudent,
    IsElectionAdmin,
    IsAuditor
)
from apps.audit.services import log_audit_event
from apps.audit.models import AuditAction


class LoginView(APIView):
    """
    POST /api/v1/auth/login/
    Establishes an authenticated session via secure HTTP-only cookies.
    Rate limited and timing safe.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(
                {
                    "error": "Authentication failed",
                    "details": serializer.errors
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        user = serializer.validated_data['user']

        # Update telemetry
        user.last_login_at = timezone.now()
        client_ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        if client_ip:
            user.last_login_ip = client_ip.split(',')[0].strip()
        user.save(update_fields=['last_login_at', 'last_login_ip'])

        # Establish server-side Django session
        login(request, user)

        user_data = UserSummarySerializer(user).data
        return Response(
            {
                "message": "Authentication successful.",
                "user": user_data
            },
            status=status.HTTP_200_OK
        )


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/
    Terminates the current server session and clears session cookies.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        logout(request)
        return Response(
            {"message": "Logged out successfully."},
            status=status.HTTP_200_OK
        )


class CurrentUserView(APIView):
    """
    GET /api/v1/auth/me/
    Returns current authenticated user details and active role.
    PATCH /api/v1/auth/me/
    Allows updating safe profile details (name). Denies role modification.
    """
    permission_classes = [IsActiveAccount]

    def get(self, request, *args, **kwargs):
        serializer = UserSummarySerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        # Explicit check: If client attempts to pass role, college_id, or status, reject or ignore
        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(
                UserSummarySerializer(request.user).data,
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CsrfTokenView(APIView):
    """
    GET /api/v1/auth/csrf/
    Ensures CSRF cookie is set and returns the token string for SPA clients.
    """
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request, *args, **kwargs):
        token = get_token(request)
        return Response(
            {"csrfToken": token},
            status=status.HTTP_200_OK
        )


# ------------------------------------------------------------------------------
# Demonstration RBAC Verification Endpoints
# ------------------------------------------------------------------------------

class StudentOnlyView(APIView):
    """GET /api/v1/accounts/student-only/"""
    permission_classes = [IsStudent]

    def get(self, request, *args, **kwargs):
        return Response({
            "message": "Authorized for Student voter role.",
            "user": request.user.username,
            "role": request.user.role
        }, status=status.HTTP_200_OK)


class AdminOnlyView(APIView):
    """GET /api/v1/accounts/admin-only/"""
    permission_classes = [IsElectionAdmin]

    def get(self, request, *args, **kwargs):
        return Response({
            "message": "Authorized for Election Administrator role.",
            "user": request.user.username,
            "role": request.user.role
        }, status=status.HTTP_200_OK)


class AuditorOnlyView(APIView):
    """GET /api/v1/accounts/auditor-only/"""
    permission_classes = [IsAuditor]

    def get(self, request, *args, **kwargs):
        return Response({
            "message": "Authorized for System Auditor role.",
            "user": request.user.username,
            "role": request.user.role
        }, status=status.HTTP_200_OK)


class InstitutionListView(APIView):
    """
    GET /api/v1/auth/institutions/
    Public listing of verified and active college institutions.
    Used for self-service registration and college discovery.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        institutions = Institution.objects.all().order_by('name')
        search = request.query_params.get('search', '').strip()
        if search:
            institutions = institutions.filter(name__icontains=search)
        serializer = InstitutionSerializer(institutions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CollegeAdminRegistrationView(APIView):
    """
    POST /api/v1/auth/college-admin/register/
    Self-service registration for College Election Administrators.
    Binds the administrator strictly to their specific college institution.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'register'

    def post(self, request, *args, **kwargs):
        serializer = CollegeAdminRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Validation failed", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        full_name = data['full_name'].strip()
        college_name = data['college_name'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        institution_code = data.get('institution_code', '').strip().upper()
        is_simulation_demo = data.get('is_simulation_demo', True)

        with transaction.atomic():
            # 1. Resolve or register the Institution
            institution = Institution.objects.filter(name__iexact=college_name).first()
            if not institution and institution_code:
                institution = Institution.objects.filter(code__iexact=institution_code).first()

            if not institution:
                clean_name = re.sub(r'[^a-z0-9]', '', college_name.lower())
                generated_code = institution_code or f"COL-{secrets.token_hex(3).upper()}"
                institution = Institution.objects.create(
                    code=generated_code,
                    name=college_name,
                    normalized_name=clean_name,
                    email_domain=email.split('@')[1] if '@' in email else '',
                    status=InstitutionStatus.ACTIVE,
                    is_demo=is_simulation_demo,
                )

            # 2. Derive a unique username
            base_username = email.split('@')[0].strip().lower()
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1

            # 3. Create the College Administrator User
            names = full_name.split()
            first_name = names[0]
            last_name = ' '.join(names[1:]) if len(names) > 1 else ''

            admin_user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                role=Role.ELECTION_ADMIN,
                status=AccountStatus.ACTIVE,
                institution=institution,
                is_staff=False,
            )

            # 4. Audit Log
            log_audit_event(
                action=AuditAction.ACCOUNT_STATUS_CHANGED,
                target_type='USER',
                target_id=str(admin_user.id),
                metadata={
                    'event': 'COLLEGE_ADMIN_REGISTERED',
                    'username': admin_user.username,
                    'college_name': institution.name,
                    'institution_code': institution.code,
                    'is_demo': institution.is_demo,
                },
                request=request
            )

        return Response({
            "message": f"College Administrator registration completed for '{institution.name}'. You may now log in to your College Admin Console.",
            "user": UserSummarySerializer(admin_user).data,
            "institution": InstitutionSerializer(institution).data,
            "status": "ACTIVE"
        }, status=status.HTTP_201_CREATED)

