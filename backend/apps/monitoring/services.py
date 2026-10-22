"""
Real-Time Voter Monitoring and Election Analytics Service.
CampusVote Smart ID-Based College Voting System - Phase 6.

Strictly operates on aggregate participation metrics without ever accessing,
linking, or exposing confidential candidate selections or secret ballots.
"""

import math
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any, List, Optional
from django.conf import settings
from django.utils import timezone
from django.db.models import Count, QuerySet

from apps.students.models import Student
from apps.elections.models import Election, ElectionStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.voting.models import VoterParticipationRecord


class ElectionAnalyticsService:
    """
    Authoritative computation service for election participation analytics,
    time-series aggregations, and privacy-suppressed demographic cohorts.
    """

    @staticmethod
    def get_eligible_voters_queryset(election: Election) -> QuerySet[Student]:
        """
        Retrieves the exact QuerySet of students eligible to participate in this election,
        strictly respecting Phase 2 eligibility rules and active enrollment criteria.
        """
        rule = ElectionEligibilityRule.objects.filter(election_id=election.id, is_active=True).first()
        if rule:
            return EligibilityEngineService.get_eligible_students_queryset(rule)

        # Default franchise: actively enrolled students
        return Student.objects.filter(
            is_active=True,
            enrollment_status='ENROLLED'
        )

    @classmethod
    def get_summary_metrics(cls, election_id: str) -> Tuple[bool, Dict[str, Any], str]:
        """
        Computes aggregate participation KPIs for the election dashboard:
          - Total Eligible Voters
          - Total Recorded Participants (unique 1-person-1-vote records)
          - Remaining Eligible Voters
          - Overall Turnout Percentage
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, {}, "Election cycle not found."

        eligible_qs = cls.get_eligible_voters_queryset(election)
        total_eligible = eligible_qs.count()

        recorded_participants = VoterParticipationRecord.objects.filter(election=election).count()
        remaining_eligible = max(0, total_eligible - recorded_participants)

        if total_eligible > 0:
            turnout_percentage = round((recorded_participants / total_eligible) * 100, 2)
            # Cap at 100.0 to prevent mathematical overflow in anomalous edge cases
            turnout_percentage = min(100.0, max(0.0, turnout_percentage))
        else:
            turnout_percentage = 0.0

        now = timezone.now()
        is_open = (
            election.status == ElectionStatus.ACTIVE and
            election.start_time <= now <= election.end_time
        )

        metrics = {
            "election_id": str(election.id),
            "election_title": election.title,
            "election_status": election.status,
            "election_status_display": election.get_status_display(),
            "start_time": election.start_time.isoformat(),
            "end_time": election.end_time.isoformat(),
            "is_open": is_open,
            "total_eligible_voters": total_eligible,
            "recorded_participants": recorded_participants,
            "remaining_eligible_voters": remaining_eligible,
            "turnout_percentage": turnout_percentage,
            "last_updated": now.isoformat(),
        }

        return True, metrics, ""

    @classmethod
    def get_turnout_time_series(
        cls,
        election_id: str,
        interval: str = "5m"
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Produces aggregate time-bucketed participation series for charts.
        Supported intervals:
          - '5m': 5-minute time buckets
          - '15m': 15-minute time buckets
          - '1h': 1-hour time buckets
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, {}, "Election cycle not found."

        interval_delta_map = {
            "5m": timedelta(minutes=5),
            "15m": timedelta(minutes=15),
            "1h": timedelta(hours=1),
        }

        delta = interval_delta_map.get(interval)
        if not delta:
            return False, {}, f"Invalid interval '{interval}'. Permitted intervals: 5m, 15m, 1h."

        eligible_qs = cls.get_eligible_voters_queryset(election)
        total_eligible = eligible_qs.count()

        # Query all participation timestamps in chronological order
        participation_times = list(
            VoterParticipationRecord.objects.filter(election=election)
            .order_by("participated_at")
            .values_list("participated_at", flat=True)
        )

        now = timezone.now()
        start_time = election.start_time
        end_time = min(election.end_time, now) if election.status == ElectionStatus.ACTIVE else election.end_time

        if start_time >= end_time:
            # If election hasn't started or duration is zero, provide single starting bucket
            end_time = start_time + delta

        # Generate bucket steps
        buckets: List[Dict[str, Any]] = []
        current_bucket_start = start_time
        cumulative_count = 0
        part_idx = 0
        total_parts = len(participation_times)

        # Loop through buckets until end_time
        while current_bucket_start <= end_time:
            current_bucket_end = current_bucket_start + delta
            interval_count = 0

            while part_idx < total_parts and participation_times[part_idx] < current_bucket_end:
                interval_count += 1
                cumulative_count += 1
                part_idx += 1

            cum_pct = round((cumulative_count / total_eligible) * 100, 2) if total_eligible > 0 else 0.0
            cum_pct = min(100.0, max(0.0, cum_pct))

            buckets.append({
                "timestamp": current_bucket_start.isoformat(),
                "display_label": current_bucket_start.strftime("%H:%M"),
                "interval_count": interval_count,
                "cumulative_count": cumulative_count,
                "turnout_percentage": cum_pct,
            })

            current_bucket_start = current_bucket_end

            # Safety cap to prevent runaway loops if date range is very large
            if len(buckets) > 500:
                break

        response_data = {
            "election_id": str(election.id),
            "interval": interval,
            "total_eligible_voters": total_eligible,
            "total_recorded_participants": total_parts,
            "buckets_count": len(buckets),
            "buckets": buckets,
            "last_updated": now.isoformat(),
        }

        return True, response_data, ""

    @classmethod
    def get_department_analytics(cls, election_id: str) -> Tuple[bool, Dict[str, Any], str]:
        """
        Computes department-level turnout breakdown with mandatory privacy suppression.
        Any cohort with fewer eligible or participating students than the institutional
        threshold is suppressed to prevent individual identification.
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, {}, "Election cycle not found."

        threshold = getattr(settings, 'MONITORING_PRIVACY_SUPPRESSION_THRESHOLD', 5)

        eligible_qs = cls.get_eligible_voters_queryset(election)
        dept_eligible_query = (
            eligible_qs.values("department")
            .annotate(eligible_total=Count("id"))
            .order_by("department")
        )
        dept_eligible_map = {
            item["department"]: item["eligible_total"]
            for item in dept_eligible_query
            if item["department"]
        }

        dept_part_query = (
            VoterParticipationRecord.objects.filter(election=election)
            .values("student__department")
            .annotate(part_total=Count("id"))
            .order_by("student__department")
        )
        dept_part_map = {
            item["student__department"]: item["part_total"]
            for item in dept_part_query
            if item["student__department"]
        }

        all_depts = sorted(set(dept_eligible_map.keys()) | set(dept_part_map.keys()))

        department_results: List[Dict[str, Any]] = []
        suppressed_cohorts_count = 0

        for dept in all_depts:
            eligible_count = dept_eligible_map.get(dept, 0)
            participant_count = dept_part_map.get(dept, 0)

            # Apply Privacy Suppression Rule
            if eligible_count < threshold:
                suppressed_cohorts_count += 1
                department_results.append({
                    "department": dept,
                    "is_suppressed": True,
                    "suppression_reason": f"Cohort size below privacy threshold (< {threshold})",
                    "eligible_voters": None,
                    "recorded_participants": None,
                    "turnout_percentage": None,
                })
            else:
                pct = round((participant_count / eligible_count) * 100, 2) if eligible_count > 0 else 0.0
                pct = min(100.0, max(0.0, pct))
                department_results.append({
                    "department": dept,
                    "is_suppressed": False,
                    "suppression_reason": None,
                    "eligible_voters": eligible_count,
                    "recorded_participants": participant_count,
                    "turnout_percentage": pct,
                })

        response_data = {
            "election_id": str(election.id),
            "privacy_threshold": threshold,
            "total_departments": len(all_depts),
            "suppressed_departments_count": suppressed_cohorts_count,
            "departments": department_results,
            "last_updated": timezone.now().isoformat(),
        }

        return True, response_data, ""
