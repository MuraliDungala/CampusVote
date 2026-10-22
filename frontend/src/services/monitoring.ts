/**
 * Frontend API Service for Real-Time Voter Monitoring and Election Analytics.
 * CampusVote Smart ID-Based College Voting System - Phase 6.
 */

import { apiClient } from './api';
import {
  ElectionAnalyticsSummary,
  TurnoutTimeSeriesResponse,
  DepartmentAnalyticsResponse,
  ConnectionStatusResponse
} from '../types/monitoring';

export async function getElectionAnalyticsSummary(
  electionId: string
): Promise<ElectionAnalyticsSummary> {
  return apiClient<ElectionAnalyticsSummary>(
    `/api/v1/elections/${electionId}/analytics/summary/`,
    { method: 'GET' }
  );
}

export async function getElectionTurnoutTimeSeries(
  electionId: string,
  interval: '5m' | '15m' | '1h' = '5m'
): Promise<TurnoutTimeSeriesResponse> {
  return apiClient<TurnoutTimeSeriesResponse>(
    `/api/v1/elections/${electionId}/analytics/turnout/?interval=${interval}`,
    { method: 'GET' }
  );
}

export async function getElectionDepartmentAnalytics(
  electionId: string
): Promise<DepartmentAnalyticsResponse> {
  return apiClient<DepartmentAnalyticsResponse>(
    `/api/v1/elections/${electionId}/analytics/departments/`,
    { method: 'GET' }
  );
}

export async function getElectionConnectionStatus(
  electionId: string
): Promise<ConnectionStatusResponse> {
  return apiClient<ConnectionStatusResponse>(
    `/api/v1/elections/${electionId}/analytics/connection-status/`,
    { method: 'GET' }
  );
}
