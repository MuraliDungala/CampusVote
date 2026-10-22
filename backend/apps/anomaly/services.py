"""
AI and Rule-Based Anomaly Detection Engine for CampusVote.
Phase 7 Security Monitoring Architecture.

Analyzes purely aggregate election participation velocity, demographic turnout curves,
and sanitized operational security metrics.
STRICT PRIVACY RULE: Zero candidate selections, ballot contents, or individual student
identities are processed or exposed.
"""

import math
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any, List, Optional
from django.conf import settings
from django.utils import timezone
from django.db.models import Count, Q

from apps.elections.models import Election, ElectionStatus
from apps.voting.models import VoterParticipationRecord
from apps.audit.models import AuditLog, AuditAction
from apps.audit.services import log_audit_event
from apps.monitoring.services import ElectionAnalyticsService
from apps.anomaly.models import (
    AnomalyAlert,
    AnomalyType,
    AnomalySeverity,
    AnomalyStatus,
    DetectorType
)

logger = logging.getLogger(__name__)

# Optional Machine Learning Imports with Graceful Fallback
try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.info("scikit-learn not available; anomaly detection will use deterministic and statistical detectors.")


class RuleBasedAnomalyDetector:
    """
    Deterministic rule engine for identifying known election integrity violations,
    abnormal participation surges, and elevated operational failure rates.
    """

    @classmethod
    def evaluate_election(cls, election: Election) -> List[Dict[str, Any]]:
        """
        Runs comprehensive rule-based checks on aggregate election metrics.
        Returns a list of structured anomaly candidate dicts.
        """
        anomalies: List[Dict[str, Any]] = []
        now = timezone.now()

        # ----------------------------------------------------------------------
        # Check 1: Data Integrity Violations (Turnout > 100% or Negative Electorate)
        # ----------------------------------------------------------------------
        success, summary, _ = ElectionAnalyticsService.get_summary_metrics(str(election.id))
        if success:
            turnout_pct = summary["turnout_percentage"]
            total_eligible = summary["total_eligible_voters"]
            recorded_participants = summary["recorded_participants"]
            remaining_voters = summary["remaining_eligible_voters"]

            if total_eligible > 0 and recorded_participants > total_eligible:
                anomalies.append({
                    "anomaly_type": AnomalyType.DATA_INTEGRITY_VIOLATION,
                    "detector_type": DetectorType.RULE_BASED,
                    "severity": AnomalySeverity.CRITICAL,
                    "risk_score": 98.0,
                    "explanation": (
                        f"Critical data integrity mismatch: recorded participants ({recorded_participants}) "
                        f"exceeds total eligible voter population ({total_eligible})."
                    ),
                    "evidence_summary": {
                        "recorded_participants": recorded_participants,
                        "total_eligible_voters": total_eligible,
                        "turnout_percentage": turnout_pct,
                        "remaining_voters": remaining_voters,
                    },
                    "recommended_actions": (
                        "Immediately pause election voting, audit student roster eligibility boundaries, "
                        "and inspect participation ledger constraints."
                    ),
                    "model_version": "integrity-rules-v1.0",
                })

            if remaining_voters < 0:
                anomalies.append({
                    "anomaly_type": AnomalyType.DATA_INTEGRITY_VIOLATION,
                    "detector_type": DetectorType.RULE_BASED,
                    "severity": AnomalySeverity.HIGH,
                    "risk_score": 85.0,
                    "explanation": f"Remaining eligible voters computed to an invalid negative value ({remaining_voters}).",
                    "evidence_summary": {"remaining_eligible_voters": remaining_voters},
                    "recommended_actions": "Verify denominator consistency across eligibility engine and participation tracker.",
                    "model_version": "integrity-rules-v1.0",
                })

        # ----------------------------------------------------------------------
        # Check 2: Turnout Velocity Spike in Short Time Window
        # ----------------------------------------------------------------------
        success, time_series, _ = ElectionAnalyticsService.get_turnout_time_series(str(election.id), interval="5m")
        if success and time_series.get("buckets"):
            buckets = time_series["buckets"]
            total_eligible = time_series.get("total_eligible_voters", 0)

            if len(buckets) >= 2 and total_eligible >= 10:
                # Baseline: all buckets except the recent 3
                prior_buckets = buckets[:-3] if len(buckets) > 3 else buckets[:-1]
                counts = [b["interval_count"] for b in prior_buckets]
                mean_count = sum(counts) / len(counts) if counts else 0.0

                # Check recent buckets (up to last 3 buckets, i.e., within last 15 minutes)
                recent_candidates = buckets[-3:]
                peak_recent_bucket = max(recent_candidates, key=lambda b: b["interval_count"])
                spike_count = peak_recent_bucket["interval_count"]

                # Spike threshold: Recent 5m count > 20% of entire electorate OR > 4x rolling mean with at least 5 votes
                is_pct_spike = (spike_count / total_eligible) >= 0.20 and spike_count >= 5
                is_multiplier_spike = mean_count > 0 and (spike_count >= mean_count * 4.0) and spike_count >= 10

                if is_pct_spike or is_multiplier_spike:
                    severity = AnomalySeverity.HIGH if spike_count >= total_eligible * 0.40 else AnomalySeverity.MEDIUM
                    risk = min(92.0, 50.0 + (spike_count / max(1, total_eligible)) * 80.0)

                    anomalies.append({
                        "anomaly_type": AnomalyType.TURNOUT_VELOCITY_SPIKE,
                        "detector_type": DetectorType.RULE_BASED,
                        "severity": severity,
                        "risk_score": round(risk, 1),
                        "explanation": (
                            f"Abnormal turnout surge detected: {spike_count} ballots cast in a recent 5-minute interval "
                            f"(baseline average: {mean_count:.1f} per 5m)."
                        ),
                        "evidence_summary": {
                            "interval_count": spike_count,
                            "baseline_mean_5m": round(mean_count, 2),
                            "timestamp": peak_recent_bucket["timestamp"],
                            "total_eligible_voters": total_eligible,
                            "interval_electorate_share_pct": round((spike_count / total_eligible) * 100, 2),
                        },
                        "recommended_actions": (
                            "Review network ingress metrics and verification challenge logs for automated traffic. "
                            "Cross-reference scheduled campus events (e.g. class dismissals)."
                        ),
                        "model_version": "velocity-rule-v1.0",
                    })

        # ----------------------------------------------------------------------
        # Check 3: Elevated Duplicate Vote Blocked Rate
        # ----------------------------------------------------------------------
        one_hour_ago = now - timedelta(hours=1)
        duplicate_blocks_count = AuditLog.objects.filter(
            action=AuditAction.DUPLICATE_VOTE_BLOCKED,
            target_id=str(election.id),
            created_at__gte=one_hour_ago
        ).count()

        if duplicate_blocks_count >= 5:
            severity = AnomalySeverity.HIGH if duplicate_blocks_count >= 15 else AnomalySeverity.MEDIUM
            risk = min(85.0, 40.0 + (duplicate_blocks_count * 3.0))

            anomalies.append({
                "anomaly_type": AnomalyType.ELEVATED_DUPLICATE_VOTE_RATE,
                "detector_type": DetectorType.RULE_BASED,
                "severity": severity,
                "risk_score": round(risk, 1),
                "explanation": (
                    f"Elevated duplicate vote attempts detected: {duplicate_blocks_count} duplicate participation "
                    "attempts blocked at gatekeeper in the last hour."
                ),
                "evidence_summary": {
                    "blocked_attempts_last_hour": duplicate_blocks_count,
                    "window_start": one_hour_ago.isoformat(),
                    "window_end": now.isoformat(),
                },
                "recommended_actions": (
                    "Investigate whether voter portal UI is submitting rapid duplicate requests on slow connections, "
                    "or if credential re-use is being attempted."
                ),
                "model_version": "security-gate-v1.0",
            })

        # ----------------------------------------------------------------------
        # Check 4: Elevated Identity Verification Failure Rate
        # ----------------------------------------------------------------------
        auth_failures = AuditLog.objects.filter(
            action__in=[
                AuditAction.OTP_FAILED,
                AuditAction.QR_FAILED,
                AuditAction.VERIFICATION_RATE_LIMITED,
                AuditAction.VERIFICATION_LOCKED
            ],
            created_at__gte=one_hour_ago
        ).count()

        auth_successes = AuditLog.objects.filter(
            action=AuditAction.OTP_VERIFIED,
            created_at__gte=one_hour_ago
        ).count()

        total_auth_attempts = auth_failures + auth_successes
        if total_auth_attempts >= 10 and (auth_failures / total_auth_attempts) >= 0.50:
            anomalies.append({
                "anomaly_type": AnomalyType.ELEVATED_AUTH_FAILURE_RATE,
                "detector_type": DetectorType.RULE_BASED,
                "severity": AnomalySeverity.MEDIUM,
                "risk_score": 68.0,
                "explanation": (
                    f"High identity verification failure rate: {auth_failures} of {total_auth_attempts} "
                    f"({(auth_failures/total_auth_attempts)*100:.1f}%) verification attempts failed in the past hour."
                ),
                "evidence_summary": {
                    "failed_attempts": auth_failures,
                    "successful_attempts": auth_successes,
                    "failure_rate_pct": round((auth_failures / total_auth_attempts) * 100, 2),
                },
                "recommended_actions": (
                    "Inspect SMS/email OTP delivery logs and check physical QR scanner lighting conditions."
                ),
                "model_version": "auth-telemetry-v1.0",
            })

        return anomalies


