"""
URL configuration for CampusVote project.
The `urlpatterns` list routes URLs to views.
"""

from django.contrib import admin
from django.urls import path, include
from config.health import HealthCheckView
from apps.accounts.views import (
    LoginView,
    LogoutView,
    CurrentUserView,
    CsrfTokenView,
    InstitutionListView,
    CollegeAdminRegistrationView,
)
from apps.students.views import StudentRegistrationView

urlpatterns = [
    path('admin/', admin.site.urls),

    # Versioned API v1 Base Route
    path('api/v1/health/', HealthCheckView.as_view(), name='api-health-check'),

    # Direct Authentication Endpoints
    path('api/v1/auth/login/', LoginView.as_view(), name='api-auth-login'),
    path('api/v1/auth/register/', StudentRegistrationView.as_view(), name='api-auth-register'),
    path('api/v1/auth/college-admin/register/', CollegeAdminRegistrationView.as_view(), name='api-college-admin-register'),
    path('api/v1/auth/institutions/', InstitutionListView.as_view(), name='api-institutions-list'),
    path('api/v1/auth/logout/', LogoutView.as_view(), name='api-auth-logout'),
    path('api/v1/auth/me/', CurrentUserView.as_view(), name='api-auth-me'),
    path('api/v1/auth/csrf/', CsrfTokenView.as_view(), name='api-auth-csrf'),

    # Modular App Endpoints
    path('api/v1/admin/students/', include('apps.students.urls', namespace='admin-students')),
    path('api/v1/admin/eligibility/', include('apps.eligibility.urls', namespace='admin-eligibility')),
    path('api/v1/accounts/', include('apps.accounts.urls', namespace='accounts')),
    path('api/v1/students/', include('apps.students.urls', namespace='students')),
    path('api/v1/elections/', include('apps.elections.urls', namespace='elections')),
    path('api/v1/positions/', include('apps.elections.position_urls', namespace='positions')),
    path('api/v1/nominations/', include('apps.elections.nomination_urls', namespace='nominations')),
    path('api/v1/eligibility/', include('apps.eligibility.urls', namespace='eligibility')),
    path('api/v1/verification/', include('apps.verification.urls', namespace='verification')),
    path('api/v1/voting/', include('apps.voting.urls', namespace='voting')),
    path('api/v1/monitoring/', include('apps.monitoring.urls', namespace='monitoring')),
    path('api/v1/anomaly/', include('apps.anomaly.urls', namespace='anomaly')),
    path('api/v1/audit/', include('apps.audit.urls', namespace='audit')),
    path('api/v1/admin/', include('apps.results.urls', namespace='admin-results')),
    path('api/v1/', include('apps.results.urls', namespace='results-direct')),
]
