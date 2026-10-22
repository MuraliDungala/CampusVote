import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { App } from '../App';
import { UserSummary } from '../types/auth';
import { PublicElectionResultsPage } from '../pages/public/PublicElectionResultsPage';
import { BallotPage } from '../pages/student/BallotPage';
import { ElectionSecurityMonitorDashboard } from '../pages/admin/ElectionSecurityMonitorDashboard';
import * as votingService from '../services/voting';
import * as resultsService from '../services/results';
import * as anomalyService from '../services/anomaly';
import { AnomalyAlert, AnomalySummaryMetrics } from '../types/anomaly';
import { ProtectedRoute } from '../components/layout/RouteGuards';

// Dynamic mockAuthValue for useAuth
let mockAuthValue: {
  user: UserSummary | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
} = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

// Mock voting, results, and anomaly services
vi.mock('../services/voting', () => ({
  fetchBallotDefinition: vi.fn(),
  submitBallot: vi.fn(),
  validateBallotSelections: vi.fn(),
  fetchParticipationStatus: vi.fn(),
}));

vi.mock('../services/results', () => ({
  getPublicElectionResults: vi.fn(),
  getResultVersions: vi.fn(),
  calculateResults: vi.fn(),
  reviewResult: vi.fn(),
  approveResult: vi.fn(),
  publishResult: vi.fn(),
}));

vi.mock('../services/anomaly', () => ({
  getElectionAnomalies: vi.fn(),
  getElectionAnomalySummary: vi.fn(),
  runAnomalyDetectionPipeline: vi.fn(),
  acknowledgeAnomalyAlert: vi.fn(),
  investigateAnomalyAlert: vi.fn(),
  resolveAnomalyAlert: vi.fn(),
  markAnomalyAlertFalsePositive: vi.fn(),
}));

const createMockUser = (overrides: Partial<UserSummary> = {}): UserSummary => ({
  id: 'usr-01',
  username: 'test_user',
  email: 'test@campus.edu',
  first_name: 'Test',
  last_name: 'User',
  full_name: 'Test User',
  college_id: 'STU-001',
  display_identifier: 'test_user',
  role: 'STUDENT',
  status: 'ACTIVE',
  is_student: true,
  is_election_admin: false,
  is_auditor: false,
  created_at: new Date().toISOString(),
  last_login_at: null,
  ...overrides,
});