class IsolationForestAnomalyDetector:
    """
    Lightweight, unsupervised machine-learning detector using Isolation Forest
    to identify multidimensional outliers across aggregate time-series features.
    """

    MODEL_VERSION = "isolation-forest-v1.2"

    @classmethod
    def evaluate_time_series(cls, election: Election) -> Optional[Dict[str, Any]]:
        """
        Evaluates participation series using Isolation Forest multivariate outlier detection.
        Returns an anomaly alert candidate dict if an outlier is identified, or None.
        """
        if not SKLEARN_AVAILABLE:
            return None

        success, time_series, _ = ElectionAnalyticsService.get_turnout_time_series(str(election.id), interval="5m")
        if not success or not time_series.get("buckets"):
            return None

        buckets = time_series["buckets"]
        total_eligible = max(1, time_series.get("total_eligible_voters", 1))

        # Require minimum 8 historical time buckets for meaningful statistical modeling
        if len(buckets) < 8:
            return None

        try:
            # Build feature matrix from aggregate time series
            # Features per bucket:
            #   0: interval_count
            #   1: cumulative_turnout_pct
            #   2: velocity_delta (change from previous bucket)
            #   3: rolling_3bucket_mean
            features: List[List[float]] = []

            for i in range(len(buckets)):
                curr_count = float(buckets[i]["interval_count"])
                curr_pct = float(buckets[i]["turnout_percentage"])
                prev_count = float(buckets[i - 1]["interval_count"]) if i > 0 else curr_count
                velocity_delta = curr_count - prev_count

                # Rolling 3-bucket window
                window_slice = buckets[max(0, i - 2):i + 1]
                rolling_mean = sum(b["interval_count"] for b in window_slice) / len(window_slice)

                features.append([curr_count, curr_pct, velocity_delta, rolling_mean])

            X = np.array(features, dtype=float)

            # Sanitize and guard against NaN or Inf values
            if not np.all(np.isfinite(X)):
                X = np.nan_to_num(X, nan=0.0, posinf=1e4, neginf=0.0)

            # Fit Isolation Forest (contamination=0.05, reproducible random_state=42)
            iso_forest = IsolationForest(
                n_estimators=50,
                contamination=0.05,
                random_state=42
            )
            iso_forest.fit(X)

            # Predict on the latest time bucket
            latest_vector = X[-1:]
            prediction = iso_forest.predict(latest_vector)[0]  # -1 = anomaly, 1 = normal
            score = iso_forest.decision_function(latest_vector)[0]

            if prediction == -1:
                # Normalize decision function score to 0..100 risk score
                # decision_function yields negative values for anomalies (typically between -0.3 and 0.0)
                risk_score = min(95.0, max(50.0, 50.0 + abs(score) * 150.0))
                severity = AnomalySeverity.HIGH if risk_score >= 80.0 else AnomalySeverity.MEDIUM

                latest_bucket = buckets[-1]
                return {
                    "anomaly_type": AnomalyType.ML_MULTIVARIATE_ANOMALY,
                    "detector_type": DetectorType.MACHINE_LEARNING,
                    "severity": severity,
                    "risk_score": round(risk_score, 1),
                    "explanation": (
                        f"Multivariate statistical outlier detected by Isolation Forest model: "
                        f"Recent 5m velocity ({latest_bucket['interval_count']} votes) and rate-of-change "
                        f"deviate significantly from the election's multidimensional baseline."
                    ),
                    "evidence_summary": {
                        "model": "IsolationForest",
                        "model_score": round(float(score), 4),
                        "latest_interval_count": latest_bucket["interval_count"],
                        "cumulative_turnout_pct": latest_bucket["turnout_percentage"],
                        "timestamp": latest_bucket["timestamp"],
                        "total_buckets_analyzed": len(buckets),
                    },
                    "recommended_actions": (
                        "Investigate participation telemetry across academic cohorts and inspect "
                        "operational access logs for abnormal clustering."
                    ),
                    "model_version": cls.MODEL_VERSION,
                }

        except Exception as exc:
            logger.warning(f"Isolation Forest evaluation failed gracefully: {exc}", exc_info=True)
            return None

        return None


