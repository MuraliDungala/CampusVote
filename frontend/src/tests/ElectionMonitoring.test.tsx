import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ElectionMonitoringDashboard } from '../pages/admin/ElectionMonitoringDashboard';
import * as monitoringService from '../services/monitoring';
import {
  ElectionAnalyticsSummary,
  TurnoutTimeSeriesResponse,
  DepartmentAnalyticsResponse,
  ConnectionStatusResponse
} from '../types/monitoring';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-admin-01',
      username: 'admin_demo',
      email: 'admin@univ.edu',
      role: 'ELECTION_ADMIN',
      is_verified: true,
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  }),
}));

// Mock monitoring services
vi.mock('../services/monitoring', () => ({
  getElectionAnalyticsSummary: vi.fn(),
  getElectionTurnoutTimeSeries: vi.fn(),
  getElectionDepartmentAnalytics: vi.fn(),
  getElectionConnectionStatus: vi.fn(),
}));

const mockSummary: ElectionAnalyticsSummary = {
  election_id: 'elec-999',
  election_title: 'Student Senate General Election 2026',
  election_status: 'ACTIVE',
  election_status_display: 'Live Voting',
  start_time: '2026-10-20T08:00:00Z',
  end_time: '2026-10-20T20:00:00Z',
  is_open: true,
  total_eligible_voters: 100,
  recorded_participants: 65,
  remaining_eligible_voters: 35,
  turnout_percentage: 65.0,
  last_updated: new Date().toISOString(),
};

const mockTimeSeries: TurnoutTimeSeriesResponse = {
  election_id: 'elec-999',
  interval: '5m',
  total_eligible_voters: 100,
  total_recorded_participants: 65,
  buckets_count: 3,
  buckets: [
    {
      timestamp: '2026-10-20T08:00:00Z',
      display_label: '08:00',
      interval_count: 20,
      cumulative_count: 20,
      turnout_percentage: 20.0,
    },
    {
      timestamp: '2026-10-20T08:05:00Z',
      display_label: '08:05',
      interval_count: 25,
      cumulative_count: 45,
      turnout_percentage: 45.0,
    },
    {
      timestamp: '2026-10-20T08:10:00Z',
      display_label: '08:10',
      interval_count: 20,
      cumulative_count: 65,
      turnout_percentage: 65.0,
    },
  ],
  last_updated: new Date().toISOString(),
};

const mockDepartments: DepartmentAnalyticsResponse = {
  election_id: 'elec-999',
  privacy_threshold: 5,
  total_departments: 2,
  suppressed_departments_count: 1,
  departments: [
    {
      department: 'Computer Science',
      is_suppressed: false,
      suppression_reason: null,
      eligible_voters: 60,
      recorded_participants: 45,
      turnout_percentage: 75.0,
    },
    {
      department: 'Philosophy',
      is_suppressed: true,
      suppression_reason: 'Cohort size below privacy threshold (< 5)',
      eligible_voters: null,
      recorded_participants: null,
      turnout_percentage: null,
    },
  ],
  last_updated: new Date().toISOString(),
};

const mockConnectionStatus: ConnectionStatusResponse = {
  election_id: 'elec-999',
  websocket_supported: true,
  transport: 'channels',
  polling_fallback_interval_seconds: 5,
  status: 'OPERATIONAL',
};

