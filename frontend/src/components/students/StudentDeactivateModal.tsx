import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Student } from '../../types/student';
import { Button } from '../ui/Button';

export interface StudentDeactivateModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (studentId: string, reason: string) => Promise<void>;
}

export const StudentDeactivateModal: React.FC<StudentDeactivateModalProps> = ({
  student,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !student) return null;

  const handleDeactivate = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(student.id, reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-md p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 id="deactivate-modal-title" className="text-base font-bold text-navy-950">
              Deactivate Student Record
            </h3>
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

        <div className="py-4 space-y-3 text-xs">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <p className="font-semibold mb-1">
              Are you sure you want to deactivate {student.full_name} ({student.college_id})?
            </p>
            <p className="text-red-600">
              This action will mark the student record as inactive and immediately disqualify the student
              from voting in all upcoming and active elections. Historical audit entries will be preserved.
            </p>
          </div>

          {error && (
            <p className="text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">{error}</p>
          )}

          <div>
            <label htmlFor="deactivation-reason" className="block font-medium text-slate-700 mb-1">
              Reason for Deactivation (Optional)
            </label>
            <textarea
              id="deactivation-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Disciplinary suspension, transfer to another institution, or graduation."
              className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleDeactivate}
            isLoading={isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Confirm Deactivation
          </Button>
        </div>
      </div>
    </div>
  );
};
