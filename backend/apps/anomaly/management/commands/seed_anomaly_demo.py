import hashlib
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.elections.models import Election, ElectionStatus
from apps.anomaly.models import (
    AnomalyAlert,
    AnomalyType,
    AnomalySeverity,
    AnomalyStatus,
    DetectorType
)


class Command(BaseCommand):
    help = "Seeds clearly labelled synthetic anomaly demonstration alerts for active elections."

    def add_arguments(self, parser):
        parser.add_argument(
            '--election-id',
            type=str,
            default=None,
            help='Target specific election ID. Defaults to first active election.'
        )

    def handle(self, *args, **options):
        election_id = options.get('election_id')
        if election_id:
            election = Election.objects.filter(id=election_id).first()
        else:
            election = Election.objects.filter(status=ElectionStatus.ACTIVE).first() or Election.objects.first()

        if not election:
            self.stdout.write(self.style.ERROR("No election found to seed demo alerts."))
            return

        now = timezone.now()
        alerts_data = [
            {
                'type': AnomalyType.TURNOUT_VELOCITY_SPIKE,
                'detector': DetectorType.RULE_BASED,
                'severity': AnomalySeverity.HIGH,
                'risk': 78.5,
                'explanation': 'Abnormal turnout surge detected: 32 ballots cast in a recent 5-minute interval (baseline average: 3.4 per 5m).',
                'evidence': {
                    'interval_count': 32,
                    'baseline_mean_5m': 3.4,
                    'total_eligible_voters': 120,
                    'interval_electorate_share_pct': 26.67
                },
                'recommended': 'Review network ingress metrics and verification challenge logs for automated traffic. Cross-reference scheduled campus dismissal events.',
                'version': 'velocity-rule-v1.0'
            },
            {
                'type': AnomalyType.ML_MULTIVARIATE_ANOMALY,
                'detector': DetectorType.MACHINE_LEARNING,
                'severity': AnomalySeverity.CRITICAL,
                'risk': 89.0,
                'explanation': 'Multivariate statistical outlier detected by Isolation Forest model: Recent 5m velocity and rate-of-change deviate significantly from multidimensional baseline.',
                'evidence': {
                    'model': 'IsolationForest',
                    'model_score': -0.1942,
                    'latest_interval_count': 38,
                    'cumulative_turnout_pct': 58.2,
                    'total_buckets_analyzed': 24
                },
                'recommended': 'Investigate participation telemetry across academic cohorts and inspect operational access logs for abnormal clustering.',
                'version': 'isolation-forest-v1.2'
            },
            {
                'type': AnomalyType.ELEVATED_AUTH_FAILURE_RATE,
                'detector': DetectorType.RULE_BASED,
                'severity': AnomalySeverity.MEDIUM,
                'risk': 68.0,
                'explanation': 'High identity verification failure rate: 14 of 22 (63.6%) verification attempts failed in the past hour.',
                'evidence': {
                    'failed_attempts': 14,
                    'successful_attempts': 8,
                    'failure_rate_pct': 63.64
                },
                'recommended': 'Inspect SMS/email OTP delivery logs and check physical QR scanner lighting conditions.',
                'version': 'auth-telemetry-v1.0'
            }
        ]

        created_count = 0
        for d in alerts_data:
            fp = hashlib.sha256(f"{election.id}:{d['type']}:demo_seed".encode()).hexdigest()
            alert, created = AnomalyAlert.objects.get_or_create(
                election=election,
                anomaly_type=d['type'],
                defaults={
                    'detector_type': d['detector'],
                    'severity': d['severity'],
                    'risk_score': d['risk'],
                    'explanation': d['explanation'],
                    'evidence_summary': d['evidence'],
                    'recommended_actions': d['recommended'],
                    'status': AnomalyStatus.OPEN,
                    'detected_at': now,
                    'model_version': d['version'],
                    'dedup_fingerprint': fp
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  + Created synthetic demonstration alert: {d['type']}"))
            else:
                self.stdout.write(f"  * Existing alert found for: {d['type']}")

        self.stdout.write(self.style.SUCCESS(f"Done. Seeded {created_count} synthetic alerts for {election.title}."))
