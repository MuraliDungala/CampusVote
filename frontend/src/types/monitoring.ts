/**
 * TypeScript Type Definitions for Phase 6:
 * Real-Time Voter Monitoring and Election Analytics.
 * CampusVote Smart ID-Based College Voting System.
 */

export interface ElectionAnalyticsSummary {
  election_id: string;
  election_title: string;
  election_status: string;
  election_status_display: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
  total_eligible_voters: number;
  recorded_participants: number;
  remaining_eligible_voters: number;
  turnout_percentage: number;
  last_updated: string;
}

export interface TurnoutBucket {
  timestamp: string;
  display_label: string;
  interval_count: number;
  cumulative_count: number;
  turnout_percentage: number;
}

export interface TurnoutTimeSeriesResponse {
  election_id: string;
  interval: string;
  total_eligible_voters: number;
  total_recorded_participants: number;
  buckets_count: number;
  buckets: TurnoutBucket[];
  last_updated: string;
}

export interface DepartmentTurnoutCohort {
  department: string;
  is_suppressed: boolean;
  suppression_reason: string | null;
  eligible_voters: number | null;
  recorded_participants: number | null;
  turnout_percentage: number | null;
}

export interface DepartmentAnalyticsResponse {
  election_id: string;
  privacy_threshold: number;
  total_departments: number;
  suppressed_departments_count: number;
  departments: DepartmentTurnoutCohort[];
  last_updated: string;
}

export interface ConnectionStatusResponse {
  election_id: string;
  websocket_supported: boolean;
  transport: string;
  polling_fallback_interval_seconds: number;
  status: string;
}

export type ConnectionMode = 'WEBSOCKET' | 'POLLING' | 'CONNECTING' | 'DISCONNECTED';
