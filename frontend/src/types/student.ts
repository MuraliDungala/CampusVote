/**
 * Student and Roster Ingestion Types.
 * CampusVote Phase 2 Architecture.
 */

export type EnrollmentStatus = 'ENROLLED' | 'PENDING' | 'ON_LEAVE' | 'SUSPENDED' | 'GRADUATED' | 'WITHDRAWN';

export interface Student {
  id: string;
  college_id: string;
  full_name: string;
  email: string;
  department: string;
  academic_year: number;
  course: string;
  enrollment_status: EnrollmentStatus;
  enrollment_status_display: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  has_user_account?: boolean;
  user_username?: string;
}

export interface StudentSummary {
  total_students: number;
  active_students: number;
  inactive_students: number;
  pending_students?: number;
  by_department: Record<string, number>;
  by_academic_year: Record<string, number>;
  by_enrollment_status: Record<string, number>;
  supported_departments: string[];
}

export interface StudentFormData {
  college_id: string;
  full_name: string;
  email: string;
  department: string;
  academic_year: number;
  course: string;
  enrollment_status: EnrollmentStatus;
  is_active?: boolean;
}

export interface StudentFilterParams {
  search?: string;
  department?: string;
  academic_year?: string;
  enrollment_status?: string;
  is_active?: string;
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ImportRowStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'CONFLICT' | 'IDENTICAL';

export interface ImportRowDiff {
  old: any;
  new: any;
}

export interface ImportRow {
  row_number: number;
  college_id: string;
  full_name: string;
  email: string;
  department: string;
  academic_year: number | null;
  course: string;
  status: ImportRowStatus;
  errors: string[];
  diff: Record<string, ImportRowDiff>;
}

export interface ImportSession {
  id: string;
  filename: string;
  file_size_bytes: number;
  status: 'PENDING' | 'COMMITTED' | 'CANCELLED' | 'FAILED';
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  conflict_rows: number;
  identical_rows: number;
  preview_data: ImportRow[];
  error_summary: string;
  created_by_username: string;
  created_at: string;
  committed_at: string | null;
}

export interface ImportCommitResult {
  message: string;
  session_id: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  total_processed: number;
}
