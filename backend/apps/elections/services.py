"""
Election Lifecycle & Candidate Nomination Business Logic Services.
CampusVote Phase 3 Architecture.
"""

from typing import Tuple, Optional
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from apps.elections.models import Election, ElectionStatus, ElectionPosition, Candidate, CandidateStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.audit.services import log_audit_event
from apps.audit.models import AuditAction


class ElectionLifecycleService:
    """
    Coordinates election lifecycle transitions with comprehensive validation and audit logging.
    """

    @classmethod
    def sync_lifecycle_statuses(cls):
        """
        Automatically synchronizes election statuses with timezone-aware voting schedules:
        1. SCHEDULED elections whose start_time <= now < end_time and have >= 1 position become ACTIVE.
        2. ACTIVE elections whose end_time <= now become CLOSED.
        Preserves DRAFT, CANCELLED, RESULTS_PUBLISHED, and ARCHIVED states.
        """
        now = timezone.now()
        # 1. SCHEDULED -> ACTIVE
        for election in Election.objects.filter(
            status=ElectionStatus.SCHEDULED,
            start_time__lte=now,
            end_time__gt=now
        ):
            if election.positions.count() > 0:
                try:
                    cls.activate(election, actor=None)
                except Exception:
                    pass

        # 2. ACTIVE -> CLOSED
        for election in Election.objects.filter(
            status=ElectionStatus.ACTIVE,
            end_time__lte=now
        ):
            try:
                cls.close(election, actor=None)
            except Exception:
                pass

    @classmethod
    @transaction.atomic
    def schedule(cls, election: Election, actor=None, request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.SCHEDULED, actor=actor)
        
        log_audit_event(
            action=AuditAction.ELECTION_SCHEDULED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.SCHEDULED,
                'start_time': election.start_time.isoformat(),
                'end_time': election.end_time.isoformat(),
            }
        )
        return election

    @classmethod
    @transaction.atomic
    def activate(cls, election: Election, actor=None, request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.ACTIVE, actor=actor)
        
        log_audit_event(
            action=AuditAction.ELECTION_ACTIVATED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.ACTIVE,
            }
        )
        return election

    @classmethod
    @transaction.atomic
    def close(cls, election: Election, actor=None, request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.CLOSED, actor=actor)
        
        log_audit_event(
            action=AuditAction.ELECTION_CLOSED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.CLOSED,
            }
        )
        return election

    @classmethod
    @transaction.atomic
    def publish_results(cls, election: Election, actor=None, request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.RESULTS_PUBLISHED, actor=actor)
        
        log_audit_event(
            action=AuditAction.ELECTION_RESULTS_PUBLISHED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.RESULTS_PUBLISHED,
                'published_at': election.published_at.isoformat() if election.published_at else timezone.now().isoformat(),
            }
        )
        return election

    @classmethod
    @transaction.atomic
    def archive(cls, election: Election, actor=None, request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.ARCHIVED, actor=actor)
        
        log_audit_event(
            action=AuditAction.ELECTION_ARCHIVED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.ARCHIVED,
                'archived_at': election.archived_at.isoformat() if election.archived_at else timezone.now().isoformat(),
            }
        )
        return election

    @classmethod
    @transaction.atomic
    def cancel(cls, election: Election, actor=None, reason: str = "", request=None) -> Election:
        prev_status = election.status
        election.transition_to(ElectionStatus.CANCELLED, actor=actor, reason=reason)
        
        log_audit_event(
            action=AuditAction.ELECTION_CANCELLED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=actor,
            request=request,
            metadata={
                'title': election.title,
                'previous_status': prev_status,
                'new_status': ElectionStatus.CANCELLED,
                'cancellation_reason': reason,
            }
        )
        return election


