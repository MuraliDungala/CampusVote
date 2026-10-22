import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ElectionSecurityMonitorDashboard } from '../pages/admin/ElectionSecurityMonitorDashboard';
import * as anomalyService from '../services/anomaly';
import {
  AnomalyAlert,
  AnomalySummaryMetrics,
  RunPipelineResponse
} from '../types/anomaly';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-admin-01',
      username: 'admin_security',
      email: 'admin_sec@campus.edu',
      role: 'ELECTION_ADMIN',
      is_verified: true,
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
  }),
}));

// Mock anomaly services
vi.mock('../services/anomaly', () => ({
  getElectionAnomalies: vi.fn(),
  getElectionAnomalySummary: vi.fn(),
  runAnomalyDetectionPipeline: vi.fn(),
  acknowledgeAnomalyAlert: vi.fn(),
  investigateAnomalyAlert: vi.fn(),
  resolveAnomalyAlert: vi.fn(),
  markAnomalyAlertFalsePositive: vi.fn(),
}));

const mockSummary: AnomalySummaryMetrics = {
  total_alerts: 3,
  open_alerts: 1,
  acknowledged_alerts: 1,
  investigating_alerts: 1,
  resolved_alerts: 0,
  false_positive_alerts: 0,
  critical_severity_count: 1,
  high_severity_count: 1,
  last_detection_run: '2026-10-20T10:00:00Z',
  detector_status: 'OPERATIONAL',
};

const mockAlerts: AnomalyAlert[] = [
  {
    id: 'alert-001',
    election: 'elec-777',
    anomaly_type: 'TURNOUT_VELOCITY_SPIKE',
    detector_type: 'RULE_BASED',
    severity: 'HIGH',
    risk_score: 82.5,
    explanation: 'Abnormal turnout surge detected: 45 ballots cast in recent 5-min interval.',
    evidence_summary: {
      interval_count: 45,
      baseline_mean_5m: 5.2,
      total_eligible_voters: 200,
    },
    recommended_actions: 'Inspect network traffic logs for ingress spikes and correlate class dismissals.',
    status: 'OPEN',
    detected_at: '2026-10-20T10:00:00Z',
    model_version: 'velocity-rule-v1.0',
    reviewed_by: null,
    reviewed_by_email: null,
    reviewed_at: null,
    resolution_note: null,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
  },
  {
    id: 'alert-002',
    election: 'elec-777',
    anomaly_type: 'ML_MULTIVARIATE_ANOMALY',
    detector_type: 'MACHINE_LEARNING',
    severity: 'CRITICAL',
    risk_score: 91.0,
    explanation: 'Multivariate statistical outlier detected by Isolation Forest model.',
    evidence_summary: {
      model: 'IsolationForest',
      model_score: -0.182,
      latest_interval_count: 50,
    },
    recommended_actions: 'Verify identity token entropy and check multi-cohort dispersion.',
    status: 'ACKNOWLEDGED',
    detected_at: '2026-10-20T10:05:00Z',
    model_version: 'isolation-forest-v1.2',
    reviewed_by: 'usr-admin-01',
    reviewed_by_email: 'admin_sec@campus.edu',
    reviewed_at: '2026-10-20T10:06:00Z',
    resolution_note: null,
    created_at: '2026-10-20T10:05:00Z',
    updated_at: '2026-10-20T10:06:00Z',
  },
  {
    id: 'alert-003',
    election: 'elec-777',
    anomaly_type: 'ELEVATED_AUTH_FAILURE_RATE',
    detector_type: 'RULE_BASED',
    severity: 'MEDIUM',
    risk_score: 65.0,
    explanation: 'High identity verification failure rate: 12 OTP verification attempts failed.',
    evidence_summary: {
      failed_attempts: 12,
      failure_rate_pct: 60.0,
    },
    recommended_actions: 'Inspect telecom gateway latency and QR scanner illumination.',
    status: 'INVESTIGATING',
    detected_at: '2026-10-20T09:30:00Z',
    model_version: 'auth-telemetry-v1.0',
    reviewed_by: 'usr-admin-01',
    reviewed_by_email: 'admin_sec@campus.edu',
    reviewed_at: '2026-10-20T09:35:00Z',
    resolution_note: 'Investigating cellular tower outage near Science quad.',
    created_at: '2026-10-20T09:30:00Z',
    updated_at: '2026-10-20T09:35:00Z',
  },
];

