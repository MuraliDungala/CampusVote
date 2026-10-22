import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Layers,
  Award,
  Vote,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { Election, ElectionPosition, Candidate, NominationFormData } from '../../types/election';
import { getElection, getPositions, getElectionCandidates, submitNomination } from '../../services/elections';
import { NominationModal } from '../../components/elections/NominationModal';

export const StudentElectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<ElectionPosition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Nomination Modal
  const [isNominationModalOpen, setIsNominationModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<ElectionPosition | null>(null);

  const loadData = useCallback(async () => {
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
    loadData();
  }, [loadData]);

  const handleNominateSubmit = async (formData: NominationFormData) => {
    if (!selectedPosition) return;
    await submitNomination(selectedPosition.id, formData);
    setToastMessage(`Your nomination for "${selectedPosition.title}" was submitted successfully!`);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-12">
        <LoadingState message="Loading election details..." />
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="flex-1 p-8">
        <ErrorState title="Failed to Load Election" message={error || 'Election not found'} onRetry={loadData} />
      </div>
    );
  }

  const isStudent = user?.role === 'STUDENT';
  const allowsNominations = election.status === 'SCHEDULED' || election.status === 'DRAFT';

  return (
    <div className="flex-1 pb-16">
      <PageHeader
        title={election.title}
        description={election.description || 'Collegiate election mandate and candidate platforms.'}
        badge={
          <Badge variant={election.status === 'ACTIVE' ? 'success' : 'primary'} size="sm">
            {election.status_display}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            {isStudent && election.status === 'ACTIVE' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/elections/${election.id}/ballot`)}
                leftIcon={<Vote className="w-4 h-4" />}
                className="bg-brand-primary text-white shadow-sm hover:bg-brand-primary/90"
              >
                Cast Ballot
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/elections')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Elections
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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

        {election.status === 'ACTIVE' && (
          <div className="p-4 sm:p-5 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                <Vote className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-navy-950 text-sm">Voting is Currently Active</h4>
                <p className="text-xs text-slate-600">
                  Cast your vote securely using CampusVote's anonymous ballot architecture.
                </p>
              </div>
            </div>
            {isStudent ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/elections/${election.id}/ballot`)}
                leftIcon={<Vote className="w-4 h-4" />}
                className="whitespace-nowrap"
              >
                Go to Voting Interface
              </Button>
            ) : (
              <span className="text-xs text-slate-500 italic">Student login required to participate</span>
            )}
          </div>
        )}

        {/* Schedule & Overview Card */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-slate-500 block">Voting Opens</span>
                  <span className="font-semibold text-navy-950">
                    {new Date(election.start_time).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-slate-500 block">Voting Closes</span>
                  <span className="font-semibold text-navy-950">
                    {new Date(election.end_time).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-slate-500 block">Contested Offices</span>
                  <span className="font-semibold text-navy-950">
                    {positions.length} Executive Positions
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Positions & Candidate Manifestos */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-navy-950">Contested Positions & Certified Candidates</h3>
              <p className="text-xs text-slate-500">
                Review candidate platforms and vision statements for each office.
              </p>
            </div>
          </div>

          {positions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-surface-border p-8 text-center text-xs text-slate-500">
              No positions are currently contested for this election cycle.
            </div>
          ) : (
            <div className="space-y-6">
              {positions.map((pos) => {
                const positionCandidates = candidates.filter(
                  (c) => c.election_position === pos.id || c.position_title === pos.title
                );

                return (
                  <div key={pos.id} className="bg-white rounded-2xl border border-surface-border shadow-subtle overflow-hidden">
                    {/* Position Header */}
                    <div className="p-4 sm:p-5 bg-surface-subtle/60 border-b border-surface-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-navy-950 text-base">{pos.title}</span>
                          <span className="text-[11px] font-mono bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded">
                            Order #{pos.display_order}
                          </span>
                        </div>
                        {pos.description && (
                          <p className="text-xs text-slate-600 mt-1">{pos.description}</p>
                        )}
                      </div>

                      {isStudent && allowsNominations && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPosition(pos);
                            setIsNominationModalOpen(true);
                          }}
                          leftIcon={<Award className="w-4 h-4 text-brand-primary" />}
                        >
                          Nominate for this Office
                        </Button>
                      )}
                    </div>

                    {/* Candidates for this Position */}
                    <div className="p-4 sm:p-6">
                      {positionCandidates.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          No certified candidates currently approved for this position.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {positionCandidates.map((cand, candIdx) => {
                            const avatarNum = ((cand.id.charCodeAt(0) || candIdx) % 3) + 1;
                            const avatarSrc = `/images/candidate-avatar-${avatarNum}.svg`;
                            return (
                              <div
                                key={cand.id}
                                className="p-5 rounded-2xl border border-surface-border bg-white shadow-subtle hover:shadow-card transition-all flex flex-col justify-between"
                              >
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-full overflow-hidden bg-navy-900 border-2 border-brand-cyan/40 shrink-0">
                                        <img
                                          src={avatarSrc}
                                          alt={cand.candidate_name || cand.student_name}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                      <div>
                                        <h4 className="font-bold text-sm text-navy-950">
                                          {cand.candidate_name || cand.student_name}
                                        </h4>
                                        <p className="text-xs text-slate-500 font-medium">
                                          {cand.department} • Class of {cand.academic_year}
                                        </p>
                                      </div>
                                    </div>
                                    <Badge variant="success" size="sm">
                                      Certified
                                    </Badge>
                                  </div>

                                  <div>
                                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                      Candidate Platform &amp; Vision
                                    </span>
                                    <div className="text-xs text-slate-700 leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap bg-surface-canvas p-3 rounded-xl border border-surface-border/60">
                                      {cand.manifesto || 'No detailed manifesto submitted.'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Student Nomination Modal */}
      <NominationModal
        isOpen={isNominationModalOpen}
        onClose={() => {
          setIsNominationModalOpen(false);
          setSelectedPosition(null);
        }}
        position={selectedPosition}
        electionTitle={election.title}
        onSubmit={handleNominateSubmit}
      />
    </div>
  );
};
