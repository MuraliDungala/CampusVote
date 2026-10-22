"""
Django Management Command to Run the AI Anomaly Detection Pipeline.
CampusVote Phase 7 Architecture.

Usage:
  python manage.py run_anomaly_detector
  python manage.py run_anomaly_detector --election-id <uuid>
  python manage.py run_anomaly_detector --all-active
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.elections.models import Election, ElectionStatus
from apps.anomaly.services import AnomalyOrchestratorService


class Command(BaseCommand):
    help = 'Executes rule-based and ML anomaly detection pipeline for active elections.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--election-id',
            type=str,
            help='Run anomaly detection on a specific election cycle.'
        )
        parser.add_argument(
            '--all-active',
            action='store_true',
            help='Run anomaly detection on all elections with ACTIVE status.'
        )

    def handle(self, *args, **options):
        election_id = options.get('election_id')
        all_active = options.get('all_active')

        if election_id:
            elections = Election.objects.filter(id=election_id)
            if not elections.exists():
                self.stderr.write(self.style.ERROR(f"Election with ID '{election_id}' not found."))
                return
        elif all_active:
            elections = Election.objects.filter(status=ElectionStatus.ACTIVE)
        else:
            # Default: evaluate active or recently concluded elections
            elections = Election.objects.filter(status__in=[ElectionStatus.ACTIVE, ElectionStatus.CLOSED])

        count = elections.count()
        self.stdout.write(self.style.NOTICE(f"[{timezone.now()}] Running Anomaly Detection Pipeline across {count} election(s)..."))

        total_new_alerts = 0
        for elec in elections:
            self.stdout.write(f"  Evaluating election: {elec.title} ({elec.id})...")
            success, new_alerts, err = AnomalyOrchestratorService.run_detection_pipeline(str(elec.id))
            if success:
                total_new_alerts += len(new_alerts)
                self.stdout.write(self.style.SUCCESS(f"    Completed. {len(new_alerts)} new alerts generated."))
            else:
                self.stderr.write(self.style.WARNING(f"    Detection warning: {err}"))

        self.stdout.write(self.style.SUCCESS(f"Anomaly detection finished. Total new alerts created: {total_new_alerts}"))