describe('ElectionSecurityMonitorDashboard (Phase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anomalyService.getElectionAnomalies).mockResolvedValue(mockAlerts);
    vi.mocked(anomalyService.getElectionAnomalySummary).mockResolvedValue(mockSummary);
  });

  const renderDashboard = () => {
    return render(
      <MemoryRouter initialEntries={['/admin/elections/elec-777/security-monitor']}>
        <Routes>
          <Route
            path="/admin/elections/:id/security-monitor"
            element={<ElectionSecurityMonitorDashboard />}
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders dashboard with summary metric cards and engine status', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('AI Election Security Monitor')).toBeInTheDocument();
    });

    // Check summary metrics rendered
    expect(screen.getByText('Total Alerts')).toBeInTheDocument();
    expect(document.getElementById('metric-total-alerts')).toHaveTextContent('3');
    expect(screen.getByText('OPERATIONAL')).toBeInTheDocument();
    expect(screen.getByText(/Zero Voter-Linkage Guarantee/i)).toBeInTheDocument();
  });

  it('renders list of security alerts with severity badges and risk scores', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Turnout Velocity Surge')).toBeInTheDocument();
      expect(screen.getByText('Multivariate Statistical Outlier (ML)')).toBeInTheDocument();
      expect(screen.getByText('Elevated Identity Verification Failures')).toBeInTheDocument();
    });

    // Risk scores
    expect(screen.getByText('82.5')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();

    // Badges
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('filters alerts by status or severity selection', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Turnout Velocity Surge')).toBeInTheDocument();
    });

    // Filter by status: select INVESTIGATING
    const statusSelect = screen.getByLabelText(/Filter by Status/i);
    fireEvent.change(statusSelect, { target: { value: 'INVESTIGATING' } });

    await waitFor(() => {
      expect(anomalyService.getElectionAnomalies).toHaveBeenCalledWith(
        'elec-777',
        expect.objectContaining({ status: 'INVESTIGATING' })
      );
    });
  });

  it('searches alerts using search input', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Turnout Velocity Surge')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search explanations, types, notes/i);
    fireEvent.change(searchInput, { target: { value: 'Isolation Forest' } });

    await waitFor(() => {
      expect(screen.getByText('Multivariate Statistical Outlier (ML)')).toBeInTheDocument();
      expect(screen.queryByText('Turnout Velocity Surge')).not.toBeInTheDocument();
    });
  });

  it('opens details modal with explainability, aggregate evidence, and privacy guarantee', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Details')[0]).toBeInTheDocument();
    });

    // Click Details on the first alert
    const detailsButtons = screen.getAllByText('Details');
    fireEvent.click(detailsButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/What Was Detected & Explanation/i)).toBeInTheDocument();
      expect(screen.getByText(/Aggregate Evidence Telemetry/i)).toBeInTheDocument();
      expect(screen.getByText(/Secrecy & Non-Punitive Protocol Notice/i)).toBeInTheDocument();
      expect(screen.getByText(/interval_count:/i)).toBeInTheDocument();
    });
  });

  it('acknowledges an open alert successfully', async () => {
    vi.mocked(anomalyService.acknowledgeAnomalyAlert).mockResolvedValue({
      ...mockAlerts[0],
      status: 'ACKNOWLEDGED',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Acknowledge')).toBeInTheDocument();
    });

    const ackButton = screen.getByText('Acknowledge');
    fireEvent.click(ackButton);

    await waitFor(() => {
      expect(anomalyService.acknowledgeAnomalyAlert).toHaveBeenCalledWith('elec-777', 'alert-001');
    });
  });

  it('marks an alert as investigating', async () => {
    vi.mocked(anomalyService.investigateAnomalyAlert).mockResolvedValue({
      ...mockAlerts[0],
      status: 'INVESTIGATING',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Investigate/i })[0]).toBeInTheDocument();
    });

    const investButton = screen.getAllByRole('button', { name: /Investigate/i })[0];
    fireEvent.click(investButton);

    await waitFor(() => {
      expect(anomalyService.investigateAnomalyAlert).toHaveBeenCalledWith('elec-777', 'alert-001');
    });
  });

  it('resolves an alert with required audit note', async () => {
    vi.mocked(anomalyService.resolveAnomalyAlert).mockResolvedValue({
      ...mockAlerts[0],
      status: 'RESOLVED',
      resolution_note: 'Telecom SMS gateway stabilized by IT infrastructure team.',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Resolve/i })[0]).toBeInTheDocument();
    });

    // Click Resolve button to open modal
    const resolveButton = screen.getAllByRole('button', { name: /Resolve/i })[0];
    fireEvent.click(resolveButton);

    await waitFor(() => {
      expect(screen.getByText('Resolve Security Alert')).toBeInTheDocument();
    });

    // Attempt confirm without note - should show validation error
    const confirmButton = screen.getByText('Confirm Action');
    fireEvent.click(confirmButton);

    expect(screen.getByText(/Resolution documentation note is required/i)).toBeInTheDocument();

    // Fill in resolution note
    const textarea = screen.getByLabelText(/Resolution Note/i);
    fireEvent.change(textarea, {
      target: { value: 'Telecom SMS gateway stabilized by IT infrastructure team.' },
    });

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(anomalyService.resolveAnomalyAlert).toHaveBeenCalledWith(
        'elec-777',
        'alert-001',
        'Telecom SMS gateway stabilized by IT infrastructure team.'
      );
    });
  });

  it('marks an alert as false positive with required audit note', async () => {
    vi.mocked(anomalyService.markAnomalyAlertFalsePositive).mockResolvedValue({
      ...mockAlerts[0],
      status: 'FALSE_POSITIVE',
      resolution_note: 'Verified student class dismissal cohort rally at noon.',
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /False Positive/i })[0]).toBeInTheDocument();
    });

    const fpButton = screen.getAllByRole('button', { name: /False Positive/i })[0];
    fireEvent.click(fpButton);

    await waitFor(() => {
      expect(screen.getByText('Mark as False Positive')).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Resolution Note/i);
    fireEvent.change(textarea, {
      target: { value: 'Verified student class dismissal cohort rally at noon.' },
    });

    const confirmButton = screen.getByText('Confirm Action');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(anomalyService.markAnomalyAlertFalsePositive).toHaveBeenCalledWith(
        'elec-777',
        'alert-001',
        'Verified student class dismissal cohort rally at noon.'
      );
    });
  });

  it('triggers on-demand detection run via Run Detector button', async () => {
    const pipelineRes: RunPipelineResponse = {
      message: 'Detection pipeline executed successfully.',
      new_alerts_detected: 1,
      alerts: [mockAlerts[0]],
    };
    vi.mocked(anomalyService.runAnomalyDetectionPipeline).mockResolvedValue(pipelineRes);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Run Detector')).toBeInTheDocument();
    });

    const runBtn = screen.getByText('Run Detector');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(anomalyService.runAnomalyDetectionPipeline).toHaveBeenCalledWith('elec-777');
      expect(screen.getByText(/Analysis complete: 1 new potential anomalies detected/i)).toBeInTheDocument();
    });
  });

  it('renders empty state when no alerts exist', async () => {
    vi.mocked(anomalyService.getElectionAnomalies).mockResolvedValue([]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No Anomaly Alerts Found')).toBeInTheDocument();
    });
  });
});