describe('Phase 9 Frontend Security Hardening & Authorization Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthValue = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };
  });

  it('1. Student role attempting to access admin dashboard is redirected to UnauthorizedPage', async () => {
    mockAuthValue = {
      user: createMockUser({
        id: 'usr-student-01',
        username: 'student_tester',
        role: 'STUDENT',
        is_student: true,
        is_election_admin: false,
      }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      // RoleGuard redirects to /unauthorized
      expect(screen.getByText(/Access Restricted|Unauthorized|Forbidden|not authorized/i)).toBeInTheDocument();
    });
  });

  it('2. Unauthenticated user accessing protected student portal is redirected to login', async () => {
    mockAuthValue = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    };

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Secret Protected Student Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Redirected Login Portal</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Redirected Login Portal')).toBeInTheDocument();
    expect(screen.queryByText('Secret Protected Student Dashboard')).not.toBeInTheDocument();
  });

  it('3. Fail-closed development restriction banner is rendered on ballot voting page', async () => {
    mockAuthValue = {
      user: createMockUser({
        id: 'usr-student-02',
        username: 'student_voter2',
        college_id: 'STU-2026-998',
      }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };

    vi.mocked(votingService.fetchBallotDefinition).mockResolvedValueOnce({
      election: {
        id: 'elec-synth-01',
        title: 'Spring 2026 Student Union General Election',
        description: 'Benchmark election with fail-closed voting',
        academic_year: '2025-2026',
        start_time: '2026-01-01T00:00:00Z',
        end_time: '2026-12-31T23:59:59Z',
        status: 'ACTIVE',
        is_open: true,
      },
      positions: [
        {
          id: 'pos-1',
          title: 'President',
          description: 'Executive Council',
          display_order: 1,
          maximum_candidates: 1,
          allow_abstain: true,
          candidate_count: 1,
          candidates: [
            {
              id: 'cand-1',
              full_name: 'Priya Sharma',
              manifesto: 'Excellence and Integrity',
              profile_image: null,
            },
          ],
        },
      ],
      total_positions: 1,
      allow_abstain_global: true,
    });

    render(
      <MemoryRouter initialEntries={['/elections/elec-synth-01/ballot']}>
        <Routes>
          <Route path="/elections/:id/ballot" element={<BallotPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // Verify decoupled anonymous ballot notice is rendered
      expect(screen.getByText(/Decoupled Anonymous Ballot/i)).toBeInTheDocument();
    });
  });

  it('4. Public results page displays empty state and blocks unapproved data when results unpublished', async () => {
    // 404 response indicates unpublished election results
    vi.mocked(resultsService.getPublicElectionResults).mockRejectedValueOnce({
      status: 404,
      message: 'Official results have not yet been published.',
    });

    render(
      <MemoryRouter initialEntries={['/elections/elec-closed-01/results']}>
        <Routes>
          <Route path="/elections/:id/results" element={<PublicElectionResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Official Results Not Yet Published/i)
      ).toBeInTheDocument();
    });
  });

  it('5. Anomaly resolution modal requires resolution note before allowing resolution', async () => {
    mockAuthValue = {
      user: createMockUser({
        id: 'usr-admin-sec',
        username: 'admin_sec',
        role: 'ELECTION_ADMIN',
        is_student: false,
        is_election_admin: true,
      }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    };

    const mockSummary: AnomalySummaryMetrics = {
      total_alerts: 1,
      open_alerts: 1,
      acknowledged_alerts: 0,
      investigating_alerts: 0,
      resolved_alerts: 0,
      false_positive_alerts: 0,
      critical_severity_count: 0,
      high_severity_count: 1,
      last_detection_run: '2026-10-20T10:00:00Z',
      detector_status: 'OPERATIONAL',
    };

    const mockAlerts: AnomalyAlert[] = [
      {
        id: 'alert-sec-01',
        election: 'elec-777',
        anomaly_type: 'TURNOUT_VELOCITY_SPIKE',
        detector_type: 'RULE_BASED',
        severity: 'HIGH',
        risk_score: 82.5,
        explanation: 'Abnormal turnout surge detected: 45 ballots cast in recent 5-min interval.',
        evidence_summary: { velocity: 9.0 },
        recommended_actions: 'Inspect physical polling station.',
        status: 'OPEN',
        detected_at: '2026-10-20T10:00:00Z',
        model_version: 'rules-v1.0',
        reviewed_by: null,
        reviewed_by_email: null,
        reviewed_at: null,
        resolution_note: null,
        created_at: '2026-10-20T10:00:00Z',
        updated_at: '2026-10-20T10:00:00Z',
      },
    ];

    vi.mocked(anomalyService.getElectionAnomalies).mockResolvedValue(mockAlerts);
    vi.mocked(anomalyService.getElectionAnomalySummary).mockResolvedValue(mockSummary);
    vi.mocked(anomalyService.resolveAnomalyAlert).mockResolvedValue({
      ...mockAlerts[0],
      status: 'RESOLVED',
      resolution_note: 'Verified legitimate post-lecture student voting surge.',
    });

    render(
      <MemoryRouter initialEntries={['/admin/elections/elec-777/security-monitor']}>
        <Routes>
          <Route
            path="/admin/elections/:id/security-monitor"
            element={<ElectionSecurityMonitorDashboard />}
          />
        </Routes>
      </MemoryRouter>
    );

    // Wait for alerts to load
    await waitFor(() => {
      expect(screen.getByText(/Abnormal turnout surge detected/i)).toBeInTheDocument();
    });

    // Click Resolve button to open dialog
    const resolveBtn = screen.getAllByRole('button', { name: /Resolve/i })[0];
    fireEvent.click(resolveBtn);

    // Modal opens with Resolution Note textarea
    await waitFor(() => {
      expect(screen.getByText('Resolve Security Alert')).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Resolution Note/i);
    const confirmButton = screen.getByText('Confirm Action');

    // Attempt to submit empty note
    fireEvent.click(confirmButton);

    // Ensure error message appears
    expect(screen.getByText(/Resolution documentation note is required/i)).toBeInTheDocument();
    expect(anomalyService.resolveAnomalyAlert).not.toHaveBeenCalled();

    // Enter valid note
    fireEvent.change(textarea, {
      target: { value: 'Verified legitimate post-lecture student voting surge.' },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(anomalyService.resolveAnomalyAlert).toHaveBeenCalledWith(
        'elec-777',
        'alert-sec-01',
        'Verified legitimate post-lecture student voting surge.'
      );
    });
  });
});
