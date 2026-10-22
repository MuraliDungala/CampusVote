import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  RefreshCw,
  Users,
  UserCheck,
  UserMinus,
  TrendingUp,
  Building2,
  ShieldAlert,
  Wifi,
  WifiOff,
  Radio
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import {
  ElectionAnalyticsSummary,
  TurnoutTimeSeriesResponse,
  DepartmentAnalyticsResponse,
  ConnectionMode
} from '../../types/monitoring';
import {
  getElectionAnalyticsSummary,
  getElectionTurnoutTimeSeries,
  getElectionDepartmentAnalytics,
  getElectionConnectionStatus
} from '../../services/monitoring';
import { TurnoutTimeSeriesChart } from '../../components/monitoring/TurnoutTimeSeriesChart';
import { DepartmentTurnoutChart } from '../../components/monitoring/DepartmentTurnoutChart';

export const ElectionMonitoringDashboard: React.FC = () => {
  const { id: electionId } = useParams<{ id: string }>();

  // Analytics states
  const [summary, setSummary] = useState<ElectionAnalyticsSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<TurnoutTimeSeriesResponse | null>(null);
  const [departmentData, setDepartmentData] = useState<DepartmentAnalyticsResponse | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<'5m' | '15m' | '1h'>('5m');

  // Connection & lifecycle states
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('CONNECTING');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // WebSocket and polling refs
  const socketRef = useRef<WebSocket | null>(null);
  const pollingTimerRef = useRef<any>(null);

  // Core data fetcher
  const fetchAllAnalytics = useCallback(async (isManualRefresh = false) => {
    if (!electionId) return;

    if (isManualRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const [summaryRes, timeSeriesRes, deptRes] = await Promise.all([
        getElectionAnalyticsSummary(electionId),
        getElectionTurnoutTimeSeries(electionId, selectedInterval),
        getElectionDepartmentAnalytics(electionId),
      ]);

      setSummary(summaryRes);
      setTimeSeries(timeSeriesRes);
      setDepartmentData(deptRes);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.details?.error || err?.message || 'Failed to retrieve election analytics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [electionId, selectedInterval]);

  // Start polling fallback
  const startPollingFallback = useCallback((intervalSeconds = 5) => {
    if (pollingTimerRef.current) return;

    setConnectionMode('POLLING');
    pollingTimerRef.current = setInterval(() => {
      fetchAllAnalytics(false);
    }, intervalSeconds * 1000);
  }, [fetchAllAnalytics]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  // Initialize real-time connection (WebSocket with automatic Polling fallback)
  useEffect(() => {
    if (!electionId) return;

    let isSubscribed = true;

    const setupConnection = async () => {
      // 1. Initial snapshot fetch
      await fetchAllAnalytics(false);

      // 2. Check connection status capabilities
      let fallbackInterval = 5;
      try {
        const connStatus = await getElectionConnectionStatus(electionId);
        fallbackInterval = connStatus.polling_fallback_interval_seconds || 5;
      } catch {
        // Default to 5s if status probe fails
      }

      // 3. Attempt WebSocket connection
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const configuredWsBase = (import.meta.env.VITE_WS_BASE_URL || '').replace(/\/+$/, '');
        const wsUrl = configuredWsBase
          ? `${configuredWsBase}/ws/elections/${electionId}/turnout/`
          : `${protocol}//${host}/ws/elections/${electionId}/turnout/`;

        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isSubscribed) return;
          setConnectionMode('WEBSOCKET');
          stopPolling();
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'initial_snapshot' && parsed.data) {
              setSummary(parsed.data);
              setLastRefreshedAt(new Date());
            } else if (parsed.type === 'turnout_update') {
              // Refresh full analytics to update time-series and cohorts
              fetchAllAnalytics(false);
            }
          } catch {
            // Ignore malformed payloads
          }
        };

        ws.onerror = () => {
          if (!isSubscribed) return;
          // Fall back to polling on socket failure
          startPollingFallback(fallbackInterval);
        };

        ws.onclose = () => {
          if (!isSubscribed) return;
          // Fall back to polling on socket closure
          startPollingFallback(fallbackInterval);
        };
      } catch {
        // If WebSocket construction fails, fall back immediately to polling
        startPollingFallback(fallbackInterval);
      }
    };

    setupConnection();

    return () => {
      isSubscribed = false;
      stopPolling();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [electionId, fetchAllAnalytics, startPollingFallback, stopPolling]);

  // When selected interval changes, update time series
  useEffect(() => {
    if (!electionId || isLoading) return;
    getElectionTurnoutTimeSeries(electionId, selectedInterval)
      .then((data) => setTimeSeries(data))
      .catch(() => {});
  }, [electionId, selectedInterval, isLoading]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <LoadingState message="Loading real-time election monitoring dashboard..." />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex-1 p-8 max-w-4xl mx-auto">
        <ErrorState
          title="Unable to Access Election Analytics"
          message={error}
          onRetry={() => fetchAllAnalytics(true)}
        />
      </div>
    );
  }

  if (!summary) return null;

  // Stale check (greater than 30s)
  const isStale = (new Date().getTime() - lastRefreshedAt.getTime()) > 30000;

  return (
    <div className="flex-1 pb-16 bg-surface-canvas">
      <PageHeader
        title={summary.election_title}
        description="Authoritative real-time voter turnout and demographic cohort analytics."
        badge={
          <Badge variant={summary.is_open ? 'success' : 'neutral'} size="sm">
            {summary.election_status_display}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/admin/elections/${summary.election_id}`}>
              <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back to Election
              </Button>
            </Link>

            <Link to={`/admin/elections/${summary.election_id}/security-monitor`}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ShieldAlert className="w-4 h-4 text-amber-500" />}
                className="border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 font-semibold"
              >
                AI Security Monitor
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAllAnalytics(true)}
              isLoading={isRefreshing}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Live Status Ribbon */}
        <div className="p-3.5 sm:p-4 rounded-2xl border border-surface-border bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-semibold">
              {connectionMode === 'WEBSOCKET' ? (
                <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Radio className="w-3.5 h-3.5" /> Live Streaming (WebSocket)
                </span>
              ) : connectionMode === 'POLLING' ? (
                <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                  <Wifi className="w-3.5 h-3.5" /> Auto-Refreshing (Polling 5s)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  <WifiOff className="w-3.5 h-3.5" /> Connecting...
                </span>
              )}
            </div>

            {isStale && (
              <Badge variant="warning" size="sm">
                Data may be stale
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Start: {new Date(summary.start_time).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Updated: {lastRefreshedAt.toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Turnout Percentage Card */}
          <Card className="border-t-4 border-t-brand-primary shadow-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Voter Turnout
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand-primary flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-navy-950 font-mono">
                  {summary.turnout_percentage}%
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Overall voting participation
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recorded Participants */}
          <Card className="border-t-4 border-t-emerald-500 shadow-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Votes Recorded
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-navy-950 font-mono">
                  {summary.recorded_participants}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Unique eligible students voted
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Remaining Eligible */}
          <Card className="border-t-4 border-t-amber-500 shadow-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Remaining Electorate
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <UserMinus className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-navy-950 font-mono">
                  {summary.remaining_eligible_voters}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Eligible voters yet to participate
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Total Eligible Electorate */}
          <Card className="border-t-4 border-t-purple-500 shadow-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Eligible
                </span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-navy-950 font-mono">
                  {summary.total_eligible_voters}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Approved registered voters
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Turnout Progress Bar Card */}
        <Card className="shadow-subtle">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-primary" />
                <span className="font-bold text-navy-950">Participation Progress</span>
              </div>
              <span className="font-mono font-bold text-navy-950">
                {summary.recorded_participants} of {summary.total_eligible_voters} votes recorded ({summary.turnout_percentage}%)
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, summary.turnout_percentage))}%` }}
                role="progressbar"
                aria-valuenow={summary.turnout_percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall voter turnout progress"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>0% Turnout</span>
              <span>50% Quorum Benchmark</span>
              <span>100% Full Turnout</span>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid: Turnout Over Time & Department Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Turnout Over Time (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-subtle">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-surface-border pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-primary" /> Turnout Over Time
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Cumulative percentage and interval participation velocities.
                  </CardDescription>
                </div>

                {/* Interval Pill Controls */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
                  {(['5m', '15m', '1h'] as const).map((int) => (
                    <button
                      key={int}
                      type="button"
                      onClick={() => setSelectedInterval(int)}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        selectedInterval === int
                          ? 'bg-white text-navy-950 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {int === '5m' ? '5-Min' : int === '15m' ? '15-Min' : '1-Hour'}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-5">
                <TurnoutTimeSeriesChart
                  buckets={timeSeries?.buckets || []}
                  interval={selectedInterval}
                />
              </CardContent>
            </Card>
          </div>

          {/* Department Breakdown (1 col) */}
          <div className="space-y-6">
            <Card className="shadow-subtle">
              <CardHeader className="border-b border-surface-border pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-brand-primary" /> Department Turnout
                </CardTitle>
                <CardDescription className="text-xs">
                  Aggregate participation segmented by registered academic cohort.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {/* Privacy Rule Disclaimer */}
                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 text-[11px] text-slate-600 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy Suppression Active:</strong> Department cohorts with fewer than{' '}
                    {departmentData?.privacy_threshold || 5} eligible voters are suppressed to prevent voter re-identification.
                  </span>
                </div>

                <DepartmentTurnoutChart
                  departments={departmentData?.departments || []}
                  threshold={departmentData?.privacy_threshold || 5}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
