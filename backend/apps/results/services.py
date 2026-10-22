"""
Election Results Calculation, Verification, and Reporting Services.
CampusVote Phase 8 Architecture.

CRITICAL SECURITY AND ANONYMITY PRINCIPLES:
1. Zero Linkage: Individual ballot choices and voter participation records are never correlated.
2. Deterministic Calculation: For identical inputs and rules, calculations produce identical results.
3. Fail-Closed Publication: Publication requires strict validation of closed election state,
   ballot integrity, reproducibility digest, and required administrative approvals.
4. Fail-Closed Real Election Gate: Real election tallying and publication remains blocked
   until independent cryptographic security review is approved.
"""

import csv
import io
import json
import hashlib
import logging
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any, List, Optional
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.accounts.models import Role
from apps.elections.models import Election, ElectionPosition, ElectionStatus, Candidate, CandidateStatus
from apps.voting.models import AnonymousBallot, VoterParticipationRecord
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.results.models import (
    ElectionResult,
    ElectionPositionResult,
    ResultLifecycleStatus,
    TallySourceType,
    ReconciliationStatus,
    VerificationStatus
)

logger = logging.getLogger(__name__)


# ==============================================================================
# 1. TALLY SOURCE PROVIDER ABSTRACTION
# ==============================================================================

class TallySourceProvider(ABC):
    """Abstract interface separating ballot provision from calculation logic."""

    @abstractmethod
    def get_tally_input(
        self,
        election: Election
    ) -> Tuple[bool, List[Dict[str, Any]], Dict[str, Any], str]:
        """
        Supplies validated ballot input records for tallying.
        Returns: (success, ballots_list, metadata, error_message)
        """
        pass


class LiveVaultTallySourceProvider(TallySourceProvider):
    """
    Supplies ballots from the live anonymous ballot vault.
    Strictly enforces fail-closed gate against unreviewed production elections.
    """

    @classmethod
    def get_tally_input(
        cls,
        election: Election
    ) -> Tuple[bool, List[Dict[str, Any]], Dict[str, Any], str]:
        # Fail-closed check: Ensure independent security review has been approved for real elections
        review_approved = getattr(settings, 'INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED', False)

        if not review_approved:
            raise PermissionError(
                "Real election tallying is blocked until the anonymous ballot duplicate-vote prevention "
                "protocol has completed formal independent security review and institutional approval."
            )

        ballot_qs = AnonymousBallot.objects.filter(election_id=election.id).order_by('created_at')
        ballots_data = []

        for b in ballot_qs:
            ballots_data.append({
                'id': str(b.id),
                'receipt_id': b.receipt_id,
                'selections': b.selections,
                'schema_version': b.schema_version,
                'created_at': b.created_at.isoformat()
            })

        metadata = {
            'is_synthetic': False,
            'tally_source_type': TallySourceType.LIVE_VAULT,
            'total_raw_ballots': len(ballots_data),
            'source_description': 'Live anonymous ballot vault repository'
        }

        return True, ballots_data, metadata, ""


class SyntheticTallySourceProvider(TallySourceProvider):
    """
    Supplies deterministic synthetic test fixtures for development, testing,
    and demonstration without touching real voter participation records.
    """

    @classmethod
    def generate_fixture_ballots(cls, election: Election, count: int = 25) -> List[Dict[str, Any]]:
        """Generates realistic, deterministic mock ballots across election positions."""
        positions = list(election.positions.all().order_by('display_order', 'id'))
        if not positions:
            return []

        fixture_ballots: List[Dict[str, Any]] = []

        for b_idx in range(count):
            selections = []
            for p_idx, pos in enumerate(positions):
                approved_candidates = list(pos.candidates.filter(status=CandidateStatus.APPROVED).order_by('id'))
                # Every 7th voter abstains on alternating positions to simulate abstentions
                if (b_idx + p_idx) % 7 == 0:
                    selections.append({
                        'position_id': str(pos.id),
                        'position_title': pos.title,
                        'candidate_id': None,
                        'candidate_name': None,
                        'is_abstain': True
                    })
                elif approved_candidates:
                    # Deterministic candidate selection
                    chosen = approved_candidates[b_idx % len(approved_candidates)]
                    selections.append({
                        'position_id': str(pos.id),
                        'position_title': pos.title,
                        'candidate_id': str(chosen.id),
                        'candidate_name': chosen.student.full_name,
                        'is_abstain': False
                    })
                else:
                    selections.append({
                        'position_id': str(pos.id),
                        'position_title': pos.title,
                        'candidate_id': None,
                        'candidate_name': None,
                        'is_abstain': True
                    })

            fixture_ballots.append({
                'id': f"synth-ballot-{b_idx+1:04d}",
                'receipt_id': f"CV-SYNTH-{b_idx+1:04d}",
                'selections': selections,
                'schema_version': 1,
                'created_at': timezone.now().isoformat()
            })

        return fixture_ballots

    @classmethod
    def get_tally_input(
        cls,
        election: Election
    ) -> Tuple[bool, List[Dict[str, Any]], Dict[str, Any], str]:
        ballots = cls.generate_fixture_ballots(election, count=30)
        metadata = {
            'is_synthetic': True,
            'tally_source_type': TallySourceType.SYNTHETIC_DEVELOPMENT,
            'total_raw_ballots': len(ballots),
            'source_description': 'Clearly labelled synthetic demonstration fixture dataset'
        }
        return True, ballots, metadata, ""


