import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PositionModal } from '../components/elections/PositionModal';
import { NominationModal } from '../components/elections/NominationModal';
import { NominationReviewModal } from '../components/elections/NominationReviewModal';
import { AdminElectionListPage } from '../pages/admin/AdminElectionListPage';
import { CreateElectionWizard } from '../pages/admin/CreateElectionWizard';
import { StudentNominationsPage } from '../pages/student/StudentNominationsPage';
import { Election, ElectionPosition, Candidate } from '../types/election';
import * as electionServices from '../services/elections';

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

const mockElection: Election = {
  id: 'elec-uuid-1',
  title: 'Student Government 2026-2027',
  description: 'Annual election for executive council',
  academic_year: '2026-2027',
  start_time: '2026-11-01T09:00:00Z',
  end_time: '2026-11-04T18:00:00Z',
  status: 'SCHEDULED',
  status_display: 'Scheduled',
  positions_count: 2,
  candidates_count: 4,
  approved_candidates_count: 2,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  published_at: null,
  archived_at: null,
};

const mockPosition: ElectionPosition = {
  id: 'pos-uuid-1',
  election: 'elec-uuid-1',
  title: 'President',
  description: 'Chief executive officer',
  display_order: 1,
  maximum_candidates: 5,
  candidates_count: 2,
  approved_candidates_count: 1,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

const mockCandidate: Candidate = {
  id: 'cand-uuid-1',
  student_id: 'student-uuid-1',
  student_college_id: 'CS2026001',
  student_name: 'Alice Johnson',
  department: 'CSE',
  academic_year: 3,
  enrollment_status: 'ENROLLED',
  election_position: 'pos-uuid-1',
  position_title: 'President',
  election_id: 'elec-uuid-1',
  election_title: 'Student Government 2026-2027',
  manifesto: 'Transparency, academic integrity, and student welfare.',
  profile_image: null,
  status: 'SUBMITTED',
  submitted_at: '2026-10-19T11:00:00Z',
  reviewed_at: null,
  reviewed_by_username: null,
  rejection_reason: null,
  eligibility_snapshot: {
    is_eligible: true,
    reason: 'Student satisfies all institutional eligibility criteria.',
    rule_title: 'Senior CSE Rule',
  },
  created_at: '2026-10-19T11:00:00Z',
  updated_at: '2026-10-19T11:00:00Z',
};

describe('Phase 3 Position Modal', () => {
  it('validates empty position title', async () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <PositionModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        currentPositionsCount={2}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Add Position/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Position title is required.')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits valid position data', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <PositionModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        currentPositionsCount={2}
      />
    );

    fireEvent.change(screen.getByLabelText(/Position Title/i), {
      target: { value: 'General Secretary' },
    });
    fireEvent.change(screen.getByLabelText(/Mandate \/ Responsibilities/i), {
      target: { value: 'Council administrative coordination' },
    });

    const submitBtn = screen.getByRole('button', { name: /Add Position/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'General Secretary',
          description: 'Council administrative coordination',
          display_order: 3,
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

describe('Phase 3 Nomination Modal', () => {
  it('validates required manifesto before nomination submission', async () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <NominationModal
        isOpen={true}
        onClose={handleClose}
        position={mockPosition}
        electionTitle="Student Government"
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Submit Nomination/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/manifesto or vision statement is required/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits candidate nomination with entered platform', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <NominationModal
        isOpen={true}
        onClose={handleClose}
        position={mockPosition}
        electionTitle="Student Government"
        onSubmit={handleSubmit}
      />
    );

    const manifestoInput = screen.getByLabelText(/Campaign Manifesto/i);
    fireEvent.change(manifestoInput, {
      target: { value: 'Promoting student health and lab improvements.' },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Nomination/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          manifesto: 'Promoting student health and lab improvements.',
          submit_now: true,
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

describe('Phase 3 Nomination Review Modal', () => {
  it('displays candidate details and eligibility evaluation snapshot', () => {
    render(
      <NominationReviewModal
        isOpen={true}
        onClose={vi.fn()}
        candidate={mockCandidate}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText(/Alice Johnson/i)).toBeInTheDocument();
    expect(screen.getByText(/CS2026001/i)).toBeInTheDocument();
    expect(screen.getByText('President')).toBeInTheDocument();
    expect(screen.getByText(/Student satisfies all institutional eligibility criteria/i)).toBeInTheDocument();
    expect(screen.getByText(/Transparency, academic integrity, and student welfare/i)).toBeInTheDocument();
  });

  it('calls onApprove when Approve Candidate button is clicked', async () => {
    const handleApprove = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <NominationReviewModal
        isOpen={true}
        onClose={handleClose}
        candidate={mockCandidate}
        onApprove={handleApprove}
        onReject={vi.fn()}
      />
    );

    const approveBtn = screen.getByRole('button', { name: /Approve Candidate/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(handleApprove).toHaveBeenCalledWith('cand-uuid-1');
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('requires rejection reason when rejecting nomination', async () => {
    const handleReject = vi.fn().mockResolvedValue(undefined);

    render(
      <NominationReviewModal
        isOpen={true}
        onClose={vi.fn()}
        candidate={mockCandidate}
        onApprove={vi.fn()}
        onReject={handleReject}
      />
    );

    // Click initial reject button to toggle reason textarea
    fireEvent.click(screen.getByRole('button', { name: /Reject\.\.\./i }));

    // Click confirm rejection with empty textarea
    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmRejectBtn);

    expect(await screen.findByText('A rejection reason is mandatory.')).toBeInTheDocument();
    expect(handleReject).not.toHaveBeenCalled();

    // Fill reason and submit
    const reasonInput = screen.getByLabelText(/Reason for Rejection/i);
    fireEvent.change(reasonInput, { target: { value: 'Academic probation' } });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(handleReject).toHaveBeenCalledWith('cand-uuid-1', 'Academic probation');
    });
  });
});

describe('Phase 3 Admin Election List Page', () => {
  beforeEach(() => {
    vi.spyOn(electionServices, 'getElectionSummary').mockResolvedValue({
      total_elections: 1,
      draft_elections: 0,
      scheduled_elections: 1,
      active_elections: 0,
      closed_elections: 0,
      results_published_elections: 0,
      archived_elections: 0,
      cancelled_elections: 0,
      pending_nominations: 1,
      approved_candidates: 1,
    });

    vi.spyOn(electionServices, 'getElections').mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockElection],
    });
  });

  it('renders elections table, metric summary cards, and search input', async () => {
    render(
      <BrowserRouter>
        <AdminElectionListPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Collegiate Elections Governance/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Student Government 2026-2027')).toBeInTheDocument();
      expect(screen.getByText('2 Offices')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search elections by title/i);
    expect(searchInput).toBeInTheDocument();
  });
});

describe('Phase 3 Create Election Wizard', () => {
  it('enforces required title on step 1 before proceeding to schedule', async () => {
    render(
      <BrowserRouter>
        <CreateElectionWizard />
      </BrowserRouter>
    );

    expect(screen.getByText(/Step 1: Basic Information/i)).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /Next Step/i });
    fireEvent.click(nextBtn);

    expect(await screen.findByText('Election title is required.')).toBeInTheDocument();
  });
});

describe('Phase 3 Student Nominations Page', () => {
  it('renders student nominations list and eligibility status', async () => {
    vi.spyOn(electionServices, 'getMyNominations').mockResolvedValue([mockCandidate]);

    render(
      <BrowserRouter>
        <StudentNominationsPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/My Candidate Nominations/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Student Government 2026-2027')).toBeInTheDocument();
      expect(screen.getByText('President')).toBeInTheDocument();
      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
      expect(screen.getByText(/Student satisfies all institutional eligibility criteria/i)).toBeInTheDocument();
    });
  });
});
