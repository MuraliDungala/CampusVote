/**
 * Election, Position, and Candidate Nomination API Service.
 * CampusVote Phase 3 Architecture.
 */

import { apiClient } from './api';
import {
  Election,
  ElectionSummary,
  ElectionPosition,
  Candidate,
  ElectionFormData,
  PositionFormData,
  NominationFormData,
  ElectionFilterParams,
} from '../types/election';
import { PaginatedResponse } from '../types/student';

export async function getElections(params: ElectionFilterParams = {}): Promise<PaginatedResponse<Election>> {
  const queryRecord: Record<string, string> = {};
  if (params.status) queryRecord.status = params.status;
  if (params.academic_year) queryRecord.academic_year = params.academic_year;
  if (params.search) queryRecord.search = params.search;
  if (params.page) queryRecord.page = params.page.toString();
  if (params.page_size) queryRecord.page_size = params.page_size.toString();
  if (params.my_elections) queryRecord.my_elections = 'true';

  return apiClient<PaginatedResponse<Election>>('/api/v1/elections/', {
    params: queryRecord,
  });
}

export async function getElectionSummary(): Promise<ElectionSummary> {
  return apiClient<ElectionSummary>('/api/v1/elections/summary/');
}

export async function getElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/`);
}

export async function createElection(data: ElectionFormData): Promise<Election> {
  return apiClient<Election>('/api/v1/elections/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateElection(id: string, data: Partial<ElectionFormData>): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Lifecycle State Transitions
export async function scheduleElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/schedule/`, {
    method: 'POST',
  });
}

export async function unpublishElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/unpublish/`, {
    method: 'POST',
  });
}

export async function activateElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/activate/`, {
    method: 'POST',
  });
}

export async function closeElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/close/`, {
    method: 'POST',
  });
}

export async function publishResults(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/publish-results/`, {
    method: 'POST',
  });
}

export async function archiveElection(id: string): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/archive/`, {
    method: 'POST',
  });
}

export async function cancelElection(id: string, reason: string = ''): Promise<Election> {
  return apiClient<Election>(`/api/v1/elections/${id}/cancel/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// Position Management
export async function getPositions(electionId: string): Promise<ElectionPosition[]> {
  return apiClient<ElectionPosition[]>(`/api/v1/elections/${electionId}/positions/`);
}

export async function createPosition(electionId: string, data: PositionFormData): Promise<ElectionPosition> {
  return apiClient<ElectionPosition>(`/api/v1/elections/${electionId}/positions/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePosition(id: string, data: Partial<PositionFormData>): Promise<ElectionPosition> {
  return apiClient<ElectionPosition>(`/api/v1/positions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deletePosition(id: string): Promise<void> {
  await apiClient<void>(`/api/v1/positions/${id}/`, {
    method: 'DELETE',
  });
}

// Candidates and Nominations
export async function getElectionCandidates(
  electionId: string,
  status?: string,
  positionId?: string
): Promise<Candidate[]> {
  const queryRecord: Record<string, string> = {};
  if (status) queryRecord.status = status;
  if (positionId) queryRecord.position_id = positionId;

  return apiClient<Candidate[]>(`/api/v1/elections/${electionId}/candidates/`, {
    params: queryRecord,
  });
}

export async function getPositionCandidates(positionId: string): Promise<Candidate[]> {
  return apiClient<Candidate[]>(`/api/v1/positions/${positionId}/candidates/`);
}

export async function adminAddCandidate(
  positionId: string,
  data: {
    student_id: string;
    manifesto?: string;
    profile_image?: string;
  }
): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/positions/${positionId}/candidates/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitNomination(
  positionId: string,
  data: NominationFormData
): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/positions/${positionId}/nominations/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMyNominations(): Promise<Candidate[]> {
  return apiClient<Candidate[]>('/api/v1/nominations/my/');
}

export async function getNomination(id: string): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/nominations/${id}/`);
}

export async function updateNomination(
  id: string,
  data: Partial<NominationFormData>
): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/nominations/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function submitDraftNomination(id: string): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/nominations/${id}/submit/`, {
    method: 'POST',
  });
}

export async function reviewNomination(
  id: string,
  action: 'approve' | 'reject',
  rejectionReason: string = ''
): Promise<Candidate> {
  const endpoint = action === 'approve' ? 'approve' : 'reject';
  return apiClient<Candidate>(`/api/v1/nominations/${id}/${endpoint}/`, {
    method: 'POST',
    body: JSON.stringify({ action, rejection_reason: rejectionReason }),
  });
}

export async function withdrawNomination(id: string): Promise<Candidate> {
  return apiClient<Candidate>(`/api/v1/nominations/${id}/withdraw/`, {
    method: 'POST',
  });
}
