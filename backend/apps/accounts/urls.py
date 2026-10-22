"""
URL routing for accounts and authentication endpoints.
"""

from django.urls import path
from apps.accounts.views import (
    LoginView,
    LogoutView,
    CurrentUserView,
    CsrfTokenView,
    StudentOnlyView,
    AdminOnlyView,
    AuditorOnlyView,
    InstitutionListView,
    CollegeAdminRegistrationView,
)
from apps.students.views import StudentRegistrationView

app_name = 'accounts'

urlpatterns = [
    # Auth endpoints
    path('auth/register/', StudentRegistrationView.as_view(), name='register'),
    path('auth/college-admin/register/', CollegeAdminRegistrationView.as_view(), name='college-admin-register'),
    path('auth/institutions/', InstitutionListView.as_view(), name='institutions-list'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/me/', CurrentUserView.as_view(), name='me'),
    path('auth/csrf/', CsrfTokenView.as_view(), name='csrf'),

    # RBAC verification endpoints
    path('student-only/', StudentOnlyView.as_view(), name='student-only'),
    path('admin-only/', AdminOnlyView.as_view(), name='admin-only'),
    path('auditor-only/', AuditorOnlyView.as_view(), name='auditor-only'),
]
