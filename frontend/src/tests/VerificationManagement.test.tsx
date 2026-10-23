import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/public/LoginPage';
import { OtpVerificationPage } from '../pages/public/OtpVerificationPage';
import { QrScannerPage } from '../pages/public/QrScannerPage';
import * as verificationServices from '../services/verification';

// Mock html5-qrcode
vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
      clear: vi.fn(),
      isScanning: false,
      scanFile: vi.fn().mockResolvedValue('STU-2026-001'),
    })),
    Html5QrcodeSupportedFormats: {
      QR_CODE: 0,
      CODE_128: 5,
      CODE_39: 3,
      EAN_13: 9,
      EAN_8: 10,
      UPC_A: 14,
      UPC_E: 15,
      ITF: 8,
    },
  };
});

// Mock Auth Context
const mockRefreshUser = vi.fn().mockResolvedValue(undefined);
const mockLogin = vi.fn().mockResolvedValue({ role: 'STUDENT' });

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: mockLogin,
    logout: vi.fn(),
    refreshUser: mockRefreshUser,
    clearError: vi.fn(),
  }),
}));

describe('Phase 4: Identity Verification & Authentication Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LoginPage Credentials & Tab Workflows', () => {
    it('renders LoginPage with Student Voter and Staff & Admin tabs', () => {
      render(
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      );

      expect(screen.getByText('Campus Portal Access')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^student voter$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /staff & admin/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/institutional email or college id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in as student voter/i })).toBeInTheDocument();
    });

    it('switches to Staff Password tab when clicked', () => {
      render(
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      );

      const staffTab = screen.getByRole('button', { name: /staff & admin/i });
      fireEvent.click(staffTab);

      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in as administrator/i })).toBeInTheDocument();
    });

    it('submits student login credentials upon clicking sign in', async () => {
      render(
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      );

      const idInput = screen.getByLabelText(/institutional email or college id/i);
      const passInput = screen.getByLabelText(/password/i);

      fireEvent.change(idInput, { target: { value: '23341A4234@GMRIT.EDU.IN' } });
      fireEvent.change(passInput, { target: { value: 'Secret123!' } });

      const submitBtn = screen.getByRole('button', { name: /sign in as student voter/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          identifier: '23341A4234@GMRIT.EDU.IN',
          password: 'Secret123!',
        });
      });
    });

    it('displays error message if login credentials fail', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials. Please verify your identifier and password.'));

      render(
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      );

      const idInput = screen.getByLabelText(/institutional email or college id/i);
      const passInput = screen.getByLabelText(/password/i);
      fireEvent.change(idInput, { target: { value: 'UNKNOWN999' } });
      fireEvent.change(passInput, { target: { value: 'WrongPass' } });

      const submitBtn = screen.getByRole('button', { name: /sign in as student voter/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });
  });

  describe('OtpVerificationPage Workflows', () => {
    const mockSessionState = {
      session_id: 'session-uuid-123',
      college_id: 'CS2026001',
      state: 'OTP_PENDING' as const,
      channel: 'EMAIL' as const,
      destination_masked: 'a***a@campusvote.edu',
      expires_in_seconds: 300,
      resend_cooldown_seconds: 60,
      message: 'Code sent',
    };

    it('renders OTP challenge form with masked contact destination and clean inputs', () => {
      render(
        <MemoryRouter initialEntries={[{ pathname: '/login/verify', state: mockSessionState }]}>
          <OtpVerificationPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Two-Factor ID Verification')).toBeInTheDocument();
      expect(screen.getByText('a***a@campusvote.edu')).toBeInTheDocument();
      expect(screen.getByLabelText(/one-time verification code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify & enter portal/i })).toBeInTheDocument();
    });

    it('submits valid OTP and triggers authentication sync', async () => {
      const verifySpy = vi.spyOn(verificationServices, 'verifyOtpCode').mockResolvedValueOnce({
        session_id: 'session-uuid-123',
        state: 'VERIFIED',
        user: {
          id: 'user-uuid',
          username: 'cs2026001',
          email: 'aarav@campusvote.edu',
          first_name: 'Aarav',
          last_name: 'Sharma',
          full_name: 'Aarav Sharma',
          college_id: 'CS2026001',
          role: 'STUDENT',
          status: 'ACTIVE',
          display_identifier: 'CS2026001',
          is_student: true,
          is_election_admin: false,
          is_auditor: false,
          created_at: '2026-10-19T10:00:00Z',
          last_login_at: null,
        },
        message: 'Verification successful.',
      });

      render(
        <MemoryRouter initialEntries={[{ pathname: '/login/verify', state: mockSessionState }]}>
          <OtpVerificationPage />
        </MemoryRouter>
      );

      const otpInput = screen.getByLabelText(/one-time verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });

      const verifyBtn = screen.getByRole('button', { name: /verify & enter portal/i });
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(verifySpy).toHaveBeenCalledWith({
          session_id: 'session-uuid-123',
          otp: '123456',
        });
        expect(mockRefreshUser).toHaveBeenCalled();
        expect(screen.getByText(/identity verified successfully/i)).toBeInTheDocument();
      });
    });

    it('handles incorrect OTP with remaining attempts error feedback', async () => {
      vi.spyOn(verificationServices, 'verifyOtpCode').mockRejectedValueOnce({
        message: 'Incorrect verification code. 4 attempt(s) remaining.',
      });

      render(
        <MemoryRouter initialEntries={[{ pathname: '/login/verify', state: mockSessionState }]}>
          <OtpVerificationPage />
        </MemoryRouter>
      );

      const otpInput = screen.getByLabelText(/one-time verification code/i);
      fireEvent.change(otpInput, { target: { value: '000000' } });

      const verifyBtn = screen.getByRole('button', { name: /verify & enter portal/i });
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(screen.getByText(/incorrect verification code. 4 attempt\(s\) remaining/i)).toBeInTheDocument();
      });
    });

    it('displays fallback prompt when session state is missing', () => {
      render(
        <MemoryRouter initialEntries={['/login/verify']}>
          <OtpVerificationPage />
        </MemoryRouter>
      );

      expect(screen.getByText('No Active Verification Session')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to identification portal/i })).toBeInTheDocument();
    });
  });

  describe('QrScannerPage Workflows', () => {
    it('renders camera preview container and Activate Camera button', () => {
      render(
        <BrowserRouter>
          <QrScannerPage />
        </BrowserRouter>
      );

      expect(screen.getByText('Student ID QR Scanner')).toBeInTheDocument();
      expect(screen.getByText('Camera Offline')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /activate camera/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/college id or qr string/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /validate & request otp/i })).toBeInTheDocument();
    });

    it('allows manual barcode / payload fallback entry', async () => {
      const validateSpy = vi.spyOn(verificationServices, 'validateQrPayload').mockResolvedValueOnce({
        college_id: 'CS2026001',
        student_name: 'Aarav Sharma',
        department: 'Computer Science',
        academic_year: 3,
        course: 'B.Tech CS',
        destination_masked: 'a***a@campusvote.edu',
        message: 'QR validated.',
      });

      const startSpy = vi.spyOn(verificationServices, 'startCollegeIdVerification').mockResolvedValueOnce({
        session_id: 'session-uuid-123',
        college_id: 'CS2026001',
        state: 'OTP_PENDING',
        channel: 'EMAIL',
        destination_masked: 'a***a@campusvote.edu',
        expires_in_seconds: 300,
        resend_cooldown_seconds: 60,
        message: 'Code sent.',
      });

      render(
        <BrowserRouter>
          <QrScannerPage />
        </BrowserRouter>
      );

      const manualInput = screen.getByLabelText(/college id or qr string/i);
      fireEvent.change(manualInput, { target: { value: 'CS2026001' } });

      const validateBtn = screen.getByRole('button', { name: /validate & request otp/i });
      fireEvent.click(validateBtn);

      await waitFor(() => {
        expect(validateSpy).toHaveBeenCalledWith({ qr_payload: 'CS2026001' });
        expect(startSpy).toHaveBeenCalledWith({
          college_id: 'CS2026001',
          channel: 'EMAIL',
        });
      });
    });
  });
});