const renderMonitoringDashboard = (electionId = 'elec-999') => {
  return render(
    <MemoryRouter initialEntries={[`/admin/elections/${electionId}/monitor`]}>
      <Routes>
        <Route path="/admin/elections/:id/monitor" element={<ElectionMonitoringDashboard />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Phase 6: Real-Time Voter Monitoring & Election Analytics Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (monitoringService.getElectionAnalyticsSummary as any).mockResolvedValue(mockSummary);
    (monitoringService.getElectionTurnoutTimeSeries as any).mockResolvedValue(mockTimeSeries);
    (monitoringService.getElectionDepartmentAnalytics as any).mockResolvedValue(mockDepartments);
    (monitoringService.getElectionConnectionStatus as any).mockResolvedValue(mockConnectionStatus);
  });

  it('1. renders loading state while initial analytics load', () => {
    // Delay resolution
    (monitoringService.getElectionAnalyticsSummary as any).mockImplementation(() => new Promise(() => {}));
    renderMonitoringDashboard();

    expect(screen.getByText(/loading real-time election monitoring dashboard/i)).toBeInTheDocument();
  });

  it('2. loads and displays election title and core KPI metric cards', async () => {
    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText('Student Senate General Election 2026')).toBeInTheDocument();
      expect(screen.getByText('65%')).toBeInTheDocument();
      expect(screen.getByText('65')).toBeInTheDocument();
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    expect(screen.getByText(/overall voting participation/i)).toBeInTheDocument();
    expect(screen.getByText(/unique eligible students voted/i)).toBeInTheDocument();
  });

  it('3. renders participation progress bar with accurate percentage and quorum markers', async () => {
    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText(/participation progress/i)).toBeInTheDocument();
      expect(screen.getByText(/65 of 100 votes recorded \(65%\)/i)).toBeInTheDocument();
    });

    const progressBar = screen.getByRole('progressbar', { name: /overall voter turnout progress/i });
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '65');
    expect(screen.getByText('50% Quorum Benchmark')).toBeInTheDocument();
  });

  it('4. handles zero-participation election state gracefully', async () => {
    const zeroSummary: ElectionAnalyticsSummary = {
      ...mockSummary,
      recorded_participants: 0,
      remaining_eligible_voters: 100,
      turnout_percentage: 0.0,
    };
    (monitoringService.getElectionAnalyticsSummary as any).mockResolvedValue(zeroSummary);
    (monitoringService.getElectionTurnoutTimeSeries as any).mockResolvedValue({
      ...mockTimeSeries,
      buckets: [],
    });

    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('0 of 100 votes recorded (0%)')).toBeInTheDocument();
      expect(screen.getByText(/no participation recorded yet/i)).toBeInTheDocument();
    });
  });

  it('5. renders turnout over time chart and supports switching interval buckets', async () => {
    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText('Turnout Over Time')).toBeInTheDocument();
    });

    // Check interval toggle buttons
    const btn15m = screen.getByRole('button', { name: '15-Min' });
    expect(btn15m).toBeInTheDocument();

    fireEvent.click(btn15m);

    await waitFor(() => {
      expect(monitoringService.getElectionTurnoutTimeSeries).toHaveBeenCalledWith('elec-999', '15m');
    });
  });

  it('6. renders department analytics and enforces privacy suppression for cohorts below threshold', async () => {
    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText('Department Turnout')).toBeInTheDocument();
      expect(screen.getByText('Computer Science')).toBeInTheDocument();
      expect(screen.getByText('Philosophy')).toBeInTheDocument();
    });

    // Computer Science is >= 5, so counts and percentages are visible
    expect(screen.getByText('(45 of 60 voted)')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();

    // Philosophy is < 5, so privacy suppression is ENFORCED!
    expect(screen.getByText(/cohort statistics privacy-suppressed/i)).toBeInTheDocument();
    expect(screen.getByText(/threshold protected \(< 5 students\)/i)).toBeInTheDocument();

    // Sensitive numbers for Philosophy must NOT be displayed
    expect(screen.queryByText('(1 of 3 voted)')).not.toBeInTheDocument();
  });

  it('7. displays real-time connection status pill and manual refresh action', async () => {
    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });

    // Click manual refresh
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(monitoringService.getElectionAnalyticsSummary).toHaveBeenCalledTimes(2);
    });
  });

  it('8. handles API failures and displays error state with retry button', async () => {
    (monitoringService.getElectionAnalyticsSummary as any).mockRejectedValue(
      new Error('Election cycle not found.')
    );

    renderMonitoringDashboard();

    await waitFor(() => {
      expect(screen.getByText('Unable to Access Election Analytics')).toBeInTheDocument();
      expect(screen.getByText('Election cycle not found.')).toBeInTheDocument();
    });
  });
});
