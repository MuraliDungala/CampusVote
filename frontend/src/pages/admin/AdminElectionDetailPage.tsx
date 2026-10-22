import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Layers,
  Users,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Archive,
  FileCheck,
  Activity,
  ShieldAlert,
  Award,
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import {
  Election,
  ElectionPosition,
  Candidate,
  ElectionStatus,
  PositionFormData,
} from '../../types/election';
import {
  getElection,
  scheduleElection,
  activateElection,
  closeElection,
  publishResults,
  archiveElection,
  cancelElection,
  getPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getElectionCandidates,
  reviewNomination,
} from '../../services/elections';
import { PositionModal } from '../../components/elections/PositionModal';
import { NominationReviewModal } from '../../components/elections/NominationReviewModal';

const STATUS_VARIANTS: Record<ElectionStatus, 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  ACTIVE: 'success',
  CLOSED: 'info',
  RESULTS_PUBLISHED: 'primary',
  ARCHIVED: 'neutral',
  CANCELLED: 'danger',
};

export const AdminElectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<ElectionPosition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeTab, setActiveTab] = useState<'positions' | 'nominations'>('positions');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<ElectionPosition | null>(null);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // Lifecycle action confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: async () => {},
  });

  const [candidateStatusFilter, setCandidateStatusFilter] = useState('ALL');

  const loadElectionData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [elecData, posData, candData] = await Promise.all([
        getElection(id),
        getPositions(id),
        getElectionCandidates(id),
      ]);
      setElection(elecData);
      setPositions(posData);
      setCandidates(candData);
    } catch (err: any) {
      setError(err.message || 'Failed to load election details.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadElectionData();
  }, [loadElectionData]);

  // Position Actions
  const handleSavePosition = async (formData: PositionFormData) => {
    if (!id) return;
    if (selectedPosition) {
      await updatePosition(selectedPosition.id, formData);
      setToastMessage(`Position "${formData.title}" updated.`);
    } else {
      await createPosition(id, formData);
      setToastMessage(`Position "${formData.title}" added to election.`);
    }
    loadElectionData();
  };

  const handleDeletePosition = (pos: ElectionPosition) => {
    setConfirmAction({
      isOpen: true,
      title: `Delete Position "${pos.title}"?`,
      description: `Are you sure you want to delete this position? Historical candidate nominations will be preserved.`,
      action: async () => {
        await deletePosition(pos.id);
        setToastMessage(`Position "${pos.title}" removed.`);
        loadElectionData();
      },
    });
  };

  // Nomination Review Actions
  const handleApproveCandidate = async (candidateId: string) => {
    await reviewNomination(candidateId, 'approve');
    setToastMessage('Candidate nomination approved successfully after backend eligibility re-check.');
    loadElectionData();
  };

  const handleRejectCandidate = async (candidateId: string, reason: string) => {
    await reviewNomination(candidateId, 'reject', reason);
    setToastMessage('Candidate nomination rejected with audit explanation.');
    loadElectionData();
  };

  // Lifecycle Transitions
  const handleSchedule = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Schedule Election for Future Start?',
      description: 'The election will enter the Scheduled lifecycle state. Contested positions will be locked for editing.',
      action: async () => {
        await scheduleElection(id);
        setToastMessage('Election successfully scheduled.');
        loadElectionData();
      },
    });
  };

  const handleActivate = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Activate Live Voting Now?',
      description: 'The election voting window will immediately become ACTIVE. Ensure student rosters and candidate manifests have been fully verified.',
      action: async () => {
        await activateElection(id);
        setToastMessage('Election is now ACTIVE for voting.');
        loadElectionData();
      },
    });
  };

  const handleClose = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Close Election Voting Window?',
      description: 'The voting window will close and no further ballots or nominations will be accepted.',
      action: async () => {
        await closeElection(id);
        setToastMessage('Election voting window CLOSED.');
        loadElectionData();
      },
    });
  };

  const handlePublishResults = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Authorize and Publish Election Results?',
      description: 'Election results will be officially authorized and marked as RESULTS_PUBLISHED.',
      action: async () => {
        await publishResults(id);
        setToastMessage('Election results published.');
        loadElectionData();
      },
    });
  };

  const handleArchive = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Archive Election Cycle?',
      description: 'The election cycle will be preserved permanently for historical and auditing reference.',
      action: async () => {
        await archiveElection(id);
        setToastMessage('Election successfully archived.');
        loadElectionData();
      },
    });
  };

  const handleCancel = () => {
    if (!id) return;
    setConfirmAction({
      isOpen: true,
      title: 'Cancel Election Cycle?',
      description: 'This is an exceptional action. The election will be marked as CANCELLED and will reject all further administrative operations.',
      action: async () => {
        await cancelElection(id, 'Cancelled by election administrator');
        setToastMessage('Election cycle CANCELLED.');
        loadElectionData();
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
        <Sidebar portalType="admin" />
        <div className="flex-1 p-12">
          <LoadingState message="Loading election governance details..." />
        </div>
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
        <Sidebar portalType="admin" />
        <div className="flex-1 p-8">
          <ErrorState title="Error Loading Election" message={error || 'Election not found'} onRetry={loadElectionData} />
        </div>
      </div>
    );
  }

  const filteredCandidates = candidates.filter((c) => {
    if (candidateStatusFilter === 'ALL') return true;
    return c.status === candidateStatusFilter;
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title={election.title}
          description={election.description || 'Collegiate election governance and candidate management.'}
          badge={
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[election.status]} size="sm">
                {election.status_display}
              </Badge>
              <span className="text-xs font-mono text-slate-500 font-semibold">
                {election.academic_year}
              </span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/elections')}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                All Elections
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/elections/${election.id}/monitor`)}
                leftIcon={<Activity className="w-4 h-4 text-brand-primary" />}
                className="border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-brand-primary font-semibold"
              >
                Live Turnout Monitor
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/elections/${election.id}/security-monitor`)}
                leftIcon={<ShieldAlert className="w-4 h-4 text-amber-500" />}
                className="border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 font-semibold"
              >
                AI Security Monitor
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/elections/${election.id}/results`)}
                leftIcon={<Award className="w-4 h-4 text-emerald-600" />}
                className="border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-800 font-semibold"
              >
                Results & Verification
              </Button>

              {/* Dynamic Lifecycle Actions */}
              {election.status === 'DRAFT' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSchedule}
                    leftIcon={<Calendar className="w-4 h-4" />}
                  >
                    Schedule Election
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {election.status === 'SCHEDULED' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleActivate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    Activate Voting
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {election.status === 'ACTIVE' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleClose}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    leftIcon={<Clock className="w-4 h-4" />}
                  >
                    Close Voting
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Cancel
                  </Button>
                </>
              )}

              {election.status === 'CLOSED' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePublishResults}
                    leftIcon={<FileCheck className="w-4 h-4" />}
                  >
                    Publish Results
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleArchive}
                    leftIcon={<Archive className="w-4 h-4" />}
                  >
                    Archive
                  </Button>
                </>
              )}

              {election.status === 'RESULTS_PUBLISHED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  leftIcon={<Archive className="w-4 h-4" />}
                >
                  Archive Election
                </Button>
              )}
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Toast feedback */}
          {toastMessage && (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-center justify-between text-xs animate-in fade-in">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="font-bold underline ml-4 hover:text-emerald-950"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Pre-Publication Readiness & Validation Checklist for DRAFT elections */}
          {election.status === 'DRAFT' && (() => {
            const hasPositions = positions.length > 0;
            const hasValidEndTime = new Date(election.end_time).getTime() > Date.now();
            const hasValidTimeWindow = new Date(election.start_time).getTime() < new Date(election.end_time).getTime();
            const isReadyToPublish = hasPositions && hasValidEndTime && hasValidTimeWindow;

            return (
              <Card className={`border shadow-subtle ${isReadyToPublish ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/70 via-white to-blue-50/50' : 'border-amber-300 bg-amber-50/40'}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isReadyToPublish ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <h3 className="text-sm font-bold text-navy-950">
                          {isReadyToPublish ? 'Pre-Publication Validation Passed — Ready to Schedule' : 'Pre-Publication Requirements Incomplete'}
                        </h3>
                        <Badge variant={isReadyToPublish ? 'success' : 'warning'} size="sm">
                          {isReadyToPublish ? 'Publication Ready' : 'Draft Incomplete'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 max-w-2xl">
                        {isReadyToPublish
                          ? `All institutional governance checks passed. Scheduling this election will publish it to the student catalogue for ${election.institution_name || 'your college'}.`
                          : 'This election is currently saved as an internal DRAFT and is invisible to students. Complete the requirements below to publish and schedule it.'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${hasPositions ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-white text-amber-900'}`}>
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${hasPositions ? 'text-emerald-600' : 'text-slate-300'}`} />
                          <div>
                            <span className="font-semibold block">Contested Offices</span>
                            <span className="text-[11px] text-slate-500">{positions.length} configured {hasPositions ? '(Requirement met)' : '(Requires >= 1)'}</span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${hasValidEndTime ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-white text-amber-900'}`}>
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${hasValidEndTime ? 'text-emerald-600' : 'text-slate-300'}`} />
                          <div>
                            <span className="font-semibold block">Voting Schedule</span>
                            <span className="text-[11px] text-slate-500">{hasValidEndTime ? 'End time is in future' : 'End time is in the past'}</span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/40 text-indigo-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                          <div>
                            <span className="font-semibold block">College Isolation</span>
                            <span className="text-[11px] text-slate-500">{election.institution_name || 'Institution Bound'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!isReadyToPublish}
                        onClick={handleSchedule}
                        leftIcon={<Calendar className="w-4 h-4" />}
                        className={isReadyToPublish ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' : ''}
                      >
                        Publish &amp; Schedule Election
                      </Button>
                      {!hasPositions && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPosition(null);
                            setIsPositionModalOpen(true);
                          }}
                          leftIcon={<Plus className="w-4 h-4" />}
                          className="text-xs"
                        >
                          Add Required Office
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Metric Overview Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] text-slate-500 block mb-1">Voting Window Starts</span>
                <span className="font-semibold text-xs text-navy-950 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                  {new Date(election.start_time).toLocaleString()}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] text-slate-500 block mb-1">Voting Window Closes</span>
                <span className="font-semibold text-xs text-navy-950 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-primary" />
                  {new Date(election.end_time).toLocaleString()}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <span className="text-[11px] text-slate-500 block mb-1">Offices to Contest</span>
                <span className="font-bold text-xl text-navy-950">{positions.length}</span>
              </CardContent>
            </Card>

            <Card className="bg-purple-50/50 border-purple-200">
              <CardContent className="p-4">
                <span className="text-[11px] text-purple-800 block mb-1">Nominations Vetted</span>
                <span className="font-bold text-xl text-purple-900">
                  {candidates.filter((c) => c.status === 'APPROVED').length}
                  <span className="text-xs font-normal text-purple-600"> / {candidates.length} total</span>
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-surface-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('positions')}
              className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'positions'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Contested Positions ({positions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('nominations')}
              className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'nominations'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Candidate Nominations ({candidates.length})</span>
            </button>
          </div>

          {/* TAB 1: Contested Positions */}
          {activeTab === 'positions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-navy-950">Contested Offices</h3>
                  <p className="text-xs text-slate-500">
                    Executive seats and student council representation contested in this cycle.
                  </p>
                </div>
                {election.status === 'DRAFT' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSelectedPosition(null);
                      setIsPositionModalOpen(true);
                    }}
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Add Position
                  </Button>
                )}
              </div>

              {positions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-surface-border p-8 text-center text-xs text-slate-500">
                  No positions configured yet. Click "Add Position" to define an executive office.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {positions.map((pos) => (
                    <Card key={pos.id} className="hover:border-surface-border/80 transition-colors">
                      <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                        <div>
                          <div className="flex items-start justify-between">
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              Order #{pos.display_order}
                            </span>
                            {election.status === 'DRAFT' && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPosition(pos);
                                    setIsPositionModalOpen(true);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-brand-primary"
                                  title="Edit position"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePosition(pos)}
                                  className="p-1 rounded text-slate-400 hover:text-red-600"
                                  title="Delete position"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-navy-950 mt-2">{pos.title}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {pos.description || 'No specific mandate description entered.'}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-surface-border/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Approved Candidates:</span>
                          <span className="font-bold text-navy-950">
                            {pos.approved_candidates_count} / {pos.maximum_candidates} max
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Candidate Nominations Review */}
          {activeTab === 'nominations' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-navy-950">Candidate Nominations Review</h3>
                  <p className="text-xs text-slate-500">
                    Vetted student manifestos and backend eligibility engine snapshots.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium mr-1">Filter:</span>
                  {['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCandidateStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        candidateStatusFilter === st
                          ? 'bg-navy-950 text-white'
                          : 'bg-surface-subtle text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredCandidates.length === 0 ? (
                <div className="bg-white rounded-2xl border border-surface-border p-8 text-center text-xs text-slate-500">
                  No candidate nominations found for this filter.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-surface-border shadow-subtle overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-subtle/80 border-b border-surface-border text-slate-500 font-semibold uppercase tracking-wider">
                          <th className="py-3 px-4">Candidate & College ID</th>
                          <th className="py-3 px-4">Office Contested</th>
                          <th className="py-3 px-4">Cohort</th>
                          <th className="py-3 px-4">Eligibility Engine Status</th>
                          <th className="py-3 px-4">Review Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border/60 text-navy-950 font-normal">
                        {filteredCandidates.map((cand) => (
                          <tr key={cand.id} className="hover:bg-surface-subtle/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-navy-950">{cand.student_name}</div>
                              <div className="font-mono text-[11px] text-slate-500">
                                {cand.student_college_id}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {cand.position_title}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {cand.department} • Year {cand.academic_year}
                            </td>
                            <td className="py-3 px-4">
                              {cand.eligibility_snapshot?.is_eligible ? (
                                <Badge variant="success" size="sm">
                                  Eligible
                                </Badge>
                              ) : (
                                <Badge variant="danger" size="sm">
                                  Ineligible
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={
                                  cand.status === 'APPROVED'
                                    ? 'success'
                                    : cand.status === 'REJECTED'
                                    ? 'danger'
                                    : cand.status === 'SUBMITTED'
                                    ? 'warning'
                                    : 'neutral'
                                }
                                size="sm"
                              >
                                {cand.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedCandidate(cand);
                                  setIsReviewModalOpen(true);
                                }}
                                leftIcon={<Eye className="w-3.5 h-3.5" />}
                              >
                                Review
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Position Modal */}
      <PositionModal
        isOpen={isPositionModalOpen}
        onClose={() => {
          setIsPositionModalOpen(false);
          setSelectedPosition(null);
        }}
        onSubmit={handleSavePosition}
        position={selectedPosition}
        currentPositionsCount={positions.length}
      />

      {/* Nomination Review Modal */}
      <NominationReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => {
          setIsReviewModalOpen(false);
          setSelectedCandidate(null);
        }}
        candidate={selectedCandidate}
        onApprove={handleApproveCandidate}
        onReject={handleRejectCandidate}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmAction.isOpen}
        title={confirmAction.title}
        description={confirmAction.description}
        onConfirm={async () => {
          await confirmAction.action();
          setConfirmAction({ ...confirmAction, isOpen: false });
        }}
        onClose={() => setConfirmAction({ ...confirmAction, isOpen: false })}
      />
    </div>
  );
};
