/**
 * Election, Position, and Candidate Nomination Types.
 * CampusVote Phase 3 Architecture.
 */

export type ElectionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'CLOSED'
  | 'RESULTS_PUBLISHED'
  | 'ARCHIVED'
  | 'CANCELLED';

export type CandidateStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface ElectionPosition {
  id: string;
  election: string;
  title: string;
  description: string;
  display_order: number;
  maximum_candidates: number;
  candidates_count: number;
  approved_candidates_count: number;
  created_at: string;
  updated_at: string;
}

export interface Election {
  id: string;
  title: string;
  description: string;
  academic_year: string;
  institution_id?: string | null;
  institution_name?: string | null;
  institution_code?: string | null;
  start_time: string;
  end_time: string;
  status: ElectionStatus;
  status_display: string;
  positions_count: number;
  candidates_count: number;
  approved_candidates_count: number;
  pending_nominations_count?: number;
  is_eligible?: boolean | null;
  eligibility_reason?: string | null;
  can_vote?: boolean;
  has_voted?: boolean;
  positions?: ElectionPosition[];
  created_by_username?: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export interface ElectionSummary {
  total_elections: number;
  draft_elections: number;
  scheduled_elections: number;
  active_elections: number;
  closed_elections: number;
  results_published_elections: number;
  archived_elections: number;
  cancelled_elections: number;
  pending_nominations: number;
  approved_candidates: number;
}

export interface EligibilitySnapshot {
  is_eligible: boolean;
  reason: string;
  rule_id?: string | null;
  rule_title?: string;
  student_college_id?: string;
  department?: string;
  academic_year?: number;
  enrollment_status?: string;
  evaluated_at?: string;
}

export interface Candidate {
  id: string;
  student_id: string;
  student_college_id: string;
  student_name: string;
  candidate_name?: string;
  department: string;
  academic_year: number;
  enrollment_status: string;
  election_position: string;
  position_title: string;
  election_id: string;
  election_title: string;
  manifesto: string;
  profile_image: string | null;
  status: CandidateStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_username: string | null;
  rejection_reason: string | null;
  eligibility_snapshot: EligibilitySnapshot;
  created_at: string;
  updated_at: string;
}

export interface ElectionFormData {
  title: string;
  description: string;
  academic_year: string;
  start_time: string;
  end_time: string;
}

export interface PositionFormData {
  title: string;
  description: string;
  display_order: number;
  maximum_candidates: number;
}

export interface NominationFormData {
  manifesto: string;
  profile_image?: string;
  submit_now?: boolean;
}

export interface ElectionFilterParams {
  status?: string;
  academic_year?: string;
  search?: string;
  page?: number;
  page_size?: number;
  my_elections?: boolean;
}
