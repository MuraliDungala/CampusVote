import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Student, StudentFormData, EnrollmentStatus } from '../../types/student';
import { Button } from '../ui/Button';

export interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: StudentFormData) => Promise<void>;
  student?: Student | null;
  departments?: string[];
}

const DEFAULT_DEPARTMENTS = [
  'CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'EEE', 'CHEM', 'BIOTECH', 'MBA', 'MCA'
];

const ENROLLMENT_STATUS_OPTIONS: { value: EnrollmentStatus; label: string }[] = [
  { value: 'ENROLLED', label: 'Enrolled (Good Standing)' },
  { value: 'ON_LEAVE', label: 'On Academic Leave' },
  { value: 'SUSPENDED', label: 'Suspended (Disciplinary)' },
  { value: 'GRADUATED', label: 'Graduated' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  student,
  departments = DEFAULT_DEPARTMENTS,
}) => {
  const isEditMode = Boolean(student);

  const [formData, setFormData] = useState<StudentFormData>({
    college_id: '',
    full_name: '',
    email: '',
    department: departments[0] || 'CSE',
    academic_year: 1,
    course: 'B.Tech',
    enrollment_status: 'ENROLLED',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (student) {
      setFormData({
        college_id: student.college_id,
        full_name: student.full_name,
        email: student.email || '',
        department: student.department,
        academic_year: student.academic_year,
        course: student.course || '',
        enrollment_status: student.enrollment_status,
      });
    } else {
      setFormData({
        college_id: '',
        full_name: '',
        email: '',
        department: departments[0] || 'CSE',
        academic_year: 1,
        course: 'B.Tech',
        enrollment_status: 'ENROLLED',
      });
    }
    setErrors({});
    setServerError(null);
  }, [student, isOpen, departments]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.college_id.trim()) {
      newErrors.college_id = 'College ID is required.';
    }
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required.';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Enter a valid institutional email address.';
    }
    if (!formData.department) {
      newErrors.department = 'Department is required.';
    }
    if (!formData.academic_year || formData.academic_year < 1 || formData.academic_year > 5) {
      newErrors.academic_year = 'Academic year must be between 1 and 5.';
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
      setServerError(err.message || 'Failed to save student record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-form-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-lg p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border">
          <div>
            <h3 id="student-form-modal-title" className="text-lg font-bold text-navy-950">
              {isEditMode ? 'Edit Student Record' : 'Register New Student'}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditMode
                ? 'Update academic roster details and institutional standings.'
                : 'Add an institutional student record to the voter registry.'}
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
          <div className="my-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="py-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="student-college-id" className="block font-medium text-slate-700 mb-1">
                College ID <span className="text-red-500">*</span>
              </label>
              <input
                id="student-college-id"
                type="text"
                value={formData.college_id}
                onChange={(e) => setFormData({ ...formData, college_id: e.target.value.toUpperCase() })}
                disabled={isEditMode}
                placeholder="e.g. CS2024001"
                className={`w-full px-3 py-2 rounded-xl border font-mono uppercase transition-colors ${
                  errors.college_id
                    ? 'border-red-500 bg-red-50 focus:ring-red-400'
                    : 'border-surface-border bg-white focus:border-brand-500'
                } ${isEditMode ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`}
              />
              {errors.college_id && <p className="text-red-500 text-[11px] mt-1">{errors.college_id}</p>}
            </div>

            <div>
              <label htmlFor="student-full-name" className="block font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="student-full-name"
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Jane Doe"
                className={`w-full px-3 py-2 rounded-xl border transition-colors ${
                  errors.full_name
                    ? 'border-red-500 bg-red-50 focus:ring-red-400'
                    : 'border-surface-border bg-white focus:border-brand-500'
                }`}
              />
              {errors.full_name && <p className="text-red-500 text-[11px] mt-1">{errors.full_name}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="student-email" className="block font-medium text-slate-700 mb-1">
              Institutional Email
            </label>
            <input
              id="student-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. jane.doe@campus.edu"
              className={`w-full px-3 py-2 rounded-xl border transition-colors ${
                errors.email
                  ? 'border-red-500 bg-red-50 focus:ring-red-400'
                  : 'border-surface-border bg-white focus:border-brand-500'
              }`}
            />
            {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="student-department" className="block font-medium text-slate-700 mb-1">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="student-department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              {errors.department && <p className="text-red-500 text-[11px] mt-1">{errors.department}</p>}
            </div>

            <div>
              <label htmlFor="student-academic-year" className="block font-medium text-slate-700 mb-1">
                Academic Year <span className="text-red-500">*</span>
              </label>
              <select
                id="student-academic-year"
                value={formData.academic_year}
                onChange={(e) => setFormData({ ...formData, academic_year: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs"
              >
                <option value={1}>Year 1 (Freshman)</option>
                <option value={2}>Year 2 (Sophomore)</option>
                <option value={3}>Year 3 (Junior)</option>
                <option value={4}>Year 4 (Senior)</option>
                <option value={5}>Year 5 (Graduate/Advanced)</option>
              </select>
              {errors.academic_year && <p className="text-red-500 text-[11px] mt-1">{errors.academic_year}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="student-course" className="block font-medium text-slate-700 mb-1">
                Program / Degree
              </label>
              <input
                id="student-course"
                type="text"
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                placeholder="e.g. B.Tech Computer Science"
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500"
              />
            </div>

            <div>
              <label htmlFor="student-enrollment-status" className="block font-medium text-slate-700 mb-1">
                Enrollment Standing <span className="text-red-500">*</span>
              </label>
              <select
                id="student-enrollment-status"
                value={formData.enrollment_status}
                onChange={(e) =>
                  setFormData({ ...formData, enrollment_status: e.target.value as EnrollmentStatus })
                }
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs"
              >
                {ENROLLMENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              {isEditMode ? 'Save Changes' : 'Register Student'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
