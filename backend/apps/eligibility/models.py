"""
Eligibility Rules Models.
Smart ID-Based College Voting System (CampusVote).
Enforces backend-only eligibility evaluation per election franchise.
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class ElectionEligibilityRule(models.Model):
    """
    Configurable institutional eligibility rule specification for an election cycle.
    Supports demographic filters (department, year), status checks, and explicit overrides.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    election_id = models.UUIDField(
        db_index=True,
        help_text=_("Foreign election cycle identifier.")
    )
    title = models.CharField(
        max_length=150,
        help_text=_("Descriptive name for rule (e.g. 'Engineering Senate Franchise').")
    )
    allowed_departments = models.JSONField(
        default=list,
        blank=True,
        help_text=_("List of allowed departments. Empty list permits all departments.")
    )
    allowed_academic_years = models.JSONField(
        default=list,
        blank=True,
        help_text=_("List of allowed academic years (e.g., [2, 3, 4]). Empty permits all years.")
    )
    required_enrollment_statuses = models.JSONField(
        default=list,
        blank=True,
        help_text=_("List of permissible registrar enrollment statuses. Defaults to ['ENROLLED'].")
    )
    require_active_account = models.BooleanField(
        default=True,
        help_text=_("Requires student record is_active flag to be True.")
    )
    included_student_ids = models.JSONField(
        default=list,
        blank=True,
        help_text=_("Explicit student college IDs granted eligibility regardless of general criteria.")
    )
    excluded_student_ids = models.JSONField(
        default=list,
        blank=True,
        help_text=_("Explicit student college IDs denied eligibility regardless of general criteria.")
    )
    is_active = models.BooleanField(
        default=True,
        help_text=_("Active toggle for this eligibility rule.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_eligibility_rules'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} (Election ID: {self.election_id})"
