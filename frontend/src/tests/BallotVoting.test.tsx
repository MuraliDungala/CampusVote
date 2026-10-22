import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BallotPage } from '../pages/student/BallotPage';
import * as votingService from '../services/voting';
import { BallotDefinition, BallotSubmissionResponse } from '../types/voting';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-stu-01',
      username: 'student1',
      email: 'stu1@univ.edu',
      role: 'STUDENT',
      college_id: 'STU-2026-001',
      is_verified: true,
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  }),
}));

// Mock voting services
vi.mock('../services/voting', () => ({
  fetchBallotDefinition: vi.fn(),
  submitBallot: vi.fn(),
  validateBallotSelections: vi.fn(),
  fetchParticipationStatus: vi.fn(),
}));

const mockActiveBallot: BallotDefinition = {
  election: {
    id: 'elec-123',
    title: 'Spring 2026 Student Government Election',
    description: 'Elect executive representatives for the upcoming academic year.',
    academic_year: '2025-2026',
    start_time: '2026-01-01T00:00:00Z',
    end_time: '2026-12-31T23:59:59Z',
    status: 'ACTIVE',
    is_open: true,
  },
  positions: [
    {
      id: 'pos-1',
      title: 'Student Body President',
      description: 'Chief executive of the student body.',
      display_order: 1,
      maximum_candidates: 1,
      allow_abstain: true,
      candidate_count: 2,
      candidates: [
        {
          id: 'cand-1',
          full_name: 'Alice Johnson',
          manifesto: 'Advocating for campus sustainability, dining reform, and open student forums.',
          profile_image: null,
        },
        {
          id: 'cand-2',
          full_name: 'Bob Smith',
          manifesto: 'Modernizing campus transport, expanding library hours, and funding clubs.',
          profile_image: null,
        },
      ],
    },
    {
      id: 'pos-2',
      title: 'Vice President of Academic Affairs',
      description: 'Liaison to academic faculty senate.',
      display_order: 2,
      maximum_candidates: 1,
      allow_abstain: true,
      candidate_count: 1,
      candidates: [
        {
          id: 'cand-3',
          full_name: 'Charlie Brown',
          manifesto: 'Championing syllabus transparency and fair grading policies.',
          profile_image: null,
        },
      ],
    },
  ],
  total_positions: 2,
  allow_abstain_global: true,
  voter_status: {
    is_eligible: true,
    reason: '',
    code: 'ELIGIBLE',
    requires_verification: false,
    has_participated: false,
  },
};

