import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  UserPlus,
  Search,
  Users,
  ShieldCheck,
  UserX,
  Building2,
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  Student,
  StudentSummary,
  StudentFormData,
  StudentFilterParams,
} from '../../types/student';
import {
  getStudents,
  getStudentSummary,
  createStudent,
  updateStudent,
  deactivateStudent,
} from '../../services/students';
import { StudentDetailModal } from '../../components/students/StudentDetailModal';
import { StudentFormModal } from '../../components/students/StudentFormModal';
import { StudentDeactivateModal } from '../../components/students/StudentDeactivateModal';

export const StudentListPage: React.FC = () => {
  const navigate = useNavigate();

  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Pagination states
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState('');

  // Modals state
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToDeactivate, setStudentToDeactivate] = useState<Student | null>(null);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);

  // Notification / Feedback banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      const summaryData = await getStudentSummary();
      setSummary(summaryData);
    } catch (err) {
      console.warn('Could not fetch student summary', err);
    }
  };

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: StudentFilterParams = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (department) params.department = department;
      if (academicYear) params.academic_year = academicYear;
      if (enrollmentStatus) params.enrollment_status = enrollmentStatus;

      const res = await getStudents(params);
      setStudents(res.results);
      setTotalCount(res.count);
    } catch (err: any) {
      setError(err.message || 'Failed to load students.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, department, academicYear, enrollmentStatus]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    fetchSummary();
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleResetFilters = () => {
    setSearch('');
    setDepartment('');
    setAcademicYear('');
    setEnrollmentStatus('');
    setPage(1);
  };

  const handleAddSubmit = async (formData: StudentFormData) => {
    await createStudent(formData);
    setToastMessage(`Student ${formData.full_name} (${formData.college_id}) created successfully.`);
    fetchStudents();
    fetchSummary();
  };

  const handleEditSubmit = async (formData: StudentFormData) => {
    if (!studentToEdit) return;
    await updateStudent(studentToEdit.id, formData);
    setToastMessage(`Student ${formData.full_name} updated successfully.`);
    fetchStudents();
    fetchSummary();
  };

  const handleDeactivateConfirm = async (studentId: string, reason: string) => {
    await deactivateStudent(studentId, reason);
    setToastMessage(`Student record deactivated successfully.`);
    fetchStudents();
    fetchSummary();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="Student Registry & Roster Management"
          description="Authoritative student voter registry. Inspect academic cohorts, verify enrollment standings, or upload official registrar CSV rolls."
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/students/import')}
                leftIcon={<FileSpreadsheet className="w-4 h-4 text-brand-primary" />}
              >
                Import CSV Roster
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setStudentToEdit(null);
                  setIsFormOpen(true);
                }}
                leftIcon={<UserPlus className="w-4 h-4" />}
              >
                Add Student
              </Button>
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Toast / Alert */}
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

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Total Registered</p>
                  <p className="text-2xl font-bold text-navy-950">
                    {summary ? summary.total_students : totalCount}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Active Voter Records</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {summary ? summary.active_students : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <UserX className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Deactivated Records</p>
                  <p className="text-2xl font-bold text-red-700">
                    {summary ? summary.inactive_students : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Active Departments</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {summary ? Object.keys(summary.by_department).length : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-surface-border shadow-subtle flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by student name or college ID..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-surface-border bg-surface-subtle/40 focus:bg-white focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Department Filter"
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 focus:border-brand-500"
              >
                <option value="">All Departments</option>
                {(summary?.supported_departments || [
                  'CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'EEE', 'CHEM', 'BIOTECH', 'MBA', 'MCA'
                ]).map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <select
                aria-label="Academic Year Filter"
                value={academicYear}
                onChange={(e) => {
                  setAcademicYear(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 focus:border-brand-500"
              >
                <option value="">All Academic Years</option>
                <option value="1">Year 1</option>
                <option value="2">Year 2</option>
                <option value="3">Year 3</option>
                <option value="4">Year 4</option>
                <option value="5">Year 5</option>
              </select>

              <select
                aria-label="Enrollment Status Filter"
                value={enrollmentStatus}
                onChange={(e) => {
                  setEnrollmentStatus(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 focus:border-brand-500"
              >
                <option value="">All Standings</option>
                <option value="ENROLLED">Enrolled</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="GRADUATED">Graduated</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>

              {(search || department || academicYear || enrollmentStatus) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Student Table / State Render */}
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-surface-border p-12">
              <LoadingState message="Fetching student registry records..." />
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-surface-border p-8">
              <ErrorState title="Failed to Load Student Registry" message={error} onRetry={fetchStudents} />
            </div>
          ) : students.length === 0 ? (
            <div className="bg-white rounded-2xl border border-surface-border p-8">
              <EmptyState
                title="No Student Records Found"
                description={
                  search || department || academicYear || enrollmentStatus
                    ? 'No students matched the active search filters. Try adjusting your query or resetting filters.'
                    : 'The institutional student registry is currently empty. Register individual students or upload an official CSV roster to begin.'
                }
                action={
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setStudentToEdit(null);
                        setIsFormOpen(true);
                      }}
                      leftIcon={<UserPlus className="w-4 h-4" />}
                    >
                      Add First Student
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/admin/students/import')}
                      leftIcon={<FileSpreadsheet className="w-4 h-4" />}
                    >
                      Import CSV Roster
                    </Button>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-surface-border shadow-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-subtle/80 border-b border-surface-border text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">College ID</th>
                      <th className="py-3 px-4">Student Name & Contact</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Cohort</th>
                      <th className="py-3 px-4">Program</th>
                      <th className="py-3 px-4">Enrollment Status</th>
                      <th className="py-3 px-4">Record Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border/60 text-navy-950 font-normal">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-surface-subtle/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {student.college_id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={student.full_name} role="STUDENT" size="sm" />
                            <div>
                              <div className="font-semibold text-navy-950">{student.full_name}</div>
                              <div className="text-[11px] text-slate-500">{student.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {student.department}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          Year {student.academic_year}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-[140px]" title={student.course}>
                          {student.course || '—'}
                        </td>
                        <td className="py-3 px-4">
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
                        </td>
                        <td className="py-3 px-4">
                          {student.is_active ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStudent(student);
                                setIsDetailOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-primary hover:bg-surface-subtle transition-colors"
                              title="View Record Details"
                              aria-label={`View details for ${student.full_name}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStudentToEdit(student);
                                setIsFormOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-surface-subtle transition-colors"
                              title="Edit Student Record"
                              aria-label={`Edit ${student.full_name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {student.is_active && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStudentToDeactivate(student);
                                  setIsDeactivateOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Deactivate Student"
                                aria-label={`Deactivate ${student.full_name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              <div className="py-3 px-4 border-t border-surface-border bg-surface-subtle/40 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of{' '}
                  <span className="font-bold text-navy-950">{totalCount}</span> student records
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page <= 1}
                    leftIcon={<ChevronLeft className="w-4 h-4" />}
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-semibold text-slate-700 px-2">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page >= totalPages}
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <StudentDetailModal
        student={selectedStudent}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedStudent(null);
        }}
        onEdit={(student) => {
          setStudentToEdit(student);
          setIsFormOpen(true);
        }}
        onDeactivate={(student) => {
          setStudentToDeactivate(student);
          setIsDeactivateOpen(true);
        }}
      />

      <StudentFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setStudentToEdit(null);
        }}
        onSubmit={studentToEdit ? handleEditSubmit : handleAddSubmit}
        student={studentToEdit}
        departments={summary?.supported_departments}
      />

      <StudentDeactivateModal
        student={studentToDeactivate}
        isOpen={isDeactivateOpen}
        onClose={() => {
          setIsDeactivateOpen(false);
          setStudentToDeactivate(null);
        }}
        onConfirm={handleDeactivateConfirm}
      />
    </div>
  );
};
