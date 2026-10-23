import React, { useState, useEffect } from 'react';
import { X, UserPlus, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { ElectionPosition, Candidate } from '../../types/election';
import { Student } from '../../types/student';
import { getStudents } from '../../services/students';
import { adminAddCandidate } from '../../services/elections';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';

export interface AddCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: ElectionPosition[];
  selectedPosition?: ElectionPosition | null;
  onCandidateAdded: (newCandidate: Candidate) => void;
}

export const AddCandidateModal: React.FC<AddCandidateModalProps> = ({
  isOpen,
  onClose,
  positions,
  selectedPosition,
  onCandidateAdded,
}) => {
  const [positionId, setPositionId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [manualCollegeId, setManualCollegeId] = useState('');
  const [manifesto, setManifesto] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPosition) {
      setPositionId(selectedPosition.id);
    } else if (positions.length > 0) {
      setPositionId(positions[0].id);
    }
  }, [selectedPosition, positions]);

  // Load students for selection
  useEffect(() => {
    if (!isOpen) return;
    const fetchCandidateStudents = async () => {
      setIsLoadingStudents(true);
      try {
        const response = await getStudents({
          page_size: 100,
          search: studentSearch || undefined,
        });
        setStudents(response.results);
      } catch {
        // Handled silently
      } finally {
        setIsLoadingStudents(false);
      }
    };

    const timer = setTimeout(fetchCandidateStudents, 250);
    return () => clearTimeout(timer);
  }, [isOpen, studentSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetPosId = positionId || selectedPosition?.id;
    if (!targetPosId) {
      setError('Please select an election position.');
      return;
    }

    const studentIdentifier = selectedStudent ? selectedStudent.college_id : manualCollegeId.trim();
    if (!studentIdentifier) {
      setError('Please select a student from the registry or enter their College ID.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newCand = await adminAddCandidate(targetPosId, {
        student_id: studentIdentifier,
        manifesto: manifesto.trim() || undefined,
        profile_image: profileImage.trim() || undefined,
      });

      onCandidateAdded(newCand);
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add participating student candidate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStudentSearch('');
    setSelectedStudent(null);
    setManualCollegeId('');
    setManifesto('');
    setProfileImage('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-candidate-title"
    >
      <div className="bg-white rounded-2xl shadow-elevated border border-surface-border w-full max-w-lg p-6 overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-brand-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="add-candidate-title" className="text-base font-bold text-navy-950">
                Enter Participating Student Candidate
              </h3>
              <p className="text-xs text-slate-500">
                Nominate and verify an enrolled student for an election position.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-surface-subtle"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {error && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Position Selector */}
          <FormField label="Contested Position" htmlFor="candidate-position" required>
            <select
              id="candidate-position"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white text-navy-950"
              disabled={isSubmitting}
            >
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {pos.title} (Max {pos.maximum_candidates} candidates)
                </option>
              ))}
            </select>
          </FormField>

          {/* Student Selection */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700">
              Select Participating Student <span className="text-red-500">*</span>
            </label>

            {selectedStudent ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedStudent.full_name} role="STUDENT" size="sm" />
                  <div>
                    <div className="font-bold text-navy-950">{selectedStudent.full_name}</div>
                    <div className="text-[11px] text-slate-600 font-mono">
                      {selectedStudent.college_id} • {selectedStudent.department} (Year {selectedStudent.academic_year})
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="text-xs text-slate-500 hover:text-red-600 font-medium underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Search students by name, roll number, or email..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                />

                {/* Filtered list of registered students */}
                <div className="border border-surface-border rounded-xl max-h-40 overflow-y-auto divide-y divide-surface-border/60 bg-surface-subtle/30">
                  {isLoadingStudents ? (
                    <div className="p-3 text-center text-slate-400">Loading student registry...</div>
                  ) : students.length === 0 ? (
                    <div className="p-3 text-center text-slate-400">
                      No students found. You can enter the College ID manually below.
                    </div>
                  ) : (
                    students.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudent(st);
                          setManualCollegeId(st.college_id);
                        }}
                        className="w-full p-2.5 flex items-center justify-between text-left hover:bg-blue-50/70 transition-colors"
                      >
                        <div>
                          <span className="font-semibold text-navy-950 block">{st.full_name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {st.college_id} • {st.department}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-brand-primary">Select &rarr;</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="pt-1">
                  <span className="text-[11px] text-slate-500 block mb-1">Or enter Student College ID / Roll Number directly:</span>
                  <Input
                    placeholder="e.g. 23341A4234 or STU-2026-001"
                    value={manualCollegeId}
                    onChange={(e) => setManualCollegeId(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campaign Manifesto / Statement */}
          <FormField
            label="Candidate Statement / Platform Manifesto"
            htmlFor="candidate-manifesto"
            helperText="Enter key campaign commitments, goals, or qualifications (optional)."
          >
            <textarea
              id="candidate-manifesto"
              rows={3}
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              placeholder="e.g. Committed to enhancing student welfare, transparent representation, and campus initiatives..."
              className="w-full px-3 py-2 rounded-xl border border-surface-border text-xs focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
              disabled={isSubmitting}
            />
          </FormField>

          {/* Profile Image URL */}
          <FormField
            label="Profile Picture URL (Optional)"
            htmlFor="candidate-profile-image"
            helperText="Direct image link for candidate's voter card and ballot profile."
          >
            <Input
              id="candidate-profile-image"
              placeholder="https://..."
              value={profileImage}
              onChange={(e) => setProfileImage(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200/80 text-[11px] text-slate-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Direct admin nominations are automatically approved and qualified for ballots upon submission.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-border">
            <Button variant="outline" size="sm" type="button" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              Add Candidate to Position
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
