/**
 * TypeScript type definitions for Phase 4:
 * College ID, OTP, and QR Identity Verification.
 * CampusVote Smart ID-Based College Voting System.
 */

import { UserSummary } from './auth';

export type VerificationState =
  | 'NOT_STARTED'
  | 'ID_SUBMITTED'
  | 'OTP_PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'LOCKED'
  | 'FAILED';

export type VerificationChannel = 'EMAIL' | 'SMS';

export interface StartVerificationPayload {
  college_id: string;
  channel?: VerificationChannel;
}

export interface StartVerificationResponse {
  session_id: string;
  college_id: string;
  state: VerificationState;
  channel: VerificationChannel;
  destination_masked: string;
  expires_in_seconds: number;
  resend_cooldown_seconds: number;
  message: string;
  _dev_otp?: string;
}

export interface VerifyOtpPayload {
  session_id: string;
  otp: string;
}

export interface VerifyOtpResponse {
  session_id: string;
  state: VerificationState;
  user: UserSummary;
  message: string;
}

export interface ResendOtpPayload {
  session_id: string;
}

export interface ResendOtpResponse {
  session_id: string;
  state: VerificationState;
  resend_count: number;
  resends_remaining: number;
  resend_cooldown_seconds: number;
  expires_in_seconds: number;
  destination_masked: string;
  message: string;
  _dev_otp?: string;
}

export interface QrValidatePayload {
  qr_payload: string;
}

export interface QrValidateResponse {
  college_id: string;
  student_name: string;
  department: string;
  academic_year: number;
  course: string;
  destination_masked: string;
  message: string;
}

export interface MyStudentQrResponse {
  college_id: string;
  student_name: string;
  qr_payload: string;
  format: string;
  valid_hours: number;
  message: string;
}

export interface VerificationSessionStatus {
  session_id: string;
  college_id: string;
  state: VerificationState;
  channel: string;
  destination_masked: string;
  attempts_count: number;
  max_attempts: number;
  resend_count: number;
  max_resends: number;
  expires_in_seconds: number;
  resend_cooldown_seconds: number;
  is_locked: boolean;
  is_expired: boolean;
}
