import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QrScannerPage } from '../pages/public/QrScannerPage';
import { SmartVoterCard } from '../components/students/SmartVoterCard';
import { VoterIdCardData } from '../services/students';
import * as verificationServices from '../services/verification';

// Mock html5-qrcode
vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockRejectedValue(new Error('NotFoundError: Requested device not found')),
      stop: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      scanFile: vi.fn().mockResolvedValue('CS2026001'),
      isScanning: false,
    })),
    Html5QrcodeSupportedFormats: {
      QR_CODE: 0,
      CODE_128: 1,
      CODE_39: 2,
      EAN_13: 3,
      EAN_8: 4,
      UPC_A: 5,
      UPC_E: 6,
      ITF: 7,
    },
  };
});

describe('QR Scanner Page Lifecycle and Reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. loads without blank page and displays Camera Offline state initially', () => {
    render(
      <BrowserRouter>
        <QrScannerPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Student ID QR Scanner')).toBeInTheDocument();
    expect(screen.getByText('Camera Offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activate camera scanner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /live camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manual entry/i })).toBeInTheDocument();
  });

  it('2. handles camera startup failure gracefully with friendly error and retry button without crashing', async () => {
    render(
      <BrowserRouter>
        <QrScannerPage />
      </BrowserRouter>
    );

    const activateBtn = screen.getByRole('button', { name: /activate camera scanner/i });
    fireEvent.click(activateBtn);

    await waitFor(() => {
      // Must not be blank, must show readable error
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText(/no camera found on this device|camera access is not supported/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry camera/i })).toBeInTheDocument();
    });
  });

  it('3. allows switching to Upload Photo mode', () => {
    render(
      <BrowserRouter>
        <QrScannerPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /upload photo/i }));
    expect(screen.getByText('Upload ID Card Image')).toBeInTheDocument();
    expect(screen.getByText(/choose photo file/i)).toBeInTheDocument();
  });

  it('4. preserves manual entry fallback and Demo ID helper', async () => {
    vi.spyOn(verificationServices, 'validateQrPayload').mockResolvedValue({
      college_id: 'CS2026001',
      student_name: 'Aarav Sharma',
      department: 'Computer Science',
      academic_year: 3,
      course: 'B.Tech CS',
      destination_masked: 'a***a@campusvote.edu',
      message: 'QR validated.',
    });

    const startSpy = vi.spyOn(verificationServices, 'startCollegeIdVerification').mockResolvedValue({
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

    // Type manual payload and submit
    const input = screen.getByLabelText(/college id or qr string/i);
    fireEvent.change(input, { target: { value: 'CS2026001' } });

    const submitBtn = screen.getByRole('button', { name: /validate & request otp/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith({
        college_id: 'CS2026001',
        channel: 'EMAIL',
      });
    });
  });
});

describe('Digital Voter ID Self-Service and Unverified Institution Labeling', () => {
  it('5. labels card "Institution Not Independently Verified" when enrollment is pending', () => {
    const pendingCardData: VoterIdCardData = {
      id: 'voter-uuid-unverified',
      voter_id_number: 'CV-2026-PENDING1',
      qr_payload: 'CVV1:CV-2026-PENDING1:STU-999:SIG456',
      student_name: 'Dev Student',
      college_id: 'CS2026999',
      college_name: 'Apex Technical University',
      department: 'Data Science',
      academic_year: 2,
      enrollment_status: 'PENDING',
      enrollment_status_display: 'Pending Verification',
      issued_at: '2026-10-20T12:00:00Z',
      is_active: true,
    };

    render(<SmartVoterCard cardData={pendingCardData} />);

    // Must clearly state Institution Not Independently Verified
    expect(
      screen.getAllByText(/institution not independently verified/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Dev Student')).toBeInTheDocument();
    expect(screen.getAllByText(/Apex Technical University/i).length).toBeGreaterThan(0);
    expect(screen.getByText('CV-2026-PENDING1')).toBeInTheDocument();
  });

  it('6. labels verified card as official credential when roster is confirmed', () => {
    const verifiedCardData: VoterIdCardData = {
      id: 'voter-uuid-verified',
      voter_id_number: 'CV-2026-VERIFIED1',
      qr_payload: 'CVV1:CV-2026-VERIFIED1:STU-100:SIG789',
      student_name: 'Rohan Verma',
      college_id: 'CS2026100',
      college_name: 'GMR Institute of Technology',
      department: 'Computer Science and Engineering',
      academic_year: 4,
      enrollment_status: 'ENROLLED',
      enrollment_status_display: 'Enrolled Active',
      issued_at: '2026-10-20T12:00:00Z',
      is_active: true,
    };

    render(<SmartVoterCard cardData={verifiedCardData} />);

    expect(screen.getByText('Verified Roster')).toBeInTheDocument();
    expect(screen.getByText('Smart ID Collegiate Voter Credential')).toBeInTheDocument();
  });
});
