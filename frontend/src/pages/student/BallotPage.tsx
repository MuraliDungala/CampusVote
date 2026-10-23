import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Vote,
  Lock,
  Clock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/ui/LoadingState';
import { fetchBallotDefinition, submitBallot } from '../../services/voting';
import { BallotDefinition, PositionSelectionItem, BallotSubmissionResponse } from '../../types/voting';

type VotingStep = 'SELECTION' | 'REVIEW' | 'CONFIRMED';

export const BallotPage: React.FC = () => {
  const { id: electionId } = useParams<{ id: string }>();

  const [ballot, setBallot] = useState<BallotDefinition | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // In-memory selections mapping: positionId -> { candidateId: string | null, isAbstain: boolean }
  const [selections, setSelections] = useState<Record<string, { candidateId: string | null; isAbstain: boolean }>>({});

  const [currentStep, setCurrentStep] = useState<VotingStep>('SELECTION');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<BallotSubmissionResponse | null>(null);

  useEffect(() => {
    if (!electionId) return;

    const loadBallot = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchBallotDefinition(electionId);
        setBallot(data);
      } catch (err: any) {
        setError(err?.details?.error || err?.message || 'Failed to load ballot definition.');
      } finally {
        setIsLoading(false);
      }
    };

    loadBallot();
  }, [electionId]);

  // Handle single candidate choice for a position
  const handleSelectCandidate = (positionId: string, candidateId: string) => {
    setSelections((prev) => ({
      ...prev,
      [positionId]: { candidateId, isAbstain: false },
    }));
  };

  // Handle explicit abstention for a position
  const handleSelectAbstain = (positionId: string) => {
    setSelections((prev) => ({
      ...prev,
      [positionId]: { candidateId: null, isAbstain: true },
    }));
  };

  // Check if all positions have been chosen or abstained
  const isBallotComplete = (): boolean => {
    if (!ballot) return false;
    return ballot.positions.every((pos) => selections[pos.id] !== undefined);
  };

  const getCompletedCount = (): number => {
    if (!ballot) return 0;
    return ballot.positions.filter((pos) => selections[pos.id] !== undefined).length;
  };

  // Handle ballot submission to the decoupled backend vote vault
  const handleSubmitBallot = async () => {
    if (!electionId || !ballot) return;

    const payloadSelections: PositionSelectionItem[] = ballot.positions.map((pos) => {
      const choice = selections[pos.id];
      return {
        position_id: pos.id,
        candidate_id: choice?.candidateId || null,
        is_abstain: choice?.isAbstain || false,
      };
    });

    setIsSubmitting(true);
    setError(null);

    try {
      const receipt = await submitBallot(electionId, { selections: payloadSelections });
      setSubmissionReceipt(receipt);
      setCurrentStep('CONFIRMED');
    } catch (err: any) {
      const msg = err?.details?.error || err?.message || 'Failed to submit ballot. Please try again.';
      setError(msg);
      // If error indicates already voted, return to view
      if (err?.status === 409 || err?.details?.code === 'ALREADY_PARTICIPATED') {
        if (ballot.voter_status) {
          ballot.voter_status.has_participated = true;
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <LoadingState message="Loading ballot definition..." />
      </div>
    );
  }

  if (error && !ballot) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-950 mb-2">Unable to Open Ballot</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">{error}</p>
          <Link to="/elections">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Elections
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!ballot) return null;

  const { election, positions, voter_status } = ballot;

  // Render voter state guards (Ineligible, Already Voted, Verification Required, Closed)
  if (voter_status?.has_participated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center border-emerald-200 bg-emerald-50/40">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy-950 mb-2">Ballot Already Cast</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            Our records confirm that you have already cast your ballot in{' '}
            <strong className="text-navy-900">{election.title}</strong>. To guarantee fair elections,
            one-person-one-vote is strictly enforced.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/elections">
              <Button variant="outline" size="sm">Browse Other Elections</Button>
            </Link>
            <Link to="/student/dashboard">
              <Button variant="primary" size="sm">Return to Dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (voter_status?.requires_approval) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center border-amber-200 bg-amber-50/40">
          <Clock className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy-950 mb-2">Registration Pending Institutional Approval</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            Your student account is awaiting review and approval by your college administrator. Once accepted, you will have immediate access to cast your ballot.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/elections">
              <Button variant="outline" size="sm">Browse Elections</Button>
            </Link>
            <Link to="/student/dashboard">
              <Button variant="primary" size="sm">Go to Student Portal</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (voter_status?.requires_verification) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center border-amber-200 bg-amber-50/40">
          <Lock className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy-950 mb-2">Identity Verification Required</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            You must complete two-factor Smart ID verification before casting a ballot.
          </p>
          <Link to="/login">
            <Button variant="primary" size="sm">
              Verify College ID & OTP
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (voter_status && !voter_status.is_eligible) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center border-red-200 bg-red-50/40">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy-950 mb-2">Voter Ineligible for this Ballot</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            {voter_status.reason || 'You do not meet the institutional franchise criteria for this election.'}
          </p>
          <Link to="/elections">
            <Button variant="outline" size="sm">Return to Elections</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!election.is_open) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="shadow-elevated p-8 text-center border-slate-200">
          <Lock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-navy-950 mb-2">Ballot Currently Closed</h2>
          <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto">
            This election is currently not open for active ballot submissions.
          </p>
          <Link to={`/elections/${election.id}`}>
            <Button variant="outline" size="sm">View Election Details</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 pb-20 bg-surface-canvas">
      {/* Top Banner & Navigation Header */}
      <div className="bg-surface-elevated border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            to={`/elections/${election.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-950 transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Election Overview
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="primary" size="sm">{election.academic_year}</Badge>
                <Badge variant="success" size="sm">Live Voting Ballot</Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-navy-950">{election.title}</h1>
              <p className="text-xs text-slate-500 mt-1">
                Decoupled Anonymous Ballot • Single-use vote vault
              </p>
            </div>

            {/* Stepper Pill Indicator */}
            {currentStep !== 'CONFIRMED' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <span
                  className={`px-3 py-1 rounded-lg transition-all ${
                    currentStep === 'SELECTION' ? 'bg-white text-navy-950 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  1. Vote
                </span>
                <span
                  className={`px-3 py-1 rounded-lg transition-all ${
                    currentStep === 'REVIEW' ? 'bg-white text-navy-950 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  2. Review
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {error && (
          <div
            className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-3 shadow-xs"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <span className="leading-relaxed font-medium">{error}</span>
          </div>
        )}

        {/* =========================================================================
            STAGE 1: BALLOT PRESENTATION & POSITION SELECTION
           ========================================================================= */}
        {currentStep === 'SELECTION' && (
          <div className="space-y-8">
            {/* Progress Card */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 text-navy-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Vote className="w-5 h-5 text-brand-primary shrink-0" />
                <div>
                  <span className="text-xs font-bold text-navy-950 block">
                    Voting Progress: {getCompletedCount()} of {positions.length} positions decided
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Select one candidate for each contested office or choose explicit abstention.
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setCurrentStep('REVIEW')}
                disabled={!isBallotComplete()}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Review Ballot
              </Button>
            </div>

            {/* Position Cards */}
            <div className="space-y-6">
              {positions.map((pos, index) => {
                const currentChoice = selections[pos.id];
                const isSelected = currentChoice !== undefined;

                return (
                  <Card key={pos.id} className="shadow-elevated overflow-hidden border-t-4 border-t-brand-primary">
                    <CardHeader className="bg-slate-50/60 pb-3 border-b border-surface-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-navy-900 text-white text-xs font-bold flex items-center justify-center">
                            {index + 1}
                          </span>
                          <CardTitle className="text-base text-navy-950">{pos.title}</CardTitle>
                        </div>
                        {isSelected ? (
                          <Badge variant="success" size="sm" className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Selected
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">Pending Choice</Badge>
                        )}
                      </div>
                      {pos.description && (
                        <CardDescription className="text-xs text-slate-500 mt-1 pl-8">
                          {pos.description}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="p-5 space-y-4">
                      {/* Candidate Options */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pos.candidates.map((cand) => {
                          const isPicked = currentChoice?.candidateId === cand.id;

                          const avatarNum = ((cand.id.charCodeAt(0) || 0) % 3) + 1;
                          const avatarSrc = cand.profile_image || `/images/candidate-avatar-${avatarNum}.svg`;

                          return (
                            <div
                              key={cand.id}
                              onClick={() => handleSelectCandidate(pos.id, cand.id)}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                                isPicked
                                  ? 'border-brand-cyan bg-blue-50/80 ring-2 ring-brand-cyan/40 shadow-sm'
                                  : 'border-surface-border bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-subtle'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <div className="w-11 h-11 rounded-full overflow-hidden bg-navy-900 border border-slate-200 shrink-0">
                                    <img
                                      src={avatarSrc}
                                      alt={cand.full_name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = `/images/candidate-avatar-1.svg`;
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-navy-950">{cand.full_name}</h4>
                                    <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">
                                      {cand.manifesto || 'Candidate platform statement.'}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-1">
                                  <div
                                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                      isPicked ? 'border-brand-cyan bg-brand-cyan text-white' : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isPicked && <span className="w-2 h-2 rounded-full bg-white" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Explicit Abstention Option */}
                      <div
                        onClick={() => handleSelectAbstain(pos.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          currentChoice?.isAbstain
                            ? 'border-amber-400 bg-amber-50/80 ring-2 ring-amber-400/20'
                            : 'border-dashed border-slate-300 bg-slate-50/40 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">
                            —
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-700">Abstain for this Office</div>
                            <div className="text-[11px] text-slate-500">Record a non-preference ballot for {pos.title}</div>
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            currentChoice?.isAbstain ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                          }`}
                        >
                          {currentChoice?.isAbstain && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Bottom Actions Bar */}
            <div className="p-4 rounded-xl border border-surface-border bg-surface-elevated flex items-center justify-between shadow-sm">
              <span className="text-xs text-slate-600 font-medium">
                {isBallotComplete()
                  ? 'All offices decided. Proceed to review screen.'
                  : `Please make selections for all remaining ${positions.length - getCompletedCount()} position(s).`}
              </span>

              <Button
                variant="primary"
                size="md"
                onClick={() => setCurrentStep('REVIEW')}
                disabled={!isBallotComplete()}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Review Ballot Choices
              </Button>
            </div>
          </div>
        )}

        {/* =========================================================================
            STAGE 2: LOCAL IN-MEMORY REVIEW BEFORE SUBMISSION
           ========================================================================= */}
        {currentStep === 'REVIEW' && (
          <div className="space-y-6">
            <Card className="shadow-elevated">
              <CardHeader className="border-b border-surface-border pb-4">
                <CardTitle className="text-lg">Review Your Ballot Selections</CardTitle>
                <CardDescription className="text-xs">
                  Please verify your selections before final submission. Once cast, choices cannot be modified.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                {/* Privacy Boundary Notice */}
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 text-navy-950 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-600 leading-relaxed">
                    <strong className="text-navy-950 block mb-0.5">Decoupled Vote Vault Anonymity</strong>
                    Your vote choices are stored into an isolated, anonymous vote table without your name,
                    student ID, or session token. Your student account will record participation to prevent duplicate voting,
                    with zero linkage to your secret ballot.
                  </div>
                </div>

                {/* Summary Table */}
                <div className="border border-surface-border rounded-xl overflow-hidden divide-y divide-surface-border">
                  {positions.map((pos) => {
                    const choice = selections[pos.id];
                    const selectedCand = pos.candidates.find((c) => c.id === choice?.candidateId);

                    return (
                      <div key={pos.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            {pos.title}
                          </span>
                          <span className="text-sm font-bold text-navy-950">
                            {choice?.isAbstain ? (
                              <span className="text-amber-700 italic">Abstained</span>
                            ) : selectedCand ? (
                              selectedCand.full_name
                            ) : (
                              'Not Decided'
                            )}
                          </span>
                        </div>

                        <Badge variant={choice?.isAbstain ? 'warning' : 'primary'} size="sm">
                          {choice?.isAbstain ? 'Non-Preference' : 'Candidate Vote'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>

              <CardFooter className="justify-between border-t border-surface-border p-4 bg-slate-50/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentStep('SELECTION')}
                  disabled={isSubmitting}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Edit Selections
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSubmitBallot}
                  isLoading={isSubmitting}
                  leftIcon={<Vote className="w-4 h-4" />}
                >
                  Confirm & Cast Anonymous Ballot
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* =========================================================================
            STAGE 3: SUBMISSION RECEIPT
           ========================================================================= */}
        {currentStep === 'CONFIRMED' && submissionReceipt && (
          <div className="space-y-6">
            <Card className="shadow-elevated p-8 text-center border-emerald-200">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-extrabold text-navy-950 mb-2">Ballot Successfully Cast!</h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                Your vote has been committed to the anonymous vote vault. Thank you for exercising your franchise.
              </p>

              {/* Official Receipt Token Box */}
              <div className="max-w-md mx-auto p-4 rounded-xl border border-slate-300 bg-slate-50 text-left mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Submission Receipt
                  </span>
                  <Badge variant="success" size="sm">Committed</Badge>
                </div>
                <div className="font-mono text-base font-extrabold text-navy-950 tracking-wider">
                  {submissionReceipt.receipt_id}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Timestamp: {new Date(submissionReceipt.submitted_at).toLocaleString()}
                </p>
                <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    This receipt proves that your ballot was accepted. To protect ballot secrecy, it contains
                    no candidate selections.
                  </span>
                </div>
              </div>

              <div className="flex justify-center gap-3">
                <Link to="/elections">
                  <Button variant="outline" size="sm">Browse Other Elections</Button>
                </Link>
                <Link to="/student/dashboard">
                  <Button variant="primary" size="sm">Return to Dashboard</Button>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