class AnomalyOrchestratorService:
    """
    Coordinates rule-based and machine-learning detectors, applies deduplication,
    persists alerts with state transitions, and emits audit records.
    """

    @classmethod
    def run_detection_pipeline(cls, election_id: str) -> Tuple[bool, List[AnomalyAlert], str]:
        """
        Executes all anomaly detectors for the specified election.
        Deduplicates against open alerts and persists new AnomalyAlert records.
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, [], "Election cycle not found."

        new_alerts: List[AnomalyAlert] = []
        now = timezone.now()

        try:
            # 1. Execute Rule-Based Detections
            candidates = RuleBasedAnomalyDetector.evaluate_election(election)

            # 2. Execute Machine Learning Detections
            ml_candidate = IsolationForestAnomalyDetector.evaluate_time_series(election)
            if ml_candidate:
                candidates.append(ml_candidate)

            # 3. Process, Deduplicate, and Persist Candidates
            for item in candidates:
                anomaly_type = item["anomaly_type"]
                timestamp_str = item.get("evidence_summary", {}).get("timestamp", now.strftime("%Y-%m-%d %H"))

                # Fingerprint combining election, type, and hourly window
                fingerprint = hashlib.sha256(
                    f"{election.id}:{anomaly_type}:{timestamp_str}".encode()
                ).hexdigest()

                # Check if identical alert already exists in OPEN or INVESTIGATING status
                existing = AnomalyAlert.objects.filter(
                    election=election,
                    anomaly_type=anomaly_type,
                    status__in=[AnomalyStatus.OPEN, AnomalyStatus.INVESTIGATING, AnomalyStatus.ACKNOWLEDGED],
                    detected_at__gte=now - timedelta(hours=2)
                ).first()

                if existing:
                    logger.debug(f"Skipping duplicate alert {anomaly_type} for election {election.id}")
                    continue

                alert = AnomalyAlert.objects.create(
                    election=election,
                    anomaly_type=anomaly_type,
                    detector_type=item.get("detector_type", DetectorType.RULE_BASED),
                    severity=item.get("severity", AnomalySeverity.LOW),
                    risk_score=item.get("risk_score", 50.0),
                    explanation=item.get("explanation", ""),
                    evidence_summary=item.get("evidence_summary", {}),
                    recommended_actions=item.get("recommended_actions", ""),
                    status=AnomalyStatus.OPEN,
                    detected_at=now,
                    model_version=item.get("model_version", "v1.0"),
                    dedup_fingerprint=fingerprint
                )

                # Record security audit event
                log_audit_event(
                    action=AuditAction.ANOMALY_DETECTED,
                    target_type="ANOMALY_ALERT",
                    target_id=str(alert.id),
                    metadata={
                        "election_id": str(election.id),
                        "anomaly_type": alert.anomaly_type,
                        "severity": alert.severity,
                        "risk_score": alert.risk_score,
                    }
                )

                new_alerts.append(alert)

            return True, new_alerts, ""

        except Exception as exc:
            logger.error(f"Anomaly detection pipeline failed for election {election_id}: {exc}", exc_info=True)
            log_audit_event(
                action=AuditAction.ANOMALY_DETECTION_FAILED,
                target_type="ELECTION",
                target_id=str(election_id),
                metadata={"error": str(exc)}
            )
            return False, [], f"Detection pipeline failure: {str(exc)}"

    @classmethod
    def get_election_alerts(
        cls,
        election_id: str,
        severity: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[AnomalyAlert]:
        """Retrieves and filters anomaly alerts for an election."""
        qs = AnomalyAlert.objects.filter(election_id=election_id)
        if severity:
            qs = qs.filter(severity=severity.upper())
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return list(qs)

    @classmethod
    def get_alert_summary_metrics(cls, election_id: str) -> Dict[str, Any]:
        """Calculates security dashboard overview counts."""
        qs = AnomalyAlert.objects.filter(election_id=election_id)
        return {
            "total_alerts": qs.count(),
            "open_alerts": qs.filter(status=AnomalyStatus.OPEN).count(),
            "acknowledged_alerts": qs.filter(status=AnomalyStatus.ACKNOWLEDGED).count(),
            "investigating_alerts": qs.filter(status=AnomalyStatus.INVESTIGATING).count(),
            "resolved_alerts": qs.filter(status=AnomalyStatus.RESOLVED).count(),
            "false_positive_alerts": qs.filter(status=AnomalyStatus.FALSE_POSITIVE).count(),
            "critical_severity_count": qs.filter(severity=AnomalySeverity.CRITICAL, status__in=[AnomalyStatus.OPEN, AnomalyStatus.INVESTIGATING]).count(),
            "high_severity_count": qs.filter(severity=AnomalySeverity.HIGH, status__in=[AnomalyStatus.OPEN, AnomalyStatus.INVESTIGATING]).count(),
            "last_detection_run": timezone.now().isoformat(),
            "detector_status": "OPERATIONAL",
        }
