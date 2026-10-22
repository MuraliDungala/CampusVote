"""
API Views for AI Anomaly Detection and Security Monitoring.
CampusVote Phase 7 Architecture.

Restricted exclusively to authenticated Election Administrators and Institutional Auditors.
Guarantees zero access to individual ballot selections or secret vote choices.
"""

import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsElectionAdmin
from apps.elections.models import Election
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.anomaly.models import AnomalyAlert, AnomalyStatus
from apps.anomaly.services import AnomalyOrchestratorService
from apps.anomaly.serializers import AnomalyAlertSerializer, AnomalyAlertActionSerializer

logger = logging.getLogger(__name__)


class AnomalyBaseView(APIView):
    """Base authorization and audit enforcement for security monitoring endpoints."""
    permission_classes = [IsElectionAdmin]

    def permission_denied(self, request, message=None, code=None):
        election_id = self.kwargs.get("election_id")
        log_audit_event(
            action=AuditAction.ANOMALY_ACCESS_DENIED,
            target_type="ELECTION",
            target_id=str(election_id) if election_id else None,
            metadata={
                "attempted_role": getattr(request.user, "role", None),
                "error": "UNAUTHORIZED_SECURITY_ANOMALY_ACCESS"
            },
            request=request
        )
        super().permission_denied(request, message, code)


class ElectionAnomalyListView(AnomalyBaseView):
    """
    GET /api/v1/elections/{election_id}/anomalies/
    Lists security anomaly alerts for an election with optional severity and status filters.
    """

    def get(self, request, election_id):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        severity = request.query_params.get("severity")
        status_filter = request.query_params.get("status")

        alerts = AnomalyOrchestratorService.get_election_alerts(
            election_id=str(election.id),
            severity=severity,
            status_filter=status_filter
        )
        serializer = AnomalyAlertSerializer(alerts, many=True)
        return Response({
            "election_id": str(election.id),
            "count": len(alerts),
            "alerts": serializer.data
        }, status=status.HTTP_200_OK)


class ElectionAnomalyRunPipelineView(AnomalyBaseView):
    """
    POST /api/v1/elections/{election_id}/anomalies/run/
    Explicit administrative trigger to execute detection pipeline on demand.
    """

    def post(self, request, election_id):
        success, new_alerts, err = AnomalyOrchestratorService.run_detection_pipeline(str(election_id))
        if not success:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AnomalyAlertSerializer(new_alerts, many=True)
        return Response({
            "message": f"Detection pipeline completed. {len(new_alerts)} new alerts identified.",
            "new_alerts_count": len(new_alerts),
            "new_alerts": serializer.data
        }, status=status.HTTP_200_OK)


class ElectionAnomalySummaryView(AnomalyBaseView):
    """
    GET /api/v1/elections/{election_id}/anomaly-summary/
    Returns high-level security metrics for the security monitoring dashboard.
    """

    def get(self, request, election_id):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        metrics = AnomalyOrchestratorService.get_alert_summary_metrics(str(election.id))
        return Response(metrics, status=status.HTTP_200_OK)


