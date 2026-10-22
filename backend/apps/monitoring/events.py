"""
Real-Time Turnout Event Dispatcher for CampusVote.
Broadcasts sanitized aggregate turnout updates over Channels.
Guarantees ZERO confidential voter identities or ballot selections are broadcast.
"""

import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from apps.monitoring.services import ElectionAnalyticsService

logger = logging.getLogger(__name__)


def broadcast_turnout_update(election_id: str) -> bool:
    """
    Computes current aggregate turnout and broadcasts to the election's channel group.
    Safe to call within transaction.on_commit() handlers.
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.debug("No channel layer configured; skipping turnout broadcast.")
            return False

        success, metrics, _ = ElectionAnalyticsService.get_summary_metrics(election_id)
        if not success:
            return False

        group_name = f"election_turnout_{election_id}"
        message_payload = {
            "type": "turnout_update",
            "election_id": str(election_id),
            "recorded_participants": metrics["recorded_participants"],
            "total_eligible_voters": metrics["total_eligible_voters"],
            "remaining_eligible_voters": metrics["remaining_eligible_voters"],
            "turnout_percentage": metrics["turnout_percentage"],
            "timestamp": metrics["last_updated"],
        }

        async_to_sync(channel_layer.group_send)(group_name, message_payload)
        logger.info(f"Turnout broadcast sent for election {election_id}: {metrics['recorded_participants']} votes ({metrics['turnout_percentage']}%)")
        return True

    except Exception as exc:
        logger.warning(f"Error broadcasting turnout update for election {election_id}: {exc}")
        return False
