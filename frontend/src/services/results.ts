/**
 * API client service for Election Results Management, Verification, and Export.
 * CampusVote Phase 8 Architecture.
 */

import { apiClient, getCookie } from './api';
import {
  ElectionResultListItem,
  ElectionResultDetail,
  ResultVerificationDetails,
  PublicElectionResult,
} from '../types/results';

export interface ResultListResponse {
  election_id: string;
  election_title: string;
  election_status: string;
  total_versions: number;
  results: ElectionResultListItem[];
}

export interface CalculateResultResponse {
  message: string;
  publication_blockers: string[];
  result: ElectionResultDetail;
}

export interface ReviewResultResponse {
  message: string;
  result: ElectionResultDetail;
}

export interface ApproveResultResponse {
  message: string;
  result: ElectionResultDetail;
}

export interface PublishResultResponse {
  message: string;
  result: ElectionResultDetail;
}

export interface ResultAuditResponse {
  result_id: string;
  version: number;
  total_events: number;
  events: Array<{
    id: string;
    action: string;
    action_display: string;
    actor_username: string;
    actor_role: string;
    created_at: string;
    metadata: any;
  }>;
}

/**
 * List all result calculation versions for an election.
 */
export async function getElectionResults(electionId: string): Promise<ResultListResponse> {
  return apiClient<ResultListResponse>(`/api/v1/admin/elections/${electionId}/results/`);
}

/**
 * Request deterministic results calculation.
 */
export async function calculateResults(
  electionId: string,
  useSynthetic: boolean = true,
  notes: string = ''
): Promise<CalculateResultResponse> {
  return apiClient<CalculateResultResponse>(`/api/v1/admin/elections/${electionId}/results/calculate/`, {
    method: 'POST',
    body: JSON.stringify({
      use_synthetic: useSynthetic,
      is_synthetic: useSynthetic,
      notes,
    }),
  });
}

/**
 * Retrieve full aggregate result details for a specific version.
 */
export async function getElectionResultDetail(
  electionId: string,
  resultId: string
): Promise<ElectionResultDetail> {
  return apiClient<ElectionResultDetail>(`/api/v1/admin/elections/${electionId}/results/${resultId}/`);
}

/**
 * Retrieve verification details: ballot integrity, participation reconciliation, digest match, publication blockers.
 */
export async function getResultVerification(
  electionId: string,
  resultId: string
): Promise<ResultVerificationDetails> {
  return apiClient<ResultVerificationDetails>(
    `/api/v1/admin/elections/${electionId}/results/${resultId}/verification/`
  );
}

/**
 * Submit administrative review decision (ACCEPTED or REJECTED).
 */
export async function submitResultReview(
  electionId: string,
  resultId: string,
  decision: 'ACCEPTED' | 'REJECTED',
  notes: string
): Promise<ReviewResultResponse> {
  return apiClient<ReviewResultResponse>(`/api/v1/admin/elections/${electionId}/results/${resultId}/review/`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  });
}

/**
 * Grant administrative approval for publication (enforcing separation of duties).
 */
export async function approveResult(
  electionId: string,
  resultId: string,
  notes: string = ''
): Promise<ApproveResultResponse> {
  return apiClient<ApproveResultResponse>(`/api/v1/admin/elections/${electionId}/results/${resultId}/approve/`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/**
 * Publish approved results after evaluating all gates.
 */
export async function publishResult(
  electionId: string,
  resultId: string
): Promise<PublishResultResponse> {
  return apiClient<PublishResultResponse>(`/api/v1/admin/elections/${electionId}/results/${resultId}/publish/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Retrieve result-specific audit trail records.
 */
export async function getResultAudit(
  electionId: string,
  resultId: string
): Promise<ResultAuditResponse> {
  return apiClient<ResultAuditResponse>(`/api/v1/admin/elections/${electionId}/results/${resultId}/audit/`);
}

/**
 * Download official CSV election report.
 */
export async function exportResultReport(electionId: string, resultId: string): Promise<Blob> {
  const csrfToken = getCookie('csrftoken');
  const headers: HeadersInit = {
    Accept: 'text/csv',
  };
  if (csrfToken) {
    (headers as Record<string, string>)['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch(`/api/v1/admin/elections/${electionId}/results/${resultId}/report/`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Report export failed with status: ${response.status}`);
  }

  return response.blob();
}

/**
 * Public endpoint to retrieve published election results.
 */
export async function getPublicElectionResults(electionId: string): Promise<PublicElectionResult> {
  return apiClient<PublicElectionResult>(`/api/v1/public/elections/${electionId}/results/`);
}

export interface SystemAuditLogItem {
  id: string;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: any;
  ip_address: string;
  created_at: string;
}

export async function getSystemAuditLogs(): Promise<SystemAuditLogItem[]> {
  return apiClient<SystemAuditLogItem[]>('/api/v1/audit/logs/');
}

