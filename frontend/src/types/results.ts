/**
 * Type definitions for Phase 8: Results Management, Election Reports, and Audit Verification.
 * CampusVote Phase 8 Architecture.
 */

export type ResultLifecycleStatus =
  | 'NOT_CALCULATED'
  | 'CALCULATED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type TallySourceType = 'SYNTHETIC_DEVELOPMENT' | 'LIVE_VAULT';

export type VerificationStatus = 'PENDING' | 'PASSED' | 'FAILED';

export type ReconciliationStatus = 'NOT_RUN' | 'PASSED' | 'FAILED' | 'NOT_VERIFIABLE';

export interface CandidateTallyItem {
  candidate_id: string;
  candidate_name: string;
  vote_count: number;
  vote_percentage: number;
  rank: number;
  is_winner?: boolean;
  is_tied?: boolean;
}

export interface TiedCandidateDetail {
  candidate_id: string;
  candidate_name: string;
}

export interface PositionTieDetails {
  tied_vote_count?: number;
  tied_candidates?: TiedCandidateDetail[];
  resolution_required?: boolean;
}

export interface PositionResultItem {
  id?: string;
  position_id: string;
  position_title: string;
  display_order?: number;
  total_votes_cast: number;
  abstention_count: number;
  is_tied: boolean;
  tie_details?: PositionTieDetails;
  winner_candidate_id?: string | null;
  winner_candidate_name?: string | null;
  candidate_tallies?: CandidateTallyItem[];
  candidates?: CandidateTallyItem[];
}

export interface ElectionResultListItem {
  id: string;
  election: string;
  version: number;
  is_synthetic: boolean;
  tally_source_type: TallySourceType;
  tally_source_display: string;
  status: ResultLifecycleStatus;
  lifecycle_status: ResultLifecycleStatus;
  status_display: string;
  total_ballots_tallied: number;
  total_abstentions: number;
  total_positions_tallied: number;
  integrity_status: VerificationStatus;
  reconciliation_status: ReconciliationStatus;
  result_digest: string;
  calculated_by_email?: string;
  created_at: string;
  published_at?: string | null;
}

export interface ElectionResultDetail {
  id: string;
  election: string;
  election_title: string;
  version: number;
  is_synthetic: boolean;
  tally_source_type: TallySourceType;
  tally_source_display: string;
  status: ResultLifecycleStatus;
  lifecycle_status: ResultLifecycleStatus;
  status_display: string;
  total_ballots_tallied: number;
  total_abstentions: number;
  total_positions_tallied: number;
  integrity_status: VerificationStatus;
  integrity_details: {
    total_inspected?: number;
    valid_count?: number;
    invalid_count?: number;
    reasons?: string[];
    timestamp?: string;
  };
  reconciliation_status: ReconciliationStatus;
  reconciliation_details: {
    reconciliation_type?: string;
    checked_in_voters_count?: number;
    cast_ballots_tallied?: number;
    variance?: number;
    explanation?: string;
  };
  publication_blockers: string[];
  result_digest: string;
  aggregate_snapshot: any;
  calculated_by_email?: string;
  reviewed_by_email?: string;
  reviewed_at?: string;
  review_decision?: string;
  review_notes?: string;
  approved_by_email?: string;
  approved_at?: string;
  approval_notes?: string;
  published_by_email?: string;
  published_at?: string | null;
  superseded_by?: string;
  superseded_at?: string;
  superseded_reason?: string;
  position_results: PositionResultItem[];
  created_at: string;
  updated_at: string;
}

export interface ResultVerificationDetails {
  result_id: string;
  version: number;
  status: ResultLifecycleStatus;
  lifecycle_status: ResultLifecycleStatus;
  is_synthetic: boolean;
  tally_source_type: TallySourceType;
  stored_result_digest: string;
  recomputed_digest: string;
  reproducibility: boolean;
  reproducibility_verified: boolean;
  integrity_status: VerificationStatus;
  integrity_verification_status: VerificationStatus;
  integrity_details: {
    total_inspected?: number;
    valid_count?: number;
    invalid_count?: number;
    reasons?: string[];
    timestamp?: string;
  };
  reconciliation_status: ReconciliationStatus;
  reconciliation_details: {
    reconciliation_type?: string;
    checked_in_voters_count?: number;
    cast_ballots_tallied?: number;
    variance?: number;
    explanation?: string;
  };
  publication_blockers: string[];
  publication_eligible: boolean;
  is_publication_eligible: boolean;
}

export interface PublicElectionResult {
  id: string;
  election_id: string;
  election_title: string;
  academic_year: string;
  version: number;
  is_synthetic: boolean;
  total_ballots_tallied: number;
  total_positions_tallied: number;
  total_abstentions: number;
  result_digest: string;
  published_at: string;
  position_results: PositionResultItem[];
  positions?: PositionResultItem[];
}
