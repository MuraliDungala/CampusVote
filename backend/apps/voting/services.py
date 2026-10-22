"""
Voting Domain Services for CampusVote.
Smart ID-Based College Voting System - Phase 5 Architecture.

Contains:
1. BallotDefinitionService: Prepares official ballot structure.
2. ParticipationService: Enforces student voter eligibility and single-participation tracking.
3. BallotValidationService: Strictly validates position selections and abstentions.
4. AnonymousBallotService: Atomically writes decoupled anonymous ballots and generates receipts.
"""

import hashlib
import secrets
import logging
from typing import Tuple, Dict, Any, List, Optional
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.accounts.models import Role, AccountStatus
from apps.students.models import Student, EnrollmentStatus
from apps.elections.models import Election, ElectionPosition, ElectionStatus, Candidate, CandidateStatus
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.services import EligibilityEngineService
from apps.verification.models import VerificationSession, VerificationState
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.voting.models import VoterParticipationRecord, AnonymousBallot

logger = logging.getLogger(__name__)


class BallotDefinitionService:
    """Retrieves and formats official ballot structures directly from database source-of-truth."""

    @staticmethod
    def get_ballot_definition(election_id: str, student: Optional[Student] = None) -> Tuple[bool, Dict[str, Any], str]:
        """
        Retrieves the ballot structure for an active election cycle.
        Returns position details, approved candidates, and selection rules.
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, {}, "Election cycle not found."

        now = timezone.now()
        is_open = (
            election.status == ElectionStatus.ACTIVE and
            election.start_time <= now <= election.end_time
        )

        positions_data = []
        positions = election.positions.all().order_by('display_order', 'created_at')

        for pos in positions:
            approved_candidates = pos.candidates.filter(
                status=CandidateStatus.APPROVED
            ).select_related('student').order_by('created_at')

            candidates_list = []
            for cand in approved_candidates:
                candidates_list.append({
                    'id': str(cand.id),
                    'full_name': cand.student.full_name,
                    'manifesto': cand.manifesto,
                    'profile_image': cand.profile_image,
                })

            positions_data.append({
                'id': str(pos.id),
                'title': pos.title,
                'description': pos.description,
                'display_order': pos.display_order,
                'maximum_candidates': pos.maximum_candidates,
                'allow_abstain': True,
                'candidates': candidates_list,
                'candidate_count': len(candidates_list),
            })

        ballot_payload = {
            'election': {
                'id': str(election.id),
                'title': election.title,
                'description': election.description,
                'academic_year': election.academic_year,
                'start_time': election.start_time.isoformat(),
                'end_time': election.end_time.isoformat(),
                'status': election.status,
                'is_open': is_open,
            },
            'positions': positions_data,
            'total_positions': len(positions_data),
            'allow_abstain_global': True,
        }

        if not is_open:
            if election.status != ElectionStatus.ACTIVE:
                msg = f"This election is currently in '{election.get_status_display()}' status and is not accepting ballots."
            elif now < election.start_time:
                msg = "The voting window for this election has not yet started."
            else:
                msg = "The voting window for this election has ended."
            return False, ballot_payload, msg

        # Cross-institution check
        if student and election.institution_id:
            student_inst_id = student.institution_id or (getattr(student, 'user', None) and getattr(student.user, 'institution_id', None))
            if student_inst_id and student_inst_id != election.institution_id:
                return False, {}, "Access denied. This election cycle belongs to another educational institution."

        return True, ballot_payload, ""


class ParticipationService:
    """
    Manages identity-side voter qualification, Phase 4 verification enforcement,
    and single-participation duplicate-vote prevention.
    """

    @staticmethod
    def check_student_voter_eligibility(user, election: Election) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Evaluates whether an authenticated user is permitted to cast a ballot in this election.
        Enforces:
          1. Role is strictly STUDENT.
          2. Active User account.
          3. Linked active Student registry record.
          4. Registrar enrollment status is permissible.
          5. Phase 4 two-factor identity verification completed.
          6. Phase 2 demographic and institutional eligibility rule satisfied.
          7. Single-participation rule (no prior vote cast in this election).
        """
        if not user or not user.is_authenticated:
            return False, "Authentication required.", {'code': 'UNAUTHENTICATED'}

        if getattr(user, 'role', None) != Role.STUDENT:
            return False, "Only registered student voter accounts can cast ballots.", {'code': 'NOT_STUDENT'}

        if getattr(user, 'status', None) != AccountStatus.ACTIVE or not user.is_active:
            return False, "Your voter account is inactive or suspended.", {'code': 'ACCOUNT_INACTIVE'}

        # Linked student record
        student = getattr(user, 'student_record', None)
        if not student:
            # Fallback search by college_id
            student = Student.objects.filter(college_id=user.college_id).first() if user.college_id else None

        if not student:
            return False, "Student registry record not found for this account.", {'code': 'STUDENT_NOT_FOUND'}

        if not student.is_active:
            return False, "Your student registry record is administratively deactivated or inactive.", {'code': 'STUDENT_INACTIVE'}

        if student.enrollment_status in (EnrollmentStatus.SUSPENDED, EnrollmentStatus.WITHDRAWN):
            return False, (
                f"Student academic status is '{student.get_enrollment_status_display()}'. "
                "Active enrollment is required to cast ballots."
            ), {'code': 'ENROLLMENT_DISQUALIFIED'}

        # Cross-institution check
        student_inst_id = student.institution_id or getattr(user, 'institution_id', None)
        if election.institution_id and student_inst_id and election.institution_id != student_inst_id:
            return False, "You are not enrolled in the institution hosting this election.", {'code': 'CROSS_INSTITUTION_FORBIDDEN'}

        # Phase 4 Two-factor verification check
        has_verified_session = VerificationSession.objects.filter(
            college_id=student.college_id,
            state=VerificationState.VERIFIED
        ).exists()

        if not has_verified_session:
            return False, (
                "Identity verification required. Please complete College ID and OTP verification before voting."
            ), {'code': 'VERIFICATION_REQUIRED', 'requires_verification': True}

        # Check prior participation (One-person-one-vote)
        if VoterParticipationRecord.objects.filter(election=election, student=student).exists():
            return False, "You have already cast a ballot in this election cycle.", {'code': 'ALREADY_PARTICIPATED', 'has_participated': True}

        # Phase 2 Demographic & Franchise Eligibility Rule
        rule = ElectionEligibilityRule.objects.filter(election_id=election.id, is_active=True).first()
        if rule:
            is_eligible, reason = EligibilityEngineService.evaluate_student(student, rule)
            if not is_eligible:
                return False, f"Ineligible for this election: {reason}", {'code': 'FRANCHISE_INELIGIBLE', 'reason': reason}

        return True, "Student is verified and eligible to vote in this election.", {'code': 'ELIGIBLE', 'student_id': str(student.id)}

    @staticmethod
    def has_student_participated(student: Student, election: Election) -> bool:
        """Returns True if the student has already cast a ballot in the given election."""
        return VoterParticipationRecord.objects.filter(election=election, student=student).exists()


