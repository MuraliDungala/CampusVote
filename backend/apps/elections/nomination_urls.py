"""
Direct /api/v1/nominations/ routes.
"""
from django.urls import path
from apps.elections.views import (
    MyNominationsListView,
    NominationDetailView,
    NominationSubmitView,
    NominationApproveView,
    NominationRejectView,
    NominationWithdrawView,
)

app_name = 'nominations'

urlpatterns = [
    path('my/', MyNominationsListView.as_view(), name='my-list'),
    path('<uuid:pk>/', NominationDetailView.as_view(), name='detail'),
    path('<uuid:pk>/submit/', NominationSubmitView.as_view(), name='submit'),
    path('<uuid:pk>/approve/', NominationApproveView.as_view(), name='approve'),
    path('<uuid:pk>/reject/', NominationRejectView.as_view(), name='reject'),
    path('<uuid:pk>/withdraw/', NominationWithdrawView.as_view(), name='withdraw'),
]
