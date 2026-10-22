"""
WebSocket Consumers for Real-Time Election Turnout Monitoring.
CampusVote Smart ID-Based College Voting System - Phase 6.

Enforces strict role-based access control (ELECTION_ADMIN, SUPER_ADMIN, AUDITOR),
validates election scope, and streams sanitized aggregate turnout updates.
"""

import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async

from apps.accounts.models import Role
from apps.elections.models import Election
from apps.monitoring.services import ElectionAnalyticsService

logger = logging.getLogger(__name__)


class ElectionTurnoutConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer providing real-time turnout streaming for an election.
    Restricted to authorized election administrators and institutional auditors.
    """

    async def connect(self):
        user = self.scope.get("user")

        # 1. Enforce Authentication
        if not user or not user.is_authenticated:
            logger.warning("Unauthenticated WebSocket connection rejected.")
            await self.close(code=4001)
            return

        # 2. Enforce Role Authorization
        allowed_roles = (Role.ELECTION_ADMIN, Role.SUPER_ADMIN, Role.AUDITOR)
        if getattr(user, "role", None) not in allowed_roles:
            logger.warning(f"Forbidden WebSocket connection by user {user.username} with role {getattr(user, 'role', None)}")
            await self.close(code=4003)
            return

        # 3. Validate Election Scope
        election_id = self.scope.get("url_route", {}).get("kwargs", {}).get("election_id")
        if not election_id:
            await self.close(code=4004)
            return

        election = await sync_to_async(
            lambda: Election.objects.filter(id=election_id).first()
        )()

        if not election:
            logger.warning(f"WebSocket connection rejected for non-existent election {election_id}")
            await self.close(code=4004)
            return

        # Multi-college isolation check
        is_superuser = getattr(user, 'role', None) == Role.SUPER_ADMIN or getattr(user, 'is_superuser', False)
        if not is_superuser and getattr(election, 'institution_id', None) and getattr(user, 'institution_id', None):
            if user.institution_id != election.institution_id:
                logger.warning(f"Forbidden WebSocket: user from institution {user.institution_id} attempted access to election of institution {election.institution_id}")
                await self.close(code=4003)
                return

        self.election_id = str(election_id)
        self.group_name = f"election_turnout_{self.election_id}"

        # 4. Join Election-Specific Channel Group
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        logger.info(f"WebSocket connected for election {self.election_id} by {user.username}")

        # 5. Push initial aggregate snapshot immediately
        success, metrics, _ = await sync_to_async(
            lambda: ElectionAnalyticsService.get_summary_metrics(self.election_id)
        )()

        if success:
            await self.send_json({
                "type": "initial_snapshot",
                "data": metrics
            })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            logger.info(f"WebSocket disconnected from {self.group_name} with code {close_code}")

    async def turnout_update(self, event):
        """
        Handler for aggregate turnout events broadcast from the channel layer.
        Forwards sanitized aggregate metrics directly to the connected administrator.
        """
        await self.send_json({
            "type": "turnout_update",
            "data": {
                "election_id": event["election_id"],
                "recorded_participants": event["recorded_participants"],
                "total_eligible_voters": event["total_eligible_voters"],
                "remaining_eligible_voters": event["remaining_eligible_voters"],
                "turnout_percentage": event["turnout_percentage"],
                "timestamp": event["timestamp"],
            }
        })