class BallotValidationService:
    """Strictly validates ballot selections against election position rules and candidate rosters."""

    @staticmethod
    def validate_selections(election: Election, raw_selections: Any) -> Tuple[bool, List[Dict[str, Any]], str]:
        """
        Validates the submitted candidate selections.
        Checks:
          - Election is ACTIVE and within scheduled time window.
          - raw_selections is a valid list matching all configured positions.
          - Each position belongs to this election.
          - No positions from other elections are accepted.
          - Candidates belong to the specified position and are APPROVED.
          - Abstention is handled correctly.
          - No duplicate position choices or invalid extra fields.
        """
        now = timezone.now()
        if election.status != ElectionStatus.ACTIVE:
            return False, [], f"Cannot vote in an election with status '{election.get_status_display()}'."

        if not (election.start_time <= now <= election.end_time):
            return False, [], "Election is not currently within its scheduled voting period."

        if not isinstance(raw_selections, list):
            return False, [], "Ballot selections must be a list of position selections."

        configured_positions = {str(p.id): p for p in election.positions.all()}
        if len(configured_positions) == 0:
            return False, [], "Election has no configured positions."

        # Check that number of submitted selections matches configured positions exactly
        if len(raw_selections) != len(configured_positions):
            return False, [], f"Expected selections for {len(configured_positions)} position(s), received {len(raw_selections)}."

        seen_position_ids = set()
        validated_entries = []

        allowed_keys = {'position_id', 'candidate_id', 'is_abstain'}

        for item in raw_selections:
            if not isinstance(item, dict):
                return False, [], "Each selection entry must be an object."

            # Reject unexpected / injected fields
            if set(item.keys()) - allowed_keys:
                return False, [], "Selections contain unrecognized or prohibited attributes."

            pos_id = str(item.get('position_id', '')).strip()
            if not pos_id or pos_id not in configured_positions:
                return False, [], f"Position '{pos_id}' is invalid or does not belong to this election."

            if pos_id in seen_position_ids:
                return False, [], f"Duplicate selection received for position '{pos_id}'."
            seen_position_ids.add(pos_id)

            position = configured_positions[pos_id]
            is_abstain = bool(item.get('is_abstain', False))
            candidate_id = item.get('candidate_id')

            if is_abstain:
                if candidate_id:
                    return False, [], f"Abstention selected for '{position.title}', but a candidate was also specified."
                validated_entries.append({
                    'position_id': str(position.id),
                    'position_title': position.title,
                    'candidate_id': None,
                    'candidate_name': None,
                    'is_abstain': True,
                })
            else:
                if not candidate_id:
                    return False, [], f"A candidate must be selected or explicit abstention chosen for '{position.title}'."

                cand_id_str = str(candidate_id).strip()
                # Verify candidate belongs to position and is APPROVED
                candidate = Candidate.objects.filter(
                    id=cand_id_str,
                    election_position=position
                ).select_related('student').first()

                if not candidate:
                    return False, [], f"Selected candidate does not exist or does not contest '{position.title}'."

                if candidate.status != CandidateStatus.APPROVED:
                    return False, [], f"Selected candidate '{candidate.student.full_name}' is not an approved candidate."

                validated_entries.append({
                    'position_id': str(position.id),
                    'position_title': position.title,
                    'candidate_id': str(candidate.id),
                    'candidate_name': candidate.student.full_name,
                    'is_abstain': False,
                })

        return True, validated_entries, ""


