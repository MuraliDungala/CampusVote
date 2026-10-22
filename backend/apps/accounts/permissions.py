"""
Role-Based Access Control (RBAC) Permissions for CampusVote.
Enforces non-bypassable backend authorization guards on all protected resources.
"""

from rest_framework.permissions import BasePermission
from apps.accounts.models import Role, AccountStatus


class IsActiveAccount(BasePermission):
    """Base check ensuring user is authenticated and their account status is ACTIVE."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and
            user.is_authenticated and
            user.is_active and
            getattr(user, 'status', None) == AccountStatus.ACTIVE
        )


class IsStudent(IsActiveAccount):
    """Grants access only to authenticated Student voters."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role == Role.STUDENT


class IsElectionAdmin(IsActiveAccount):
    """
    Grants access to Election Administrators.
    Super Admins are also permitted administrative oversight.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role in (Role.ELECTION_ADMIN, Role.SUPER_ADMIN)


class IsAuditor(IsActiveAccount):
    """
    Grants access to System Auditors.
    Auditor endpoints are strictly separated from election administration.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role in (Role.AUDITOR, Role.SUPER_ADMIN)


class IsSuperAdmin(IsActiveAccount):
    """Grants access strictly to institutional Super Administrators."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role == Role.SUPER_ADMIN or request.user.is_superuser


class RequiresRole:
    """Factory helper to construct DRF permission class restricting to specific roles."""

    def __init__(self, *allowed_roles):
        self.allowed_roles = allowed_roles

    def __call__(self):
        roles = self.allowed_roles

        class DynamicRolePermission(IsActiveAccount):
            def has_permission(self, request, view):
                if not super().has_permission(request, view):
                    return False
                return request.user.role in roles or request.user.role == Role.SUPER_ADMIN

        return DynamicRolePermission


class IsActiveOrPublicReadOnly(BasePermission):
    """
    Grants read-only access to unauthenticated public visitors for published catalogue.
    If authenticated, the user account MUST be active.
    Write operations require an active authenticated account.
    """

    def has_permission(self, request, view):
        user = request.user
        if user and user.is_authenticated:
            return bool(
                user.is_active and
                getattr(user, 'status', None) == AccountStatus.ACTIVE
            )
        return request.method in ('GET', 'HEAD', 'OPTIONS')
