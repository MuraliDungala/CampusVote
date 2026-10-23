"""
Election, Position, and Candidate Management Models.
Smart ID-Based College Voting System (CampusVote) - Phase 3 Architecture.

Maintains strict separation between student identity/candidate nomination and future anonymous ballots.
"""

import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class ElectionStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Draft')
    SCHEDULED = 'SCHEDULED', _('Scheduled')
    ACTIVE = 'ACTIVE', _('Active Voting')
    CLOSED = 'CLOSED', _('Closed')
    RESULTS_PUBLISHED = 'RESULTS_PUBLISHED', _('Results Published')
    ARCHIVED = 'ARCHIVED', _('Archived')
    CANCELLED = 'CANCELLED', _('Cancelled')


class CandidateStatus(models.TextChoices):
    DRAFT = 'DRAFT', _('Draft')
    SUBMITTED = 'SUBMITTED', _('Submitted')
    UNDER_REVIEW = 'UNDER_REVIEW', _('Under Review')
    APPROVED = 'APPROVED', _('Approved Candidate')
    REJECTED = 'REJECTED', _('Rejected')
    WITHDRAWN = 'WITHDRAWN', _('Withdrawn')


class Election(models.Model):
    """
    Collegiate election cycle entity with strict lifecycle state machine and auditability.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique identifier for the election cycle.")
    )
    title = models.CharField(
        max_length=200,
        db_index=True,
        help_text=_("Official election title (e.g., 'Student Council Elections 2026-2027').")
    )
    description = models.TextField(
        blank=True,
        help_text=_("Comprehensive description and mandate for this election.")
    )
    academic_year = models.CharField(
        max_length=32,
        default='2026-2027',
        db_index=True,
        help_text=_("Academic year or cohort associated with this election.")
    )
    start_time = models.DateTimeField(
        help_text=_("Timezone-aware start datetime of voting window.")
    )
    end_time = models.DateTimeField(
        help_text=_("Timezone-aware end datetime of voting window.")
    )
    status = models.CharField(
        max_length=32,
        choices=ElectionStatus.choices,
        default=ElectionStatus.DRAFT,
        db_index=True,
        help_text=_("Current lifecycle status.")
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_elections',
        help_text=_("Administrator who initialized this election.")
    )
    institution = models.ForeignKey(
        'accounts.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='elections',
        help_text=_("Institution hosting this election cycle.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when election results were formally authorized and published.")
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when election record was archived for historical preservation.")
    )

    class Meta:
        db_table = 'campusvote_elections'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_time__gt=models.F('start_time')),
                name='election_end_time_after_start_time'
            )
        ]

    def __str__(self):
        return f"{self.title} ({self.status})"

    def clean(self):
        super().clean()
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValidationError({
                    'end_time': _("Election end time must be later than the scheduled start time.")
                })

    # Permitted State Transitions Matrix
    # DRAFT -> SCHEDULED, CANCELLED
    # SCHEDULED -> ACTIVE, DRAFT, CANCELLED
    # ACTIVE -> CLOSED, CANCELLED
    # CLOSED -> RESULTS_PUBLISHED, ARCHIVED
    # RESULTS_PUBLISHED -> ARCHIVED
    # ARCHIVED -> terminal
    # CANCELLED -> terminal
    VALID_TRANSITIONS = {
        ElectionStatus.DRAFT: {ElectionStatus.SCHEDULED, ElectionStatus.CANCELLED},
        ElectionStatus.SCHEDULED: {ElectionStatus.ACTIVE, ElectionStatus.DRAFT, ElectionStatus.CANCELLED},
        ElectionStatus.ACTIVE: {ElectionStatus.CLOSED, ElectionStatus.CANCELLED, ElectionStatus.DRAFT},
        ElectionStatus.CLOSED: {ElectionStatus.RESULTS_PUBLISHED, ElectionStatus.ARCHIVED},
        ElectionStatus.RESULTS_PUBLISHED: {ElectionStatus.ARCHIVED},
        ElectionStatus.ARCHIVED: set(),
        ElectionStatus.CANCELLED: set(),
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.VALID_TRANSITIONS.get(self.status, set())

    def transition_to(self, new_status: str, actor=None, reason: str = ""):
        """
        Executes a validated lifecycle transition or raises ValidationError.
        """
        if not self.can_transition_to(new_status):
            raise ValidationError(
                _(f"Invalid election lifecycle transition from '{self.status}' to '{new_status}'.")
            )

        now = timezone.now()

        # Specific transition requirements
        if new_status == ElectionStatus.SCHEDULED:
            if self.positions.count() == 0:
                raise ValidationError(_("Cannot schedule an election without at least one configured position."))
            if self.end_time <= now:
                raise ValidationError(_("Cannot schedule an election whose end time is already in the past."))

        elif new_status == ElectionStatus.ACTIVE:
            # Active election requires at least one position
            if self.positions.count() == 0:
                raise ValidationError(_("Cannot activate an election without at least one configured position."))

        elif new_status == ElectionStatus.RESULTS_PUBLISHED:
            self.published_at = now

        elif new_status == ElectionStatus.ARCHIVED:
            self.archived_at = now

        self.status = new_status
        self.save()


class ElectionPosition(models.Model):
    """
    Contested position or executive office within an election cycle.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name='positions',
        help_text=_("Associated election cycle.")
    )
    title = models.CharField(
        max_length=150,
        help_text=_("Title of office (e.g., 'President', 'Department Representative').")
    )
    description = models.TextField(
        blank=True,
        help_text=_("Mandate, responsibilities, or eligibility guidelines for this office.")
    )
    display_order = models.PositiveSmallIntegerField(
        default=1,
        help_text=_("Visual presentation order on candidate rosters and ballots.")
    )
    maximum_candidates = models.PositiveSmallIntegerField(
        default=10,
        help_text=_("Maximum number of approved candidates allowed to contest this position.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_election_positions'
        ordering = ['display_order', 'created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['election', 'title'],
                name='unique_position_title_per_election'
            )
        ]

    def __str__(self):
        return f"{self.title} - {self.election.title}"

    def clean(self):
        super().clean()
        if not self.title or not self.title.strip():
            raise ValidationError({'title': _("Position title cannot be empty.")})

        # Case-insensitive duplicate check within same election
        qs = ElectionPosition.objects.filter(
            election=self.election,
            title__iexact=self.title.strip()
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError({
                'title': _(f"A position titled '{self.title.strip()}' already exists for this election.")
            })

    def delete(self, *args, **kwargs):
        # Disallow deletion if election is active or beyond
        if self.election.status in (ElectionStatus.ACTIVE, ElectionStatus.CLOSED, ElectionStatus.RESULTS_PUBLISHED, ElectionStatus.ARCHIVED):
            raise ValidationError(_(f"Cannot delete positions in an election with status '{self.election.status}'."))
        
        # Disallow deletion if candidates already submitted
        if self.candidates.filter(status__in=[CandidateStatus.SUBMITTED, CandidateStatus.UNDER_REVIEW, CandidateStatus.APPROVED]).exists():
            raise ValidationError(_("Cannot delete a position that already has submitted or approved candidate nominations."))

        super().delete(*args, **kwargs)


class Candidate(models.Model):
    """
    Candidate nomination linking an institutional Student record to an ElectionPosition.
    Strictly vetted via the Phase 2 Eligibility Engine before administrative approval.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    election_position = models.ForeignKey(
        ElectionPosition,
        on_delete=models.PROTECT,
        related_name='candidates',
        help_text=_("Position being contested.")
    )
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.PROTECT,
        related_name='nominations',
        help_text=_("Authoritative student registry record.")
    )
    manifesto = models.TextField(
        blank=True,
        help_text=_("Candidate policy statement, platform, or bio.")
    )
    profile_image = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        help_text=_("Optional approved profile avatar URI or asset reference.")
    )
    status = models.CharField(
        max_length=32,
        choices=CandidateStatus.choices,
        default=CandidateStatus.DRAFT,
        db_index=True,
        help_text=_("Nomination review lifecycle status.")
    )
    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when student formally submitted the nomination.")
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp of administrative approval or rejection.")
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_candidates',
        help_text=_("Election Administrator who evaluated the nomination.")
    )
    rejection_reason = models.TextField(
        blank=True,
        null=True,
        help_text=_("Mandatory justification if nomination is rejected.")
    )
    eligibility_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Record of eligibility evaluation results at time of submission/approval.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_candidates'
        ordering = ['election_position', 'status', 'created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['election_position', 'student'],
                name='unique_nomination_per_position'
            )
        ]

    def __str__(self):
        return f"{self.student.full_name} ({self.student.college_id}) for {self.election_position.title} [{self.status}]"

    # Candidate Status Transitions Matrix
    VALID_CANDIDATE_TRANSITIONS = {
        CandidateStatus.DRAFT: {CandidateStatus.SUBMITTED, CandidateStatus.WITHDRAWN},
        CandidateStatus.SUBMITTED: {CandidateStatus.UNDER_REVIEW, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
        CandidateStatus.UNDER_REVIEW: {CandidateStatus.APPROVED, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
        CandidateStatus.APPROVED: {CandidateStatus.WITHDRAWN},
        CandidateStatus.REJECTED: set(),
        CandidateStatus.WITHDRAWN: set(),
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.VALID_CANDIDATE_TRANSITIONS.get(self.status, set())
