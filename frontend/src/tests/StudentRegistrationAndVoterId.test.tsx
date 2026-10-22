import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { RegisterPage, ACADEMIC_DEPARTMENTS } from '../pages/public/RegisterPage';
import { SmartVoterCard } from '../components/students/SmartVoterCard';
import * as authServices from '../services/auth';
import { VoterIdCardData } from '../services/students';

// Mock qrcode library
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQrCodeDataUrl'),
    toCanvas: vi.fn().mockImplementation((_canvas: unknown, _text: unknown, _options: unknown, callback?: (err: Error | null) => void) => {
      if (callback) callback(null);
      return Promise.resolve();
    }),
  },
}));

describe('Student Self-Service Registration Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration form with College Name, College ID, and expanded Department options', () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Student Voter Registration')).toBeInTheDocument();
    expect(screen.getByText(/institutional identity matching/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/college name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/institutional college id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/institutional email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/academic department/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/academic year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^account password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete registration/i })).toBeInTheDocument();

    // Verify all 8 specified departments + Other are in the select dropdown
    const deptSelect = screen.getByLabelText(/academic department/i) as HTMLSelectElement;
    expect(deptSelect.options.length).toBe(9);
    expect(ACADEMIC_DEPARTMENTS).toContain('Computer Science and Engineering');
    expect(ACADEMIC_DEPARTMENTS).toContain('Artificial Intelligence and Machine Learning');
    expect(ACADEMIC_DEPARTMENTS).toContain('Data Science');
    expect(ACADEMIC_DEPARTMENTS).toContain('Electronics and Communication Engineering');
    expect(ACADEMIC_DEPARTMENTS).toContain('Electrical and Electronics Engineering');
    expect(ACADEMIC_DEPARTMENTS).toContain('Mechanical Engineering');
    expect(ACADEMIC_DEPARTMENTS).toContain('Civil Engineering');
    expect(ACADEMIC_DEPARTMENTS).toContain('Information Technology');
    expect(ACADEMIC_DEPARTMENTS).toContain('Other');
  });

  it('validates missing College Name on frontend before API call', async () => {
    const registerSpy = vi.spyOn(authServices, 'registerStudent');

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Rohan Sharma' },
    });
    // Leave College Name empty
    fireEvent.change(screen.getByLabelText(/institutional college id/i), {
      target: { value: '23341A4234' },
    });
    fireEvent.change(screen.getByLabelText(/institutional email address/i), {
      target: { value: 'rohan@gmrit.edu.in' },
    });
    fireEvent.change(screen.getByLabelText(/^account password/i), {
      target: { value: 'SecurePass123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));

    expect(screen.getByText(/please enter your college or institution name/i)).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('displays Enter Department Name field when Other is selected and requires input', async () => {
    const registerSpy = vi.spyOn(authServices, 'registerStudent');

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Rohan Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/college name/i), {
      target: { value: 'GMR Institute of Technology' },
    });
    fireEvent.change(screen.getByLabelText(/institutional college id/i), {
      target: { value: '23341A4234' },
    });
    fireEvent.change(screen.getByLabelText(/institutional email address/i), {
      target: { value: 'rohan@gmrit.edu.in' },
    });

    // Select Other
    const deptSelect = screen.getByLabelText(/academic department/i);
    fireEvent.change(deptSelect, { target: { value: 'Other' } });

    // The custom department field should now appear
    expect(screen.getByLabelText(/enter department name/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^account password/i), {
      target: { value: 'SecurePass123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'SecurePass123!' },
    });

    // Submitting without entering custom department name should trigger validation
    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));

    expect(screen.getByText(/please enter your department name/i)).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();

    // Now fill the custom department name
    fireEvent.change(screen.getByLabelText(/enter department name/i), {
      target: { value: 'Chemical Engineering' },
    });

    registerSpy.mockResolvedValueOnce({
      status: 'VERIFIED',
      message: 'Student record matched institutional roster. Account activated.',
      full_name: 'Rohan Sharma',
      college_id: '23341A4234',
      college_name: 'GMR Institute of Technology',
      is_verified: true,
    });

    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          college_name: 'GMR Institute of Technology',
          department: 'Chemical Engineering',
          custom_department: 'Chemical Engineering',
        })
      );
      expect(screen.getByText('Registration Verified!')).toBeInTheDocument();
    });
  });

  it('clears custom department field when switching from Other back to a predefined department', () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    const deptSelect = screen.getByLabelText(/academic department/i);
    fireEvent.change(deptSelect, { target: { value: 'Other' } });

    const customDeptInput = screen.getByLabelText(/enter department name/i) as HTMLInputElement;
    fireEvent.change(customDeptInput, { target: { value: 'Biotechnology' } });
    expect(customDeptInput.value).toBe('Biotechnology');

    // Switch back to Computer Science and Engineering
    fireEvent.change(deptSelect, { target: { value: 'Computer Science and Engineering' } });

    // Custom field should be hidden
    expect(screen.queryByLabelText(/enter department name/i)).not.toBeInTheDocument();
  });

  it('submits valid registration and displays verified screen with College Name', async () => {
    vi.spyOn(authServices, 'registerStudent').mockResolvedValueOnce({
      status: 'VERIFIED',
      message: 'Student record matched institutional roster. Account activated.',
      full_name: 'Rohan Sharma',
      college_id: '23341A4234',
      college_name: 'GMR Institute of Technology',
      is_verified: true,
    });

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Rohan Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/college name/i), {
      target: { value: 'GMR Institute of Technology' },
    });
    fireEvent.change(screen.getByLabelText(/institutional college id/i), {
      target: { value: '23341A4234' },
    });
    fireEvent.change(screen.getByLabelText(/institutional email address/i), {
      target: { value: 'rohan@gmrit.edu.in' },
    });
    fireEvent.change(screen.getByLabelText(/^account password/i), {
      target: { value: 'SecurePass123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));

    await waitFor(() => {
      expect(screen.getByText('Registration Verified!')).toBeInTheDocument();
      expect(screen.getByText('GMR Institute of Technology')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /proceed to login/i })).toBeInTheDocument();
    });
  });

  it('safely handles unexpected HTML or server error without rendering raw HTML', async () => {
    vi.spyOn(authServices, 'registerStudent').mockRejectedValueOnce({
      status: 404,
      message: '<!DOCTYPE html><html><body><h1>Page Not Found</h1><p>Debug info...</p></body></html>',
    });

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rohan Sharma' } });
    fireEvent.change(screen.getByLabelText(/college name/i), { target: { value: 'GMR Institute of Technology' } });
    fireEvent.change(screen.getByLabelText(/institutional college id/i), { target: { value: '23341A4234' } });
    fireEvent.change(screen.getByLabelText(/institutional email address/i), { target: { value: 'rohan@gmrit.edu.in' } });
    fireEvent.change(screen.getByLabelText(/^account password/i), { target: { value: 'SecurePass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'SecurePass123!' } });

    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));

    await waitFor(() => {
      // Must NOT display any HTML tags or DOCTYPE
      expect(screen.queryByText(/<!doctype/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/<h1>/i)).not.toBeInTheDocument();
      // Should display a clean fallback error
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/registration service endpoint is currently unreachable/i)).toBeInTheDocument();
    });
  });
});

