"""
Data Models for AI-Based Anomaly Detection and Election Security Monitoring.
CampusVote Smart ID-Based College Voting System - Phase 7.

Stores explainable, aggregate-level anomaly assessments and administrative alert lifecycles.
STRICT PRIVACY GUARANTEE: Contains ZERO confidential candidate selections, ballot contents,
student identities, or personal identifiers.
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError

from apps.elections.models import Election


class AnomalySeverity(models.TextChoices):
    INFO = 'INFO', _('Informational')
    LOW = 'LOW', _('Low Severity')
    MEDIUM = 'MEDIUM', _('Medium Severity')
    HIGH = 'HIGH', _('High Severity')
    CRITICAL = 'CRITICAL', _('Critical Security Risk')


class AnomalyStatus(models.TextChoices):
    OPEN = 'OPEN', _('Open Alert')
    ACKNOWLEDGED = 'ACKNOWLEDGED', _('Acknowledged by Administrator')
    INVESTIGATING = 'INVESTIGATING', _('Under Active Investigation')
    RESOLVED = 'RESOLVED', _('Resolved with Justification')
    FALSE_POSITIVE = 'FALSE_POSITIVE', _('Marked as False Positive')


class AnomalyType(models.TextChoices):
    TURNOUT_VELOCITY_SPIKE = 'TURNOUT_VELOCITY_SPIKE', _('Abnormal Participation Velocity Spike')
    DATA_INTEGRITY_VIOLATION = 'DATA_INTEGRITY_VIOLATION', _('Aggregate Data Integrity Inconsistency')
    UNUSUAL_OFF_HOURS_ACTIVITY = 'UNUSUAL_OFF_HOURS_ACTIVITY', _('Unusual Off-Hours Participation Activity')
    ELEVATED_AUTH_FAILURE_RATE = 'ELEVATED_AUTH_FAILURE_RATE', _('Elevated Identity Verification Failure Rate')
    ELEVATED_DUPLICATE_VOTE_RATE = 'ELEVATED_DUPLICATE_VOTE_RATE', _('Elevated Duplicate Vote Attempt Rejections')
    MONITORING_TELEMETRY_GAP = 'MONITORING_TELEMETRY_GAP', _('Monitoring Heartbeat Telemetry Gap')
    ML_MULTIVARIATE_ANOMALY = 'ML_MULTIVARIATE_ANOMALY', _('Multivariate Statistical Anomaly (ML Model)')


class DetectorType(models.TextChoices):
    RULE_BASED = 'RULE_BASED', _('Deterministic Rule Engine')
    STATISTICAL = 'STATISTICAL', _('Statistical Z-Score & Moving Average')
    MACHINE_LEARNING = 'MACHINE_LEARNING', _('Isolation Forest Machine Learning')


class AnomalyAlert(models.Model):
    """
    Persistent security alert generated when unusual aggregate patterns or
    operational anomalies are detected in an election cycle.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name='anomaly_alerts',
        db_index=True
    )
    anomaly_type = models.CharField(
        max_length=64,
        choices=AnomalyType.choices,
        db_index=True
    )
    detector_type = models.CharField(
        max_length=32,
        choices=DetectorType.choices,
        default=DetectorType.RULE_BASED,
        db_index=True
    )
    severity = models.CharField(
        max_length=16,
        choices=AnomalySeverity.choices,
        default=AnomalySeverity.LOW,
        db_index=True
    )
    risk_score = models.FloatField(
        help_text="Normalized risk score from 0.0 (benign) to 100.0 (severe)."
    )
    explanation = models.TextField(
        help_text="Human-readable plain English explanation of what triggered the alert."
    )
    evidence_summary = models.JSONField(
        default=dict,
        help_text="Structured aggregate metrics and signals supporting the detection."
    )
    recommended_actions = models.TextField(
        blank=True,
        help_text="Recommended administrative investigation and remediation steps."
    )
    status = models.CharField(
        max_length=24,
        choices=AnomalyStatus.choices,
        default=AnomalyStatus.OPEN,
        db_index=True
    )
    detected_at = models.DateTimeField(db_index=True)
    model_version = models.CharField(max_length=64, default='rule-engine-v1.0')
    dedup_fingerprint = models.CharField(
        max_length=128,
        db_index=True,
        blank=True,
        help_text="Hash to prevent identical recurring alerts within the same time window."
    )

    # Resolution and Audit Fields
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_anomaly_alerts'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['election', 'status', 'severity']),
            models.Index(fields=['election', 'dedup_fingerprint']),
        ]

    def __str__(self):
        return f"[{self.severity}] {self.anomaly_type} - {self.election.title} ({self.status})"

    def clean(self):
        if not (0.0 <= self.risk_score <= 100.0):
            raise ValidationError({'risk_score': "Risk score must be bounded between 0.0 and 100.0."})

    def can_transition_to(self, new_status: str) -> bool:
        """Enforces permitted alert status lifecycle transitions."""
        valid_transitions = {
            AnomalyStatus.OPEN: [
                AnomalyStatus.ACKNOWLEDGED,
                AnomalyStatus.INVESTIGATING,
                AnomalyStatus.RESOLVED,
                AnomalyStatus.FALSE_POSITIVE
            ],
            AnomalyStatus.ACKNOWLEDGED: [
                AnomalyStatus.INVESTIGATING,
                AnomalyStatus.RESOLVED,
                AnomalyStatus.FALSE_POSITIVE
            ],
            AnomalyStatus.INVESTIGATING: [
                AnomalyStatus.RESOLVED,
                AnomalyStatus.FALSE_POSITIVE,
                AnomalyStatus.ACKNOWLEDGED
            ],
            AnomalyStatus.RESOLVED: [
                AnomalyStatus.INVESTIGATING,  # Reopened upon new evidence
            ],
            AnomalyStatus.FALSE_POSITIVE: [
                AnomalyStatus.INVESTIGATING,  # Reopened if re-assessed
            ],
        }
        return new_status in valid_transitions.get(self.status, [])
