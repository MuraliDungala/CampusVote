"""
WebSocket URL Routing for CampusVote Monitoring App.
"""

from django.urls import path
from apps.monitoring.consumers import ElectionTurnoutConsumer

websocket_urlpatterns = [
    path('ws/elections/<uuid:election_id>/turnout/', ElectionTurnoutConsumer.as_asgi(), name='ws-election-turnout'),
]