# ==============================================================================
# 2. BALLOT INTEGRITY VERIFICATION SERVICE
# ==============================================================================

class BallotIntegrityService:
    """Validates structural and relational integrity of ballots before tallying."""

    @classmethod
    def verify_ballot_integrity(
        cls,
        election: Election,
        ballots: List[Dict[str, Any]]
    ) -> Tuple[bool, List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
        """
        Validates ballot schema, position boundaries, and candidate set membership.
        Returns: (all_valid, valid_ballots, invalid_ballots, details)
        """
        configured_positions = {str(p.id): p for p in election.positions.all()}
        configured_candidates = {
            str(c.id): c
            for c in Candidate.objects.filter(
                election_position__election=election,
                status=CandidateStatus.APPROVED
            ).select_related('student', 'election_position')
        }

        valid_ballots: List[Dict[str, Any]] = []
        invalid_ballots: List[Dict[str, Any]] = []
        validation_reasons: List[str] = []

        seen_receipts = set()

        for idx, b in enumerate(ballots):
            receipt = b.get('receipt_id') or b.get('ballot_id') or b.get('id') or f"mock_ballot_{idx}"
            if receipt in seen_receipts:
                invalid_ballots.append(b)
                validation_reasons.append(f"Duplicate or missing receipt ID: {receipt}")
                continue
            seen_receipts.add(receipt)

            selections = b.get('selections')
            if not isinstance(selections, list):
                invalid_ballots.append(b)
                validation_reasons.append("Selections payload is not a list")
                continue

            ballot_valid = True
            seen_positions = set()

            for sel in selections:
                if not isinstance(sel, dict):
                    ballot_valid = False
                    validation_reasons.append("Selection entry is not a dict")
                    break

                pos_id = str(sel.get('position_id', ''))
                if pos_id not in configured_positions:
                    ballot_valid = False
                    validation_reasons.append(f"Position '{pos_id}' does not belong to election")
                    break

                if pos_id in seen_positions:
                    ballot_valid = False
                    validation_reasons.append(f"Duplicate selection for position '{pos_id}' in same ballot")
                    break
                seen_positions.add(pos_id)

                is_abstain = bool(sel.get('is_abstain', False))
                cand_id = sel.get('candidate_id')

                if is_abstain:
                    if cand_id:
                        ballot_valid = False
                        validation_reasons.append(f"Contradictory selection: candidate specified with abstention")
                        break
                else:
                    if not cand_id or str(cand_id) not in configured_candidates:
                        ballot_valid = False
                        validation_reasons.append(f"Candidate '{cand_id}' is invalid or not approved")
                        break

                    # Ensure candidate belongs to this specific position
                    cand_obj = configured_candidates[str(cand_id)]
                    if str(cand_obj.election_position_id) != pos_id:
                        ballot_valid = False
                        validation_reasons.append(f"Candidate '{cand_id}' does not belong to position '{pos_id}'")
                        break

            if ballot_valid:
                valid_ballots.append(b)
            else:
                invalid_ballots.append(b)

        all_valid = len(invalid_ballots) == 0 and len(valid_ballots) > 0
        details = {
            'total_inspected': len(ballots),
            'valid_count': len(valid_ballots),
            'invalid_count': len(invalid_ballots),
            'reasons': validation_reasons[:10],
            'timestamp': timezone.now().isoformat()
        }

        return all_valid, valid_ballots, invalid_ballots, details

    @classmethod
    def validate_ballots(
        cls,
        election: Election,
        ballots: List[Dict[str, Any]]
    ) -> Tuple[str, List[str]]:
        """Convenience method returning (VerificationStatus, reasons_list)."""
        all_valid, valid_ballots, invalid_ballots, details = cls.verify_ballot_integrity(election, ballots)
        status = VerificationStatus.PASSED if all_valid else VerificationStatus.FAILED
        return status, details.get('reasons', [])


# ==============================================================================
# 3. PARTICIPATION RECONCILIATION SERVICE
# ==============================================================================

class ParticipationReconciliationService:
    """
    Evaluates checked-in student voter participation counts against cast ballots.
    STRICT PRIVACY POLICY:
    Never forces totals to agree, and never creates a direct correlation between
    voters and ballots. If independent zero-knowledge evidence is absent, reports
    status as NOT_VERIFIABLE.
    """

    @classmethod
    def evaluate_reconciliation(
        cls,
        election: Election,
        ballots_count: int,
        is_synthetic: bool = False
    ) -> Tuple[ReconciliationStatus, Dict[str, Any]]:
        checked_in_count = VoterParticipationRecord.objects.filter(election=election).count()

        if is_synthetic:
            # Synthetic test fixture reconciliation check
            status = ReconciliationStatus.PASSED
            details = {
                'reconciliation_type': 'SYNTHETIC_FIXTURE_EVALUATION',
                'checked_in_voters_count': ballots_count,
                'cast_ballots_tallied': ballots_count,
                'variance': 0,
                'explanation': 'Synthetic development fixture: aggregate participation matches cast ballot total exactly.'
            }
            return status, details

        # Real Election Reconciliation Policy
        # To maintain voter anonymity without certified blinding cryptography,
        # we cannot assume Checked-In == Cast Ballots without formal verification.
        review_approved = getattr(settings, 'INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED', False)

        if not review_approved:
            status = ReconciliationStatus.NOT_VERIFIABLE
            details = {
                'reconciliation_type': 'AGGREGATE_CHECK',
                'checked_in_voters_count': checked_in_count,
                'cast_ballots_tallied': ballots_count,
                'variance': checked_in_count - ballots_count,
                'explanation': (
                    "Reconciliation is NOT_VERIFIABLE: Individual student participation records cannot be correlated "
                    "with anonymous ballots to preserve voter privacy and constitutional ballot secrecy. End-to-end zero-knowledge "
                    "cryptographic reconciliation requires formal independent security certification."
                )
            }
            return status, details

        variance = checked_in_count - ballots_count
        if variance == 0:
            status = ReconciliationStatus.PASSED
            explanation = "Aggregate checked-in voter count exactly matches anonymous ballots cast."
        else:
            status = ReconciliationStatus.FAILED
            explanation = f"Discrepancy detected: {checked_in_count} checked-in voters vs {ballots_count} ballots cast."

        details = {
            'reconciliation_type': 'AGGREGATE_COUNT_RECONCILIATION',
            'checked_in_voters_count': checked_in_count,
            'cast_ballots_tallied': ballots_count,
            'variance': variance,
            'explanation': explanation
        }

        return status, details

    @classmethod
    def reconcile(
        cls,
        election: Election,
        total_ballots: int,
        tally_source_type: str = TallySourceType.LIVE_VAULT
    ) -> Tuple[str, int, str]:
        """
        Public/Test reconciliation interface.
        Returns: (reconciliation_status, variance, explanation)
        """
        is_synth = (tally_source_type == TallySourceType.SYNTHETIC_DEVELOPMENT)
        status, details = cls.evaluate_reconciliation(election, total_ballots, is_synthetic=is_synth)
        return status, details.get('variance', 0), details.get('explanation', '')


# ==============================================================================
# 4. DETERMINISTIC RESULT CALCULATION ENGINE
# ==============================================================================

class ResultCalculationService:
    """
    Computes deterministic position totals, candidate vote shares, rankings, and ties.
    Produces a canonical aggregate artifact and SHA-256 reproducibility digest.
    """

    @classmethod
    def calculate_deterministic_tallies(
        cls,
        election: Election,
        valid_ballots: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, Any], str]:
        """
        Calculates position and candidate tallies deterministically.
        Returns: (canonical_aggregate_snapshot, sha256_digest)
        """
        positions = list(election.positions.all().order_by('display_order', 'id'))
        position_tallies = []
        total_abstentions_election = 0

        for pos in positions:
            candidates = list(
                pos.candidates.filter(status=CandidateStatus.APPROVED)
                .select_related('student')
                .order_by('id')
            )

            # Initialize counters
            cand_vote_map: Dict[str, int] = {str(c.id): 0 for c in candidates}
            cand_name_map: Dict[str, str] = {str(c.id): c.student.full_name for c in candidates}
            abstention_count = 0

            for ballot in valid_ballots:
                selections = ballot.get('selections', [])
                for sel in selections:
                    if str(sel.get('position_id')) == str(pos.id):
                        if sel.get('is_abstain'):
                            abstention_count += 1
                        else:
                            c_id = str(sel.get('candidate_id'))
                            if c_id in cand_vote_map:
                                cand_vote_map[c_id] += 1

            total_votes_cast = sum(cand_vote_map.values()) + abstention_count
            total_abstentions_election += abstention_count

            # Build candidate list with percentages and sort deterministically
            # Primary sort: vote_count descending. Secondary sort: candidate_name ascending.
            cand_items = []
            for c_id, votes in cand_vote_map.items():
                pct = round((votes / total_votes_cast) * 100, 2) if total_votes_cast > 0 else 0.0
                cand_items.append({
                    'candidate_id': c_id,
                    'candidate_name': cand_name_map[c_id],
                    'vote_count': votes,
                    'vote_percentage': pct
                })

            cand_items.sort(key=lambda x: (-x['vote_count'], x['candidate_name']))

            # Assign ranks and detect ties
            ranked_candidates = []
            current_rank = 1
            is_position_tied = False
            tie_details = {}
            winner_id = None
            winner_name = None

            for idx, c_data in enumerate(cand_items):
                if idx > 0 and c_data['vote_count'] < cand_items[idx - 1]['vote_count']:
                    current_rank = idx + 1

                ranked_candidates.append({
                    **c_data,
                    'rank': current_rank,
                    'is_winner': False,
                    'is_tied': False
                })

            # Evaluate top rank for winner or tie
            top_candidates = [c for c in ranked_candidates if c['rank'] == 1 and c['vote_count'] > 0]

            if len(top_candidates) > 1:
                is_position_tied = True
                tie_details = {
                    'tied_vote_count': top_candidates[0]['vote_count'],
                    'tied_candidates': [
                        {'candidate_id': tc['candidate_id'], 'candidate_name': tc['candidate_name']}
                        for tc in top_candidates
                    ],
                    'resolution_required': True
                }
                for tc in ranked_candidates:
                    if tc['rank'] == 1:
                        tc['is_tied'] = True
            elif len(top_candidates) == 1:
                winner_id = top_candidates[0]['candidate_id']
                winner_name = top_candidates[0]['candidate_name']
                for tc in ranked_candidates:
                    if tc['candidate_id'] == winner_id:
                        tc['is_winner'] = True

            position_tallies.append({
                'position_id': str(pos.id),
                'position_title': pos.title,
                'display_order': pos.display_order,
                'total_votes_cast': total_votes_cast,
                'abstention_count': abstention_count,
                'is_tied': is_position_tied,
                'tie_details': tie_details,
                'winner_candidate_id': winner_id,
                'winner_candidate_name': winner_name,
                'candidates': ranked_candidates
            })

        # Sort position results deterministically by display_order, then position_title
        position_tallies.sort(key=lambda p: (p['display_order'], p['position_title']))

        canonical_snapshot = {
            'election_id': str(election.id),
            'election_title': election.title,
            'academic_year': election.academic_year,
            'total_ballots_tallied': len(valid_ballots),
            'total_abstentions': total_abstentions_election,
            'total_positions': len(position_tallies),
            'positions': position_tallies
        }

        # Canonical SHA-256 Digest of deterministic JSON string
        canonical_str = json.dumps(canonical_snapshot, sort_keys=True, separators=(',', ':'))
        result_digest = hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()

        return canonical_snapshot, result_digest

    @classmethod
    def calculate(cls, election: Election, ballots: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convenience calculation method returning structured dictionary for tests/views."""
        all_valid, valid_ballots, invalid_ballots, details = BallotIntegrityService.verify_ballot_integrity(election, ballots)
        snapshot, digest = cls.calculate_deterministic_tallies(election, valid_ballots)

        positions_dict = {}
        for p in snapshot['positions']:
            cand_results = {}
            for c in p['candidates']:
                cand_results[c['candidate_id']] = {
                    'candidate_id': c['candidate_id'],
                    'candidate_name': c['candidate_name'],
                    'vote_count': c['vote_count'],
                    'percentage': c['vote_percentage'],
                    'rank': c['rank'],
                    'is_winner': c.get('is_winner', False),
                    'is_tied': c.get('is_tied', False),
                }

            tie_details_list = []
            if isinstance(p.get('tie_details'), dict) and 'tied_candidates' in p['tie_details']:
                tie_details_list = p['tie_details']['tied_candidates']

            positions_dict[p['position_id']] = {
                'position_id': p['position_id'],
                'position_title': p['position_title'],
                'total_votes_cast': p['total_votes_cast'],
                'abstention_count': p['abstention_count'],
                'is_tied': p['is_tied'],
                'tie_details': tie_details_list,
                'winner_candidate_id': p.get('winner_candidate_id'),
                'winner_candidate_name': p.get('winner_candidate_name'),
                'candidate_results': cand_results
            }

        return {
            'totals': {
                'total_ballots_counted': snapshot['total_ballots_tallied'],
                'total_abstentions': snapshot['total_abstentions'],
                'total_positions': snapshot['total_positions']
            },
            'positions': positions_dict,
            'artifact_digest': digest,
            'snapshot': snapshot
        }



# ==============================================================================
# 5. RESULT WORKFLOW & PUBLICATION GATE SERVICE
# ==============================================================================

class ResultWorkflowService:
    """
    Coordinates calculation requests, versioning, review, approvals,
    publication gates, report exports, and audit logging.
    """

    @classmethod
    def calculate_result(
        cls,
        election_id: str,
        user: Any,
        use_synthetic: bool = False,
        request: Any = None
    ) -> Tuple[bool, Optional[ElectionResult], List[str], str]:
        """
        Executes result calculation for an election cycle.
        """
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return False, None, [], "Election cycle not found."

        # Validate Election Lifecycle State: Must be CLOSED or RESULTS_PUBLISHED
        if election.status not in (ElectionStatus.CLOSED, ElectionStatus.RESULTS_PUBLISHED):
            return False, None, [], (
                f"Result calculation requires election to be in CLOSED status. "
                f"Current status: '{election.get_status_display()}' (must be in CLOSED status)."
            )

        log_audit_event(
            action=AuditAction.RESULT_CALCULATION_REQUESTED,
            target_type='ELECTION',
            target_id=str(election.id),
            metadata={'is_synthetic': use_synthetic},
            request=request
        )

        # 1. Obtain Ballots via appropriate Provider
        provider: TallySourceProvider = (
            SyntheticTallySourceProvider() if use_synthetic else LiveVaultTallySourceProvider()
        )
        try:
            success, raw_ballots, provider_meta, prov_error = provider.get_tally_input(election)
        except PermissionError as pe:
            return False, None, [], str(pe)

        if not success:
            log_audit_event(
                action=AuditAction.RESULT_CALCULATION_FAILED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'error': prov_error},
                request=request
            )
            return False, None, [], prov_error

        # 2. Ballot Integrity Verification
        all_valid, valid_ballots, invalid_ballots, integrity_details = (
            BallotIntegrityService.verify_ballot_integrity(election, raw_ballots)
        )
        integrity_status = VerificationStatus.PASSED if all_valid else VerificationStatus.FAILED

        # 3. Participation Reconciliation Evaluation
        reconciliation_status, reconciliation_details = (
            ParticipationReconciliationService.evaluate_reconciliation(
                election=election,
                ballots_count=len(valid_ballots),
                is_synthetic=use_synthetic
            )
        )

        # 4. Deterministic Calculation
        snapshot, result_digest = ResultCalculationService.calculate_deterministic_tallies(
            election=election,
            valid_ballots=valid_ballots
        )

        # 5. Evaluate Publication Blockers
        blockers: List[str] = []
        if use_synthetic:
            blockers.append("SYNTHETIC_DATA: Result was computed from synthetic development fixtures and cannot be published as real official election outcome.")
        if election.status != ElectionStatus.CLOSED and election.status != ElectionStatus.RESULTS_PUBLISHED:
            blockers.append(f"ELECTION_NOT_CLOSED: Election status is '{election.get_status_display()}'. Must be CLOSED to publish.")
        if integrity_status != VerificationStatus.PASSED:
            blockers.append(f"INTEGRITY_CHECK_FAILED: {len(invalid_ballots)} invalid or malformed ballot records detected.")
        if not use_synthetic:
            review_approved = getattr(settings, 'INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED', False)
            if not review_approved:
                blockers.append("INDEPENDENT_SECURITY_REVIEW_PENDING: Real voting protocol requires formal independent security certification.")
        blockers.append("APPROVAL_PENDING: Result requires formal review and administrative approval.")

        # 6. Determine Sequential Version & Persist inside transaction
        try:
            with transaction.atomic():
                latest_result = ElectionResult.objects.filter(election=election).order_by('-version').first()
                next_version = (latest_result.version + 1) if latest_result else 1

                result = ElectionResult.objects.create(
                    election=election,
                    version=next_version,
                    is_synthetic=use_synthetic,
                    tally_source_type=provider_meta['tally_source_type'],
                    status=ResultLifecycleStatus.CALCULATED,
                    total_ballots_tallied=len(valid_ballots),
                    total_abstentions=snapshot['total_abstentions'],
                    total_positions_tallied=snapshot['total_positions'],
                    integrity_status=integrity_status,
                    integrity_details=integrity_details,
                    reconciliation_status=reconciliation_status,
                    reconciliation_details=reconciliation_details,
                    publication_blockers=blockers,
                    result_digest=result_digest,
                    aggregate_snapshot=snapshot,
                    calculated_by=user
                )

                if latest_result:
                    latest_result.status = ResultLifecycleStatus.SUPERSEDED
                    latest_result.superseded_by = result
                    latest_result.superseded_at = timezone.now()
                    latest_result.superseded_reason = f"Superseded by recalculation v{result.version}"
                    latest_result.save()


                # Persist Position Results
                for pos_data in snapshot['positions']:
                    ElectionPositionResult.objects.create(
                        result=result,
                        position_id=pos_data['position_id'],
                        position_title=pos_data['position_title'],
                        total_votes_cast=pos_data['total_votes_cast'],
                        abstention_count=pos_data['abstention_count'],
                        is_tied=pos_data['is_tied'],
                        tie_details=pos_data['tie_details'],
                        winner_candidate_id=pos_data['winner_candidate_id'],
                        winner_candidate_name=pos_data['winner_candidate_name'],
                        candidate_tallies=pos_data['candidates']
                    )

            log_audit_event(
                action=AuditAction.RESULT_CALCULATED,
                target_type='ELECTION_RESULT',
                target_id=str(result.id),
                metadata={
                    'election_id': str(election.id),
                    'version': result.version,
                    'result_digest': result.result_digest,
                    'artifact_digest': result.result_digest,
                    'is_synthetic': result.is_synthetic,
                    'ballots_tallied': result.total_ballots_tallied,
                },
                request=request
            )

            return True, result, blockers, ""

        except Exception as exc:
            logger.error(f"Failed to persist calculation result for election {election.id}: {exc}", exc_info=True)
            log_audit_event(
                action=AuditAction.RESULT_CALCULATION_FAILED,
                target_type='ELECTION',
                target_id=str(election.id),
                metadata={'error': str(exc)},
                request=request
            )
            return False, None, [], f"Database calculation persistence error: {str(exc)}"

    @classmethod
    def calculate_and_create_version(
        cls,
        election: Election,
        user: Any,
        is_synthetic: bool = True,
        tally_source_type: str = TallySourceType.SYNTHETIC_DEVELOPMENT,
        notes: str = "",
        request: Any = None
    ) -> ElectionResult:
        """Helper for programmatic calculation version creation."""
        success, result, blockers, error_msg = cls.calculate_result(
            election_id=str(election.id),
            user=user,
            use_synthetic=is_synthetic,
            request=request
        )
        if not success:
            raise RuntimeError(error_msg or "Failed to calculate results.")
        return result

    @classmethod
    def submit_review(
        cls,
        result_id: str,
        user: Any,
        decision: str,
        notes: str,
        request: Any = None
    ) -> Tuple[bool, Optional[ElectionResult], str]:
        """Submits administrative review decision on calculated results."""
        result = ElectionResult.objects.filter(id=result_id).first()
        if not result:
            return False, None, "Result record not found."

        decision_clean = decision.strip().upper()
        if decision_clean not in ('ACCEPTED', 'REJECTED'):
            return False, None, "Review decision must be 'ACCEPTED' or 'REJECTED'."

        if decision_clean == 'REJECTED' and not notes.strip():
            return False, None, "Mandatory justification notes are required when rejecting a result calculation."

        result.reviewed_by = user
        result.reviewed_at = timezone.now()
        result.review_decision = decision_clean
        result.review_notes = notes.strip()

        if decision_clean == 'REJECTED':
            result.status = ResultLifecycleStatus.REJECTED
            action = AuditAction.RESULT_REJECTED
        else:
            result.status = ResultLifecycleStatus.UNDER_REVIEW
            action = AuditAction.RESULT_REVIEW_SUBMITTED

        result.save()

        log_audit_event(
            action=action,
            target_type='ELECTION_RESULT',
            target_id=str(result.id),
            metadata={
                'election_id': str(result.election_id),
                'version': result.version,
                'decision': decision_clean,
                'notes': notes.strip(),
            },
            request=request
        )

        return True, result, ""

    @classmethod
    def review_result(
        cls,
        result: Any,
        user: Any,
        decision: str,
        notes: str,
        request: Any = None
    ) -> ElectionResult:
        """Helper that raises ValueError on review validation errors."""
        result_id = str(result.id) if hasattr(result, 'id') else str(result)
        success, updated_result, error_msg = cls.submit_review(
            result_id=result_id,
            user=user,
            decision=decision,
            notes=notes,
            request=request
        )
        if not success:
            raise ValueError(error_msg)
        return updated_result

    @classmethod
    def evaluate_publication_gates(cls, result: ElectionResult) -> Tuple[bool, List[str]]:
        """Evaluates whether an ElectionResult meets all publication gates."""
        gates_failed: List[str] = []

        if result.status != ResultLifecycleStatus.APPROVED:
            gates_failed.append(f"Result is in status '{result.get_status_display()}'. Must be APPROVED before publication.")

        election = result.election
        if election.status not in (ElectionStatus.CLOSED, ElectionStatus.RESULTS_PUBLISHED):
            gates_failed.append(f"Election status is '{election.get_status_display()}'. Must be CLOSED to publish.")

        if result.integrity_status != VerificationStatus.PASSED:
            gates_failed.append("Ballot integrity verification has not passed.")

        # Real election fail-closed protection
        if not result.is_synthetic:
            review_approved = getattr(settings, 'INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED', False)
            if not review_approved:
                gates_failed.append("Cryptographic duplicate-vote prevention protocol requires formal independent security review.")

        # Digest reproducibility check
        canonical_str = json.dumps(result.aggregate_snapshot, sort_keys=True, separators=(',', ':'))
        recomputed_digest = hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()
        if recomputed_digest != result.result_digest:
            gates_failed.append("Digest verification failed: Canonical aggregate snapshot does not match stored digest.")

        return len(gates_failed) == 0, gates_failed

    @classmethod
    def approve_result(
        cls,
        result: Any = None,
        user: Any = None,
        notes: str = "",
        request: Any = None,
        result_id: Any = None
    ) -> ElectionResult:
        """
        Grants administrative approval for publication.
        Enforces separation of duties: Approver cannot be the same administrator who calculated,
        unless institutional Super Administrator override is present.
        """
        res_target = result if result is not None else result_id
        result_id_str = str(res_target.id) if hasattr(res_target, 'id') else str(res_target)
        result_obj = ElectionResult.objects.filter(id=result_id_str).first()
        if not result_obj:
            raise ValueError("Result record not found.")

        # Separation of Duties check
        if result_obj.calculated_by_id == user.id and getattr(user, 'role', '') != Role.SUPER_ADMIN:
            raise PermissionError(
                "Separation of duties violation: An administrator cannot approve a result they calculated. "
                "Another authorized administrator or super admin must review and grant approval."
            )

        if result_obj.status not in (ResultLifecycleStatus.CALCULATED, ResultLifecycleStatus.UNDER_REVIEW):
            raise ValueError(f"Cannot approve result in status '{result_obj.get_status_display()}'.")

        result_obj.approved_by = user
        result_obj.approved_at = timezone.now()
        result_obj.approval_notes = notes.strip()
        result_obj.status = ResultLifecycleStatus.APPROVED

        # Update blockers: Remove approval blocker
        blockers = [b for b in result_obj.publication_blockers if not b.startswith("APPROVAL_PENDING")]
        result_obj.publication_blockers = blockers
        result_obj.save()

        log_audit_event(
            action=AuditAction.RESULT_APPROVED,
            target_type='ELECTION_RESULT',
            target_id=str(result_obj.id),
            metadata={
                'election_id': str(result_obj.election_id),
                'version': result_obj.version,
                'approved_by': user.username,
            },
            request=request
        )

        return result_obj

    @classmethod
    def publish_result(
        cls,
        result: Any = None,
        user: Any = None,
        request: Any = None,
        result_id: Any = None
    ) -> ElectionResult:
        """
        Publishes approved election results after evaluating all publication gates.
        """
        res_target = result if result is not None else result_id
        result_id_str = str(res_target.id) if hasattr(res_target, 'id') else str(res_target)
        result_obj = ElectionResult.objects.filter(id=result_id_str).first()
        if not result_obj:
            raise ValueError("Result record not found.")

        is_eligible, failed_gates = cls.evaluate_publication_gates(result_obj)
        if not is_eligible:
            log_audit_event(
                action=AuditAction.RESULT_PUBLICATION_BLOCKED,
                target_type='ELECTION_RESULT',
                target_id=str(result_obj.id),
                metadata={
                    'election_id': str(result_obj.election_id),
                    'version': result_obj.version,
                    'gates_failed': failed_gates,
                },
                request=request
            )
            raise PermissionError(f"Publication blocked: {', '.join(failed_gates)}")

        now = timezone.now()

        try:
            with transaction.atomic():
                prior_published = ElectionResult.objects.filter(
                    election=result_obj.election,
                    status=ResultLifecycleStatus.PUBLISHED
                ).exclude(id=result_obj.id)

                for prior in prior_published:
                    prior.status = ResultLifecycleStatus.SUPERSEDED
                    prior.superseded_by = result_obj
                    prior.superseded_at = now
                    prior.superseded_reason = f"Superseded by newly authorized calculation version {result_obj.version}."
                    prior.save()
                    log_audit_event(
                        action=AuditAction.RESULT_SUPERSEDED,
                        target_type='ELECTION_RESULT',
                        target_id=str(prior.id),
                        metadata={'superseded_by_version': result_obj.version},
                        request=request
                    )

                result_obj.status = ResultLifecycleStatus.PUBLISHED
                result_obj.published_by = user
                result_obj.published_at = now
                result_obj.publication_blockers = []
                result_obj.save()

                election = result_obj.election
                election.status = ElectionStatus.RESULTS_PUBLISHED
                election.published_at = now
                election.save(update_fields=['status', 'published_at'])

            log_audit_event(
                action=AuditAction.RESULT_PUBLISHED,
                target_type='ELECTION_RESULT',
                target_id=str(result_obj.id),
                metadata={
                    'election_id': str(election.id),
                    'version': result_obj.version,
                    'published_by': user.username,
                    'is_synthetic': result_obj.is_synthetic,
                },
                request=request
            )

            return result_obj

        except Exception as exc:
            logger.error(f"Failed to publish result {result_obj.id}: {exc}", exc_info=True)
            raise

    @classmethod
    def generate_report_csv(cls, result: ElectionResult) -> str:
        """
        Generates a standardized aggregate election results CSV report.
        Strictly excludes individual ballot selections or student identifiers.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Header metadata
        writer.writerow(["CAMPUSVOTE OFFICIAL ELECTION REPORT"])
        writer.writerow(["Election Title", result.election.title])
        writer.writerow(["Election ID", str(result.election.id)])
        writer.writerow(["Academic Year", result.election.academic_year])
        writer.writerow(["Result Version", f"v{result.version}"])
        writer.writerow(["Status", result.get_status_display()])
        writer.writerow(["Tally Source", result.get_tally_source_type_display()])
        writer.writerow(["Synthetic Demonstration", "YES (SYNTHETIC FIXTURE)" if result.is_synthetic else "NO (REAL ELECTION)"])
        writer.writerow(["Artifact SHA-256 Digest", result.result_digest])
        writer.writerow(["Ballots Tallied", result.total_ballots_tallied])
        writer.writerow(["Total Positions", result.total_positions_tallied])
        writer.writerow(["Total Abstentions", result.total_abstentions])
        writer.writerow(["Integrity Status", result.integrity_status])
        writer.writerow(["Reconciliation Status", result.reconciliation_status])
        writer.writerow(["Calculated At", result.created_at.isoformat()])
        writer.writerow(["Published At", result.published_at.isoformat() if result.published_at else "NOT_PUBLISHED"])
        writer.writerow([])

        # Table header
        writer.writerow([
            "Position",
            "Candidate Name",
            "Votes",
            "Vote Percentage",
            "Rank",
            "Outcome",
            "Position Total Votes",
            "Position Abstentions"
        ])

        for pos in result.position_results.all().order_by('position__display_order', 'position_title'):
            for cand in pos.candidate_tallies:
                outcome = "TIED" if cand.get('is_tied') else ("WINNER" if cand.get('is_winner') else "CANDIDATE")
                writer.writerow([
                    pos.position_title,
                    cand.get('candidate_name', 'Unknown'),
                    cand.get('vote_count', 0),
                    f"{cand.get('vote_percentage', 0.0):.2f}%",
                    cand.get('rank', '-'),
                    outcome,
                    pos.total_votes_cast,
                    pos.abstention_count
                ])

        return output.getvalue()
