import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ElectionResultsDashboard } from '../pages/admin/ElectionResultsDashboard';
import { PublicElectionResultsPage } from '../pages/public/PublicElectionResultsPage';
import * as resultsService from '../services/results';
import * as electionsService from '../services/elections';
import {
  ElectionResultDetail,
  ElectionResultListItem,
  PublicElectionResult,
  ResultVerificationDetails,
  CandidateTallyItem,
  PositionResultItem
} from '../types/results';

// Mock AuthContext
let mockCurrentUser = {
  id: 'usr-admin-01',
  username: 'admin_officer',
  email: 'admin_officer@campus.edu',
  role: 'ELECTION_ADMIN',
  is_verified: true,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    isAuthenticated: true,
    isLoading: false,
    error: null,
  }),
}));

// Mock results services
vi.mock('../services/results', () => ({
  getElectionResults: vi.fn(),
  getElectionResultDetail: vi.fn(),
  calculateResults: vi.fn(),
  getResultVerification: vi.fn(),
  submitResultReview: vi.fn(),
  approveResult: vi.fn(),
  publishResult: vi.fn(),
  getResultAudit: vi.fn(),
  exportResultReport: vi.fn(),
  getPublicElectionResults: vi.fn(),
}));

// Mock elections services
vi.mock('../services/elections', () => ({
  getElection: vi.fn(),
}));

const mockElection = {
  id: 'elec-uuid-100',
  title: 'Annual Student Government Election 2026',
  description: 'Annual campuswide leadership election',
  status: 'CLOSED',
  status_display: 'Closed',
  academic_year: '2025-2026',
  start_time: '2026-10-18T08:00:00Z',
  end_time: '2026-10-19T18:00:00Z',
};

const mockResultItem: ElectionResultListItem = {
  id: 'res-uuid-001',
  election: 'elec-uuid-100',
  version: 1,
  is_synthetic: true,
  tally_source_type: 'SYNTHETIC_DEVELOPMENT',
  tally_source_display: 'Synthetic Demonstration Provider',
  status: 'UNDER_REVIEW',
  lifecycle_status: 'UNDER_REVIEW',
  status_display: 'Under Review',
  total_ballots_tallied: 120,
  total_abstentions: 0,
  total_positions_tallied: 2,
  integrity_status: 'PASSED',
  reconciliation_status: 'NOT_VERIFIABLE',
  result_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  calculated_by_email: 'admin_officer@campus.edu',
  created_at: '2026-10-20T10:00:00Z',
  published_at: null,
};

const mockPresidentCandidates: CandidateTallyItem[] = [
  {
    candidate_id: 'cand-001',
    candidate_name: 'Jane Doe',
    vote_count: 75,
    vote_percentage: 62.5,
    rank: 1,
    is_winner: true,
    is_tied: false,
  },
  {
    candidate_id: 'cand-002',
    candidate_name: 'John Smith',
    vote_count: 45,
    vote_percentage: 37.5,
    rank: 2,
    is_winner: false,
    is_tied: false,
  },
];

const mockVPCandidates: CandidateTallyItem[] = [
  {
    candidate_id: 'cand-003',
    candidate_name: 'Alice Wonder',
    vote_count: 50,
    vote_percentage: 50.0,
    rank: 1,
    is_winner: false,
    is_tied: true,
  },
  {
    candidate_id: 'cand-004',
    candidate_name: 'Bob Builder',
    vote_count: 50,
    vote_percentage: 50.0,
    rank: 1,
    is_winner: false,
    is_tied: true,
  },
];

const mockPositionResults: PositionResultItem[] = [
  {
    position_id: 'pos-101',
    position_title: 'President',
    total_votes_cast: 120,
    abstention_count: 0,
    is_tied: false,
    winner_candidate_id: 'cand-001',
    winner_candidate_name: 'Jane Doe',
    candidate_tallies: mockPresidentCandidates,
    candidates: mockPresidentCandidates,
  },
  {
    position_id: 'pos-102',
    position_title: 'Vice President',
    total_votes_cast: 100,
    abstention_count: 20,
    is_tied: true,
    tie_details: {
      tied_vote_count: 50,
      tied_candidates: [
        { candidate_id: 'cand-003', candidate_name: 'Alice Wonder' },
        { candidate_id: 'cand-004', candidate_name: 'Bob Builder' },
      ],
      resolution_required: true,
    },
    candidate_tallies: mockVPCandidates,
    candidates: mockVPCandidates,
  },
];

