/**
 * Authentication service functions.
 */

import { apiClient } from './api';
import { UserSummary, LoginCredentials, LoginResponse } from '../types/auth';

export async function fetchCsrfToken(): Promise<string> {
  const data = await apiClient<{ csrfToken: string }>('/api/v1/auth/csrf/');
  return data.csrfToken;
}

export interface StudentRegistrationData {
  full_name: string;
  college_name: string;
  college_id: string;
  email: string;
  department: string;
  custom_department?: string;
  academic_year: number;
  password?: string;
}

export interface StudentRegistrationResponse {
  message: string;
  status: 'VERIFIED' | 'PENDING_VERIFICATION';
  is_verified: boolean;
  college_id: string;
  college_name?: string;
  full_name: string;
}

export interface CollegeAdminRegistrationData {
  full_name: string;
  college_name: string;
  email: string;
  password: string;
  confirm_password: string;
  contact_phone?: string;
  institution_code?: string;
  is_simulation_demo?: boolean;
}

export interface CollegeAdminRegistrationResponse {
  message: string;
  user: UserSummary;
  institution: {
    id: string;
    code: string;
    name: string;
    status: string;
    is_demo: boolean;
  };
}

export interface InstitutionItem {
  id: string;
  code: string;
  name: string;
  normalized_name: string;
  email_domain: string | null;
  status: string;
  is_demo: boolean;
  created_at: string;
}

export async function registerCollegeAdmin(data: CollegeAdminRegistrationData): Promise<CollegeAdminRegistrationResponse> {
  await fetchCsrfToken();
  return apiClient<CollegeAdminRegistrationResponse>('/api/v1/auth/college-admin/register/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchInstitutions(): Promise<InstitutionItem[]> {
  return apiClient<InstitutionItem[]>('/api/v1/auth/institutions/');
}

export async function registerStudent(data: StudentRegistrationData): Promise<StudentRegistrationResponse> {
  await fetchCsrfToken();
  try {
    return await apiClient<StudentRegistrationResponse>('/api/v1/auth/register/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (err: any) {
    // If auth alias is not reachable, gracefully fallback to students endpoint
    if (err.status === 404) {
      return await apiClient<StudentRegistrationResponse>('/api/v1/students/register/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }
    throw err;
  }
}

export async function loginUser(credentials: LoginCredentials): Promise<LoginResponse> {
  // Ensure a CSRF token cookie is present prior to logging in
  await fetchCsrfToken();

  return apiClient<LoginResponse>('/api/v1/auth/login/', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function logoutUser(): Promise<{ message: string }> {
  return apiClient<{ message: string }>('/api/v1/auth/logout/', {
    method: 'POST',
  });
}

export async function fetchCurrentUser(): Promise<UserSummary> {
  return apiClient<UserSummary>('/api/v1/auth/me/');
}

export async function updateUserProfile(data: { first_name?: string; last_name?: string }): Promise<UserSummary> {
  return apiClient<UserSummary>('/api/v1/auth/me/', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// RBAC validation endpoints
export async function testStudentEndpoint(): Promise<any> {
  return apiClient('/api/v1/accounts/student-only/');
}

export async function testAdminEndpoint(): Promise<any> {
  return apiClient('/api/v1/accounts/admin-only/');
}

export async function testAuditorEndpoint(): Promise<any> {
  return apiClient('/api/v1/accounts/auditor-only/');
}
