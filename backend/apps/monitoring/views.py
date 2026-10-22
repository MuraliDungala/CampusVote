"""
API Views for Real-Time Election Monitoring and Analytics.
CampusVote Smart ID-Based College Voting System - Phase 6.

Restricted exclusively to authenticated Election Administrators and Institutional Auditors.
Guarantees ZERO access to confidential ballot selections or individual student identities.
"""

import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsElectionAdmin, IsActiveAccount
from apps.accounts.models import Role
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.monitoring.services import ElectionAnalyticsService

logger = logging.getLogger(__name__)


class MonitoringBaseView(APIView):
    """Base authorization and audit enforcement class for monitoring views."""
    permission_classes = [IsElectionAdmin]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        election_id = kwargs.get("election_id")
        if election_id:
            from apps.elections.models import Election
            election = Election.objects.filter(id=election_id).first()
            if election and election.institution_id:
                user = request.user
                is_superuser = getattr(user, 'role', None) == Role.SUPER_ADMIN or getattr(user, 'is_superuser', False)
                if not is_superuser and getattr(user, 'institution_id', None):
                    if user.institution_id != election.institution_id:
                        self.permission_denied(
                            request,
                            message="You do not have permission to monitor elections from another institution.",
                            code="CROSS_INSTITUTION_FORBIDDEN"
                        )

    def permission_denied(self, request, message=None, code=None):
        election_id = self.kwargs.get("election_id")
        log_audit_event(
            action=AuditAction.ANALYTICS_ACCESS_DENIED,
            target_type="ELECTION",
            target_id=str(election_id) if election_id else None,
            metadata={
                "attempted_role": getattr(request.user, "role", None),
                "error": "UNAUTHORIZED_ANALYTICS_ACCESS"
            },
            request=request
        )
        super().permission_denied(request, message, code)


class ElectionSummaryAnalyticsView(MonitoringBaseView):
    """
    GET /api/v1/elections/{election_id}/analytics/summary/
    Returns core participation KPIs: eligible voters, recorded participants,
    remaining eligible voters, and turnout percentage.
    """

    def get(self, request, election_id):
        success, data, error_msg = ElectionAnalyticsService.get_summary_metrics(str(election_id))
        if not success:
            return Response({"error": error_msg}, status=status.HTTP_404_NOT_FOUND)

        log_audit_event(
            action=AuditAction.ANALYTICS_DASHBOARD_ACCESSED,
            target_type="ELECTION",
            target_id=str(election_id),
            metadata={"endpoint": "summary"},
            request=request
        )

        return Response(data, status=status.HTTP_200_OK)


class ElectionTurnoutAnalyticsView(MonitoringBaseView):
    """
    GET /api/v1/elections/{election_id}/analytics/turnout/?interval=5m
    Returns aggregate time-bucketed turnout metrics (5m, 15m, 1h).
    """

    def get(self, request, election_id):
        interval = request.query_params.get("interval", "5m").strip().lower()
        if interval not in ("5m", "15m", "1h"):
            return Response(
                {"error": f"Invalid interval '{interval}'. Permitted intervals: 5m, 15m, 1h."},
                status=status.HTTP_400_BAD_REQUEST
            )

        success, data, error_msg = ElectionAnalyticsService.get_turnout_time_series(
            election_id=str(election_id),
            interval=interval
        )
        if not success:
            return Response({"error": error_msg}, status=status.HTTP_404_NOT_FOUND)

        return Response(data, status=status.HTTP_200_OK)


class ElectionDepartmentAnalyticsView(MonitoringBaseView):
    """
    GET /api/v1/elections/{election_id}/analytics/departments/
    Returns privacy-suppressed department cohort turnout analytics.
    """

    def get(self, request, election_id):
        success, data, error_msg = ElectionAnalyticsService.get_department_analytics(str(election_id))
        if not success:
            return Response({"error": error_msg}, status=status.HTTP_404_NOT_FOUND)

        if data.get("suppressed_departments_count", 0) > 0:
            log_audit_event(
                action=AuditAction.PRIVACY_SUPPRESSION_APPLIED,
                target_type="ELECTION",
                target_id=str(election_id),
                metadata={
                    "suppressed_count": data["suppressed_departments_count"],
                    "threshold": data["privacy_threshold"]
                },
                request=request
            )

        return Response(data, status=status.HTTP_200_OK)


class ElectionConnectionStatusView(MonitoringBaseView):
    """
    GET /api/v1/elections/{election_id}/analytics/connection-status/
    Informs frontend dashboard of supported real-time transports and fallback polling intervals.
    """

    def get(self, request, election_id):
        return Response({
            "election_id": str(election_id),
            "websocket_supported": True,
            "transport": "channels",
            "polling_fallback_interval_seconds": 5,
            "status": "OPERATIONAL"
        }, status=status.HTTP_200_OK)
