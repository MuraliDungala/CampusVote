"""
Direct /api/v1/positions/ routes.
"""
from django.urls import path
from apps.elections.views import (
    ElectionPositionDetailView,
    PositionCandidateListView,
    PositionNominationCreateView,
)

app_name = 'positions'

urlpatterns = [
    path('<uuid:pk>/', ElectionPositionDetailView.as_view(), name='detail'),
    path('<uuid:position_id>/candidates/', PositionCandidateListView.as_view(), name='candidates'),
    path('<uuid:position_id>/nominations/', PositionNominationCreateView.as_view(), name='nominate'),
]
