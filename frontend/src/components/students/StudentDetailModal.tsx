import React from 'react';
import { X, UserCheck, Mail, BookOpen, Calendar, ShieldCheck, UserX } from 'lucide-react';
import { Student } from '../../types/student';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';

export interface StudentDetailModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (student: Student) => void;
  onDeactivate: (student: Student) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  isOpen,
  onClose,
  onEdit,
  onDeactivate,
}) => {
  if (!isOpen || !student) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-detail-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-lg p-6 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <Avatar name={student.full_name} role="STUDENT" size="lg" />
            <div>
              <h3 id="student-detail-title" className="text-lg font-bold text-navy-950">
                {student.full_name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">{student.college_id}</p>
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

        <div className="py-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border/60">
              <span className="text-slate-500 block mb-1">Enrollment Standing</span>
              <Badge
                variant={
                  student.enrollment_status === 'ENROLLED'
                    ? 'success'
                    : student.enrollment_status === 'SUSPENDED'
                    ? 'danger'
                    : 'warning'
                }
                size="sm"
              >
                {student.enrollment_status_display}
              </Badge>
            </div>

            <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border/60">
              <span className="text-slate-500 block mb-1">Administrative Status</span>
              {student.is_active ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Active Voter Record
                </span>
              ) : (
                <span className="text-red-700 font-semibold flex items-center gap-1">
                  <UserX className="w-4 h-4 text-red-600" /> Deactivated / Inactive
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between py-1.5 border-b border-surface-border/60">
              <span className="text-slate-500 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" /> Institutional Email
              </span>
              <span className="font-semibold text-navy-950">{student.email || 'None'}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-surface-border/60">
              <span className="text-slate-500 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" /> Academic Department
              </span>
              <span className="font-semibold text-navy-950">{student.department}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-surface-border/60">
              <span className="text-slate-500 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Academic Year of Study
              </span>
              <span className="font-semibold text-navy-950">Year {student.academic_year}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-surface-border/60">
              <span className="text-slate-500 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" /> Degree / Program
              </span>
              <span className="font-semibold text-navy-950">{student.course || 'Unspecified'}</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-500">Authentication Account</span>
              <span className="font-mono text-slate-600">
                {student.has_user_account ? `Linked (${student.user_username})` : 'Unprovisioned'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-surface-border">
          {student.is_active ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onDeactivate(student);
              }}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Deactivate Student
            </Button>
          ) : (
            <span className="text-xs text-red-600 italic">Record is deactivated</span>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(student);
              }}
            >
              Edit Record
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
