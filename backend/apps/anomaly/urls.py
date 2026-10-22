"""
URL Configuration for CampusVote Anomaly Detection App.
"""

from django.urls import path
from apps.anomaly.views import (
    ElectionAnomalyListView,
    ElectionAnomalyRunPipelineView,
    ElectionAnomalySummaryView,
    AnomalyDetailView,
    AnomalyAcknowledgeView,
    AnomalyInvestigateView,
    AnomalyResolveView,
    AnomalyMarkFalsePositiveView,
)

app_name = 'anomaly'

urlpatterns = [
    path('elections/<uuid:election_id>/anomalies/', ElectionAnomalyListView.as_view(), name='election-anomalies'),
    path('elections/<uuid:election_id>/anomalies/run/', ElectionAnomalyRunPipelineView.as_view(), name='election-anomalies-run'),
    path('elections/<uuid:election_id>/anomalies/<uuid:pk>/', AnomalyDetailView.as_view(), name='anomaly-detail'),
    path('elections/<uuid:election_id>/anomalies/<uuid:pk>/acknowledge/', AnomalyAcknowledgeView.as_view(), name='anomaly-acknowledge'),
    path('elections/<uuid:election_id>/anomalies/<uuid:pk>/investigate/', AnomalyInvestigateView.as_view(), name='anomaly-investigate'),
    path('elections/<uuid:election_id>/anomalies/<uuid:pk>/resolve/', AnomalyResolveView.as_view(), name='anomaly-resolve'),
    path('elections/<uuid:election_id>/anomalies/<uuid:pk>/mark-false-positive/', AnomalyMarkFalsePositiveView.as_view(), name='anomaly-mark-false-positive'),
    path('elections/<uuid:election_id>/anomaly-summary/', ElectionAnomalySummaryView.as_view(), name='election-anomaly-summary'),
]
