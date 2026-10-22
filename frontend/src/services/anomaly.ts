/**
 * Frontend API Service for AI Anomaly Detection and Election Security Monitoring.
 * CampusVote Smart ID-Based College Voting System - Phase 7.
 */

import { apiClient } from './api';
import {
  AnomalyAlert,
  AnomalySummaryMetrics,
  RunPipelineResponse
} from '../types/anomaly';

export interface ElectionAnomaliesResponse {
  election_id: string;
  count: number;
  alerts: AnomalyAlert[];
}

export async function getElectionAnomalies(
  electionId: string,
  filters?: { severity?: string; status?: string }
): Promise<AnomalyAlert[]> {
  const params = new URLSearchParams();
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.status) params.append('status', filters.status);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiClient<ElectionAnomaliesResponse | AnomalyAlert[]>(
    `/api/v1/elections/${electionId}/anomalies/${query}`,
    { method: 'GET' }
  );

  if (Array.isArray(res)) {
    return res;
  }
  return (res as ElectionAnomaliesResponse)?.alerts || [];
}

export async function getElectionAnomalySummary(
  electionId: string
): Promise<AnomalySummaryMetrics> {
  return apiClient<AnomalySummaryMetrics>(
    `/api/v1/elections/${electionId}/anomaly-summary/`,
    { method: 'GET' }
  );
}

export async function runAnomalyDetectionPipeline(
  electionId: string
): Promise<RunPipelineResponse> {
  return apiClient<RunPipelineResponse>(
    `/api/v1/elections/${electionId}/anomalies/run-pipeline/`,
    { method: 'POST' }
  );
}

export async function getAnomalyAlertDetail(
  electionId: string,
  alertId: string
): Promise<AnomalyAlert> {
  return apiClient<AnomalyAlert>(
    `/api/v1/elections/${electionId}/anomalies/${alertId}/`,
    { method: 'GET' }
  );
}

export async function acknowledgeAnomalyAlert(
  electionId: string,
  alertId: string
): Promise<AnomalyAlert> {
  return apiClient<AnomalyAlert>(
    `/api/v1/elections/${electionId}/anomalies/${alertId}/acknowledge/`,
    { method: 'POST' }
  );
}

export async function investigateAnomalyAlert(
  electionId: string,
  alertId: string
): Promise<AnomalyAlert> {
  return apiClient<AnomalyAlert>(
    `/api/v1/elections/${electionId}/anomalies/${alertId}/investigate/`,
    { method: 'POST' }
  );
}

export async function resolveAnomalyAlert(
  electionId: string,
  alertId: string,
  resolutionNote: string
): Promise<AnomalyAlert> {
  return apiClient<AnomalyAlert>(
    `/api/v1/elections/${electionId}/anomalies/${alertId}/resolve/`,
    {
      method: 'POST',
      body: JSON.stringify({ resolution_note: resolutionNote })
    }
  );
}

export async function markAnomalyAlertFalsePositive(
  electionId: string,
  alertId: string,
  resolutionNote: string
): Promise<AnomalyAlert> {
  return apiClient<AnomalyAlert>(
    `/api/v1/elections/${electionId}/anomalies/${alertId}/mark-false-positive/`,
    {
      method: 'POST',
      body: JSON.stringify({ resolution_note: resolutionNote })
    }
  );
}
