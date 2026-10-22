import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  Users,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Election, ElectionSummary, ElectionFilterParams, ElectionStatus } from '../../types/election';
import { getElections, getElectionSummary } from '../../services/elections';

const STATUS_VARIANTS: Record<ElectionStatus, 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  ACTIVE: 'success',
  CLOSED: 'info',
  RESULTS_PUBLISHED: 'primary',
  ARCHIVED: 'neutral',
  CANCELLED: 'danger',
};

export const AdminElectionListPage: React.FC = () => {
  const navigate = useNavigate();

  const [elections, setElections] = useState<Election[]>([]);
  const [summary, setSummary] = useState<ElectionSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [statusFilter, setStatusFilter] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [search, setSearch] = useState('');
  const [myElectionsOnly, setMyElectionsOnly] = useState(false);

  const fetchSummary = async () => {
    try {
      const data = await getElectionSummary();
      setSummary(data);
    } catch (err) {
      console.warn('Could not load election summary', err);
    }
  };

  const fetchElections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: ElectionFilterParams = {
        page,
        page_size: pageSize,
      };
      if (statusFilter) params.status = statusFilter;
      if (academicYear) params.academic_year = academicYear;
      if (search.trim()) params.search = search.trim();
      if (myElectionsOnly) params.my_elections = true;

      const res = await getElections(params);
      setElections(res.results);
      setTotalCount(res.count);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch elections.');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, academicYear, search, myElectionsOnly]);

  useEffect(() => {
    fetchElections();
  }, [fetchElections]);

  useEffect(() => {
    fetchSummary();
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleResetFilters = () => {
    setStatusFilter('');
    setAcademicYear('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="Collegiate Elections Governance"
          description="Establish democratic election cycles, define contested executive offices, and manage candidate nominations."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/admin/elections/new')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create New Election
            </Button>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Metrics Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-500 font-medium">Total Cycles</p>
                <p className="text-xl font-bold text-navy-950">
                  {summary ? summary.total_elections : totalCount}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-amber-50/50 border-amber-200">
              <CardContent className="p-4">
                <p className="text-[11px] text-amber-800 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Scheduled
                </p>
                <p className="text-xl font-bold text-amber-700">
                  {summary ? summary.scheduled_elections : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-emerald-50/50 border-emerald-200">
              <CardContent className="p-4">
                <p className="text-[11px] text-emerald-800 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Voting
                </p>
                <p className="text-xl font-bold text-emerald-700">
                  {summary ? summary.active_elections : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50/50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-[11px] text-blue-800 font-medium flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Drafts
                </p>
                <p className="text-xl font-bold text-blue-700">
                  {summary ? summary.draft_elections : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-purple-50/50 border-purple-200">
              <CardContent className="p-4">
                <p className="text-[11px] text-purple-800 font-medium flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> Pending Filings
                </p>
                <p className="text-xl font-bold text-purple-700">
                  {summary ? summary.pending_nominations : '—'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-100 border-slate-200">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-600 font-medium">Closed / Certified</p>
                <p className="text-xl font-bold text-slate-700">
                  {summary ? summary.closed_elections + summary.results_published_elections : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-surface-border shadow-subtle flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* View Scope Toggle */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMyElectionsOnly(false);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  !myElectionsOnly
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                All Cycles
              </button>
              <button
                type="button"
                onClick={() => {
                  setMyElectionsOnly(true);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  myElectionsOnly
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                My Organized Cycles
              </button>
            </div>

            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search elections by title or mandate..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-surface-border bg-surface-subtle/40 focus:bg-white focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Lifecycle Status Filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 focus:border-brand-500"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
                <option value="RESULTS_PUBLISHED">Results Published</option>
                <option value="ARCHIVED">Archived</option>
                <option value="CANCELLED">Cancelled</option>
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
                <option value="">All Cohorts / Batches</option>
                <option value="2026-2027">2026-2027</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2024-2025">2024-2025</option>
              </select>

              {(statusFilter || academicYear || search) && (
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

          {/* Table / Loading / Empty / Error State */}
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-surface-border p-12">
              <LoadingState message="Fetching election records..." />
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-surface-border p-8">
              <ErrorState title="Failed to Load Elections" message={error} onRetry={fetchElections} />
            </div>
          ) : elections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-surface-border p-8">
              <EmptyState
                title="No Elections Found"
                description={
                  statusFilter || academicYear || search
                    ? 'No election cycles matched your search criteria. Try adjusting your filters.'
                    : 'No elections have been created yet. Launch the wizard to configure your institution’s first election.'
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/admin/elections/new')}
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Create First Election
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-surface-border shadow-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-subtle/80 border-b border-surface-border text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Election Title & Cohort</th>
                      <th className="py-3 px-4">Lifecycle Status</th>
                      <th className="py-3 px-4">Voting Window</th>
                      <th className="py-3 px-4">Positions</th>
                      <th className="py-3 px-4">Candidates</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border/60 text-navy-950 font-normal">
                    {elections.map((elec) => (
                      <tr key={elec.id} className="hover:bg-surface-subtle/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-navy-950 text-sm">{elec.title}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                              {elec.academic_year}
                            </span>
                            {elec.description && (
                              <span className="truncate max-w-xs">{elec.description}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={STATUS_VARIANTS[elec.status] || 'neutral'} size="sm">
                            {elec.status_display}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-600 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(elec.start_time).toLocaleString()}</span>
                          </div>
                          <div className="text-slate-400 pl-4.5">
                            ➔ {new Date(elec.end_time).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {elec.positions_count} {elec.positions_count === 1 ? 'Office' : 'Offices'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-emerald-700">
                            {elec.approved_candidates_count}
                          </span>
                          <span className="text-slate-400"> / {elec.candidates_count} filed</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/elections/${elec.id}`)}
                            leftIcon={<Eye className="w-3.5 h-3.5 text-brand-primary" />}
                          >
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="py-3 px-4 border-t border-surface-border bg-surface-subtle/40 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of{' '}
                  <span className="font-bold text-navy-950">{totalCount}</span> elections
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
    </div>
  );
};
