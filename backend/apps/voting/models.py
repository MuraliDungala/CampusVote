"""
Anonymous Ballot Architecture and Voter Participation Models.
CampusVote Smart ID-Based College Voting System - Phase 5 Architecture.

CRITICAL SECURITY & ANONYMITY NOTICE:
This module establishes a strict, audited isolation boundary between:
1. The authenticated student's identity and eligibility.
2. The record that an eligible student has cast a ballot in a specific election.
3. The anonymous ballot containing vote choices.

Under no circumstances should any database foreign key, join table, or correlation
attribute be created linking `AnonymousBallot` to `Student`, `User`, or `VoterParticipationRecord`.
"""

import uuid
import secrets
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.elections.models import Election
from apps.students.models import Student


def generate_submission_receipt() -> str:
    """
    Generates a secure, unguessable receipt identifier returned to the voter.
    Format: CV-REC-<8 CHARACTERS>-<4 CHARACTERS>
    This receipt confirms ballot acceptance without revealing candidate selections.
    """
    token = secrets.token_hex(6).upper()
    return f"CV-REC-{token[:8]}-{token[8:]}"


class VoterParticipationRecord(models.Model):
    """
    Identity-Side Participation Record.
    Records that an eligible, verified student has cast a vote in an election cycle.
    Enforces the single-participation constraint per student per election.

    STRICT PRIVACY GUARANTEE:
    This model has NO foreign key, reference, or correlation to any AnonymousBallot record.
    It proves participation occurred, but cannot reveal how the voter voted.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Opaque UUID identifier for participation event.")
    )
    election = models.ForeignKey(
        Election,
        on_delete=models.CASCADE,
        related_name='voter_participations',
        help_text=_("The election cycle in which participation occurred.")
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.PROTECT,
        related_name='election_participations',
        help_text=_("Authoritative student registry record who participated.")
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voting_participations',
        help_text=_("Authentication account at time of participation.")
    )
    participated_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text=_("Timestamp when participation was recorded.")
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text=_("Client IP address at participation.")
    )
    authorization_token_hash = models.CharField(
        max_length=64,
        blank=True,
        help_text=_("Single-use participation authorization handshake digest.")
    )

    class Meta:
        db_table = 'campusvote_voter_participations'
        ordering = ['-participated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['election', 'student'],
                name='unique_voter_participation_per_election'
            )
        ]
        indexes = [
            models.Index(fields=['election', 'student']),
            models.Index(fields=['participated_at']),
        ]

    def __str__(self):
        return f"Participation: Student {self.student.college_id} in Election {self.election.title}"


class AnonymousBallot(models.Model):
    """
    Decoupled Anonymous Ballot Record.
    Stores validated candidate selections and abstentions for an election cycle.

    STRICT PRIVACY GUARANTEE:
    Contains NO student ID, NO user FK, NO student FK, NO email, NO session ID,
    and NO link to VoterParticipationRecord. Stored into an isolated ballot vault.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Opaque ballot identifier in anonymous vote vault.")
    )
    election_id = models.UUIDField(
        db_index=True,
        help_text=_("UUID of the election cycle for which this ballot was cast.")
    )
    selections = models.JSONField(
        default=list,
        help_text=_("Validated structured list of position selections and abstentions.")
    )
    receipt_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        default=generate_submission_receipt,
        help_text=_("Cryptographically unguessable submission confirmation receipt.")
    )
    schema_version = models.PositiveSmallIntegerField(
        default=1,
        help_text=_("Ballot schema definition version.")
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text=_("Timestamp when ballot was written into the vote vault.")
    )

    class Meta:
        db_table = 'campusvote_anonymous_ballots'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['election_id']),
            models.Index(fields=['receipt_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"AnonymousBallot[{self.id}] for Election {self.election_id} (Receipt: {self.receipt_id})"
