/**
 * Student and Roster Management API Service.
 * CampusVote Phase 2 Architecture.
 */

import { apiClient, getCookie } from './api';
import {
  Student,
  StudentSummary,
  StudentFormData,
  StudentFilterParams,
  PaginatedResponse,
  ImportSession,
  ImportCommitResult
} from '../types/student';

export async function getStudents(params: StudentFilterParams = {}): Promise<PaginatedResponse<Student>> {
  const queryRecord: Record<string, string> = {};
  if (params.search) queryRecord.search = params.search;
  if (params.department) queryRecord.department = params.department;
  if (params.academic_year) queryRecord.academic_year = params.academic_year;
  if (params.enrollment_status) queryRecord.enrollment_status = params.enrollment_status;
  if (params.is_active !== undefined) queryRecord.is_active = params.is_active;
  if (params.page) queryRecord.page = params.page.toString();
  if (params.page_size) queryRecord.page_size = params.page_size.toString();

  return apiClient<PaginatedResponse<Student>>('/api/v1/admin/students/', {
    params: queryRecord,
  });
}

export async function getStudentSummary(): Promise<StudentSummary> {
  return apiClient<StudentSummary>('/api/v1/admin/students/summary/');
}

export async function getStudent(id: string): Promise<Student> {
  return apiClient<Student>(`/api/v1/admin/students/${id}/`);
}

export async function createStudent(data: StudentFormData): Promise<Student> {
  return apiClient<Student>('/api/v1/admin/students/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStudent(id: string, data: Partial<StudentFormData>): Promise<Student> {
  return apiClient<Student>(`/api/v1/admin/students/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deactivateStudent(id: string, reason: string = ''): Promise<{ message: string; student: Student }> {
  return apiClient<{ message: string; student: Student }>(`/api/v1/admin/students/${id}/deactivate/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function approveStudent(id: string): Promise<{ message: string; student: Student }> {
  return apiClient<{ message: string; student: Student }>(`/api/v1/admin/students/${id}/approve/`, {
    method: 'POST',
  });
}

export async function previewRosterCsv(file: File): Promise<ImportSession> {
  const formData = new FormData();
  formData.append('file', file);

  const csrfToken = getCookie('csrftoken');
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch('/api/v1/admin/students/import/preview/', {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to upload and preview CSV.');
  }
  return data as ImportSession;
}

export async function commitRosterImport(
  sessionId: string,
  strategy: 'skip_conflicts' | 'update_conflicts' = 'skip_conflicts'
): Promise<ImportCommitResult> {
  return apiClient<ImportCommitResult>('/api/v1/admin/students/import/commit/', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, strategy }),
  });
}

export async function downloadRosterTemplate(): Promise<void> {
  const response = await fetch('/api/v1/admin/students/import/template/', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to download CSV template.');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campusvote_roster_template.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export interface VoterIdCardData {
  id: string;
  voter_id_number: string;
  qr_payload: string;
  student_name: string;
  college_id: string;
  college_name: string;
  department: string;
  academic_year: number;
  enrollment_status: string;
  enrollment_status_display: string;
  issued_at: string;
  is_active: boolean;
}

export interface VoterIdStatusResponse {
  has_voter_id: boolean;
  eligible_to_generate?: boolean;
  enrollment_status?: string;
  enrollment_status_display?: string;
  message?: string;
  voter_id?: VoterIdCardData;
}

export async function getMyVoterId(): Promise<VoterIdStatusResponse> {
  return apiClient<VoterIdStatusResponse>('/api/v1/students/voter-id/me/');
}

export async function generateMyVoterId(): Promise<{ message: string; voter_id: VoterIdCardData }> {
  return apiClient<{ message: string; voter_id: VoterIdCardData }>('/api/v1/students/voter-id/generate/', {
    method: 'POST',
  });
}
