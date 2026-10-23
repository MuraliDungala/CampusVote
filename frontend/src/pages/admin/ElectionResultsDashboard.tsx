import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Award,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  Eye,
  Send,
  Users,
  Vote,
  Hash,
  Clock,
  Layers,
  Info
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  ElectionResultListItem,
  ElectionResultDetail,
  ResultVerificationDetails,
  CandidateTallyItem
} from '../../types/results';
import {
  getElectionResults,
  getElectionResultDetail,
  getResultVerification,
  calculateResults,
  submitResultReview,
  approveResult,
  publishResult,
  exportResultReport,
  getResultAudit,
  ResultAuditResponse
} from '../../services/results';
import { getElection } from '../../services/elections';
import { Election } from '../../types/election';

export const ElectionResultsDashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [election, setElection] = useState<Election | null>(null);
  const [versions, setVersions] = useState<ElectionResultListItem[]>([]);
  const [selectedResult, setSelectedResult] = useState<ElectionResultDetail | null>(null);
  const [verification, setVerification] = useState<ResultVerificationDetails | null>(null);
  const [auditData, setAuditData] = useState<ResultAuditResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedDigest, setCopiedDigest] = useState(false);

  // Active Tab: 'candidates' | 'verification' | 'governance' | 'audit'
  const [activeTab, setActiveTab] = useState<'candidates' | 'verification' | 'governance' | 'audit'>('candidates');

  // Modals
  const [showCalculateModal, setShowCalculateModal] = useState(false);
  const [calcUseSynthetic, setCalcUseSynthetic] = useState(false);
  const [calcNotes, setCalcNotes] = useState('');

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [reviewNotes, setReviewNotes] = useState('');

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  const [showPublishModal, setShowPublishModal] = useState(false);

  // Toast Auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Load Election and Result Versions
  const loadData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const [elecData, resultsData] = await Promise.all([
        getElection(id),
        getElectionResults(id)
      ]);
      setElection(elecData);
      const resList: ElectionResultListItem[] = Array.isArray(resultsData?.results)
        ? resultsData.results
        : Array.isArray(resultsData)
        ? resultsData
        : [];
      setVersions(resList);

      // If versions exist, load the latest version's full details
      if (resList.length > 0) {
        const latestVersionId = resList[0].id;
        const [detail, verif, audit] = await Promise.all([
          getElectionResultDetail(id, latestVersionId),
          getResultVerification(id, latestVersionId),
          getResultAudit(id, latestVersionId)
        ]);
        setSelectedResult(detail);
        setVerification(verif);
        setAuditData(audit);
      } else {
        setSelectedResult(null);
        setVerification(null);
        setAuditData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load election results.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Switch Selected Version
  const handleSelectVersion = async (versionId: string) => {
    if (!id) return;
    setIsActionLoading(true);
    try {
      const [detail, verif, audit] = await Promise.all([
        getElectionResultDetail(id, versionId),
        getResultVerification(id, versionId),
        getResultAudit(id, versionId)
      ]);
      setSelectedResult(detail);
      setVerification(verif);
      setAuditData(audit);
    } catch (err: any) {
      setError(err.message || 'Failed to load version details.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Action: Calculate Results
  const handleCalculate = async () => {
    if (!id) return;
    setIsActionLoading(true);
    try {
      const res = await calculateResults(id, calcUseSynthetic, calcNotes);
      setShowCalculateModal(false);
      setToastMessage(`Result calculation v${res.result.version} completed.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Calculation failed.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Action: Submit Review
  const handleReview = async () => {
    if (!id || !selectedResult) return;
    if (reviewDecision === 'REJECTED' && !reviewNotes.trim()) {
      setError('Justification notes are required when rejecting a result.');
      return;
    }
    setIsActionLoading(true);
    try {
      await submitResultReview(id, selectedResult.id, reviewDecision, reviewNotes);
      setShowReviewModal(false);
      setToastMessage(`Review decision "${reviewDecision}" recorded.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit review.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Action: Approve Result
  const handleApprove = async () => {
    if (!id || !selectedResult) return;
    setIsActionLoading(true);
    try {
      await approveResult(id, selectedResult.id, approvalNotes);
      setShowApproveModal(false);
      setToastMessage('Result version approved for publication.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Approval failed (check separation of duties).');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Action: Publish Result
  const handlePublish = async () => {
    if (!id || !selectedResult) return;
    setIsActionLoading(true);
    try {
      await publishResult(id, selectedResult.id);
      setShowPublishModal(false);
      setToastMessage('Election results published successfully!');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Publication blocked by security gates.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Action: Export CSV Report
  const handleExportCSV = async () => {
    if (!id || !selectedResult) return;
    try {
      const blob = await exportResultReport(id, selectedResult.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Election_Report_${election?.title?.slice(0, 15)}_v${selectedResult.version}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setToastMessage('Report downloaded successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to export report.');
    }
  };

  const copyDigestToClipboard = () => {
    if (!selectedResult?.result_digest) return;
    navigator.clipboard.writeText(selectedResult.result_digest);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2500);
  };

  // Status Badge Helper
  const getLifecycleBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <Badge variant="success" size="sm">PUBLISHED</Badge>;
      case 'APPROVED':
        return <Badge variant="info" size="sm">APPROVED</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning" size="sm">UNDER REVIEW</Badge>;
      case 'REJECTED':
        return <Badge variant="danger" size="sm">REJECTED</Badge>;
      case 'SUPERSEDED':
        return <Badge variant="neutral" size="sm">SUPERSEDED</Badge>;
      case 'CALCULATED':
      default:
        return <Badge variant="neutral" size="sm">CALCULATED</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-slate-50">
        <Sidebar portalType="admin" />
        <div className="flex-1 p-8">
          <LoadingState message="Loading election results and cryptographic audit records..." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-slate-50">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title={election?.title ? `${election.title} — Results` : 'Election Results Management'}
          description="Deterministic aggregate vote tallying, mathematical tie identification, ballot integrity verification, and publication gates."
          badge={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="neutral" size="sm">
                Election: {election?.status_display || election?.status}
              </Badge>
              {selectedResult && (
                <>
                  {getLifecycleBadge(selectedResult.status)}
                  {selectedResult.is_synthetic ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      SYNTHETIC DEMO
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                      LIVE VAULT
                    </span>
                  )}
                  <span className="text-xs font-mono text-slate-500 font-semibold">
                    Version v{selectedResult.version}
                  </span>
                </>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/elections/${id}`)}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                Back to Election
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCalculateModal(true)}
                leftIcon={<RefreshCw className="w-4 h-4" />}
                disabled={isActionLoading}
              >
                Calculate Results
              </Button>

              {selectedResult && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  leftIcon={<Download className="w-4 h-4 text-slate-600" />}
                >
                  Export CSV
                </Button>
              )}
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          {/* Toast Banner */}
          {toastMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-medium text-sm">{toastMessage}</span>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="text-emerald-600 hover:text-emerald-800 font-bold text-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-medium text-sm">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800 font-bold text-sm"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Synthetic Demo Alert Banner */}
          {selectedResult?.is_synthetic && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm">
              <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-amber-800">
                  Synthetic Development Demonstration Dataset
                </h4>
                <p className="text-sm text-amber-700 mt-1">
                  This result calculation was generated using isolated, deterministic synthetic test fixtures for development testing and institutional review.
                  These tallies are not real student votes and cannot be certified as an official campus election outcome.
                </p>
              </div>
            </div>
          )}

          {/* Empty State: No results calculated yet */}
          {versions.length === 0 ? (
            <EmptyState
              icon={<Award className="w-12 h-12 text-slate-400" />}
              title="No Results Calculated Yet"
              description="Results have not yet been computed for this election. Ensure the election is in CLOSED status, then initiate a deterministic tally calculation."
              action={
                <Button
                  variant="primary"
                  onClick={() => setShowCalculateModal(true)}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Initiate Result Calculation
                </Button>
              }
            />
          ) : (
            <>
              {/* Version Selector Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-brand-primary" />
                    Result Versions:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => handleSelectVersion(v.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          selectedResult?.id === v.id
                            ? 'bg-brand-primary text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span>v{v.version}</span>
                        <span className={`w-2 h-2 rounded-full ${
                          v.status === 'PUBLISHED' ? 'bg-emerald-400' :
                          v.status === 'APPROVED' ? 'bg-blue-400' :
                          v.status === 'SUPERSEDED' ? 'bg-slate-400' : 'bg-amber-400'
                        }`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Calculated: {new Date(selectedResult?.created_at || '').toLocaleString()}</span>
                  {selectedResult?.calculated_by_email && (
                    <span className="font-mono text-slate-600">by {selectedResult.calculated_by_email}</span>
                  )}
                </div>
              </div>

              {/* Top Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card className="border border-slate-200 shadow-sm hover:shadow transition-shadow">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-brand-primary rounded-xl">
                      <Vote className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ballots Tallied</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                        {selectedResult?.total_ballots_tallied || 0}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Valid processed ballots</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 shadow-sm hover:shadow transition-shadow">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Positions Tallied</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                        {selectedResult?.total_positions_tallied || 0}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Offices evaluated</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 shadow-sm hover:shadow transition-shadow">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Abstentions</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                        {selectedResult?.total_abstentions || 0}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Position abstentions</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 shadow-sm hover:shadow transition-shadow">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
                      <Hash className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Artifact Digest</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-slate-800 truncate" title={selectedResult?.result_digest}>
                          {selectedResult?.result_digest?.slice(0, 16)}...
                        </span>
                        <button
                          onClick={copyDigestToClipboard}
                          className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
                          title="Copy full SHA-256 Digest"
                        >
                          {copiedDigest ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">SHA-256 reproducibility proof</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Navigation Tabs */}
              <div className="border-b border-slate-200 mb-6">
                <nav className="flex space-x-8" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('candidates')}
                    className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                      activeTab === 'candidates'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    Candidate Results by Position
                  </button>

                  <button
                    onClick={() => setActiveTab('verification')}
                    className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                      activeTab === 'verification'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Verification & Publication Gates
                    {verification?.publication_eligible ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('governance')}
                    className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                      activeTab === 'governance'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Review & Governance
                  </button>

                  <button
                    onClick={() => setActiveTab('audit')}
                    className={`py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-2 transition-all ${
                      activeTab === 'audit'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    Audit Trail ({auditData?.total_events || 0})
                  </button>
                </nav>
              </div>

              {/* TAB 1: CANDIDATE RESULTS */}
              {activeTab === 'candidates' && (
                <div className="space-y-6">
                  {selectedResult?.position_results && selectedResult.position_results.length > 0 ? (
                    selectedResult.position_results.map((pos) => {
                      const candidatesList: CandidateTallyItem[] =
                        pos.candidates || pos.candidate_tallies || [];

                      return (
                        <Card key={pos.position_id} className="border border-slate-200 shadow-sm overflow-hidden">
                          <CardHeader className="bg-slate-50/80 border-b border-slate-200 p-4 flex flex-row items-center justify-between flex-wrap gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900">{pos.position_title}</h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Total Votes Cast: <span className="font-semibold text-slate-800">{pos.total_votes_cast}</span> | Abstentions: <span className="font-semibold text-slate-800">{pos.abstention_count}</span>
                              </p>
                            </div>

                            <div>
                              {pos.is_tied ? (
                                <Badge variant="warning" size="sm">
                                  TIE DETECTED
                                </Badge>
                              ) : pos.winner_candidate_name ? (
                                <Badge variant="success" size="sm">
                                  WINNER: {pos.winner_candidate_name}
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">NO VOTES CAST</Badge>
                              )}
                            </div>
                          </CardHeader>

                          {/* Tie Warning Alert */}
                          {pos.is_tied && (
                            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
                              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Tie Detected: </span>
                                Multiple candidates tied for the highest vote count.
                                The system does not invent a winner; manual institutional tie-breaker is required per college election bylaws.
                              </div>
                            </div>
                          )}

                          <CardContent className="p-0">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                                  <tr>
                                    <th className="py-3 px-4 w-16">Rank</th>
                                    <th className="py-3 px-4">Candidate</th>
                                    <th className="py-3 px-4">Votes</th>
                                    <th className="py-3 px-4">Vote Share</th>
                                    <th className="py-3 px-4 text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {candidatesList.map((cand) => (
                                    <tr
                                      key={cand.candidate_id}
                                      className={`hover:bg-slate-50 transition-colors ${
                                        cand.is_winner ? 'bg-emerald-50/40' : cand.is_tied ? 'bg-amber-50/40' : ''
                                      }`}
                                    >
                                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                                        #{cand.rank}
                                      </td>
                                      <td className="py-3 px-4 font-semibold text-slate-900">
                                        {cand.candidate_name}
                                      </td>
                                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                                        {cand.vote_count}
                                      </td>
                                      <td className="py-3 px-4 w-64">
                                        <div className="flex items-center gap-3">
                                          <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all duration-500 ${
                                                cand.is_winner
                                                  ? 'bg-emerald-500'
                                                  : cand.is_tied
                                                  ? 'bg-amber-500'
                                                  : 'bg-brand-primary'
                                              }`}
                                              style={{ width: `${Math.min(cand.vote_percentage, 100)}%` }}
                                            />
                                          </div>
                                          <span className="font-mono text-xs font-bold text-slate-700 w-12 text-right">
                                            {cand.vote_percentage}%
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        {cand.is_winner && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                                            <Award className="w-3 h-3" /> Winner
                                          </span>
                                        )}
                                        {cand.is_tied && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                                            <AlertTriangle className="w-3 h-3" /> Tied
                                          </span>
                                        )}
                                        {!cand.is_winner && !cand.is_tied && (
                                          <span className="text-xs text-slate-400">Candidate</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  ) : (
                    <EmptyState
                      title="No Position Results Available"
                      description="No positions were evaluated in this calculation."
                    />
                  )}
                </div>
              )}

              {/* TAB 2: VERIFICATION & PUBLICATION GATES */}
              {activeTab === 'verification' && verification && (
                <div className="space-y-6">
                  {/* Gate Eligibility Banner */}
                  <div
                    className={`p-5 rounded-xl border flex items-start gap-3 shadow-sm ${
                      verification.publication_eligible
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {verification.publication_eligible ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h4 className="text-base font-bold">
                        {verification.publication_eligible
                          ? 'All Publication Gates Passed'
                          : 'Publication Gates Pending or Blocked'}
                      </h4>
                      <p className="text-sm mt-1">
                        {verification.publication_eligible
                          ? 'This result version has passed integrity checks, reproducibility verification, and institutional review. It is eligible for public release.'
                          : 'Publication is fail-closed. All integrity, governance, and security conditions must be satisfied before public release.'}
                      </p>

                      {verification.publication_blockers.length > 0 && (
                        <div className="mt-3 bg-white/80 rounded-lg p-3 border border-amber-200">
                          <p className="text-xs font-bold uppercase text-amber-900 mb-2">
                            Outstanding Blockers ({verification.publication_blockers.length}):
                          </p>
                          <ul className="space-y-1.5">
                            {verification.publication_blockers.map((b, i) => (
                              <li key={i} className="text-xs font-mono text-amber-800 flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Verification Findings Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Ballot Input Integrity */}
                    <Card className="border border-slate-200 shadow-sm">
                      <CardHeader className="bg-slate-50 border-b border-slate-200 p-4 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                          <h4 className="font-bold text-sm text-slate-900">Ballot Schema & Relational Integrity</h4>
                        </div>
                        <Badge
                          variant={verification.integrity_status === 'PASSED' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {verification.integrity_status}
                        </Badge>
                      </CardHeader>
                      <CardContent className="p-4 text-xs space-y-3">
                        <p className="text-slate-600">
                          Validates that every cast ballot conforms to the election configuration, candidate IDs belong to the contested office, and no illegal duplicate selections exist.
                        </p>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Total Ballots Inspected:</span>
                            <span className="font-mono font-bold">{verification.integrity_details?.total_inspected || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Valid Ballots Tallied:</span>
                            <span className="font-mono font-bold text-emerald-600">{verification.integrity_details?.valid_count || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Malformed / Invalid Ballots:</span>
                            <span className="font-mono font-bold text-red-600">{verification.integrity_details?.invalid_count || 0}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 2. Participation Reconciliation */}
                    <Card className="border border-slate-200 shadow-sm">
                      <CardHeader className="bg-slate-50 border-b border-slate-200 p-4 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-purple-600" />
                          <h4 className="font-bold text-sm text-slate-900">Participation Reconciliation</h4>
                        </div>
                        <Badge
                          variant={
                            verification.reconciliation_status === 'PASSED'
                              ? 'success'
                              : verification.reconciliation_status === 'NOT_VERIFIABLE'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {verification.reconciliation_status}
                        </Badge>
                      </CardHeader>
                      <CardContent className="p-4 text-xs space-y-3">
                        <p className="text-slate-600">
                          Compares aggregate checked-in student voters with cast anonymous ballots without introducing individual student-to-ballot tracking.
                        </p>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Checked-In Students:</span>
                            <span className="font-mono font-bold">{verification.reconciliation_details?.checked_in_voters_count || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Anonymous Ballots Tallied:</span>
                            <span className="font-mono font-bold">{verification.reconciliation_details?.cast_ballots_tallied || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Variance:</span>
                            <span className="font-mono font-bold">{verification.reconciliation_details?.variance || 0}</span>
                          </div>
                        </div>
                        {verification.reconciliation_details?.explanation && (
                          <p className="text-[11px] text-slate-500 italic bg-amber-50/50 p-2 rounded border border-amber-100">
                            {verification.reconciliation_details.explanation}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* 3. Result Artifact Reproducibility */}
                    <Card className="border border-slate-200 shadow-sm md:col-span-2">
                      <CardHeader className="bg-slate-50 border-b border-slate-200 p-4 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Hash className="w-5 h-5 text-emerald-600" />
                          <h4 className="font-bold text-sm text-slate-900">Result Canonical Digest & Reproducibility</h4>
                        </div>
                        <Badge
                          variant={verification.reproducibility ? 'success' : 'danger'}
                          size="sm"
                        >
                          {verification.reproducibility ? 'REPRODUCIBLE' : 'DIGEST MISMATCH'}
                        </Badge>
                      </CardHeader>
                      <CardContent className="p-4 text-xs space-y-3">
                        <p className="text-slate-600">
                          Recomputes the SHA-256 cryptographic digest across canonicalized aggregate results to guarantee deterministic calculation and detect any unauthorized backend tampering.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block mb-1">Stored Result Digest:</span>
                            <span className="text-slate-900 break-all">{verification.stored_result_digest}</span>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block mb-1">Recomputed Verification Digest:</span>
                            <span className="text-slate-900 break-all">{verification.recomputed_digest}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* TAB 3: GOVERNANCE, REVIEW & APPROVALS */}
              {activeTab === 'governance' && selectedResult && (
                <div className="space-y-6">
                  {/* Governance Lifecycle State Machine */}
                  <Card className="border border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50 border-b border-slate-200 p-4">
                      <h4 className="font-bold text-sm text-slate-900">Result Governance & Approval Controls</h4>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {/* Lifecycle Steps */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
                        <div className={`p-4 rounded-xl border ${
                          selectedResult.status !== 'NOT_CALCULATED' ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <span className="text-xs font-bold uppercase tracking-wider block mb-1">Step 1</span>
                          <span className="font-bold text-sm">Calculated</span>
                        </div>

                        <div className={`p-4 rounded-xl border ${
                          selectedResult.reviewed_at ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <span className="text-xs font-bold uppercase tracking-wider block mb-1">Step 2</span>
                          <span className="font-bold text-sm">Peer Review</span>
                        </div>

                        <div className={`p-4 rounded-xl border ${
                          selectedResult.approved_at ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <span className="text-xs font-bold uppercase tracking-wider block mb-1">Step 3</span>
                          <span className="font-bold text-sm">Approved</span>
                        </div>

                        <div className={`p-4 rounded-xl border ${
                          selectedResult.status === 'PUBLISHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <span className="text-xs font-bold uppercase tracking-wider block mb-1">Step 4</span>
                          <span className="font-bold text-sm">Published</span>
                        </div>
                      </div>

                      {/* Separation of Duties Notice */}
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-800">Separation of Duties Policy: </span>
                          To guarantee integrity and prevent unilateral action, the administrator who initiated the calculation (
                          <span className="font-mono font-semibold">{selectedResult.calculated_by_email || 'Calculator'}</span>
                          ) cannot approve the same result version. A second authorized administrator or super admin must perform independent review and grant approval.
                        </div>
                      </div>

                      {/* Action Triggers */}
                      <div className="flex items-center gap-3 pt-4 border-t border-slate-200 flex-wrap">
                        {/* Review Action */}
                        <Button
                          variant="outline"
                          onClick={() => setShowReviewModal(true)}
                          disabled={selectedResult.status === 'PUBLISHED' || selectedResult.status === 'SUPERSEDED'}
                          leftIcon={<Eye className="w-4 h-4" />}
                        >
                          Submit Review Decision
                        </Button>

                        {/* Approve Action */}
                        <Button
                          variant="primary"
                          onClick={() => setShowApproveModal(true)}
                          disabled={
                            selectedResult.status === 'APPROVED' ||
                            selectedResult.status === 'PUBLISHED' ||
                            selectedResult.status === 'SUPERSEDED'
                          }
                          leftIcon={<CheckCircle2 className="w-4 h-4" />}
                        >
                          Approve for Publication
                        </Button>

                        {/* Publish Action */}
                        <Button
                          variant="primary"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => setShowPublishModal(true)}
                          disabled={
                            selectedResult.status === 'PUBLISHED' ||
                            selectedResult.status === 'SUPERSEDED' ||
                            selectedResult.status !== 'APPROVED'
                          }
                          leftIcon={<Send className="w-4 h-4" />}
                        >
                          Publish Results Publicly
                        </Button>

                        {/* Public Link if Published */}
                        {selectedResult.status === 'PUBLISHED' && (
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/elections/${id}/results`)}
                            leftIcon={<Award className="w-4 h-4 text-emerald-600" />}
                          >
                            View Public Results Page
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* TAB 4: AUDIT TRAIL */}
              {activeTab === 'audit' && (
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader className="bg-slate-50 border-b border-slate-200 p-4 flex flex-row items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">Cryptographic Result Audit Trail</h4>
                    <span className="text-xs font-mono text-slate-500">
                      {auditData?.total_events || 0} events recorded
                    </span>
                  </CardHeader>
                  <CardContent className="p-0">
                    {auditData?.events && auditData.events.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {auditData.events.map((evt) => (
                          <div key={evt.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-start gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg text-slate-700 flex-shrink-0 mt-0.5">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-bold text-sm text-slate-900">{evt.action_display || evt.action}</span>
                                <span className="text-xs font-mono text-slate-400">{new Date(evt.created_at).toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Actor: <span className="font-semibold text-slate-700">{evt.actor_username || 'System'}</span> ({evt.actor_role})
                              </p>
                              {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                                <pre className="mt-2 p-2 bg-slate-50 rounded text-[11px] font-mono text-slate-600 overflow-x-auto border border-slate-200">
                                  {JSON.stringify(evt.metadata, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 text-sm">
                        No audit events recorded for this calculation version yet.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODAL 1: CALCULATE RESULTS */}
      {showCalculateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-brand-primary" />
              Calculate Deterministic Results
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Executes deterministic position-level tallying, calculates candidate vote percentages, and computes a SHA-256 artifact digest.
            </p>

            <div className="space-y-4">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Select Tally Source
              </label>

              {/* Option 1: Genuine Ballots (Live Vault) */}
              <div
                onClick={() => setCalcUseSynthetic(false)}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  !calcUseSynthetic
                    ? 'border-brand-primary bg-indigo-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="tallySource"
                    checked={!calcUseSynthetic}
                    onChange={() => setCalcUseSynthetic(false)}
                    className="mt-1 text-brand-primary focus:ring-brand-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        Genuine Student Ballots (Live Vote Vault)
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                        Official Results
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Tallies real votes cast by eligible students. Generates authentic, certified tallies reflecting actual voter participation.
                    </p>
                  </div>
                </div>
              </div>

              {/* Option 2: Synthetic Fixtures (Demo) */}
              <div
                onClick={() => setCalcUseSynthetic(true)}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  calcUseSynthetic
                    ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="tallySource"
                    checked={calcUseSynthetic}
                    onChange={() => setCalcUseSynthetic(true)}
                    className="mt-1 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        Synthetic Test Fixtures (Development Demo)
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
                        Demo / Mock
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Simulates 30 synthetic mock ballots for dry-run testing. Clearly watermarked and cannot be certified as official election results.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Calculation Notes (Optional)</label>
                <textarea
                  value={calcNotes}
                  onChange={(e) => setCalcNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-primary"
                  placeholder="e.g. Official tally calculation after polls close."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCalculateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCalculate}
                disabled={isActionLoading}
              >
                {isActionLoading ? 'Computing Tallies...' : 'Execute Calculation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SUBMIT REVIEW */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Eye className="w-5 h-5 text-brand-primary" />
              Submit Review Decision
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Record formal peer review of calculated tallies, tie statuses, and integrity checks.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Decision</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      value="ACCEPTED"
                      checked={reviewDecision === 'ACCEPTED'}
                      onChange={() => setReviewDecision('ACCEPTED')}
                      className="text-brand-primary"
                    />
                    Accept (Under Review)
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      value="REJECTED"
                      checked={reviewDecision === 'REJECTED'}
                      onChange={() => setReviewDecision('REJECTED')}
                      className="text-red-600"
                    />
                    Reject Calculation
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Review Notes {reviewDecision === 'REJECTED' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-primary"
                  placeholder={
                    reviewDecision === 'REJECTED'
                      ? 'Mandatory reason for rejection (e.g., ballot discrepancy investigation pending).'
                      : 'Optional review notes.'
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowReviewModal(false)}>
                Cancel
              </Button>
              <Button
                variant={reviewDecision === 'REJECTED' ? 'danger' : 'primary'}
                size="sm"
                onClick={handleReview}
                disabled={isActionLoading}
              >
                Submit Decision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: APPROVE RESULT */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Approve Results for Publication
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Enforces Separation of Duties: Ensure you are an authorized reviewer different from the administrator who computed this version.
            </p>

            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                <span className="font-bold">Institutional Sign-off:</span>
                <p className="mt-0.5">
                  Approving this result satisfies the governance review gate. Once approved, the result can be made public provided all integrity gates pass.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Approval Notes (Optional)</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-primary"
                  placeholder="e.g. Certified by Election Commissioner."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowApproveModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApprove}
                disabled={isActionLoading}
              >
                Grant Approval
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: PUBLISH RESULT */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2 text-emerald-700">
              <Send className="w-5 h-5" />
              Confirm Public Result Publication
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Publishing will make this result version visible to all students and community members on the public portal.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Result Version:</span>
                <span className="font-mono font-bold">v{selectedResult?.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ballots Tallied:</span>
                <span className="font-mono font-bold">{selectedResult?.total_ballots_tallied}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Artifact Digest:</span>
                <span className="font-mono font-bold">{selectedResult?.result_digest.slice(0, 16)}...</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPublishModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handlePublish}
                disabled={isActionLoading}
              >
                Confirm & Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElectionResultsDashboard;
