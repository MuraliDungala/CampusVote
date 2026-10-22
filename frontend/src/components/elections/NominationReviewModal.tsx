import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, User } from 'lucide-react';
import { Candidate } from '../../types/election';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export interface NominationReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  onApprove: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string, reason: string) => Promise<void>;
}

export const NominationReviewModal: React.FC<NominationReviewModalProps> = ({
  isOpen,
  onClose,
  candidate,
  onApprove,
  onReject,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !candidate) return null;

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onApprove(candidate.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to approve nomination.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('A rejection reason is mandatory.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onReject(candidate.id, rejectionReason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reject nomination.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const eligibility = candidate.eligibility_snapshot;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-lg p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 id="review-modal-title" className="text-base font-bold text-navy-950">
                Review Candidate Nomination
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {candidate.student_name} ({candidate.student_college_id})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-surface-subtle"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="my-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="py-4 space-y-4 text-xs">
          {/* Demographic & Position Badges */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-surface-subtle rounded-xl border border-surface-border">
            <div>
              <span className="text-slate-500 block mb-0.5">Contesting Office</span>
              <span className="font-bold text-navy-950 text-sm">{candidate.position_title}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">Academic Cohort</span>
              <span className="font-semibold text-slate-800">
                {candidate.department} • Year {candidate.academic_year}
              </span>
            </div>
          </div>

          {/* Eligibility Engine Snapshot */}
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-navy-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-brand-primary" />
                Backend Eligibility Evaluation
              </span>
              <Badge
                variant={eligibility?.is_eligible ? 'success' : 'danger'}
                size="sm"
              >
                {eligibility?.is_eligible ? 'Eligible' : 'Ineligible'}
              </Badge>
            </div>
            <p className="text-slate-600 mt-1">
              {eligibility?.reason || 'Evaluation records recorded upon submission.'}
            </p>
            {eligibility?.rule_title && (
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Rule: {eligibility.rule_title}
              </p>
            )}
          </div>

          {/* Manifesto */}
          <div>
            <label className="block font-medium text-slate-700 mb-1">Submitted Manifesto</label>
            <div className="p-3 bg-white rounded-xl border border-surface-border text-slate-700 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
              {candidate.manifesto || 'No manifesto text provided.'}
            </div>
          </div>

          {/* Reject Reason input if reject mode active */}
          {showRejectInput && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 animate-in fade-in">
              <label htmlFor="rejection-reason-input" className="block font-semibold text-red-900">
                Reason for Rejection <span className="text-red-600">*</span>
              </label>
              <textarea
                id="rejection-reason-input"
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain the administrative or constitutional justification for rejecting this nomination..."
                className="w-full px-3 py-2 rounded-xl border border-red-300 bg-white focus:border-red-500 text-xs"
              />
              <p className="text-[11px] text-red-700">
                The reason will be permanently recorded in the audit log and visible to the student.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-surface-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            {!showRejectInput ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectInput(true)}
                  disabled={isSubmitting}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  leftIcon={<XCircle className="w-4 h-4" />}
                >
                  Reject...
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApprove}
                  isLoading={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Approve Candidate
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectionReason('');
                    setError(null);
                  }}
                  disabled={isSubmitting}
                >
                  Cancel Rejection
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReject}
                  isLoading={isSubmitting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Confirm Rejection
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
