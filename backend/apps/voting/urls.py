"""
URL configuration for the voting application.
CampusVote Phase 5 Architecture - Anonymous Ballot & Participation.
"""

from django.urls import path
from apps.voting.views import (
    BallotDefinitionView,
    BallotValidateView,
    BallotSubmitView,
    VoterParticipationStatusView
)

app_name = 'voting'

urlpatterns = [
    # Ballot Presentation & Validation
    path('elections/<uuid:election_id>/ballot/', BallotDefinitionView.as_view(), name='ballot-definition'),
    path('elections/<uuid:election_id>/ballot/validate/', BallotValidateView.as_view(), name='ballot-validate'),
    path('elections/<uuid:election_id>/ballot/submit/', BallotSubmitView.as_view(), name='ballot-submit'),

    # Voter Participation Tracking Status
    path('elections/<uuid:election_id>/participation/status/', VoterParticipationStatusView.as_view(), name='participation-status'),
]
