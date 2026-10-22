"""
Election Results Management, Verification, and Audit Models.
CampusVote Phase 8 Architecture.

STRICT PRIVACY GUARANTEE:
Results records contain strictly aggregate tallies and cryptographic integrity digests.
Under no circumstances are student IDs, voter choices, or individual ballot records
stored, mapped, or linked in this module.
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.elections.models import Election, ElectionPosition


class ResultLifecycleStatus(models.TextChoices):
    NOT_CALCULATED = 'NOT_CALCULATED', _('Not Calculated')
    CALCULATED = 'CALCULATED', _('Calculated')
    UNDER_REVIEW = 'UNDER_REVIEW', _('Under Review')
    APPROVED = 'APPROVED', _('Approved')
    PUBLISHED = 'PUBLISHED', _('Published')
    REJECTED = 'REJECTED', _('Rejected')
    SUPERSEDED = 'SUPERSEDED', _('Superseded')


class TallySourceType(models.TextChoices):
    SYNTHETIC_DEVELOPMENT = 'SYNTHETIC_DEVELOPMENT', _('Synthetic Development Fixture')
    LIVE_VAULT = 'LIVE_VAULT', _('Live Anonymous Ballot Vault')


class ReconciliationStatus(models.TextChoices):
    NOT_RUN = 'NOT_RUN', _('Not Run')
    PASSED = 'PASSED', _('Reconciliation Passed')
    FAILED = 'FAILED', _('Reconciliation Discrepancy Detected')
    NOT_VERIFIABLE = 'NOT_VERIFIABLE', _('Reconciliation Not Verifiable')


class VerificationStatus(models.TextChoices):
    PENDING = 'PENDING', _('Pending')
    PASSED = 'PASSED', _('Passed')
    FAILED = 'FAILED', _('Failed')


class ElectionResult(models.Model):
    """
    Versioned aggregate election result artifact.
    Tracks calculation outcome, verification status, and audit review lifecycle.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Opaque identifier for the result calculation version.")
    )
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name='results',
        help_text=_("Election cycle for which results were calculated.")
    )
    version = models.PositiveIntegerField(
        default=1,
        help_text=_("Sequential version number of calculation for this election.")
    )
    is_synthetic = models.BooleanField(
        default=False,
        db_index=True,
        help_text=_("True if computed using isolated synthetic test fixtures.")
    )
    tally_source_type = models.CharField(
        max_length=32,
        choices=TallySourceType.choices,
        default=TallySourceType.LIVE_VAULT,
        help_text=_("Mechanism used to supply input ballots for tallying.")
    )
    status = models.CharField(
        max_length=32,
        choices=ResultLifecycleStatus.choices,
        default=ResultLifecycleStatus.CALCULATED,
        db_index=True,
        help_text=_("Current lifecycle review and publication status.")
    )
    total_ballots_tallied = models.PositiveIntegerField(
        default=0,
        help_text=_("Total number of valid ballots processed in this calculation.")
    )
    total_abstentions = models.PositiveIntegerField(
        default=0,
        help_text=_("Aggregate count of position abstentions across all ballots.")
    )
    total_positions_tallied = models.PositiveIntegerField(
        default=0,
        help_text=_("Total number of election positions calculated.")
    )
    integrity_status = models.CharField(
        max_length=32,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
        help_text=_("Ballot schema and candidate membership integrity status.")
    )
    integrity_details = models.JSONField(
        default=dict,
        help_text=_("Structured findings from input ballot integrity evaluation.")
    )
    reconciliation_status = models.CharField(
        max_length=32,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.NOT_RUN,
        help_text=_("Outcome of checked-in voters vs cast ballots reconciliation.")
    )
    reconciliation_details = models.JSONField(
        default=dict,
        help_text=_("Structured findings and explanation for reconciliation status.")
    )
    publication_blockers = models.JSONField(
        default=list,
        help_text=_("List of unresolved blockers preventing public result publication.")
    )
    result_digest = models.CharField(
        max_length=64,
        blank=True,
        db_index=True,
        help_text=_("SHA-256 digest of the canonical aggregate result artifact.")
    )
    aggregate_snapshot = models.JSONField(
        default=dict,
        help_text=_("Canonical, deterministic aggregate result data snapshot.")
    )

    # Actor Tracking & Separation of Duties
    calculated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='calculated_results',
        help_text=_("Administrator who initiated the result calculation.")
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_results',
        help_text=_("Administrator or auditor who reviewed the calculated result.")
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when review decision was recorded.")
    )
    review_decision = models.CharField(
        max_length=32,
        null=True,
        blank=True,
        help_text=_("Decision outcome recorded during review (e.g., ACCEPTED, REJECTED).")
    )
    review_notes = models.TextField(
        blank=True,
        help_text=_("Mandatory justification or administrative notes from review.")
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_results',
        help_text=_("Administrator who formally approved results for publication gate.")
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when approval was granted.")
    )
    approval_notes = models.TextField(
        blank=True,
        help_text=_("Notes documenting approval decision.")
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='published_results',
        help_text=_("Administrator who authorized public release after all gates passed.")
    )
    published_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when result was made publicly accessible.")
    )

    # Versioning & Supersession
    superseded_by = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='superseded_prior_versions',
        help_text=_("Reference to subsequent authorized version superseding this result.")
    )
    superseded_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_("Timestamp when this result was superseded.")
    )
    superseded_reason = models.TextField(
        blank=True,
        help_text=_("Mandatory justification explaining why this result was superseded.")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_election_results'
        ordering = ['election', '-version']
        constraints = [
            models.UniqueConstraint(
                fields=['election', 'version'],
                name='unique_result_version_per_election'
            )
        ]
        indexes = [
            models.Index(fields=['election', 'status']),
            models.Index(fields=['election', 'is_synthetic']),
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        synth = " [SYNTHETIC]" if self.is_synthetic else ""
        return f"ElectionResult v{self.version} for {self.election.title} ({self.status}){synth}"

    @property
    def lifecycle_status(self):
        return self.status

    @lifecycle_status.setter
    def lifecycle_status(self, val):
        self.status = val

    @property
    def artifact_digest(self):
        return self.result_digest

    @artifact_digest.setter
    def artifact_digest(self, val):
        self.result_digest = val

    @property
    def integrity_verification_status(self):
        return self.integrity_status

    @property
    def supersedes(self):
        return self.superseded_prior_versions.first()

    @supersedes.setter
    def supersedes(self, prior_version):
        if prior_version:
            prior_version.superseded_by = self
            prior_version.status = ResultLifecycleStatus.SUPERSEDED
            prior_version.save()


class ElectionPositionResult(models.Model):
    """
    Position-level aggregate candidate tallies.
    Stores deterministic rankings, tie status, and abstentions for a single office.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    result = models.ForeignKey(
        ElectionResult,
        on_delete=models.CASCADE,
        related_name='position_results',
        help_text=_("Parent election result calculation version.")
    )
    position = models.ForeignKey(
        ElectionPosition,
        on_delete=models.CASCADE,
        related_name='results',
        help_text=_("Election position/office evaluated.")
    )
    position_title = models.CharField(
        max_length=200,
        help_text=_("Snapshot of position title at calculation time.")
    )
    total_votes_cast = models.PositiveIntegerField(
        default=0,
        help_text=_("Total candidate votes cast for this position (excluding abstentions).")
    )
    abstention_count = models.PositiveIntegerField(
        default=0,
        help_text=_("Total number of explicit abstentions recorded for this position.")
    )
    is_tied = models.BooleanField(
        default=False,
        help_text=_("True if two or more top candidates received an identical vote total.")
    )
    tie_details = models.JSONField(
        default=dict,
        help_text=_("Candidate IDs and vote counts involved in tie condition.")
    )
    winner_candidate_id = models.UUIDField(
        null=True,
        blank=True,
        help_text=_("Candidate ID of single determined winner, if determinable without tie.")
    )
    winner_candidate_name = models.CharField(
        max_length=200,
        null=True,
        blank=True,
        help_text=_("Full name of winner candidate, if determinable.")
    )
    candidate_tallies = models.JSONField(
        default=list,
        help_text=_(
            "Ordered list of candidate tallies: "
            "[{\"candidate_id\": ..., \"candidate_name\": ..., \"vote_count\": ..., "
            "\"vote_percentage\": ..., \"rank\": ..., \"is_winner\": ..., \"is_tied\": ...}]"
        )
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'campusvote_position_results'
        ordering = ['position__display_order', 'position_title']
        constraints = [
            models.UniqueConstraint(
                fields=['result', 'position'],
                name='unique_position_per_result'
            )
        ]
        indexes = [
            models.Index(fields=['result', 'position']),
            models.Index(fields=['is_tied']),
        ]

    def __str__(self):
        winner = self.winner_candidate_name or ("TIED" if self.is_tied else "NO WINNER")
        return f"{self.position_title} Result: {winner} ({self.total_votes_cast} votes)"