describe('Smart Voter ID Card Component', () => {
  const mockCardData: VoterIdCardData = {
    id: 'voter-uuid-1',
    voter_id_number: 'CV-2026-A1B2C3D4',
    qr_payload: 'CVV1:CV-2026-A1B2C3D4:STU-001:SIG123',
    student_name: 'Priya Patel',
    college_id: 'CS2026042',
    college_name: 'GMR Institute of Technology',
    department: 'Computer Science and Engineering',
    academic_year: 3,
    enrollment_status: 'ACTIVE',
    enrollment_status_display: 'Active Enrolled',
    issued_at: '2026-10-20T12:00:00Z',
    is_active: true,
  };

  it('renders student details, verified college name, unique voter ID, and CampusVote credential branding', () => {
    render(<SmartVoterCard cardData={mockCardData} />);

    expect(screen.getAllByText(/campusvote/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Priya Patel')).toBeInTheDocument();
    expect(screen.getAllByText(/GMR Institute of Technology/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/CS2026042/)).toBeInTheDocument();
    expect(screen.getByText(/CV-2026-A1B2C3D4/)).toBeInTheDocument();
    expect(screen.getByText(/Active Credential/i)).toBeInTheDocument();
    expect(screen.getByText(/DIGITAL CREDENTIAL/i)).toBeInTheDocument();
  });

  it('provides Download Voter ID PNG and Print buttons', () => {
    render(<SmartVoterCard cardData={mockCardData} />);

    const downloadBtn = screen.getByRole('button', { name: /download voter id/i });
    const printBtn = screen.getByRole('button', { name: /print/i });

    expect(downloadBtn).toBeInTheDocument();
    expect(printBtn).toBeInTheDocument();
  });
});