const renderBallotPage = (electionId = 'elec-123') => {
  return render(
    <MemoryRouter initialEntries={[`/elections/${electionId}/ballot`]}>
      <Routes>
        <Route path="/elections/:id/ballot" element={<BallotPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Phase 5: Anonymous Ballot Architecture & Voting Interface Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (votingService.fetchBallotDefinition as any).mockResolvedValue(mockActiveBallot);
  });

  it('1. loads and displays ballot definition with positions and candidates', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Student Government Election')).toBeInTheDocument();
      expect(screen.getByText('Student Body President')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Vice President of Academic Affairs')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });
  });

  it('2. selects a candidate and verifies selection UI state', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const aliceCard = screen.getByText('Alice Johnson');
    fireEvent.click(aliceCard);

    // Progress counter should update
    expect(screen.getByText(/Voting Progress: 1 of 2 positions decided/i)).toBeInTheDocument();
  });

  it('3. selects abstention for a position', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Student Body President')).toBeInTheDocument();
    });

    const abstainButtons = screen.getAllByText('Abstain for this Office');
    expect(abstainButtons.length).toBeGreaterThan(0);
    fireEvent.click(abstainButtons[0]);

    expect(screen.getByText(/Voting Progress: 1 of 2 positions decided/i)).toBeInTheDocument();
  });

  it('4. enforces required selections before advancing to review', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Student Government Election')).toBeInTheDocument();
    });

    // Both positions unselected
    const reviewButtons = screen.getAllByRole('button', { name: /review ballot/i });
    expect(reviewButtons[0]).toBeDisabled();

    // Select only position 1
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(screen.getAllByRole('button', { name: /review ballot/i })[0]).toBeDisabled();

    // Select position 2
    fireEvent.click(screen.getByText('Charlie Brown'));
    expect(screen.getAllByRole('button', { name: /review ballot/i })[0]).toBeEnabled();
  });

  it('5. navigates to review-before-submit screen showing in-memory summary', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Make selections
    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByText('Charlie Brown'));

    const reviewBtn = screen.getAllByRole('button', { name: /review ballot/i })[0];
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(screen.getByText('Review Your Ballot Selections')).toBeInTheDocument();
      expect(screen.getByText('Decoupled Vote Vault Anonymity')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /confirm & cast anonymous ballot/i })).toBeInTheDocument();
    });
  });

  it('6. allows returning from review screen to edit choices before submission', async () => {
    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByText('Charlie Brown'));

    fireEvent.click(screen.getAllByRole('button', { name: /review ballot/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Review Your Ballot Selections')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit selections/i });
    fireEvent.click(editBtn);

    // Should be back on the ballot selection screen
    expect(screen.getByText('Voting Progress: 2 of 2 positions decided')).toBeInTheDocument();
    expect(screen.getByText('Student Body President')).toBeInTheDocument();
  });

  it('7. displays closed election state when voting window is inactive', async () => {
    (votingService.fetchBallotDefinition as any).mockResolvedValue({
      ...mockActiveBallot,
      election: {
        ...mockActiveBallot.election,
        is_open: false,
        status: 'CLOSED',
      },
    });

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Ballot Currently Closed')).toBeInTheDocument();
      expect(screen.getByText(/this election is currently not open for active ballot submissions/i)).toBeInTheDocument();
    });
  });

  it('8. displays eligibility denied state when student is ineligible', async () => {
    (votingService.fetchBallotDefinition as any).mockResolvedValue({
      ...mockActiveBallot,
      voter_status: {
        is_eligible: false,
        reason: 'Student record department does not match election boundary.',
        code: 'INELIGIBLE_DEPARTMENT',
        requires_verification: false,
        has_participated: false,
      },
    });

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Voter Ineligible for this Ballot')).toBeInTheDocument();
      expect(screen.getByText(/student record department does not match election boundary/i)).toBeInTheDocument();
    });
  });

  it('9. displays verification required state when student ID is unverified', async () => {
    (votingService.fetchBallotDefinition as any).mockResolvedValue({
      ...mockActiveBallot,
      voter_status: {
        is_eligible: true,
        reason: '',
        code: 'VERIFICATION_REQUIRED',
        requires_verification: true,
        has_participated: false,
      },
    });

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Identity Verification Required')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify college id & otp/i })).toBeInTheDocument();
    });
  });

  it('10. handles already-participated / duplicate voting guard state', async () => {
    (votingService.fetchBallotDefinition as any).mockResolvedValue({
      ...mockActiveBallot,
      voter_status: {
        is_eligible: true,
        reason: '',
        code: 'ALREADY_PARTICIPATED',
        requires_verification: false,
        has_participated: true,
      },
    });

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Ballot Already Cast')).toBeInTheDocument();
      expect(screen.getByText(/our records confirm that you have already cast your ballot in/i)).toBeInTheDocument();
    });
  });

  it('11. submits ballot successfully and presents generic receipt without candidate choices', async () => {
    const mockReceipt: BallotSubmissionResponse = {
      status: 'ACCEPTED',
      receipt_id: 'CV-REC-9A8B-7C6D',
      election_id: 'elec-123',
      submitted_at: '2026-10-19T18:00:00Z',
      message: 'Ballot successfully cast and recorded anonymously.',
    };

    (votingService.submitBallot as any).mockResolvedValue(mockReceipt);

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    // Make selections
    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByText('Charlie Brown'));

    // Go to review
    fireEvent.click(screen.getAllByRole('button', { name: /review ballot/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Review Your Ballot Selections')).toBeInTheDocument();
    });

    // Submit ballot
    const confirmSubmitBtn = screen.getByRole('button', { name: /confirm & cast anonymous ballot/i });
    fireEvent.click(confirmSubmitBtn);

    // Verify confirmation screen
    await waitFor(() => {
      expect(screen.getByText('Ballot Successfully Cast!')).toBeInTheDocument();
      expect(screen.getByText('CV-REC-9A8B-7C6D')).toBeInTheDocument();
      expect(screen.getByText(/this receipt proves that your ballot was accepted/i)).toBeInTheDocument();
    });

    // Critical privacy check: candidate choices must NOT be displayed on confirmation screen
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
  });

  it('12. handles submission failure and displays server rejection error', async () => {
    (votingService.submitBallot as any).mockRejectedValue({
      status: 400,
      details: {
        error: 'Voter has already participated in this election.',
      },
    });

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice Johnson'));
    fireEvent.click(screen.getByText('Charlie Brown'));

    fireEvent.click(screen.getAllByRole('button', { name: /review ballot/i })[0]);

    await waitFor(() => {
      expect(screen.getByText('Review Your Ballot Selections')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm & cast anonymous ballot/i }));

    await waitFor(() => {
      expect(screen.getByText(/voter has already participated in this election/i)).toBeInTheDocument();
    });
  });

  it('13. handles network failure during ballot definition load', async () => {
    (votingService.fetchBallotDefinition as any).mockRejectedValue(
      new Error('Network error: Unable to reach election server.')
    );

    renderBallotPage();

    await waitFor(() => {
      expect(screen.getByText('Unable to Open Ballot')).toBeInTheDocument();
      expect(screen.getByText(/network error: unable to reach election server/i)).toBeInTheDocument();
    });
  });
});
