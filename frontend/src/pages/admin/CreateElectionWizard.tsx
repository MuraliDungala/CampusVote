import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Building2,
  Info
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { PositionFormData, ElectionFormData } from '../../types/election';
import { createElection, createPosition, scheduleElection } from '../../services/elections';

interface PositionDraft extends PositionFormData {
  tempId: string;
}

export const CreateElectionWizard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Basic Information
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [academicYear, setAcademicYear] = useState('2026-2027');

  // Step 2: Schedule
  // Default: start tomorrow 09:00, end in 3 days 18:00 local time
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowStr = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const endDay = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
  const endDayStr = new Date(endDay.getTime() - endDay.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const [startTime, setStartTime] = useState(tomorrowStr);
  const [endTime, setEndTime] = useState(endDayStr);

  // Step 3: Positions
  const [positions, setPositions] = useState<PositionDraft[]>([
    {
      tempId: 'pos-1',
      title: 'President',
      description: 'Chief executive of the student body',
      display_order: 1,
      maximum_candidates: 10,
    },
    {
      tempId: 'pos-2',
      title: 'Vice President',
      description: 'Deputy executive and senate chair',
      display_order: 2,
      maximum_candidates: 10,
    },
    {
      tempId: 'pos-3',
      title: 'General Secretary',
      description: 'Administrative and operational coordinator',
      display_order: 3,
      maximum_candidates: 10,
    },
  ]);

  const [newPosTitle, setNewPosTitle] = useState('');
  const [newPosDesc, setNewPosDesc] = useState('');
  const [newPosMax, setNewPosMax] = useState(10);

  // Submission State
  const [publishImmediately, setPublishImmediately] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation per step
  const validateStep = (step: number): boolean => {
    setError(null);
    if (step === 1) {
      if (!title.trim()) {
        setError('Election title is required.');
        return false;
      }
      if (!academicYear.trim()) {
        setError('Academic year is required.');
        return false;
      }
    } else if (step === 2) {
      if (!startTime || !endTime) {
        setError('Both start and end dates are required.');
        return false;
      }
      const s = new Date(startTime);
      const e = new Date(endTime);
      if (e <= s) {
        setError('End date/time must be strictly later than start date/time.');
        return false;
      }
    } else if (step === 3) {
      if (positions.length === 0) {
        setError('You must configure at least one contested position for this election.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handleAddPosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPosTitle.trim()) return;

    // Check duplicate
    if (positions.some((p) => p.title.toLowerCase() === newPosTitle.trim().toLowerCase())) {
      setError(`A position titled "${newPosTitle.trim()}" already exists in the draft list.`);
      return;
    }

    const newPos: PositionDraft = {
      tempId: `pos-${Date.now()}`,
      title: newPosTitle.trim(),
      description: newPosDesc.trim(),
      display_order: positions.length + 1,
      maximum_candidates: newPosMax || 10,
    };

    setPositions([...positions, newPos]);
    setNewPosTitle('');
    setNewPosDesc('');
    setNewPosMax(10);
    setError(null);
  };

  const handleRemovePosition = (tempId: string) => {
    setPositions(positions.filter((p) => p.tempId !== tempId));
  };

  const handleFinalSubmit = async (publishImmediately: boolean = false) => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Create election
      const electionData: ElectionFormData = {
        title: title.trim(),
        description: description.trim(),
        academic_year: academicYear.trim(),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      };
      const createdElection = await createElection(electionData);

      // 2. Create positions
      for (const pos of positions) {
        await createPosition(createdElection.id, {
          title: pos.title,
          description: pos.description,
          display_order: pos.display_order,
          maximum_candidates: pos.maximum_candidates,
        });
      }

      // 3. Optionally publish & schedule immediately
      if (publishImmediately) {
        await scheduleElection(createdElection.id);
      }

      navigate(`/admin/elections/${createdElection.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create election.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { number: 1, title: 'Basic Information', icon: FileText },
    { number: 2, title: 'Voting Schedule', icon: Calendar },
    { number: 3, title: 'Contested Positions', icon: Layers },
    { number: 4, title: 'Review & Confirm', icon: CheckCircle2 },
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="Create New Election Cycle"
          description="Configure election parameters, voting windows, and official contested positions."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/elections')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Elections
            </Button>
          }
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Step Progress Bar */}
          <div className="bg-white p-4 rounded-2xl border border-surface-border shadow-subtle">
            <div className="grid grid-cols-4 gap-2">
              {steps.map((st) => {
                const Icon = st.icon;
                const isComplete = currentStep > st.number;
                const isCurrent = currentStep === st.number;
                return (
                  <div
                    key={st.number}
                    className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-blue-50/80 border border-brand-primary/40 text-brand-primary'
                        : isComplete
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-brand-primary text-white'
                          : isComplete
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isComplete ? '✓' : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="hidden sm:block text-xs font-semibold truncate">
                      {st.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Step Content */}
          <Card>
            <CardContent className="p-6">
              {/* STEP 1: Basic Information */}
              {currentStep === 1 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="text-base font-bold text-navy-950">Step 1: Basic Information</h3>
                    <p className="text-slate-500">
                      Specify the formal title, descriptive mandate, and cohort for this election cycle.
                    </p>
                  </div>

                  {/* College Jurisdiction */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-navy-950">
                            {user?.institution_name || user?.college_name || 'CampusVote Collegiate Institute'}
                          </span>
                          {user?.institution_code && (
                            <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              {user.institution_code}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          Election cycle will be bound exclusively to this college domain
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 shrink-0">
                      HOST COLLEGE
                    </span>
                  </div>

                  <div>
                    <label htmlFor="election-title" className="block font-medium text-slate-700 mb-1">
                      Election Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="election-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Student Government Executive Council 2026-2027"
                      className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="academic-year" className="block font-medium text-slate-700 mb-1">
                        Academic Year / Batch <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="academic-year"
                        type="text"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                        placeholder="e.g. 2026-2027"
                        className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="election-description" className="block font-medium text-slate-700 mb-1">
                      Mandate & Constitution Description
                    </label>
                    <textarea
                      id="election-description"
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Explain the election purpose, eligible voting faculties, and executive responsibilities..."
                      className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Voting Schedule */}
              {currentStep === 2 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="text-base font-bold text-navy-950">Step 2: Voting Window Schedule</h3>
                    <p className="text-slate-500">
                      Configure timezone-aware voting start and closure datetimes.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-primary shrink-0" />
                    <span>
                      Timestamps will be recorded in UTC on the server and presented in the local timezone (
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}).
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="start-time" className="block font-medium text-slate-700 mb-1">
                        Scheduled Start Date & Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="start-time"
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label htmlFor="end-time" className="block font-medium text-slate-700 mb-1">
                        Scheduled End Date & Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="end-time"
                        type="datetime-local"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-surface-border bg-white focus:border-brand-500 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Contested Positions */}
              {currentStep === 3 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="text-base font-bold text-navy-950">Step 3: Contested Positions</h3>
                    <p className="text-slate-500">
                      Define the executive offices and candidate filing limits for this cycle.
                    </p>
                  </div>

                  {/* Informational Guidance on Participating Students */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-navy-950 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-navy-950 block mb-0.5">Participating Student Candidates</span>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        Configure your contested offices here. As soon as you finish creating the election, you can enter and nominate participating student candidates directly for each office using the <strong>Add Candidate</strong> button in the Election Management Console, or eligible students can file nominations online.
                      </p>
                    </div>
                  </div>

                  {/* Existing list */}
                  <div className="space-y-2">
                    <label className="block font-medium text-slate-700">Configured Offices ({positions.length})</label>
                    {positions.map((pos) => (
                      <div
                        key={pos.tempId}
                        className="p-3 bg-surface-subtle/80 rounded-xl border border-surface-border flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-navy-950">
                              #{pos.display_order} {pos.title}
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              (Max {pos.maximum_candidates} candidates)
                            </span>
                          </div>
                          {pos.description && (
                            <p className="text-slate-500 text-[11px] mt-0.5">{pos.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePosition(pos.tempId)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove position"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Position Form */}
                  <form
                    onSubmit={handleAddPosition}
                    className="p-3 rounded-xl border border-dashed border-slate-300 bg-white space-y-3"
                  >
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-brand-primary" /> Add Contested Position
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={newPosTitle}
                          onChange={(e) => setNewPosTitle(e.target.value)}
                          placeholder="Position title (e.g. Cultural Secretary)"
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-border text-xs"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          min={1}
                          value={newPosMax}
                          onChange={(e) => setNewPosMax(Number(e.target.value))}
                          placeholder="Max candidates"
                          className="w-full px-3 py-1.5 rounded-xl border border-surface-border text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={newPosDesc}
                        onChange={(e) => setNewPosDesc(e.target.value)}
                        placeholder="Description / office responsibilities (optional)"
                        className="w-full px-3 py-1.5 rounded-xl border border-surface-border text-xs"
                      />
                    </div>
                    <Button variant="outline" size="sm" type="submit" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                      Add to List
                    </Button>
                  </form>
                </div>
              )}

              {/* STEP 4: Review and Confirm */}
              {currentStep === 4 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="text-base font-bold text-navy-950">Step 4: Review & Create Election</h3>
                    <p className="text-slate-500">
                      Verify all election parameters before saving. Elections are created in Draft mode so you can add candidates first.
                    </p>
                  </div>

                  <div className="p-4 bg-surface-subtle rounded-xl border border-surface-border space-y-3">
                    <div className="flex items-center justify-between border-b border-surface-border/60 pb-2">
                      <span className="text-slate-500">Title:</span>
                      <span className="font-bold text-navy-950 text-sm">{title}</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-surface-border/60 pb-2">
                      <span className="text-slate-500">Academic Cohort:</span>
                      <span className="font-mono font-semibold text-slate-800">{academicYear}</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-surface-border/60 pb-2">
                      <span className="text-slate-500">Voting Period:</span>
                      <span className="font-semibold text-slate-800">
                        {new Date(startTime).toLocaleString()} ➔ {new Date(endTime).toLocaleString()}
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="text-slate-500 block mb-1">
                        Contested Positions ({positions.length}):
                      </span>
                      <ul className="list-disc list-inside space-y-1 font-semibold text-navy-950">
                        {positions.map((p) => (
                          <li key={p.tempId}>
                            {p.title} (Max {p.maximum_candidates} candidates)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Publication Mode Toggle Card */}
                  <div className="p-4 rounded-xl border border-surface-border bg-white shadow-subtle space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="font-bold text-navy-950 text-xs block">Election Public Visibility</span>
                        <span className="text-[11px] text-slate-500">
                          Control if students can see this election immediately or after you enter candidates.
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-semibold text-slate-600">
                          {publishImmediately ? 'Publish to Students' : 'Draft (Unpublished)'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={publishImmediately}
                          onClick={() => setPublishImmediately(!publishImmediately)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                            publishImmediately ? 'bg-amber-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              publishImmediately ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {!publishImmediately ? (
                      <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          <strong>Recommended:</strong> Kept in <strong>Draft (Unpublished)</strong>. Candidates have not been selected yet. You can add candidates in the management console before publishing.
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Warning:</strong> Publishing immediately will make this election visible in student portals before candidates are added.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-6 border-t border-surface-border mt-6">
                {currentStep > 1 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBack}
                    disabled={isSubmitting}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                ) : (
                  <div />
                )}

                {currentStep < 4 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleNext}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Next Step
                  </Button>
                ) : (
                  <div className="flex items-center gap-3">
                    <Button
                      variant={publishImmediately ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => handleFinalSubmit(publishImmediately)}
                      isLoading={isSubmitting}
                      disabled={isSubmitting}
                      leftIcon={<CheckCircle2 className="w-4 h-4" />}
                      className={publishImmediately ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-brand-primary hover:bg-brand-secondary text-white'}
                    >
                      {publishImmediately ? 'Create & Publish Immediately' : 'Create Election (Save as Draft)'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
