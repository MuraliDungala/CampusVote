import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Layers,
  Users,
  Building2,
  Vote,
  Calendar,
  Award,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { Election, ElectionStatus } from '../../types/election';
import { getElections } from '../../services/elections';

const STATUS_VARIANTS: Record<ElectionStatus, 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  ACTIVE: 'success',
  CLOSED: 'info',
  RESULTS_PUBLISHED: 'primary',
  ARCHIVED: 'neutral',
  CANCELLED: 'danger',
};

type CatalogFilterTab = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'PAST';

export const ElectionsPage: React.FC = () => {
  const { user } = useAuth();
  const [elections, setElections] = useState<Election[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CatalogFilterTab>('ALL');

  const fetchElectionsList = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getElections({ page_size: 50 });
      setElections(res.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load collegiate elections.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchElectionsList();
  }, []);

  // Categorize elections
  const activeElections = elections.filter((e) => e.status === 'ACTIVE');
  const upcomingElections = elections.filter((e) => e.status === 'SCHEDULED');
  const pastElections = elections.filter(
    (e) => e.status === 'CLOSED' || e.status === 'RESULTS_PUBLISHED' || e.status === 'ARCHIVED'
  );

  const filteredElections = elections.filter((e) => {
    if (activeTab === 'ACTIVE') return e.status === 'ACTIVE';
    if (activeTab === 'SCHEDULED') return e.status === 'SCHEDULED';
    if (activeTab === 'PAST') return e.status === 'CLOSED' || e.status === 'RESULTS_PUBLISHED' || e.status === 'ARCHIVED';
    return true;
  });

  const studentCollegeName = user?.institution_name || user?.college_name;

  const renderElectionCard = (elec: Election) => {
    const isLive = elec.status === 'ACTIVE';
    const isUpcoming = elec.status === 'SCHEDULED';
    const isResultsReady = elec.status === 'RESULTS_PUBLISHED';
    const hasVoted = Boolean(elec.has_voted);
    const canVote = Boolean(elec.can_vote);

    return (
      <Card
        key={elec.id}
        className={`flex flex-col hover:border-brand-primary/40 hover:shadow-card transition-all overflow-hidden border ${
          isLive ? 'border-emerald-200 ring-1 ring-emerald-400/20' : 'border-slate-200'
        }`}
      >
        <div className="relative h-28 bg-navy-900 overflow-hidden">
          <img
            src="/images/election-banner.svg"
            alt={elec.title}
            className="w-full h-full object-cover opacity-75"
          />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {elec.institution_name && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/20">
                <Building2 className="w-3 h-3 text-brand-cyan" />
                {elec.institution_name}
              </span>
            )}
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[elec.status] || 'neutral'} size="sm">
              {elec.status_display}
            </Badge>
          </div>
        </div>

        <CardContent className="p-6 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-brand-cyan font-semibold uppercase tracking-wider flex items-center gap-1.5">
              {isLive ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Collegiate Ballot
                </>
              ) : isUpcoming ? (
                'Scheduled Collegiate Ballot'
              ) : (
                'Archived Collegiate Ballot'
              )}
            </span>
            <span className="text-xs text-slate-500 font-mono font-medium">
              Cohort: {elec.academic_year}
            </span>
          </div>

          <h2 className="text-lg font-bold text-navy-950 mb-2">{elec.title}</h2>

          <p className="text-xs text-slate-600 leading-relaxed mb-6 line-clamp-2">
            {elec.description || 'Institutional election cycle managed under CampusVote governance.'}
          </p>

          <div className="space-y-2.5 py-4 border-y border-surface-border mb-6 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Voting Window:
              </span>
              <span className="font-semibold text-navy-950">
                {new Date(elec.start_time).toLocaleDateString()} ➔ {new Date(elec.end_time).toLocaleDateString()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" /> Contested Offices:
              </span>
              <span className="font-semibold text-navy-950">
                {elec.positions_count} {elec.positions_count === 1 ? 'Position' : 'Positions'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Approved Candidates:
              </span>
              <span className="font-semibold text-emerald-700">
                {elec.approved_candidates_count} Certified
              </span>
            </div>

            {/* Voter Eligibility indicator when authenticated as student */}
            {user?.role === 'STUDENT' && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Voter Status:</span>
                {hasVoted ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ballot Cast
                  </span>
                ) : canVote ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary">
                    <Vote className="w-3.5 h-3.5" /> Eligible to Vote
                  </span>
                ) : elec.is_eligible === false ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 max-w-[200px] truncate"
                    title={elec.eligibility_reason || 'Ineligible'}
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {elec.eligibility_reason || 'Ineligible'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium">Standard Eligibility</span>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto pt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 font-mono truncate max-w-[120px]">
              ID: {elec.id.slice(0, 8)}...
            </span>
            <div className="flex items-center gap-2">
              {isLive && canVote && (
                <Link to={`/elections/${elec.id}/ballot`}>
                  <Button variant="primary" size="sm" className="bg-brand-primary text-white" leftIcon={<Vote className="w-4 h-4" />}>
                    Vote Now
                  </Button>
                </Link>
              )}
              {isResultsReady && (
                <Link to={`/elections/${elec.id}/results`}>
                  <Button variant="outline" size="sm" leftIcon={<Award className="w-4 h-4 text-emerald-600" />}>
                    Results
                  </Button>
                </Link>
              )}
              <Link to={`/elections/${elec.id}`}>
                <Button variant={isLive && !canVote ? 'primary' : 'outline'} size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  {isLive ? 'Details' : 'View Details & Manifestos'}
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-1 pb-16">
      <PageHeader
        title="Collegiate Elections"
        description={
          studentCollegeName
            ? `Browse ongoing ballots, upcoming schedules, and certified election results for ${studentCollegeName}.`
            : "Browse ongoing, upcoming, and certified past election cycles administered through CampusVote."
        }
        badge={
          <div className="flex items-center gap-2">
            {studentCollegeName && (
              <Badge variant="primary" size="sm" className="font-semibold">
                <Building2 className="w-3 h-3 mr-1" />
                {studentCollegeName}
              </Badge>
            )}
            <Badge variant="info">Campus Voter Catalog</Badge>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation Tabs / Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-navy-950 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Elections ({elections.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'ACTIVE' ? 'bg-white' : 'bg-emerald-500'} animate-ping`} />
              Open for Voting ({activeElections.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SCHEDULED')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'SCHEDULED'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Upcoming ({upcomingElections.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PAST')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'PAST'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Past & Certified ({pastElections.length})
            </button>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Live Syncing with Institutional Registry
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-surface-border p-12">
            <LoadingState message="Loading collegiate elections..." />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-surface-border p-8">
            <ErrorState title="Unable to Load Elections" message={error} onRetry={fetchElectionsList} />
          </div>
        ) : elections.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-border p-12">
            <EmptyState
              title={
                studentCollegeName
                  ? `No Elections Scheduled for ${studentCollegeName}`
                  : "No Active or Scheduled Elections"
              }
              description={
                studentCollegeName
                  ? `There are currently no published collegiate elections scheduled for ${studentCollegeName}. Once your college electoral commissioner publishes and schedules a cycle, it will appear here.`
                  : "There are currently no public collegiate elections scheduled. Check back soon or contact your student electoral commissioner."
              }
            />
          </div>
        ) : filteredElections.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-border p-12">
            <EmptyState
              title={
                activeTab === 'ACTIVE'
                  ? 'No Elections Open for Voting Right Now'
                  : activeTab === 'SCHEDULED'
                  ? 'No Upcoming Elections Scheduled'
                  : 'No Past Election Archives Found'
              }
              description={
                activeTab === 'ACTIVE'
                  ? "There are currently no live voting windows active. Check the 'Upcoming' tab to review scheduled ballots."
                  : activeTab === 'SCHEDULED'
                  ? "No future election cycles have been scheduled yet. Check back soon for announcements."
                  : "No completed or archived election cycles are recorded yet."
              }
              action={
                <Button variant="outline" size="sm" onClick={() => setActiveTab('ALL')}>
                  Show All Elections ({elections.length})
                </Button>
              }
            />
          </div>
        ) : activeTab === 'ALL' ? (
          <div className="space-y-10">
            {/* 1. Active Elections Section */}
            {activeElections.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <h3 className="text-base font-bold text-navy-950">Elections Open for Voting</h3>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    {activeElections.length} Active {activeElections.length === 1 ? 'Ballot' : 'Ballots'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeElections.map(renderElectionCard)}
                </div>
              </section>
            )}

            {/* 2. Upcoming Elections Section */}
            {upcomingElections.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <h3 className="text-base font-bold text-navy-950">Upcoming Collegiate Elections</h3>
                  </div>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    {upcomingElections.length} Scheduled
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {upcomingElections.map(renderElectionCard)}
                </div>
              </section>
            )}

            {/* 3. Past Elections Section */}
            {pastElections.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-base font-bold text-navy-950">Past Cycles & Certified Results</h3>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                    {pastElections.length} Completed
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {pastElections.map(renderElectionCard)}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredElections.map(renderElectionCard)}
          </div>
        )}
      </div>
    </div>
  );
};