class AnonymousBallotService:
    """
    Decoupled Anonymous Ballot Storage Engine.
    Executes the controlled atomic submission workflow and generates receipts.
    Strictly safeguards voter anonymity by decoupling ballot records from student identity.
    """

    @classmethod
    def submit_ballot(
        cls,
        election_id: str,
        user,
        raw_selections: Any,
        ip_address: Optional[str] = None,
        request=None
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Coordinates the complete ballot validation and decoupled submission workflow.
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, {}, "Election not found."

        # Safety Check: Real-Election Fail-Closed Protection
        # Protects against running production elections with development duplicate-vote mechanism
        is_production = getattr(settings, 'ENVIRONMENT', 'development').lower() == 'production'
        review_approved = getattr(settings, 'INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED', False)

        if (is_production or getattr(election, 'academic_year', '') == 'PRODUCTION_REAL') and not review_approved:
            log_audit_event(
                action=AuditAction.BALLOT_SUBMISSION_REJECTED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'reason': 'UNAPPROVED_VOTING_PROTOCOL'},
                request=request
            )
            return False, {}, (
                "Real election voting is disabled until the cryptographic duplicate-vote prevention "
                "and anonymity architecture has completed formal independent security review."
            )

        # 1. Voter Eligibility & Verification Check
        eligible, reason, meta = ParticipationService.check_student_voter_eligibility(user, election)
        if not eligible:
            action = AuditAction.DUPLICATE_VOTE_BLOCKED if meta.get('has_participated') else AuditAction.PARTICIPATION_AUTHORIZATION_REJECTED
            log_audit_event(
                action=action,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'code': meta.get('code', 'DISQUALIFIED')},
                request=request
            )
            return False, {'code': meta.get('code')}, reason

        student = getattr(user, 'student_record', None) or Student.objects.filter(college_id=user.college_id).first()

        # 2. Ballot Selections Validation
        valid, validated_selections, val_error = BallotValidationService.validate_selections(election, raw_selections)
        if not valid:
            log_audit_event(
                action=AuditAction.BALLOT_VALIDATION_FAILED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'error': val_error},
                request=request
            )
            return False, {'code': 'VALIDATION_FAILED'}, val_error

        # 3. Decoupled Atomic Submission
        # Identity-side participation record and anonymous ballot are written inside atomic transaction
        try:
            with transaction.atomic():
                # Lock and check duplicate participation
                if VoterParticipationRecord.objects.select_for_update().filter(election=election, student=student).exists():
                    log_audit_event(
                        action=AuditAction.DUPLICATE_VOTE_BLOCKED,
                        target_type='ELECTION',
                        target_id=str(election.id),
                        request=request
                    )
                    return False, {'code': 'ALREADY_PARTICIPATED'}, "You have already cast a ballot in this election."

                # Single-use participation handshake token
                handshake_token = secrets.token_hex(16)
                token_hash = hashlib.sha256(handshake_token.encode()).hexdigest()

                # Record Participation on Identity Side
                VoterParticipationRecord.objects.create(
                    election=election,
                    student=student,
                    user=user,
                    ip_address=ip_address,
                    authorization_token_hash=token_hash
                )

                # Store Decoupled Anonymous Ballot in Vote Vault
                # Contains ZERO student/user identity links!
                ballot = AnonymousBallot.objects.create(
                    election_id=election.id,
                    selections=validated_selections,
                    schema_version=1
                )

                # Broadcast real-time turnout update after successful transaction commit
                from apps.monitoring.events import broadcast_turnout_update
                transaction.on_commit(lambda: broadcast_turnout_update(str(election.id)))

            # Audit Log: Records acceptance without candidate choices or student-ballot linkage
            log_audit_event(
                action=AuditAction.BALLOT_SUBMISSION_ACCEPTED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={
                    'receipt_id': ballot.receipt_id,
                    'schema_version': ballot.schema_version,
                },
                request=request
            )

            # Return Submission Receipt (DO NOT return candidate selections)
            return True, {
                'status': 'ACCEPTED',
                'receipt_id': ballot.receipt_id,
                'election_id': str(election.id),
                'submitted_at': ballot.created_at.isoformat(),
                'message': "Your ballot has been accepted and recorded anonymously."
            }, ""

        except Exception as exc:
            logger.error(f"Ballot submission transaction failed: {exc}", exc_info=True)
            log_audit_event(
                action=AuditAction.BALLOT_SUBMISSION_REJECTED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'error': 'TRANSACTION_FAILURE'},
                request=request
            )
            return False, {'code': 'INTERNAL_ERROR'}, "A database error occurred while recording your ballot. Please try again."
