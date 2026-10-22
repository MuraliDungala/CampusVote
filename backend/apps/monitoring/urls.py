"""
URL Configuration for CampusVote Monitoring App.
"""

from django.urls import path
from apps.monitoring.views import (
    ElectionSummaryAnalyticsView,
    ElectionTurnoutAnalyticsView,
    ElectionDepartmentAnalyticsView,
    ElectionConnectionStatusView
)

app_name = 'monitoring'

urlpatterns = [
    path('elections/<uuid:election_id>/summary/', ElectionSummaryAnalyticsView.as_view(), name='election-summary'),
    path('elections/<uuid:election_id>/turnout/', ElectionTurnoutAnalyticsView.as_view(), name='election-turnout'),
    path('elections/<uuid:election_id>/departments/', ElectionDepartmentAnalyticsView.as_view(), name='election-departments'),
    path('elections/<uuid:election_id>/connection-status/', ElectionConnectionStatusView.as_view(), name='election-connection-status'),
]
