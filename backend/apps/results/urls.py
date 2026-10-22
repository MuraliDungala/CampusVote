"""
URL Configuration for CampusVote Results Management and Verification.
CampusVote Phase 8 Architecture.
"""

from django.urls import path
from apps.results.views import (
    ElectionResultListView,
    ElectionResultCalculateView,
    ElectionResultDetailView,
    ElectionResultVerificationView,
    ElectionResultReviewView,
    ElectionResultApproveView,
    ElectionResultPublishView,
    ElectionResultAuditView,
    ElectionResultReportExportView,
    PublicElectionResultView
)

app_name = 'results'

urlpatterns = [
    # Administrative Results Management
    path('elections/<uuid:election_id>/results/', ElectionResultListView.as_view(), name='election-results-list'),
    path('elections/<uuid:election_id>/results/calculate/', ElectionResultCalculateView.as_view(), name='election-results-calculate'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/', ElectionResultDetailView.as_view(), name='election-results-detail'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/verification/', ElectionResultVerificationView.as_view(), name='election-results-verification'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/review/', ElectionResultReviewView.as_view(), name='election-results-review'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/approve/', ElectionResultApproveView.as_view(), name='election-results-approve'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/publish/', ElectionResultPublishView.as_view(), name='election-results-publish'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/audit/', ElectionResultAuditView.as_view(), name='election-results-audit'),
    path('elections/<uuid:election_id>/results/<uuid:result_id>/report/', ElectionResultReportExportView.as_view(), name='election-results-report'),

    # Public Results
    path('public/elections/<uuid:election_id>/results/', PublicElectionResultView.as_view(), name='public-election-results'),
]
