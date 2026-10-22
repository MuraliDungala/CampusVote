"""
DRF Serializers for Anomaly Detection Alerts.
CampusVote Phase 7 Architecture.
"""

from rest_framework import serializers
from apps.anomaly.models import AnomalyAlert, AnomalyStatus, AnomalySeverity, AnomalyType


class AnomalyAlertSerializer(serializers.ModelSerializer):
    """Read serializer for security anomaly alerts."""
    anomaly_type_display = serializers.CharField(source='get_anomaly_type_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default=None)

    class Meta:
        model = AnomalyAlert
        fields = [
            'id',
            'election',
            'anomaly_type',
            'anomaly_type_display',
            'detector_type',
            'severity',
            'severity_display',
            'risk_score',
            'explanation',
            'evidence_summary',
            'recommended_actions',
            'status',
            'status_display',
            'detected_at',
            'model_version',
            'reviewed_by',
            'reviewed_by_username',
            'reviewed_at',
            'resolution_note',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AnomalyAlertActionSerializer(serializers.Serializer):
    """Input serializer for administrative alert lifecycle actions."""
    resolution_note = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        help_text="Optional or required administrative context explaining the action."
    )
