"""
URL routing for Eligibility Engine APIs.
"""

from django.urls import path
from apps.eligibility.views import (
    EligibilityRuleListCreateView,
    EligibilityRuleDetailView,
    EligibilityEvaluateView,
    EligibilitySummaryView
)

app_name = 'eligibility'

urlpatterns = [
    path('rules/', EligibilityRuleListCreateView.as_view(), name='rule-list-create'),
    path('rules/<uuid:pk>/', EligibilityRuleDetailView.as_view(), name='rule-detail'),
    path('rules/<uuid:pk>/summary/', EligibilitySummaryView.as_view(), name='rule-summary'),
    path('evaluate/', EligibilityEvaluateView.as_view(), name='evaluate'),
]
