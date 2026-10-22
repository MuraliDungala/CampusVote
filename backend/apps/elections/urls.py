"""
URL configuration for the elections application.
CampusVote Phase 3 Architecture.
"""

from django.urls import path
from apps.elections.views import (
    ElectionListCreateView,
    ElectionDetailView,
    ElectionSummaryView,
    ElectionScheduleView,
    ElectionActivateView,
    ElectionCloseView,
    ElectionPublishResultsView,
    ElectionArchiveView,
    ElectionCancelView,
    ElectionPositionListCreateView,
    ElectionPositionDetailView,
    ElectionCandidateListView,
    PositionCandidateListView,
    PositionNominationCreateView,
    MyNominationsListView,
    NominationDetailView,
    NominationSubmitView,
    NominationApproveView,
    NominationRejectView,
    NominationWithdrawView,
)

app_name = 'elections'

urlpatterns = [
    # Election Management
    path('', ElectionListCreateView.as_view(), name='election-list-create'),
    path('summary/', ElectionSummaryView.as_view(), name='election-summary'),
    path('<uuid:pk>/', ElectionDetailView.as_view(), name='election-detail'),
    path('<uuid:pk>/schedule/', ElectionScheduleView.as_view(), name='election-schedule'),
    path('<uuid:pk>/activate/', ElectionActivateView.as_view(), name='election-activate'),
    path('<uuid:pk>/close/', ElectionCloseView.as_view(), name='election-close'),
    path('<uuid:pk>/publish-results/', ElectionPublishResultsView.as_view(), name='election-publish-results'),
    path('<uuid:pk>/archive/', ElectionArchiveView.as_view(), name='election-archive'),
    path('<uuid:pk>/cancel/', ElectionCancelView.as_view(), name='election-cancel'),

    # Election Nested Positions & Candidates
    path('<uuid:election_id>/positions/', ElectionPositionListCreateView.as_view(), name='election-positions'),
    path('<uuid:election_id>/candidates/', ElectionCandidateListView.as_view(), name='election-candidates'),

    # Phase 5 Anonymous Ballot & Participation Routes
    path('<uuid:election_id>/ballot/', __import__('apps.voting.views', fromlist=['BallotDefinitionView']).BallotDefinitionView.as_view(), name='election-ballot-definition'),
    path('<uuid:election_id>/ballot/validate/', __import__('apps.voting.views', fromlist=['BallotValidateView']).BallotValidateView.as_view(), name='election-ballot-validate'),
    path('<uuid:election_id>/ballot/submit/', __import__('apps.voting.views', fromlist=['BallotSubmitView']).BallotSubmitView.as_view(), name='election-ballot-submit'),
    path('<uuid:election_id>/participation/status/', __import__('apps.voting.views', fromlist=['VoterParticipationStatusView']).VoterParticipationStatusView.as_view(), name='election-participation-status'),

    # Phase 6 Real-Time Monitoring & Aggregate Analytics Routes
    path('<uuid:election_id>/analytics/summary/', __import__('apps.monitoring.views', fromlist=['ElectionSummaryAnalyticsView']).ElectionSummaryAnalyticsView.as_view(), name='election-analytics-summary'),
    path('<uuid:election_id>/analytics/turnout/', __import__('apps.monitoring.views', fromlist=['ElectionTurnoutAnalyticsView']).ElectionTurnoutAnalyticsView.as_view(), name='election-analytics-turnout'),
    path('<uuid:election_id>/analytics/departments/', __import__('apps.monitoring.views', fromlist=['ElectionDepartmentAnalyticsView']).ElectionDepartmentAnalyticsView.as_view(), name='election-analytics-departments'),
    path('<uuid:election_id>/analytics/connection-status/', __import__('apps.monitoring.views', fromlist=['ElectionConnectionStatusView']).ElectionConnectionStatusView.as_view(), name='election-analytics-connection-status'),

    # Phase 7 AI Anomaly Detection & Security Monitoring Routes
    path('<uuid:election_id>/anomalies/', __import__('apps.anomaly.views', fromlist=['ElectionAnomalyListView']).ElectionAnomalyListView.as_view(), name='election-anomalies'),
    path('<uuid:election_id>/anomalies/run/', __import__('apps.anomaly.views', fromlist=['ElectionAnomalyRunPipelineView']).ElectionAnomalyRunPipelineView.as_view(), name='election-anomalies-run'),
    path('<uuid:election_id>/anomalies/<uuid:pk>/', __import__('apps.anomaly.views', fromlist=['AnomalyDetailView']).AnomalyDetailView.as_view(), name='election-anomaly-detail'),
    path('<uuid:election_id>/anomalies/<uuid:pk>/acknowledge/', __import__('apps.anomaly.views', fromlist=['AnomalyAcknowledgeView']).AnomalyAcknowledgeView.as_view(), name='election-anomaly-acknowledge'),
    path('<uuid:election_id>/anomalies/<uuid:pk>/investigate/', __import__('apps.anomaly.views', fromlist=['AnomalyInvestigateView']).AnomalyInvestigateView.as_view(), name='election-anomaly-investigate'),
    path('<uuid:election_id>/anomalies/<uuid:pk>/resolve/', __import__('apps.anomaly.views', fromlist=['AnomalyResolveView']).AnomalyResolveView.as_view(), name='election-anomaly-resolve'),
    path('<uuid:election_id>/anomalies/<uuid:pk>/mark-false-positive/', __import__('apps.anomaly.views', fromlist=['AnomalyMarkFalsePositiveView']).AnomalyMarkFalsePositiveView.as_view(), name='election-anomaly-mark-false-positive'),
    path('<uuid:election_id>/anomaly-summary/', __import__('apps.anomaly.views', fromlist=['ElectionAnomalySummaryView']).ElectionAnomalySummaryView.as_view(), name='election-anomaly-summary'),

    # Phase 8 Results Management, Verification & Publication Routes
    path('<uuid:election_id>/results/', __import__('apps.results.views', fromlist=['ElectionResultListView']).ElectionResultListView.as_view(), name='election-results-list'),
    path('<uuid:election_id>/results/calculate/', __import__('apps.results.views', fromlist=['ElectionResultCalculateView']).ElectionResultCalculateView.as_view(), name='election-results-calculate'),
    path('<uuid:election_id>/results/<uuid:result_id>/', __import__('apps.results.views', fromlist=['ElectionResultDetailView']).ElectionResultDetailView.as_view(), name='election-results-detail'),
    path('<uuid:election_id>/results/<uuid:result_id>/verification/', __import__('apps.results.views', fromlist=['ElectionResultVerificationView']).ElectionResultVerificationView.as_view(), name='election-results-verification'),
    path('<uuid:election_id>/results/<uuid:result_id>/review/', __import__('apps.results.views', fromlist=['ElectionResultReviewView']).ElectionResultReviewView.as_view(), name='election-results-review'),
    path('<uuid:election_id>/results/<uuid:result_id>/approve/', __import__('apps.results.views', fromlist=['ElectionResultApproveView']).ElectionResultApproveView.as_view(), name='election-results-approve'),
    path('<uuid:election_id>/results/<uuid:result_id>/publish/', __import__('apps.results.views', fromlist=['ElectionResultPublishView']).ElectionResultPublishView.as_view(), name='election-results-publish'),
    path('<uuid:election_id>/results/<uuid:result_id>/audit/', __import__('apps.results.views', fromlist=['ElectionResultAuditView']).ElectionResultAuditView.as_view(), name='election-results-audit'),
    path('<uuid:election_id>/results/<uuid:result_id>/report/', __import__('apps.results.views', fromlist=['ElectionResultReportExportView']).ElectionResultReportExportView.as_view(), name='election-results-report'),


    # Position Management Direct
    path('positions/<uuid:pk>/', ElectionPositionDetailView.as_view(), name='position-detail'),
    path('positions/<uuid:position_id>/candidates/', PositionCandidateListView.as_view(), name='position-candidates'),
    path('positions/<uuid:position_id>/nominations/', PositionNominationCreateView.as_view(), name='position-nomination-create'),

    # Candidate Nominations
    path('nominations/my/', MyNominationsListView.as_view(), name='my-nominations'),
    path('nominations/<uuid:pk>/', NominationDetailView.as_view(), name='nomination-detail'),
    path('nominations/<uuid:pk>/submit/', NominationSubmitView.as_view(), name='nomination-submit'),
    path('nominations/<uuid:pk>/approve/', NominationApproveView.as_view(), name='nomination-approve'),
    path('nominations/<uuid:pk>/reject/', NominationRejectView.as_view(), name='nomination-reject'),
    path('nominations/<uuid:pk>/withdraw/', NominationWithdrawView.as_view(), name='nomination-withdraw'),
]
