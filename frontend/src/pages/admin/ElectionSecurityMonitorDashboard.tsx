import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle,
  Eye,
  Info,
  Clock,
  Search,
  Activity,
  Cpu,
  FileText,
  Lock,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import {
  AnomalyAlert,
  AnomalySummaryMetrics,
  AnomalySeverity,
  AnomalyStatus,
  AnomalyType
} from '../../types/anomaly';
import {
  getElectionAnomalies,
  getElectionAnomalySummary,
  runAnomalyDetectionPipeline,
  acknowledgeAnomalyAlert,
  investigateAnomalyAlert,
  resolveAnomalyAlert,
  markAnomalyAlertFalsePositive
} from '../../services/anomaly';

export const ElectionSecurityMonitorDashboard: React.FC = () => {
  const { id: electionId } = useParams<{ id: string }>();

  // Data states
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [summary, setSummary] = useState<AnomalySummaryMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected alert for details modal
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);

  // Action Modals State
  const [actionModal, setActionModal] = useState<{
    type: 'RESOLVE' | 'FALSE_POSITIVE' | null;
    alert: AnomalyAlert | null;
  }>({ type: null, alert: null });
  const [resolutionNote, setResolutionNote] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 6;

  // Load Alerts & Summary
  const loadDashboardData = useCallback(async (manual = false) => {
    if (!electionId) return;
    if (manual) setIsRefreshing(true);
    setError(null);

    try {
      const [alertsRes, summaryRes] = await Promise.all([
        getElectionAnomalies(electionId, {
          severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined
        }),
        getElectionAnomalySummary(electionId)
      ]);

      const extractedAlerts = Array.isArray(alertsRes)
        ? alertsRes
        : (alertsRes as any)?.alerts || [];

      setAlerts(extractedAlerts);
      setSummary(summaryRes);
    } catch (err: any) {
      setError(err?.details?.error || err?.message || 'Failed to load security anomaly telemetry.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [electionId, selectedSeverity, selectedStatus]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle Run Pipeline On-Demand
  const handleRunPipeline = async () => {
    if (!electionId || isRunningPipeline) return;
    setIsRunningPipeline(true);
    setActionSuccessMsg(null);
    setError(null);

    try {
      const res = await runAnomalyDetectionPipeline(electionId);
      setActionSuccessMsg(
        res.new_alerts_detected > 0
          ? `Analysis complete: ${res.new_alerts_detected} new potential anomalies detected and recorded.`
          : 'Analysis complete: No new anomalies detected. All aggregate metrics within operational tolerances.'
      );
      await loadDashboardData();
    } catch (err: any) {
      setError(err?.details?.error || err?.message || 'Failed to execute anomaly detection pipeline.');
    } finally {
      setIsRunningPipeline(false);
    }
  };

  // Status transitions
  const handleAcknowledge = async (alert: AnomalyAlert) => {
    if (!electionId) return;
    try {
      await acknowledgeAnomalyAlert(electionId, alert.id);
      setActionSuccessMsg(`Alert marked as Acknowledged.`);
      await loadDashboardData();
      if (selectedAlert?.id === alert.id) {
        setSelectedAlert((prev) => (prev ? { ...prev, status: 'ACKNOWLEDGED' } : null));
      }
    } catch (err: any) {
      setError(err?.details?.error || err?.message || 'Failed to acknowledge alert.');
    }
  };

  const handleInvestigate = async (alert: AnomalyAlert) => {
    if (!electionId) return;
    try {
      await investigateAnomalyAlert(electionId, alert.id);
      setActionSuccessMsg(`Alert marked as Investigating.`);
      await loadDashboardData();
      if (selectedAlert?.id === alert.id) {
        setSelectedAlert((prev) => (prev ? { ...prev, status: 'INVESTIGATING' } : null));
      }
    } catch (err: any) {
      setError(err?.details?.error || err?.message || 'Failed to set alert status to investigating.');
    }
  };

  const handleConfirmActionModal = async () => {
    if (!electionId || !actionModal.alert || !actionModal.type) return;
    if (!resolutionNote.trim()) {
      setActionError('Resolution documentation note is required for administrative audit compliance.');
      return;
    }

    setIsSubmittingAction(true);
    setActionError(null);

    try {
      if (actionModal.type === 'RESOLVE') {
        await resolveAnomalyAlert(electionId, actionModal.alert.id, resolutionNote.trim());
        setActionSuccessMsg(`Alert resolved successfully.`);
      } else {
        await markAnomalyAlertFalsePositive(electionId, actionModal.alert.id, resolutionNote.trim());
        setActionSuccessMsg(`Alert classified as False Positive.`);
      }

      setActionModal({ type: null, alert: null });
      setResolutionNote('');
      setSelectedAlert(null);
      await loadDashboardData();
    } catch (err: any) {
      setActionError(err?.details?.error || err?.message || 'Action failed.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Severity style helper
  const getSeverityBadge = (severity: AnomalySeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            LOW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            INFO
          </span>
        );
    }
  };

  // Status style helper
  const getStatusBadge = (status: AnomalyStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            OPEN
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            ACKNOWLEDGED
          </span>
        );
      case 'INVESTIGATING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            INVESTIGATING
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            RESOLVED
          </span>
        );
      case 'FALSE_POSITIVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            FALSE POSITIVE
          </span>
        );
    }
  };

  const getAnomalyTypeLabel = (type: AnomalyType) => {
    switch (type) {
      case 'TURNOUT_VELOCITY_SPIKE':
        return 'Turnout Velocity Surge';
      case 'ELEVATED_DUPLICATE_VOTE_RATE':
        return 'Elevated Duplicate Vote Attempts';
      case 'ELEVATED_AUTH_FAILURE_RATE':
        return 'Elevated Identity Verification Failures';
      case 'DATA_INTEGRITY_VIOLATION':
        return 'Data Integrity Violation';
      case 'ML_MULTIVARIATE_ANOMALY':
        return 'Multivariate Statistical Outlier (ML)';
      default:
        return type;
    }
  };

  // Client-side filtering
  const alertList = Array.isArray(alerts) ? alerts : [];
  const filteredAlerts = alertList.filter((alert) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      alert.explanation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.anomaly_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (alert.resolution_note && alert.resolution_note.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage) || 1;
  const paginatedAlerts = filteredAlerts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI Election Security Monitoring"
          description="Explainable anomaly detection and operational integrity surveillance."
        />
        <LoadingState message="Loading election security telemetry and anomaly records..." />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/admin/elections/${electionId}`}
            className="p-2 rounded-lg bg-surface-card border border-border-default text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
            title="Back to Election Details"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">AI Election Security Monitor</h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/20 text-primary border border-primary/30">
                Real-Time Security
              </span>
            </div>
            <p className="text-sm text-text-muted">
              Surveillance of aggregate participation patterns and operational security anomalies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/admin/elections/${electionId}/monitor`}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-surface-card border border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover transition-all flex items-center gap-2"
          >
            <Activity className="h-4 w-4 text-emerald-400" />
            Turnout Monitor
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing || isRunningPipeline}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunPipeline}
            disabled={isRunningPipeline || isRefreshing}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover shadow-lg shadow-primary/20"
          >
            <Play className={`h-4 w-4 ${isRunningPipeline ? 'animate-spin' : ''}`} />
            {isRunningPipeline ? 'Running Detectors...' : 'Run Detector'}
          </Button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 text-xs font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Monitoring Privacy Guarantee Banner */}
      <div className="p-4 rounded-xl bg-surface-card border border-border-default/80 flex items-start gap-3.5 shadow-sm">
        <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-secondary space-y-1">
          <span className="font-semibold text-text-primary">
            Ethical AI & Zero Voter-Linkage Guarantee:
          </span>
          <p>
            Anomaly detection operates strictly on sanitized aggregate time-series and system operational telemetry.
            It <span className="text-text-primary font-medium">never</span> inspects ballot choices, candidate votes, or ties student identities to cast ballots.
            Anomalies represent operational signals for administrative audit, not proof of voter wrongdoing.
          </p>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Total Alerts</span>
            <AlertCircle className="h-4 w-4 text-text-muted" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary" id="metric-total-alerts">
            {summary?.total_alerts ?? alerts.length}
          </div>
          <div className="mt-1 text-xs text-text-muted">Lifecycle recorded</div>
        </Card>

        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Open Alerts</span>
            <AlertTriangle className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-400" id="metric-open-alerts">
            {summary?.open_alerts ?? 0}
          </div>
          <div className="mt-1 text-xs text-text-muted">Awaiting triage</div>
        </Card>

        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Investigating</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400" id="metric-investigating-alerts">
            {summary?.investigating_alerts ?? 0}
          </div>
          <div className="mt-1 text-xs text-text-muted">Active inquiries</div>
        </Card>

        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Critical / High</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400" id="metric-critical-alerts">
            {(summary?.critical_severity_count ?? 0) + (summary?.high_severity_count ?? 0)}
          </div>
          <div className="mt-1 text-xs text-text-muted">Elevated urgency</div>
        </Card>

        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Resolved</span>
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400" id="metric-resolved-alerts">
            {summary?.resolved_alerts ?? 0}
          </div>
          <div className="mt-1 text-xs text-text-muted">Audited & closed</div>
        </Card>

        <Card className="p-4 bg-surface-card/60 backdrop-blur border-border-default">
          <div className="flex items-center justify-between text-text-muted text-xs font-medium">
            <span>Engine Status</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-400 flex items-center gap-1.5" id="metric-detector-status">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {summary?.detector_status || 'OPERATIONAL'}
          </div>
          <div className="mt-1 text-xs text-text-muted">Hybrid Rule + ML</div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-surface-card/80 border-border-default">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search explanations, types, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-surface-subtle border border-border-default text-text-primary focus:outline-none focus:border-primary placeholder:text-text-muted"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted font-medium">Severity:</span>
              <select
                value={selectedSeverity}
                onChange={(e) => {
                  setSelectedSeverity(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-surface-subtle border border-border-default text-text-primary focus:outline-none focus:border-primary"
                aria-label="Filter by Severity"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
                <option value="INFO">Info</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted font-medium">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-surface-subtle border border-border-default text-text-primary focus:outline-none focus:border-primary"
                aria-label="Filter by Status"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="FALSE_POSITIVE">False Positive</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-text-muted w-full md:w-auto text-right">
            Showing <span className="font-semibold text-text-primary">{filteredAlerts.length}</span> alert(s)
          </div>
        </div>
      </Card>

      {/* Alerts Table */}
      <Card className="border-border-default overflow-hidden">
        <CardHeader className="border-b border-border-default/60 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Security Anomaly Incidents</CardTitle>
              <CardDescription className="text-xs">
                Aggregate statistical outliers, turnout surges, and operational telemetry flags
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {paginatedAlerts.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldAlert className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-40" />
              <h3 className="text-sm font-semibold text-text-primary">No Anomaly Alerts Found</h3>
              <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                No alerts match the selected filters or search query. Click "Run Detector" above to execute real-time telemetry analysis.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle/60 text-text-muted border-b border-border-default/60">
                  <tr>
                    <th className="py-3 px-4 font-medium">Severity</th>
                    <th className="py-3 px-4 font-medium">Anomaly Type</th>
                    <th className="py-3 px-4 font-medium">Risk Score</th>
                    <th className="py-3 px-4 font-medium">Explanation</th>
                    <th className="py-3 px-4 font-medium">Detected</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default/40">
                  {paginatedAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      className="hover:bg-surface-subtle/30 transition-colors"
                      data-testid={`alert-row-${alert.id}`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getSeverityBadge(alert.severity)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-text-primary">
                          {getAnomalyTypeLabel(alert.anomaly_type)}
                        </div>
                        <div className="text-[10px] text-text-muted flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              alert.detector_type === 'MACHINE_LEARNING'
                                ? 'bg-cyan-500/15 text-cyan-400'
                                : 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {alert.detector_type === 'MACHINE_LEARNING' ? 'ML Isolation Forest' : 'Rule-Based'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text-primary">{alert.risk_score}</span>
                          <div className="w-16 h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                alert.risk_score >= 80
                                  ? 'bg-rose-500'
                                  : alert.risk_score >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, alert.risk_score)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="truncate text-text-secondary" title={alert.explanation}>
                          {alert.explanation}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-text-muted">
                        {new Date(alert.detected_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(alert.status)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedAlert(alert)}
                            className="text-xs px-2 py-1 flex items-center gap-1"
                            title="Inspect Evidence & Explanation"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </Button>

                          {alert.status === 'OPEN' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAcknowledge(alert)}
                              className="text-xs px-2 py-1 text-yellow-400 hover:text-yellow-300"
                              title="Acknowledge Alert"
                            >
                              Acknowledge
                            </Button>
                          )}

                          {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleInvestigate(alert)}
                              className="text-xs px-2 py-1 text-purple-400 hover:text-purple-300"
                              title="Mark Investigating"
                            >
                              Investigate
                            </Button>
                          )}

                          {(alert.status === 'INVESTIGATING' || alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setActionModal({ type: 'RESOLVE', alert });
                                  setResolutionNote('');
                                  setActionError(null);
                                }}
                                className="text-xs px-2 py-1 text-emerald-400 hover:text-emerald-300"
                                title="Resolve Alert with Audit Note"
                              >
                                Resolve
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setActionModal({ type: 'FALSE_POSITIVE', alert });
                                  setResolutionNote('');
                                  setActionError(null);
                                }}
                                className="text-xs px-2 py-1 text-slate-400 hover:text-slate-300"
                                title="Mark as False Positive"
                              >
                                False Positive
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-border-default/60 flex items-center justify-between text-xs text-text-muted">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Details & Explainability Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-card border border-border-default rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-border-default/60 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-text-primary">
                    {getAnomalyTypeLabel(selectedAlert.anomaly_type)}
                  </h3>
                  {getSeverityBadge(selectedAlert.severity)}
                  {getStatusBadge(selectedAlert.status)}
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Incident ID: <span className="font-mono">{selectedAlert.id}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-text-muted hover:text-text-primary p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs">
              {/* Explanation Card */}
              <div>
                <h4 className="font-semibold text-text-primary mb-1.5 flex items-center gap-1.5 text-sm">
                  <Info className="h-4 w-4 text-primary" />
                  What Was Detected & Explanation
                </h4>
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default text-text-secondary leading-relaxed">
                  {selectedAlert.explanation}
                </div>
              </div>

              {/* Evidence Summary Badges / Key-Values */}
              <div>
                <h4 className="font-semibold text-text-primary mb-1.5 flex items-center gap-1.5 text-sm">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  Aggregate Evidence Telemetry
                </h4>
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default font-mono text-[11px] space-y-1.5">
                  {Object.entries(selectedAlert.evidence_summary || {}).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between border-b border-border-default/40 pb-1">
                      <span className="text-text-muted">{key}:</span>
                      <span className="text-text-primary font-semibold">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Architecture & Model Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default">
                  <span className="text-text-muted text-[11px] block">Detection Engine</span>
                  <span className="font-semibold text-text-primary mt-1 block">
                    {selectedAlert.detector_type === 'MACHINE_LEARNING'
                      ? 'Unsupervised Machine Learning (Isolation Forest)'
                      : 'Deterministic Rule-Based Policy'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default">
                  <span className="text-text-muted text-[11px] block">Model / Rule Version</span>
                  <span className="font-semibold text-text-primary mt-1 block">
                    {selectedAlert.model_version || 'v1.0'}
                  </span>
                </div>
              </div>

              {/* Recommended Investigation Steps */}
              <div>
                <h4 className="font-semibold text-text-primary mb-1.5 flex items-center gap-1.5 text-sm">
                  <FileText className="h-4 w-4 text-amber-400" />
                  Recommended Administrative Inquiries
                </h4>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 leading-relaxed">
                  {selectedAlert.recommended_actions || 'Perform audit of system telemetry and cross-reference campus calendar.'}
                </div>
              </div>

              {/* Ethical AI & Privacy Guarantee Notice */}
              <div className="p-3 rounded-lg bg-surface-subtle border border-border-default text-text-muted space-y-1">
                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-primary" />
                  Secrecy & Non-Punitive Protocol Notice
                </div>
                <p className="text-[11px]">
                  Under CampusVote security architecture, anomaly scores never invalidate ballots or result in punitive action against students. No candidate selections or individual student identities were evaluated during this assessment.
                </p>
              </div>

              {/* Audit Trail Details */}
              {selectedAlert.reviewed_by_email && (
                <div className="p-3 rounded-lg bg-surface-subtle border border-border-default space-y-1">
                  <div className="font-semibold text-text-primary text-[11px]">Audit History</div>
                  <div className="text-[11px] text-text-secondary">
                    Reviewed by: <span className="text-text-primary font-medium">{selectedAlert.reviewed_by_email}</span>
                  </div>
                  {selectedAlert.reviewed_at && (
                    <div className="text-[11px] text-text-secondary">
                      Reviewed at: {new Date(selectedAlert.reviewed_at).toLocaleString()}
                    </div>
                  )}
                  {selectedAlert.resolution_note && (
                    <div className="text-[11px] text-text-secondary mt-1">
                      Administrative Note: "{selectedAlert.resolution_note}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border-default/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedAlert.status === 'OPEN' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAcknowledge(selectedAlert)}
                    className="text-xs"
                  >
                    Acknowledge
                  </Button>
                )}
                {(selectedAlert.status === 'OPEN' || selectedAlert.status === 'ACKNOWLEDGED') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleInvestigate(selectedAlert)}
                    className="text-xs text-purple-400"
                  >
                    Investigate
                  </Button>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedAlert(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution & False Positive Modal */}
      {actionModal.type && actionModal.alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-card border border-border-default rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              {actionModal.type === 'RESOLVE' ? (
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              ) : (
                <XCircle className="h-6 w-6 text-slate-400" />
              )}
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  {actionModal.type === 'RESOLVE' ? 'Resolve Security Alert' : 'Mark as False Positive'}
                </h3>
                <p className="text-xs text-text-muted">
                  {getAnomalyTypeLabel(actionModal.alert.anomaly_type)} • Risk {actionModal.alert.risk_score}
                </p>
              </div>
            </div>

            {actionError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {actionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Resolution & Audit Documentation Note <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={
                  actionModal.type === 'RESOLVE'
                    ? 'Document root cause, remediation steps, or verification findings...'
                    : 'Explain why this pattern is benign (e.g. classroom dismissal, scheduled rally)...'
                }
                className="w-full p-2.5 text-xs rounded-lg bg-surface-subtle border border-border-default text-text-primary focus:outline-none focus:border-primary resize-none placeholder:text-text-muted"
                aria-label="Resolution Note"
              />
              <span className="text-[10px] text-text-muted mt-1 block">
                Required by administrative audit compliance. Recorded with your administrator account.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActionModal({ type: null, alert: null })}
                disabled={isSubmittingAction}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmActionModal}
                disabled={isSubmittingAction}
                className={`text-xs ${
                  actionModal.type === 'RESOLVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {isSubmittingAction ? 'Submitting...' : 'Confirm Action'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
