import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { ElectionPosition, PositionFormData } from '../../types/election';
import { Button } from '../ui/Button';

export interface PositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PositionFormData) => Promise<void>;
  position?: ElectionPosition | null;
  currentPositionsCount?: number;
}

export const PositionModal: React.FC<PositionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  position,
  currentPositionsCount = 0,
}) => {
  const isEditMode = Boolean(position);

  const [formData, setFormData] = useState<PositionFormData>({
    title: '',
    description: '',
    display_order: 1,
    maximum_candidates: 10,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (position) {
      setFormData({
        title: position.title,
        description: position.description || '',
        display_order: position.display_order,
        maximum_candidates: position.maximum_candidates,
      });
    } else {
      setFormData({
        title: '',
        description: '',
        display_order: currentPositionsCount + 1,
        maximum_candidates: 10,
      });
    }
    setErrors({});
    setServerError(null);
  }, [position, isOpen, currentPositionsCount]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Position title is required.';
    }
    if (formData.display_order < 1) {
      newErrors.display_order = 'Display order must be a positive integer.';
    }
    if (formData.maximum_candidates < 1) {
      newErrors.maximum_candidates = 'Maximum candidates must be at least 1.';
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
      await onSubmit(formData);
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save election position.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="position-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-md p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border">
          <div>
            <h3 id="position-modal-title" className="text-base font-bold text-navy-950">
              {isEditMode ? 'Edit Contested Position' : 'Add Contested Position'}
            </h3>
            <p className="text-xs text-slate-500">
              Define the executive office, mandate, and candidate parameters.
            </p>
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

        {serverError && (
          <div className="my-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="py-4 space-y-3.5 text-xs">
          <div>
            <label htmlFor="position-title" className="block font-medium text-slate-700 mb-1">
              Position Title <span className="text-red-500">*</span>
            </label>
            <input
              id="position-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Student Council President"
              className={`w-full px-3 py-2 rounded-xl border transition-colors ${
                errors.title
                  ? 'border-red-500 bg-red-50 focus:ring-red-400'
                  : 'border-surface-border bg-white focus:border-brand-500'
              }`}
            />
            {errors.title && <p className="text-red-500 text-[11px] mt-1">{errors.title}</p>}
          </div>

          <div>
            <label htmlFor="position-description" className="block font-medium text-slate-700 mb-1">
              Mandate / Responsibilities
            </label>
            <textarea
              id="position-description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the office responsibilities..."
              className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="display-order" className="block font-medium text-slate-700 mb-1">
                Display Order <span className="text-red-500">*</span>
              </label>
              <input
                id="display-order"
                type="number"
                min={1}
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500"
              />
            </div>

            <div>
              <label htmlFor="max-candidates" className="block font-medium text-slate-700 mb-1">
                Max Candidates <span className="text-red-500">*</span>
              </label>
              <input
                id="max-candidates"
                type="number"
                min={1}
                max={50}
                value={formData.maximum_candidates}
                onChange={(e) => setFormData({ ...formData, maximum_candidates: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              {isEditMode ? 'Save Position' : 'Add Position'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
