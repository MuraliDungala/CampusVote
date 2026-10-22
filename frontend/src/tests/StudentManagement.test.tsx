import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StudentFormModal } from '../components/students/StudentFormModal';
import { StudentDeactivateModal } from '../components/students/StudentDeactivateModal';
import { StudentDetailModal } from '../components/students/StudentDetailModal';
import { StudentListPage } from '../pages/admin/StudentListPage';
import { RosterImportPage } from '../pages/admin/RosterImportPage';
import { Student } from '../types/student';
import * as studentServices from '../services/students';

// Mock auth context
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-uuid',
      username: 'admin_demo',
      email: 'admin@campusvote.edu',
      full_name: 'Admin User',
      role: 'ELECTION_ADMIN',
      display_identifier: 'ADMIN-001',
      is_active: true,
      mfa_enabled: false,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const mockStudent: Student = {
  id: 'student-uuid-1',
  college_id: 'CS2024001',
  full_name: 'Alice Johnson',
  email: 'alice.johnson@campus.edu',
  department: 'CSE',
  academic_year: 3,
  course: 'B.Tech CSE',
  enrollment_status: 'ENROLLED',
  enrollment_status_display: 'Enrolled / Good Standing',
  is_active: true,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  has_user_account: true,
  user_username: 'CS2024001',
};

describe('Student Form Modal Component', () => {
  it('validates required fields on empty submit', async () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <StudentFormModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        departments={['CSE', 'ECE']}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Register Student/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('College ID is required.')).toBeInTheDocument();
    expect(await screen.findByText('Full name is required.')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <StudentFormModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        departments={['CSE', 'ECE']}
      />
    );

    const emailInput = screen.getByLabelText(/Institutional Email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email-address' } });

    const submitBtn = screen.getByRole('button', { name: /Register Student/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Enter a valid institutional email address.')).toBeInTheDocument();
  });

  it('submits valid student form data with uppercase college ID', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <StudentFormModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        departments={['CSE', 'ECE']}
      />
    );

    fireEvent.change(screen.getByLabelText(/College ID/i), { target: { value: 'cs2024999' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Bob Smith' } });
    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'bob@campus.edu' },
    });

    const submitBtn = screen.getByRole('button', { name: /Register Student/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          college_id: 'CS2024999',
          full_name: 'Bob Smith',
          email: 'bob@campus.edu',
          department: 'CSE',
          academic_year: 1,
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

describe('Student Deactivate Modal Component', () => {
  it('renders confirmation text and allows reason input', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <StudentDeactivateModal
        student={mockStudent}
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByText(/Are you sure you want to deactivate Alice Johnson/i)).toBeInTheDocument();
    expect(screen.getByText(/disqualify the student from voting/i)).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/Reason for Deactivation/i);
    fireEvent.change(reasonInput, { target: { value: 'Academic transfer' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Deactivation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith('student-uuid-1', 'Academic transfer');
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

describe('Student Detail Modal Component', () => {
  it('displays demographic fields and linked account information', () => {
    const handleEdit = vi.fn();
    const handleDeactivate = vi.fn();
    const handleClose = vi.fn();

    render(
      <StudentDetailModal
        student={mockStudent}
        isOpen={true}
        onClose={handleClose}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
      />
    );

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('CS2024001')).toBeInTheDocument();
    expect(screen.getByText('alice.johnson@campus.edu')).toBeInTheDocument();
    expect(screen.getByText('Year 3')).toBeInTheDocument();
    expect(screen.getByText('Active Voter Record')).toBeInTheDocument();
    expect(screen.getByText('Linked (CS2024001)')).toBeInTheDocument();
  });
});

describe('Admin Student List Page', () => {
  beforeEach(() => {
    vi.spyOn(studentServices, 'getStudentSummary').mockResolvedValue({
      total_students: 1,
      active_students: 1,
      inactive_students: 0,
      by_department: { CSE: 1 },
      by_academic_year: { '3': 1 },
      by_enrollment_status: { ENROLLED: 1 },
      supported_departments: ['CSE', 'ECE', 'MECH'],
    });

    vi.spyOn(studentServices, 'getStudents').mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockStudent],
    });
  });

  it('renders student list table, metrics, and search input', async () => {
    render(
      <BrowserRouter>
        <StudentListPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Student Registry & Roster Management/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('CS2024001')).toBeInTheDocument();
      expect(screen.getByText('B.Tech CSE')).toBeInTheDocument();
    });

    // Verify search input is present
    const searchInput = screen.getByPlaceholderText(/Search by student name or college ID/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('renders empty state when no students match', async () => {
    vi.spyOn(studentServices, 'getStudents').mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    render(
      <BrowserRouter>
        <StudentListPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No Student Records Found')).toBeInTheDocument();
    });
  });
});

describe('Admin Roster Import Page', () => {
  it('renders file selection area and enforces CSV format', async () => {
    render(
      <BrowserRouter>
        <RosterImportPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/CSV Student Roster Import/i)).toBeInTheDocument();
    expect(screen.getByText(/Download CSV Template/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1: Select Registrar CSV File/i)).toBeInTheDocument();
  });
});
