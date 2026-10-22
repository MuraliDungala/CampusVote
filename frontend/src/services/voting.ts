/**
 * Frontend API Service for Anonymous Ballot Presentation and Decoupled Voting.
 * CampusVote Smart ID-Based College Voting System.
 */

import { apiClient } from './api';
import {
  BallotDefinition,
  BallotSubmissionPayload,
  BallotSubmissionResponse,
  VoterParticipationStatus
} from '../types/voting';

export async function fetchBallotDefinition(electionId: string): Promise<BallotDefinition> {
  return apiClient<BallotDefinition>(`/api/v1/elections/${electionId}/ballot/`, {
    method: 'GET',
  });
}

export async function validateBallotSelections(
  electionId: string,
  payload: BallotSubmissionPayload
): Promise<{ is_valid: boolean; message: string; total_positions: number }> {
  return apiClient<{ is_valid: boolean; message: string; total_positions: number }>(
    `/api/v1/elections/${electionId}/ballot/validate/`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function submitBallot(
  electionId: string,
  payload: BallotSubmissionPayload
): Promise<BallotSubmissionResponse> {
  return apiClient<BallotSubmissionResponse>(`/api/v1/elections/${electionId}/ballot/submit/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchParticipationStatus(
  electionId: string
): Promise<VoterParticipationStatus> {
  return apiClient<VoterParticipationStatus>(
    `/api/v1/elections/${electionId}/participation/status/`,
    {
      method: 'GET',
    }
  );
}
