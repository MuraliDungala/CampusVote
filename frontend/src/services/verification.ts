/**
 * Frontend API Service for Identity Verification and OTP Challenges.
 * CampusVote Smart ID-Based College Voting System.
 */

import { apiClient } from './api';
import {
  StartVerificationPayload,
  StartVerificationResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
  ResendOtpPayload,
  ResendOtpResponse,
  QrValidatePayload,
  QrValidateResponse,
  VerificationSessionStatus,
  MyStudentQrResponse
} from '../types/verification';

export async function startCollegeIdVerification(
  payload: StartVerificationPayload
): Promise<StartVerificationResponse> {
  return apiClient<StartVerificationResponse>('/api/v1/verification/id/start/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyOtpCode(
  payload: VerifyOtpPayload
): Promise<VerifyOtpResponse> {
  return apiClient<VerifyOtpResponse>('/api/v1/verification/otp/verify/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resendOtpCode(
  payload: ResendOtpPayload
): Promise<ResendOtpResponse> {
  return apiClient<ResendOtpResponse>('/api/v1/verification/otp/resend/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function validateQrPayload(
  payload: QrValidatePayload
): Promise<QrValidateResponse> {
  return apiClient<QrValidateResponse>('/api/v1/verification/qr/validate/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchVerificationStatus(
  sessionId: string
): Promise<VerificationSessionStatus> {
  return apiClient<VerificationSessionStatus>('/api/v1/verification/status/', {
    method: 'GET',
    params: { session_id: sessionId },
  });
}

export async function fetchMyStudentQrCode(): Promise<MyStudentQrResponse> {
  return apiClient<MyStudentQrResponse>('/api/v1/verification/qr/my-code/', {
    method: 'GET',
  });
}
