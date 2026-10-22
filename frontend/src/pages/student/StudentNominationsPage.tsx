import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Vote,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { Candidate, CandidateStatus } from '../../types/election';
import { getMyNominations, withdrawNomination } from '../../services/elections';

const STATUS_VARIANTS: Record<CandidateStatus, 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

export const StudentNominationsPage: React.FC = () => {
  const navigate = useNavigate();

  const [nominations, setNominations] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Withdraw confirmation dialog
  const [withdrawTarget, setWithdrawTarget] = useState<Candidate | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const fetchNominations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyNominations();
      setNominations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch candidate nominations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNominations();
  }, []);

  const handleConfirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setIsWithdrawing(true);
    try {
      await withdrawNomination(withdrawTarget.id);
      setToastMessage(`Nomination for "${withdrawTarget.position_title}" withdrawn.`);
      setWithdrawTarget(null);
      fetchNominations();
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw nomination.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="flex-1 pb-16">
      <PageHeader
        title="My Candidate Nominations"
        description="Track the administrative vetting, eligibility evaluation, and certification status of your filed candidacies."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/elections')}
            leftIcon={<Vote className="w-4 h-4 text-brand-primary" />}
          >
            Browse Contested Elections
          </Button>
        }
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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

        {isLoading ? (
          <div className="bg-white rounded-2xl border border-surface-border p-12">
            <LoadingState message="Fetching your filed nominations..." />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-surface-border p-8">
            <ErrorState title="Failed to Load Nominations" message={error} onRetry={fetchNominations} />
          </div>
        ) : nominations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-border p-8">
            <EmptyState
              title="No Nominations Filed"
              description="You have not filed for any contested executive offices. Browse open collegiate elections to view available seats and submit your candidacy platform."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/elections')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Explore Contested Elections
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {nominations.map((nom) => (
              <Card key={nom.id} className="overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
                        <Award className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-navy-950">{nom.position_title}</h4>
                        <p className="text-xs text-slate-500">{nom.election_title}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANTS[nom.status]} size="sm">
                        {nom.status}
                      </Badge>
                      {nom.status !== 'WITHDRAWN' && nom.status !== 'REJECTED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWithdrawTarget(nom)}
                          className="text-red-600 border-red-200 hover:bg-red-50 text-xs py-1"
                        >
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Eligibility Engine Card */}
                    <div className="p-3 bg-surface-subtle rounded-xl border border-surface-border">
                      <span className="font-bold text-navy-950 flex items-center gap-1.5 mb-1">
                        <ShieldCheck className="w-4 h-4 text-brand-primary" />
                        Backend Eligibility Status
                      </span>
                      <p className="text-slate-600">
                        {nom.eligibility_snapshot?.reason || 'Evaluation records recorded upon submission.'}
                      </p>
                      {nom.eligibility_snapshot?.evaluated_at && (
                        <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                          Evaluated: {new Date(nom.eligibility_snapshot.evaluated_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Timeline & Rejection Explanation */}
                    <div className="p-3 bg-surface-subtle rounded-xl border border-surface-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Submitted:</span>
                        <span className="font-semibold text-slate-800">
                          {nom.submitted_at ? new Date(nom.submitted_at).toLocaleDateString() : 'Draft'}
                        </span>
                      </div>
                      {nom.reviewed_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Reviewed:</span>
                          <span className="font-semibold text-slate-800">
                            {new Date(nom.reviewed_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {nom.rejection_reason && (
                        <div className="mt-2 pt-2 border-t border-red-200 text-red-700">
                          <span className="font-bold block mb-0.5">Rejection Explanation:</span>
                          <p>{nom.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manifesto Preview */}
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block mb-1">
                      Your Submitted Campaign Platform
                    </span>
                    <div className="p-3 bg-white rounded-xl border border-surface-border text-xs text-slate-700 leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                      {nom.manifesto || 'No manifesto text.'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={Boolean(withdrawTarget)}
        title="Withdraw Candidate Nomination?"
        description={`Are you sure you want to withdraw your nomination for "${withdrawTarget?.position_title}" in ${withdrawTarget?.election_title}? This action is permanent and recorded in the audit log.`}
        confirmLabel="Confirm Withdrawal"
        cancelLabel="Keep Nomination"
        variant="danger"
        isLoading={isWithdrawing}
        onConfirm={handleConfirmWithdraw}
        onClose={() => setWithdrawTarget(null)}
      />
    </div>
  );
};
