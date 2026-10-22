import React, { useState } from 'react';
import { X, AlertCircle, Award } from 'lucide-react';
import { ElectionPosition, NominationFormData } from '../../types/election';
import { Button } from '../ui/Button';

export interface NominationModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: ElectionPosition | null;
  electionTitle?: string;
  onSubmit: (data: NominationFormData) => Promise<void>;
}

export const NominationModal: React.FC<NominationModalProps> = ({
  isOpen,
  onClose,
  position,
  electionTitle = '',
  onSubmit,
}) => {
  const [manifesto, setManifesto] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [submitNow, setSubmitNow] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !position) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!manifesto.trim()) {
      newErrors.manifesto = 'Candidate manifesto or vision statement is required.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        manifesto: manifesto.trim(),
        profile_image: profileImage.trim() || undefined,
        submit_now: submitNow,
      });
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to submit nomination.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nomination-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-lg p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand-primary flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 id="nomination-modal-title" className="text-base font-bold text-navy-950">
                File Candidate Nomination
              </h3>
              <p className="text-xs text-slate-500">{electionTitle}</p>
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

        <div className="mt-3 p-3 bg-surface-subtle rounded-xl border border-surface-border/60 text-xs">
          <p className="font-semibold text-navy-950">Position: {position.title}</p>
          {position.description && (
            <p className="text-slate-600 mt-0.5">{position.description}</p>
          )}
        </div>

        {serverError && (
          <div className="my-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="py-3 space-y-3.5 text-xs">
          <div>
            <label htmlFor="nomination-manifesto" className="block font-medium text-slate-700 mb-1">
              Campaign Manifesto & Vision Statement <span className="text-red-500">*</span>
            </label>
            <textarea
              id="nomination-manifesto"
              rows={4}
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              placeholder="Outline your policy platform, goals for office, and campaign priorities..."
              className={`w-full px-3 py-2 rounded-xl border transition-colors ${
                errors.manifesto
                  ? 'border-red-500 bg-red-50 focus:ring-red-400'
                  : 'border-surface-border bg-white focus:border-brand-500'
              }`}
            />
            {errors.manifesto && <p className="text-red-500 text-[11px] mt-1">{errors.manifesto}</p>}
          </div>

          <div>
            <label htmlFor="nomination-image" className="block font-medium text-slate-700 mb-1">
              Profile Avatar URI (Optional)
            </label>
            <input
              id="nomination-image"
              type="text"
              value={profileImage}
              onChange={(e) => setProfileImage(e.target.value)}
              placeholder="https://example.com/photo.jpg or asset link"
              className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500"
            />
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-navy-950">
              <input
                type="checkbox"
                checked={submitNow}
                onChange={(e) => setSubmitNow(e.target.checked)}
                className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
              />
              <span>Submit for administrator review immediately</span>
            </label>
            <p className="text-[11px] text-slate-600 leading-normal pl-5">
              Your institutional eligibility (department, academic standing, enrollment) will be verified
              by the backend evaluation engine upon submission.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              {submitNow ? 'Submit Nomination' : 'Save as Draft'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
