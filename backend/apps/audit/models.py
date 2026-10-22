"""
Audit Models for CampusVote.
Records immutable administrative and security audit events.
Strictly disallows logging secrets, tokens, or ballot selections.
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _


class AuditAction(models.TextChoices):
    LOGIN_SUCCESS = 'LOGIN_SUCCESS', _('User Login Success')
    LOGIN_FAILED = 'LOGIN_FAILED', _('User Login Failed')
    LOGOUT = 'LOGOUT', _('User Logout')
    ACCOUNT_UPDATED = 'ACCOUNT_UPDATED', _('Account Profile Updated')
    ACCOUNT_STATUS_CHANGED = 'ACCOUNT_STATUS_CHANGED', _('Account Status Changed')
    STUDENT_CREATED = 'STUDENT_CREATED', _('Student Record Created')
    STUDENT_UPDATED = 'STUDENT_UPDATED', _('Student Record Updated')
    STUDENT_DEACTIVATED = 'STUDENT_DEACTIVATED', _('Student Record Deactivated')
    ROSTER_PREVIEWED = 'ROSTER_PREVIEWED', _('Roster CSV Upload Previewed')
    ROSTER_IMPORTED = 'ROSTER_IMPORTED', _('Roster CSV Batch Committed')
    ROSTER_IMPORT_FAILED = 'ROSTER_IMPORT_FAILED', _('Roster CSV Batch Failed')
    ROSTER_IMPORT_CANCELLED = 'ROSTER_IMPORT_CANCELLED', _('Roster CSV Batch Cancelled')
    ELIGIBILITY_EVALUATED = 'ELIGIBILITY_EVALUATED', _('Voter Eligibility Evaluated')
    ELIGIBILITY_RULE_CHANGED = 'ELIGIBILITY_RULE_CHANGED', _('Eligibility Rule Modified')
    ELIGIBILITY_OVERRIDE = 'ELIGIBILITY_OVERRIDE', _('Eligibility Override Applied')
    ELECTION_CREATED = 'ELECTION_CREATED', _('Election Created')
    ELECTION_UPDATED = 'ELECTION_UPDATED', _('Election Details Updated')
    ELECTION_SCHEDULED = 'ELECTION_SCHEDULED', _('Election Scheduled')
    ELECTION_ACTIVATED = 'ELECTION_ACTIVATED', _('Election Activated')
    ELECTION_CLOSED = 'ELECTION_CLOSED', _('Election Closed')
    ELECTION_RESULTS_PUBLISHED = 'ELECTION_RESULTS_PUBLISHED', _('Election Results Published')
    ELECTION_ARCHIVED = 'ELECTION_ARCHIVED', _('Election Archived')
    ELECTION_CANCELLED = 'ELECTION_CANCELLED', _('Election Cancelled')
    POSITION_CREATED = 'POSITION_CREATED', _('Election Position Created')
    POSITION_UPDATED = 'POSITION_UPDATED', _('Election Position Updated')
    POSITION_DELETED = 'POSITION_DELETED', _('Election Position Deleted')
    NOMINATION_CREATED = 'NOMINATION_CREATED', _('Nomination Created')
    NOMINATION_SUBMITTED = 'NOMINATION_SUBMITTED', _('Nomination Submitted')
    NOMINATION_UNDER_REVIEW = 'NOMINATION_UNDER_REVIEW', _('Nomination Under Review')
    NOMINATION_APPROVED = 'NOMINATION_APPROVED', _('Nomination Approved')
    NOMINATION_REJECTED = 'NOMINATION_REJECTED', _('Nomination Rejected')
    NOMINATION_WITHDRAWN = 'NOMINATION_WITHDRAWN', _('Nomination Withdrawn')
    CANDIDATE_ELIGIBILITY_FAILED = 'CANDIDATE_ELIGIBILITY_FAILED', _('Candidate Eligibility Evaluation Failed')
    VERIFICATION_STARTED = 'VERIFICATION_STARTED', _('Identity Verification Started')
    OTP_CHALLENGE_ISSUED = 'OTP_CHALLENGE_ISSUED', _('OTP Verification Challenge Issued')
    OTP_DELIVERY_FAILED = 'OTP_DELIVERY_FAILED', _('OTP Delivery Failed')
    OTP_VERIFIED = 'OTP_VERIFIED', _('OTP Verification Succeeded')
    OTP_FAILED = 'OTP_FAILED', _('OTP Verification Failed')
    OTP_EXPIRED = 'OTP_EXPIRED', _('OTP Challenge Expired')
    VERIFICATION_RATE_LIMITED = 'VERIFICATION_RATE_LIMITED', _('Verification Rate Limit Exceeded')
    VERIFICATION_LOCKED = 'VERIFICATION_LOCKED', _('Verification Session Locked')
    QR_VALIDATED = 'QR_VALIDATED', _('QR Code Validated')
    QR_FAILED = 'QR_FAILED', _('QR Code Validation Failed')
    VERIFICATION_RESET = 'VERIFICATION_RESET', _('Verification Session Reset')
    BALLOT_VALIDATION_FAILED = 'BALLOT_VALIDATION_FAILED', _('Ballot Validation Failed')
    BALLOT_SUBMISSION_ACCEPTED = 'BALLOT_SUBMISSION_ACCEPTED', _('Anonymous Ballot Submission Accepted')
    BALLOT_SUBMISSION_REJECTED = 'BALLOT_SUBMISSION_REJECTED', _('Ballot Submission Rejected')
    PARTICIPATION_AUTHORIZATION_REJECTED = 'PARTICIPATION_AUTHORIZATION_REJECTED', _('Voter Participation Authorization Rejected')
    DUPLICATE_VOTE_BLOCKED = 'DUPLICATE_VOTE_BLOCKED', _('Duplicate Vote Attempt Blocked')
    ANALYTICS_DASHBOARD_ACCESSED = 'ANALYTICS_DASHBOARD_ACCESSED', _('Election Analytics Dashboard Accessed')
    ANALYTICS_ACCESS_DENIED = 'ANALYTICS_ACCESS_DENIED', _('Analytics Access Denied')
    REALTIME_CONNECTION_ESTABLISHED = 'REALTIME_CONNECTION_ESTABLISHED', _('Real-Time Monitoring Connection Established')
    REALTIME_CONNECTION_DENIED = 'REALTIME_CONNECTION_DENIED', _('Real-Time Monitoring Connection Denied')
    PRIVACY_SUPPRESSION_APPLIED = 'PRIVACY_SUPPRESSION_APPLIED', _('Analytics Privacy Suppression Applied')
    ANOMALY_DETECTED = 'ANOMALY_DETECTED', _('Security Anomaly Detected')
    ANOMALY_ACKNOWLEDGED = 'ANOMALY_ACKNOWLEDGED', _('Anomaly Alert Acknowledged')
    ANOMALY_INVESTIGATION_STARTED = 'ANOMALY_INVESTIGATION_STARTED', _('Anomaly Investigation Started')
    ANOMALY_RESOLVED = 'ANOMALY_RESOLVED', _('Anomaly Alert Resolved')
    ANOMALY_MARKED_FALSE_POSITIVE = 'ANOMALY_MARKED_FALSE_POSITIVE', _('Anomaly Alert Marked False Positive')
    ANOMALY_ACCESS_DENIED = 'ANOMALY_ACCESS_DENIED', _('Unauthorized Anomaly Alert Access')
    ANOMALY_DETECTION_FAILED = 'ANOMALY_DETECTION_FAILED', _('Anomaly Detection Service Execution Failed')
    RESULT_CALCULATION_REQUESTED = 'RESULT_CALCULATION_REQUESTED', _('Election Result Calculation Requested')
    RESULT_CALCULATED = 'RESULT_CALCULATED', _('Election Result Calculated')
    RESULT_CALCULATION_FAILED = 'RESULT_CALCULATION_FAILED', _('Election Result Calculation Failed')
    RESULT_INTEGRITY_VERIFIED = 'RESULT_INTEGRITY_VERIFIED', _('Result Integrity Verified')
    RESULT_RECONCILIATION_EVALUATED = 'RESULT_RECONCILIATION_EVALUATED', _('Result Participation Reconciliation Evaluated')
    RESULT_REVIEW_SUBMITTED = 'RESULT_REVIEW_SUBMITTED', _('Result Review Submitted')
    RESULT_APPROVED = 'RESULT_APPROVED', _('Election Result Approved')
    RESULT_REJECTED = 'RESULT_REJECTED', _('Election Result Rejected')
    RESULT_PUBLICATION_REQUESTED = 'RESULT_PUBLICATION_REQUESTED', _('Result Publication Requested')
    RESULT_PUBLICATION_BLOCKED = 'RESULT_PUBLICATION_BLOCKED', _('Result Publication Blocked')
    RESULT_PUBLISHED = 'RESULT_PUBLISHED', _('Election Result Published')
    RESULT_REPORT_EXPORTED = 'RESULT_REPORT_EXPORTED', _('Election Result Report Exported')
    STUDENT_REGISTERED = 'STUDENT_REGISTERED', _('Student Self-Registration Submitted')
    VOTER_ID_GENERATED = 'VOTER_ID_GENERATED', _('Smart Voter ID Generated')


class AuditLog(models.Model):
    """
    Append-only administrative and security event log.
    Captures who did what and when, with structured metadata.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_actions',
        help_text=_("The authenticated user who performed the action.")
    )
    actor_username = models.CharField(
        max_length=150,
        blank=True,
        help_text=_("Snapshot of actor username at time of event.")
    )
    actor_role = models.CharField(
        max_length=32,
        blank=True,
        help_text=_("Snapshot of actor role at time of event.")
    )
    action = models.CharField(
        max_length=64,
        choices=AuditAction.choices,
        db_index=True
    )
    target_type = models.CharField(
        max_length=64,
        db_index=True,
        help_text=_("Entity type affected (e.g., STUDENT, ROSTER, ELIGIBILITY).")
    )
    target_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Identifier of target entity affected.")
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text=_("Structured event parameters, excluding secrets and sensitive PII.")
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    class Meta:
        db_table = 'campusvote_audit_logs'
        ordering = ['-created_at']
        verbose_name = _('Audit Log')

    @property
    def timestamp(self):
        return self.created_at

    @property
    def resource_type(self):
        return self.target_type

    @property
    def resource_id(self):
        return self.target_id

    def __str__(self):
        return f"[{self.created_at.isoformat()}] {self.actor_username or 'System'} - {self.action} on {self.target_type}:{self.target_id}"