class AnomalyDetailView(AnomalyBaseView):
    """
    GET /api/v1/elections/{election_id}/anomalies/{id}/
    Retrieves full explainability details, aggregate evidence, and recommendations for an alert.
    """

    def get(self, request, election_id, pk):
        alert = AnomalyAlert.objects.filter(id=pk, election_id=election_id).first()
        if not alert:
            return Response({"error": "Anomaly alert not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AnomalyAlertSerializer(alert)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AnomalyAcknowledgeView(AnomalyBaseView):
    """
    POST /api/v1/elections/{election_id}/anomalies/{id}/acknowledge/
    Transitions alert from OPEN to ACKNOWLEDGED.
    """

    def post(self, request, election_id, pk):
        alert = AnomalyAlert.objects.filter(id=pk, election_id=election_id).first()
        if not alert:
            return Response({"error": "Anomaly alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if not alert.can_transition_to(AnomalyStatus.ACKNOWLEDGED):
            return Response(
                {"error": f"Cannot transition alert from {alert.status} to ACKNOWLEDGED."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AnomalyAlertActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert.status = AnomalyStatus.ACKNOWLEDGED
        alert.reviewed_by = request.user
        alert.reviewed_at = timezone.now()
        if serializer.validated_data.get("resolution_note"):
            alert.resolution_note = serializer.validated_data["resolution_note"]
        alert.save()

        log_audit_event(
            action=AuditAction.ANOMALY_ACKNOWLEDGED,
            target_type="ANOMALY_ALERT",
            target_id=str(alert.id),
            metadata={"election_id": str(election_id)},
            request=request
        )

        return Response(AnomalyAlertSerializer(alert).data, status=status.HTTP_200_OK)


class AnomalyInvestigateView(AnomalyBaseView):
    """
    POST /api/v1/elections/{election_id}/anomalies/{id}/investigate/
    Transitions alert to INVESTIGATING.
    """

    def post(self, request, election_id, pk):
        alert = AnomalyAlert.objects.filter(id=pk, election_id=election_id).first()
        if not alert:
            return Response({"error": "Anomaly alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if not alert.can_transition_to(AnomalyStatus.INVESTIGATING):
            return Response(
                {"error": f"Cannot transition alert from {alert.status} to INVESTIGATING."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AnomalyAlertActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert.status = AnomalyStatus.INVESTIGATING
        alert.reviewed_by = request.user
        alert.reviewed_at = timezone.now()
        if serializer.validated_data.get("resolution_note"):
            alert.resolution_note = serializer.validated_data["resolution_note"]
        alert.save()

        log_audit_event(
            action=AuditAction.ANOMALY_INVESTIGATION_STARTED,
            target_type="ANOMALY_ALERT",
            target_id=str(alert.id),
            metadata={"election_id": str(election_id)},
            request=request
        )

        return Response(AnomalyAlertSerializer(alert).data, status=status.HTTP_200_OK)


class AnomalyResolveView(AnomalyBaseView):
    """
    POST /api/v1/elections/{election_id}/anomalies/{id}/resolve/
    Transitions alert to RESOLVED with required administrative resolution note.
    """

    def post(self, request, election_id, pk):
        alert = AnomalyAlert.objects.filter(id=pk, election_id=election_id).first()
        if not alert:
            return Response({"error": "Anomaly alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if not alert.can_transition_to(AnomalyStatus.RESOLVED):
            return Response(
                {"error": f"Cannot transition alert from {alert.status} to RESOLVED."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AnomalyAlertActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("resolution_note", "").strip()

        if not note:
            return Response(
                {"resolution_note": ["A resolution note explaining administrative findings is required to resolve an alert."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = AnomalyStatus.RESOLVED
        alert.reviewed_by = request.user
        alert.reviewed_at = timezone.now()
        alert.resolution_note = note
        alert.save()

        log_audit_event(
            action=AuditAction.ANOMALY_RESOLVED,
            target_type="ANOMALY_ALERT",
            target_id=str(alert.id),
            metadata={"election_id": str(election_id), "note": note[:100]},
            request=request
        )

        return Response(AnomalyAlertSerializer(alert).data, status=status.HTTP_200_OK)


class AnomalyMarkFalsePositiveView(AnomalyBaseView):
    """
    POST /api/v1/elections/{election_id}/anomalies/{id}/mark-false-positive/
    Transitions alert to FALSE_POSITIVE with required justification note.
    """

    def post(self, request, election_id, pk):
        alert = AnomalyAlert.objects.filter(id=pk, election_id=election_id).first()
        if not alert:
            return Response({"error": "Anomaly alert not found."}, status=status.HTTP_404_NOT_FOUND)

        if not alert.can_transition_to(AnomalyStatus.FALSE_POSITIVE):
            return Response(
                {"error": f"Cannot transition alert from {alert.status} to FALSE_POSITIVE."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AnomalyAlertActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("resolution_note", "").strip()

        if not note:
            return Response(
                {"resolution_note": ["A justification note is required to mark an alert as false positive."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = AnomalyStatus.FALSE_POSITIVE
        alert.reviewed_by = request.user
        alert.reviewed_at = timezone.now()
        alert.resolution_note = note
        alert.save()

        log_audit_event(
            action=AuditAction.ANOMALY_MARKED_FALSE_POSITIVE,
            target_type="ANOMALY_ALERT",
            target_id=str(alert.id),
            metadata={"election_id": str(election_id), "note": note[:100]},
            request=request
        )

        return Response(AnomalyAlertSerializer(alert).data, status=status.HTTP_200_OK)
