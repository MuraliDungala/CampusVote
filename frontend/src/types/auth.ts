/**
 * Authentication and User Model Type Definitions.
 * Aligned with backend Django accounts models.
 */

export type Role = 'STUDENT' | 'ELECTION_ADMIN' | 'AUDITOR' | 'SUPER_ADMIN';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  college_id: string | null;
  college_name?: string;
  institution_id?: string | null;
  institution_code?: string | null;
  institution_name?: string | null;
  display_identifier: string;
  role: Role;
  status: AccountStatus;
  is_student: boolean;
  is_election_admin: boolean;
  is_auditor: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: UserSummary;
}

export interface AuthContextValue {
  user: UserSummary | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<UserSummary>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}
