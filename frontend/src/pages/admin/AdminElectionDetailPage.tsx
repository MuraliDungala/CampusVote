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
  UserPlus,
  Globe,
  AlertCircle,
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
  unpublishElection,
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
import { AddCandidateModal } from '../../components/elections/AddCandidateModal';

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

  const [isAddCandidateModalOpen, setIsAddCandidateModalOpen] = useState(false);
  const [selectedPositionForCandidate, setSelectedPositionForCandidate] = useState<ElectionPosition | null>(null);

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

  const canModifyElection = Boolean(election && !['CLOSED', 'ARCHIVED', 'CANCELLED', 'RESULTS_PUBLISHED'].includes(election.status));
  const isPublished = Boolean(election && (election.status === 'SCHEDULED' || election.status === 'ACTIVE'));
  const isDraft = Boolean(election && election.status === 'DRAFT');
  const isTerminalStatus = Boolean(election && ['CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED', 'CANCELLED'].includes(election.status));
  const approvedCandidates = candidates.filter((c) => c.status === 'APPROVED');
  const totalCandidates = candidates.length;
  const [isTogglingPublication, setIsTogglingPublication] = useState(false);

  // Unified Publish Action with Candidate Readiness Checks
  const executePublish = async () => {
    if (!id) return;
    try {
      setIsTogglingPublication(true);
      await scheduleElection(id);
      setToastMessage('Election successfully published and scheduled for student participation.');
      await loadElectionData();
    } catch (err: any) {
      setError(err.message || 'Failed to publish election.');
    } finally {
      setIsTogglingPublication(false);
    }
  };

  const handlePublish = (skipCandidateWarning: boolean = false) => {
    if (!id || !election) return;

    if (positions.length === 0) {
      setError('Cannot publish election: At least one contested position must be configured first.');
      return;
    }

    if (!skipCandidateWarning && totalCandidates === 0) {
      setConfirmAction({
        isOpen: true,
        title: 'No Candidates Selected — Publish Anyway?',
        description:
          'Warning: There are currently 0 candidates registered for this election. If published now, students will see an empty ballot without any contestants. Are you sure you want to publish now, or would you like to select candidates first?',
        action: async () => {
          await executePublish();
        },
      });
      return;
    }

    if (!skipCandidateWarning && totalCandidates > 0 && approvedCandidates.length === 0) {
      setConfirmAction({
        isOpen: true,
        title: 'Approve Candidates Before Publishing?',
        description: `There are ${totalCandidates} candidate nomination(s) registered, but none are approved yet. Only approved candidates appear on student ballots. Would you like to publish anyway?`,
        action: async () => {
          await executePublish();
        },
      });
      return;
    }

    setConfirmAction({
      isOpen: true,
      title: 'Publish & Schedule Election for Students?',
      description: `This election will be published to the student catalogue for ${
        election.institution_name || 'your college'
      } with ${approvedCandidates.length} approved candidate(s) across ${positions.length} position(s).`,
      action: async () => {
        await executePublish();
      },
    });
  };

  const handleUnpublish = () => {
    if (!id || !election) return;
    setConfirmAction({
      isOpen: true,
      title: 'Unpublish Election and Return to Draft?',
      description:
        'This will immediately remove the election from student visibility. Any scheduled voting will pause, and the election will return to Draft mode so you can add candidates or adjust offices.',
      action: async () => {
        try {
          setIsTogglingPublication(true);
          await unpublishElection(id);
          setToastMessage('Election unpublished and returned to Draft mode. It is now hidden from students.');
          await loadElectionData();
        } catch (err: any) {
          setError(err.message || 'Failed to unpublish election.');
        } finally {
          setIsTogglingPublication(false);
        }
      },
    });
  };

  const handleTogglePublication = () => {
    if (isTerminalStatus || isTogglingPublication) return;
    if (isPublished) {
      handleUnpublish();
    } else {
      handlePublish();
    }
  };

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
    handlePublish();
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
                    onClick={handleUnpublish}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    Unpublish to Draft
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
                    onClick={handleUnpublish}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    Unpublish to Draft
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

          {/* Election Public Visibility & Publishing Control Card */}
          <Card className={`border shadow-subtle transition-all duration-200 ${
            isPublished
              ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/70 via-white to-blue-50/40'
              : 'border-surface-border bg-white'
          }`}>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors shadow-sm ${
                      isPublished
                        ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-navy-950">
                        Election Public Visibility
                      </h2>
                      <Badge variant={isPublished ? 'success' : isDraft ? 'neutral' : 'info'} size="sm">
                        {isPublished ? 'Published & Live to Students' : isDraft ? 'Unpublished (Draft)' : election.status_display}
                      </Badge>
                      {isDraft && totalCandidates === 0 && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Candidates Not Selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                      {isPublished
                        ? 'This election is published to the collegiate catalogue. Eligible students can view candidate profiles, read manifestos, and cast ballots when the voting window opens.'
                        : isDraft
                        ? 'This election is saved as an internal Draft and is completely invisible to students. Use this section to select candidates, configure offices, and verify eligibility before publishing.'
                        : `This election cycle is currently in ${election.status_display} status.`}
                    </p>
                  </div>
                </div>

                {/* Control Toggle Switch */}
                <div className="flex items-center gap-3 self-end sm:self-center shrink-0 bg-surface-subtle/80 px-3.5 py-2 rounded-xl border border-surface-border/80">
                  <span className="text-xs font-semibold text-slate-700">
                    {isPublished ? 'Published' : 'Unpublished'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublished}
                    aria-label="Toggle election public visibility"
                    disabled={isTerminalStatus || isTogglingPublication}
                    onClick={handleTogglePublication}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 ${
                      isTerminalStatus
                        ? 'opacity-40 cursor-not-allowed bg-slate-200'
                        : isPublished
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-slate-300 hover:bg-slate-400'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isPublished ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pre-Publication Readiness & Validation Checklist for DRAFT elections */}
          {election.status === 'DRAFT' && (() => {
            const hasPositions = positions.length > 0;
            const hasValidEndTime = new Date(election.end_time).getTime() > Date.now();
            const hasValidTimeWindow = new Date(election.start_time).getTime() < new Date(election.end_time).getTime();
            const hasApprovedCandidates = approvedCandidates.length > 0;
            const isReadyToPublish = hasPositions && hasValidEndTime && hasValidTimeWindow;

            return (
              <Card className={`border shadow-subtle ${isReadyToPublish && hasApprovedCandidates ? 'border-emerald-300 bg-gradient-to-r from-emerald-50/70 via-white to-blue-50/50' : 'border-amber-300 bg-amber-50/40'}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isReadyToPublish && hasApprovedCandidates ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <h3 className="text-sm font-bold text-navy-950">
                          {isReadyToPublish && hasApprovedCandidates
                            ? 'Pre-Publication Validation Passed — Ready to Publish'
                            : !hasApprovedCandidates
                            ? 'Candidate Selection Recommended Before Publishing'
                            : 'Pre-Publication Requirements Incomplete'}
                        </h3>
                        <Badge variant={isReadyToPublish && hasApprovedCandidates ? 'success' : 'warning'} size="sm">
                          {isReadyToPublish && hasApprovedCandidates ? 'Ready to Publish' : !hasApprovedCandidates ? 'Candidates Needed' : 'Draft Incomplete'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 max-w-2xl">
                        {isReadyToPublish && hasApprovedCandidates
                          ? `All institutional governance checks passed and candidates are enrolled. You can turn on the visibility toggle to publish this election to students.`
                          : !hasApprovedCandidates
                          ? 'Notice: No approved candidates registered yet. Students will see an empty ballot if published now. Select and approve candidates below first.'
                          : 'This election is currently saved as an internal DRAFT and is invisible to students. Complete the requirements below to publish and schedule it.'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${hasPositions ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-white text-amber-900'}`}>
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${hasPositions ? 'text-emerald-600' : 'text-slate-300'}`} />
                          <div>
                            <span className="font-semibold block">Contested Offices</span>
                            <span className="text-[11px] text-slate-500">{positions.length} configured {hasPositions ? '(Met)' : '(>= 1)'}</span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${hasApprovedCandidates ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : totalCandidates > 0 ? 'border-amber-200 bg-amber-50/80 text-amber-900' : 'border-amber-200 bg-white text-amber-900'}`}>
                          <Users className={`w-4 h-4 shrink-0 ${hasApprovedCandidates ? 'text-emerald-600' : 'text-amber-500'}`} />
                          <div>
                            <span className="font-semibold block">Candidates</span>
                            <span className="text-[11px] text-slate-500">
                              {hasApprovedCandidates
                                ? `${approvedCandidates.length} approved`
                                : totalCandidates > 0
                                ? `${totalCandidates} pending review`
                                : '0 selected (Pending)'}
                            </span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${hasValidEndTime ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-200 bg-white text-amber-900'}`}>
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${hasValidEndTime ? 'text-emerald-600' : 'text-slate-300'}`} />
                          <div>
                            <span className="font-semibold block">Voting Schedule</span>
                            <span className="text-[11px] text-slate-500">{hasValidEndTime ? 'Schedule valid' : 'End time past'}</span>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/40 text-indigo-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                          <div>
                            <span className="font-semibold block">College Isolation</span>
                            <span className="text-[11px] text-slate-500">{election.institution_name || 'Bound'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!hasPositions || isTogglingPublication}
                        onClick={handleTogglePublication}
                        leftIcon={<Globe className="w-4 h-4" />}
                        className={isReadyToPublish && hasApprovedCandidates ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' : 'bg-slate-700 hover:bg-slate-800 text-white'}
                      >
                        Publish Election to Students
                      </Button>
                      {totalCandidates === 0 && positions.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPositionForCandidate(positions[0]);
                            setIsAddCandidateModalOpen(true);
                          }}
                          leftIcon={<UserPlus className="w-4 h-4 text-purple-600" />}
                          className="text-xs border-purple-200 bg-purple-50/50 hover:bg-purple-100 text-purple-900 font-semibold"
                        >
                          + Select Candidate
                        </Button>
                      )}
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

                        <div className="pt-3 border-t border-surface-border/60 flex items-center justify-between text-[11px] gap-2">
                          <div>
                            <span className="text-slate-500">Approved Candidates: </span>
                            <span className="font-bold text-navy-950">
                              {pos.approved_candidates_count} / {pos.maximum_candidates} max
                            </span>
                          </div>
                          {canModifyElection && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[11px] h-7 px-2.5 py-0 text-brand-primary border-brand-primary/30 hover:bg-blue-50"
                              onClick={() => {
                                setSelectedPositionForCandidate(pos);
                                setIsAddCandidateModalOpen(true);
                              }}
                              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                            >
                              Add Candidate
                            </Button>
                          )}
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

                <div className="flex flex-wrap items-center gap-2">
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

                  {canModifyElection && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedPositionForCandidate(null);
                        setIsAddCandidateModalOpen(true);
                      }}
                      leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                    >
                      Add Candidate
                    </Button>
                  )}
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

      {/* Add Candidate Modal */}
      <AddCandidateModal
        isOpen={isAddCandidateModalOpen}
        onClose={() => {
          setIsAddCandidateModalOpen(false);
          setSelectedPositionForCandidate(null);
        }}
        positions={positions}
        selectedPosition={selectedPositionForCandidate}
        onCandidateAdded={(newCand) => {
          setToastMessage(`Candidate ${newCand.student_name} (${newCand.student_college_id}) registered for ${newCand.position_title} successfully.`);
          loadElectionData();
        }}
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