const mockResultDetail: ElectionResultDetail = {
  id: 'res-uuid-001',
  election: 'elec-uuid-100',
  election_title: 'Annual Student Government Election 2026',
  version: 1,
  is_synthetic: true,
  tally_source_type: 'SYNTHETIC_DEVELOPMENT',
  tally_source_display: 'Synthetic Demonstration Provider',
  status: 'UNDER_REVIEW',
  lifecycle_status: 'UNDER_REVIEW',
  status_display: 'Under Review',
  total_ballots_tallied: 120,
  total_abstentions: 20,
  total_positions_tallied: 2,
  integrity_status: 'PASSED',
  integrity_details: {
    total_inspected: 120,
    valid_count: 120,
    invalid_count: 0,
  },
  reconciliation_status: 'NOT_VERIFIABLE',
  reconciliation_details: {
    checked_in_voters_count: 120,
    cast_ballots_tallied: 120,
    variance: 0,
    explanation: 'Participation records and anonymous ballots remain cryptographically unlinked to preserve student privacy.',
  },
  publication_blockers: ['Result must be APPROVED by governance reviewers before publication.'],
  result_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  aggregate_snapshot: {},
  calculated_by_email: 'admin_officer@campus.edu',
  position_results: mockPositionResults,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
};

const mockVerification: ResultVerificationDetails = {
  result_id: 'res-uuid-001',
  version: 1,
  status: 'UNDER_REVIEW',
  lifecycle_status: 'UNDER_REVIEW',
  is_synthetic: true,
  tally_source_type: 'SYNTHETIC_DEVELOPMENT',
  stored_result_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  recomputed_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  reproducibility: true,
  reproducibility_verified: true,
  integrity_status: 'PASSED',
  integrity_details: {
    total_inspected: 120,
    valid_count: 120,
    invalid_count: 0,
  },
  reconciliation_status: 'NOT_VERIFIABLE',
  reconciliation_details: {
    checked_in_voters_count: 120,
    cast_ballots_tallied: 120,
    variance: 0,
    explanation: 'Participation records and anonymous ballots remain cryptographically unlinked to preserve student privacy.',
  },
  publication_blockers: ['Result must be APPROVED by governance reviewers before publication.'],
  publication_eligible: false,
  is_publication_eligible: false,
  integrity_verification_status: 'PASSED',
};

const mockPublicResult: PublicElectionResult = {
  id: 'res-uuid-001',
  version: 1,
  election_id: 'elec-uuid-100',
  election_title: 'Annual Student Government Election 2026',
  academic_year: '2025-2026',
  published_at: '2026-10-20T11:00:00Z',
  is_synthetic: true,
  result_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  total_ballots_tallied: 120,
  total_abstentions: 20,
  total_positions_tallied: 2,
  position_results: mockPositionResults,
};