class CandidateNominationService:
    """
    Manages student nomination workflow, integrating Phase 2 eligibility revalidation on submission & review.
    """

    @staticmethod
    def get_election_eligibility_rule(election: Election) -> Optional[ElectionEligibilityRule]:
        """Finds active institutional eligibility rule configured for this election cycle."""
        return ElectionEligibilityRule.objects.filter(election_id=election.id, is_active=True).first()

    @classmethod
    def evaluate_candidate_eligibility(cls, student, election: Election) -> Tuple[bool, str, dict]:
        """
        Evaluates student qualification against election eligibility criteria.
        Returns (is_eligible, reason_str, snapshot_dict).
        """
        # 1. Base active student check
        if not student.is_active:
            reason = "Student record is administratively deactivated in the student registry."
            snapshot = {'is_eligible': False, 'reason': reason, 'evaluated_at': timezone.now().isoformat()}
            return False, reason, snapshot

        rule = cls.get_election_eligibility_rule(election)
        if rule:
            is_eligible, reason = EligibilityEngineService.evaluate_student(student, rule)
            rule_id = str(rule.id)
            rule_title = rule.title
        else:
            # If no election-specific rule is configured, base registrar good-standing applies
            if student.enrollment_status != 'ENROLLED':
                is_eligible = False
                reason = f"Student enrollment status '{student.get_enrollment_status_display()}' is not in good academic standing."
            else:
                is_eligible = True
                reason = "Student satisfies standard institutional eligibility criteria."
            rule_id = None
            rule_title = "Default Good Standing Rule"

        snapshot = {
            'is_eligible': is_eligible,
            'reason': reason,
            'rule_id': rule_id,
            'rule_title': rule_title,
            'student_college_id': student.college_id,
            'department': student.department,
            'academic_year': student.academic_year,
            'enrollment_status': student.enrollment_status,
            'evaluated_at': timezone.now().isoformat()
        }
        return is_eligible, reason, snapshot

    @classmethod
    @transaction.atomic
    def submit_nomination(cls, candidate: Candidate, actor=None, request=None) -> Candidate:
        election = candidate.election_position.election
        
        # Check election status allows nominations (must be DRAFT or SCHEDULED)
        if election.status not in (ElectionStatus.DRAFT, ElectionStatus.SCHEDULED):
            raise ValidationError(
                _(f"Cannot submit nominations for an election with status '{election.status}'.")
            )

        # Check candidate transition
        if not candidate.can_transition_to(CandidateStatus.SUBMITTED):
            raise ValidationError(
                _(f"Cannot submit nomination from current status '{candidate.status}'.")
            )

        # Evaluate eligibility
        is_eligible, reason, snapshot = cls.evaluate_candidate_eligibility(candidate.student, election)
        candidate.eligibility_snapshot = snapshot

        if not is_eligible:
            log_audit_event(
                action=AuditAction.CANDIDATE_ELIGIBILITY_FAILED,
                target_type='NOMINATION',
                target_id=str(candidate.id),
                actor=actor,
                request=request,
                metadata={
                    'student_id': candidate.student.college_id,
                    'position': candidate.election_position.title,
                    'election_id': str(election.id),
                    'reason': reason
                }
            )
            raise ValidationError({'eligibility': _(f"Nomination rejected: {reason}")})

        candidate.status = CandidateStatus.SUBMITTED
        candidate.submitted_at = timezone.now()
        candidate.save()

        log_audit_event(
            action=AuditAction.NOMINATION_SUBMITTED,
            target_type='NOMINATION',
            target_id=str(candidate.id),
            actor=actor,
            request=request,
            metadata={
                'student_id': candidate.student.college_id,
                'position_id': str(candidate.election_position.id),
                'position_title': candidate.election_position.title,
                'election_id': str(election.id),
                'election_title': election.title,
            }
        )
        return candidate

    @classmethod
    @transaction.atomic
    def review_nomination(
        cls,
        candidate: Candidate,
        action: str,
        reviewer,
        rejection_reason: str = "",
        request=None
    ) -> Candidate:
        election = candidate.election_position.election
        
        if candidate.status not in (CandidateStatus.SUBMITTED, CandidateStatus.UNDER_REVIEW):
            raise ValidationError(
                _(f"Only submitted or under-review nominations can be evaluated. Current status: '{candidate.status}'.")
            )

        action_lower = action.strip().lower()

        if action_lower == 'approve':
            # Re-evaluate eligibility at review time!
            is_eligible, reason, snapshot = cls.evaluate_candidate_eligibility(candidate.student, election)
            candidate.eligibility_snapshot = snapshot

            if not is_eligible:
                log_audit_event(
                    action=AuditAction.CANDIDATE_ELIGIBILITY_FAILED,
                    target_type='NOMINATION',
                    target_id=str(candidate.id),
                    actor=reviewer,
                    request=request,
                    metadata={
                        'student_id': candidate.student.college_id,
                        'reason': reason,
                        'review_attempt': 'APPROVE'
                    }
                )
                raise ValidationError(
                    _(f"Candidate cannot be approved because eligibility re-check failed: {reason}")
                )

            # Check maximum candidates limit for position
            approved_count = candidate.election_position.candidates.filter(status=CandidateStatus.APPROVED).count()
            if approved_count >= candidate.election_position.maximum_candidates:
                raise ValidationError(
                    _(f"Maximum candidates limit ({candidate.election_position.maximum_candidates}) reached for position '{candidate.election_position.title}'.")
                )

            candidate.status = CandidateStatus.APPROVED
            candidate.reviewed_at = timezone.now()
            candidate.reviewed_by = reviewer
            candidate.rejection_reason = None
            candidate.save()

            log_audit_event(
                action=AuditAction.NOMINATION_APPROVED,
                target_type='NOMINATION',
                target_id=str(candidate.id),
                actor=reviewer,
                request=request,
                metadata={
                    'student_id': candidate.student.college_id,
                    'position_title': candidate.election_position.title,
                    'election_id': str(election.id),
                }
            )

        elif action_lower == 'reject':
            if not rejection_reason or not rejection_reason.strip():
                raise ValidationError({'rejection_reason': _("A rejection reason is mandatory when rejecting a nomination.")})

            candidate.status = CandidateStatus.REJECTED
            candidate.reviewed_at = timezone.now()
            candidate.reviewed_by = reviewer
            candidate.rejection_reason = rejection_reason.strip()
            candidate.save()

            log_audit_event(
                action=AuditAction.NOMINATION_REJECTED,
                target_type='NOMINATION',
                target_id=str(candidate.id),
                actor=reviewer,
                request=request,
                metadata={
                    'student_id': candidate.student.college_id,
                    'position_title': candidate.election_position.title,
                    'election_id': str(election.id),
                    'rejection_reason': candidate.rejection_reason,
                }
            )
        else:
            raise ValidationError(_(f"Unsupported nomination review action '{action}'. Permitted: 'approve', 'reject'."))

        return candidate

    @classmethod
    @transaction.atomic
    def withdraw_nomination(cls, candidate: Candidate, actor=None, request=None) -> Candidate:
        election = candidate.election_position.election
        
        # Disallow withdrawal if election is closed or archived
        if election.status in (ElectionStatus.CLOSED, ElectionStatus.RESULTS_PUBLISHED, ElectionStatus.ARCHIVED):
            raise ValidationError(
                _(f"Cannot withdraw nominations in an election with status '{election.status}'.")
            )

        if not candidate.can_transition_to(CandidateStatus.WITHDRAWN):
            raise ValidationError(
                _(f"Cannot withdraw nomination from status '{candidate.status}'.")
            )

        candidate.status = CandidateStatus.WITHDRAWN
        candidate.save()

        log_audit_event(
            action=AuditAction.NOMINATION_WITHDRAWN,
            target_type='NOMINATION',
            target_id=str(candidate.id),
            actor=actor,
            request=request,
            metadata={
                'student_id': candidate.student.college_id,
                'position_title': candidate.election_position.title,
                'election_id': str(election.id),
            }
        )
        return candidate
