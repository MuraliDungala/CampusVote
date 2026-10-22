/**
 * TypeScript Type Definitions for Phase 5:
 * Anonymous Ballot Architecture and Voting Interface.
 * CampusVote Smart ID-Based College Voting System.
 */

export interface CandidateBallotSummary {
  id: string;
  full_name: string;
  manifesto: string;
  profile_image: string | null;
}

export interface PositionBallot {
  id: string;
  title: string;
  description: string;
  display_order: number;
  maximum_candidates: number;
  allow_abstain: boolean;
  candidates: CandidateBallotSummary[];
  candidate_count: number;
}

export interface BallotVoterStatus {
  is_eligible: boolean;
  reason: string;
  code: string;
  requires_verification: boolean;
  has_participated: boolean;
}

export interface BallotDefinition {
  election: {
    id: string;
    title: string;
    description: string;
    academic_year: string;
    start_time: string;
    end_time: string;
    status: string;
    is_open: boolean;
  };
  positions: PositionBallot[];
  total_positions: number;
  allow_abstain_global: boolean;
  voter_status?: BallotVoterStatus;
}

export interface PositionSelectionItem {
  position_id: string;
  candidate_id: string | null;
  is_abstain: boolean;
}

export interface BallotSubmissionPayload {
  selections: PositionSelectionItem[];
}

export interface BallotSubmissionResponse {
  status: string;
  receipt_id: string;
  election_id: string;
  submitted_at: string;
  message: string;
}

export interface VoterParticipationStatus {
  election_id: string;
  has_participated: boolean;
  participated_at: string | null;
  is_eligible: boolean;
  requires_verification: boolean;
  message: string;
}
