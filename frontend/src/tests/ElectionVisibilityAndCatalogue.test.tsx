import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ElectionsPage } from '../pages/public/ElectionsPage';
import * as electionServices from '../services/elections';
import { Election } from '../types/election';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'student-uuid-1',
      username: '23341A4234',
      email: '23341a4234@gmrit.edu.in',
      full_name: 'Murali Student',
      role: 'STUDENT',
      institution_name: 'GMR institute of technology',
      college_name: 'GMR institute of technology',
      institution_code: 'GMRIT',
      is_active: true,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const mockUpcomingElection: Election = {
  id: 'elec-upcoming-1',
  title: 'President Elections 2026',
  description: 'Annual election for the President of Student Council',
  academic_year: '2026-2027',
  start_time: '2026-11-01T09:00:00Z',
  end_time: '2026-11-04T18:00:00Z',
  status: 'SCHEDULED',
  status_display: 'Scheduled',
  positions_count: 3,
  candidates_count: 5,
  approved_candidates_count: 3,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  institution_name: 'GMR institute of technology',
  is_eligible: true,
  eligibility_reason: 'Student satisfies all institutional eligibility criteria.',
  can_vote: false,
  has_voted: false,
  published_at: null,
  archived_at: null,
};

const mockActiveElection: Election = {
  id: 'elec-active-1',
  title: 'CSE Department Senator Election',
  description: 'Contested election for CSE Senate representative',
  academic_year: '2026-2027',
  start_time: '2026-10-20T09:00:00Z',
  end_time: '2026-10-25T18:00:00Z',
  status: 'ACTIVE',
  status_display: 'Active Voting',
  positions_count: 1,
  candidates_count: 2,
  approved_candidates_count: 2,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  institution_name: 'GMR institute of technology',
  is_eligible: true,
  eligibility_reason: 'Student satisfies all institutional eligibility criteria.',
  can_vote: true,
  has_voted: false,
  published_at: null,
  archived_at: null,
};

describe('ElectionsPage — Visibility, Lifecycle Segmentation, and Error Handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // TEST 8: API failure displays error rather than misleading empty state
  it('TEST 8: displays genuine error state when API request fails instead of misleading empty state', async () => {
    vi.spyOn(electionServices, 'getElections').mockRejectedValue(
      new Error('Network gateway timeout while reaching collegiate voting cluster')
    );

    render(
      <BrowserRouter>
        <ElectionsPage />
      </BrowserRouter>
    );

    // Verify error state appears
    await waitFor(() => {
      expect(screen.getByText('Unable to Load Elections')).toBeInTheDocument();
      expect(
        screen.getByText(/Network gateway timeout while reaching collegiate voting cluster/)
      ).toBeInTheDocument();
    });

    // Ensure it does NOT show the misleading empty state message
    expect(screen.queryByText(/No Elections Scheduled for/i)).not.toBeInTheDocument();

    // Verify Retry button is present and usable
    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('displays empty state with college context when query succeeds with 0 elections', async () => {
    vi.spyOn(electionServices, 'getElections').mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    render(
      <BrowserRouter>
        <ElectionsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No Elections Scheduled for GMR institute of technology')).toBeInTheDocument();
      expect(
        screen.getByText(/There are currently no published collegiate elections scheduled for GMR institute of technology\./)
      ).toBeInTheDocument();
    });
  });

  it('displays both upcoming scheduled and active elections with eligibility badges', async () => {
    vi.spyOn(electionServices, 'getElections').mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [mockUpcomingElection, mockActiveElection],
    });

    render(
      <BrowserRouter>
        <ElectionsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('President Elections 2026')).toBeInTheDocument();
      expect(screen.getByText('CSE Department Senator Election')).toBeInTheDocument();
    });

    // Verify sections and badges
    expect(screen.getByText('Elections Open for Voting')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Collegiate Elections')).toBeInTheDocument();

    // Verify Vote Now button is rendered for active election
    const voteButton = screen.getByRole('button', { name: /Vote Now/i });
    expect(voteButton).toBeInTheDocument();
  });

  it('filters by tab when clicking Upcoming or Open for Voting tabs', async () => {
    vi.spyOn(electionServices, 'getElections').mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [mockUpcomingElection, mockActiveElection],
    });

    render(
      <BrowserRouter>
        <ElectionsPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('President Elections 2026')).toBeInTheDocument();
    });

    // Click on Upcoming tab
    const upcomingTab = screen.getByRole('button', { name: /Upcoming/i });
    fireEvent.click(upcomingTab);

    // Active election should not be visible in Upcoming tab
    expect(screen.getByText('President Elections 2026')).toBeInTheDocument();
    expect(screen.queryByText('CSE Department Senator Election')).not.toBeInTheDocument();
  });
});