describe('Phase 8: Election Results Management & Verification Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    mockCurrentUser = {
      id: 'usr-admin-01',
      username: 'admin_officer',
      email: 'admin_officer@campus.edu',
      role: 'ELECTION_ADMIN',
      is_verified: true,
    };
    vi.mocked(electionsService.getElection).mockResolvedValue(mockElection as any);
    vi.mocked(resultsService.getElectionResults).mockResolvedValue({
      election_id: 'elec-uuid-100',
      election_title: 'Annual Student Government Election 2026',
      election_status: 'CLOSED',
      total_versions: 1,
      results: [mockResultItem],
    });
    vi.mocked(resultsService.getElectionResultDetail).mockResolvedValue(mockResultDetail);
    vi.mocked(resultsService.getResultVerification).mockResolvedValue(mockVerification);
    vi.mocked(resultsService.getResultAudit).mockResolvedValue({
      result_id: 'res-uuid-001',
      version: 1,
      total_events: 0,
      events: [],
    });
  });

  it('1. renders admin results dashboard with overview metrics and synthetic demo banner', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Annual Student Government Election 2026 — Results/i)).toBeInTheDocument();
    });

    // Check synthetic banner
    expect(screen.getByText('SYNTHETIC DEMO')).toBeInTheDocument();

    // Check summary metric cards
    expect(screen.getAllByText('120').length).toBeGreaterThan(0); // Ballots Tallied
    expect(screen.getByText('v1')).toBeInTheDocument(); // Version button
  });

  it('2. displays candidate tallies, rankings, percentages, and tie alert', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('President')).toBeInTheDocument();
    });

    // President position checks
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('62.5%')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();

    // Vice President tie checks
    expect(screen.getByText('Vice President')).toBeInTheDocument();
    expect(screen.getByText('TIE DETECTED')).toBeInTheDocument();
    expect(screen.getByText('Alice Wonder')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
  });

  it('3. renders integrity verification tab with reproducibility, digest, and reconciliation status', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verification & Publication Gates/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Verification & Publication Gates/i }));

    await waitFor(() => {
      expect(screen.getByText('Result Canonical Digest & Reproducibility')).toBeInTheDocument();
    });

    // Digest displayed
    expect(screen.getAllByText(/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855/).length).toBeGreaterThan(0);
    // Ballot integrity passed
    expect(screen.getByText('REPRODUCIBLE')).toBeInTheDocument();
    // Reconciliation is NOT_VERIFIABLE to preserve privacy
    expect(screen.getByText('NOT_VERIFIABLE')).toBeInTheDocument();
    expect(screen.getByText(/Participation records and anonymous ballots remain cryptographically unlinked/i)).toBeInTheDocument();
  });

  it('4. blocks publication when unapproved and shows publication blockers', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verification & Publication Gates/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Verification & Publication Gates/i }));

    // Publication blocker displayed
    await waitFor(() => {
      expect(screen.getByText(/Result must be APPROVED by governance reviewers before publication/i)).toBeInTheDocument();
    });

    // Switch to Governance tab
    fireEvent.click(screen.getByRole('button', { name: /Review & Governance/i }));

    // Publish Results Publicly button should be disabled because result is not APPROVED
    const publishButton = screen.getByRole('button', { name: /Publish Results Publicly/i });
    expect(publishButton).toBeDisabled();
  });

  it('5. opens review modal and requires rejection reason when rejecting a result', async () => {
    vi.mocked(resultsService.submitResultReview).mockResolvedValue({
      id: 'res-uuid-001',
      status: 'REJECTED',
    } as any);

    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Review & Governance/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Review & Governance/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Review Decision/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Review Decision/i }));

    await waitFor(() => {
      expect(screen.getByText('Record formal peer review of calculated tallies, tie statuses, and integrity checks.')).toBeInTheDocument();
    });

    // Select Reject
    const rejectRadio = screen.getByLabelText(/Reject Calculation/i);
    fireEvent.click(rejectRadio);

    // Rejection reason input should now be visible
    expect(screen.getByText(/Review Notes/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Submit Decision/i });
    // Attempting submit without reason
    fireEvent.click(submitBtn);

    // Should not call service yet without reason
    expect(resultsService.submitResultReview).not.toHaveBeenCalled();

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/Mandatory reason for rejection/i);
    fireEvent.change(reasonInput, { target: { value: 'Discrepancy in position definitions detected.' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(resultsService.submitResultReview).toHaveBeenCalledWith(
        'elec-uuid-100',
        'res-uuid-001',
        'REJECTED',
        'Discrepancy in position definitions detected.'
      );
    });
  });

  it('6. triggers CSV report export when Export CSV button is clicked', async () => {
    vi.mocked(resultsService.exportResultReport).mockResolvedValue(new Blob(['test,csv'], { type: 'text/csv' }));

    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/admin/elections/:id/results" element={<ElectionResultsDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

    await waitFor(() => {
      expect(resultsService.exportResultReport).toHaveBeenCalledWith('elec-uuid-100', 'res-uuid-001');
    });
  });

  it('7. renders public election results page when results are published', async () => {
    vi.mocked(resultsService.getPublicElectionResults).mockResolvedValue(mockPublicResult);

    render(
      <MemoryRouter initialEntries={['/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/elections/:id/results" element={<PublicElectionResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Annual Student Government Election 2026')).toBeInTheDocument();
    });

    // Check official badge and synthetic badge
    expect(screen.getByText('OFFICIAL PUBLISHED RESULTS')).toBeInTheDocument();
    expect(screen.getByText('SYNTHETIC DEMONSTRATION DATA')).toBeInTheDocument();

    // Check candidate cards
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('62.5%')).toBeInTheDocument();
    expect(screen.getByText('Official Winner')).toBeInTheDocument();

    // Check vice president tie badge
    expect(screen.getAllByText('Tied for #1').length).toBe(2);
  });

  it('8. renders public election results empty state when results are not yet published', async () => {
    vi.mocked(resultsService.getPublicElectionResults).mockRejectedValue({ status: 404, message: 'Not found' });

    render(
      <MemoryRouter initialEntries={['/elections/elec-uuid-100/results']}>
        <Routes>
          <Route path="/elections/:id/results" element={<PublicElectionResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Official Results Not Yet Published')).toBeInTheDocument();
    });

    expect(screen.getByText(/Official vote tallies have not yet been approved and certified/i)).toBeInTheDocument();
  });
});
