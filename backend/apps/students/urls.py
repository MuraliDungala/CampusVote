"""
URL routing for Student Roster and Administrative Ingestion APIs.
"""

from django.urls import path
from apps.students.views import (
    StudentListCreateView,
    StudentDetailView,
    StudentDeactivateView,
    StudentSummaryView,
    RosterImportPreviewView,
    RosterImportCommitView,
    RosterTemplateDownloadView,
    StudentRegistrationView,
    VoterIdCardGenerateView,
    VoterIdCardMeView
)

app_name = 'students'

urlpatterns = [
    path('register/', StudentRegistrationView.as_view(), name='student-register'),
    path('voter-id/generate/', VoterIdCardGenerateView.as_view(), name='voter-id-generate'),
    path('voter-id/me/', VoterIdCardMeView.as_view(), name='voter-id-me'),
    path('', StudentListCreateView.as_view(), name='student-list-create'),
    path('summary/', StudentSummaryView.as_view(), name='student-summary'),
    path('import/preview/', RosterImportPreviewView.as_view(), name='roster-import-preview'),
    path('import/commit/', RosterImportCommitView.as_view(), name='roster-import-commit'),
    path('import/template/', RosterTemplateDownloadView.as_view(), name='roster-template-download'),
    path('<uuid:pk>/', StudentDetailView.as_view(), name='student-detail'),
    path('<uuid:pk>/deactivate/', StudentDeactivateView.as_view(), name='student-deactivate'),
]
