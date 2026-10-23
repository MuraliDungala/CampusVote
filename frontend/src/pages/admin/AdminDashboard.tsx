import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileSpreadsheet,
  Users,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Vote,
  Layers,
  ArrowRight,
  TrendingUp,
  FileCheck,
  Building2,
  UserCheck,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { testAdminEndpoint } from '../../services/auth';
import { getElectionSummary, getElections } from '../../services/elections';
import { getStudentSummary } from '../../services/students';
import { Election, ElectionSummary } from '../../types/election';
import { StudentSummary } from '../../types/student';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [electionSummary, setElectionSummary] = useState<ElectionSummary | null>(null);
  const [studentSummary, setStudentSummary] = useState<StudentSummary | null>(null);
  const [recentElections, setRecentElections] = useState<Election[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rbacTestStatus, setRbacTestStatus] = useState<string | null>(null);
  const [isTestingRbac, setIsTestingRbac] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboardMetrics() {
      try {
        const [elecSummaryData, stuSummaryData, electionsData] = await Promise.all([
          getElectionSummary().catch(() => null),
          getStudentSummary().catch(() => null),
          getElections({ page_size: 4 }).catch(() => ({ results: [] })),
        ]);
        if (isMounted) {
          if (elecSummaryData) setElectionSummary(elecSummaryData);
          if (stuSummaryData) setStudentSummary(stuSummaryData);
          setRecentElections(electionsData?.results || []);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadDashboardMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestRbac = async () => {
    setIsTestingRbac(true);
    setRbacTestStatus(null);
    try {
      const res = await testAdminEndpoint();
      setRbacTestStatus(`Backend Clearance Confirmed: ${res.message} (User: ${res.user})`);
    } catch (err: any) {
      setRbacTestStatus(`Backend Error: ${err.message}`);
    } finally {
      setIsTestingRbac(false);
    }
  };

  const activeCollegeName = user?.institution_name || user?.college_name || 'CampusVote Collegiate Institute';

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-surface-canvas">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="Election Administrator Console"
          description={`Administering elections, student verification, nominations, and results for ${activeCollegeName}.`}
          badge={
            <div className="flex items-center gap-1.5">
              <Badge variant="primary" size="sm" className="font-semibold">
                <Building2 className="w-3 h-3 mr-1" />
                {activeCollegeName}
              </Badge>
              <Badge variant="info">
                {user?.role} Session
              </Badge>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link to="/admin/elections/new">
                <Button variant="primary" size="sm" leftIcon={<Vote className="w-4 h-4" />}>
                  Create Election
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestRbac}
                isLoading={isTestingRbac}
                leftIcon={<ShieldCheck className="w-4 h-4 text-brand-primary" />}
              >
                Verify RBAC
              </Button>
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Institutional Jurisdiction Banner */}
          <div className="p-4 rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/80 text-navy-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-navy-950">
                    {activeCollegeName}
                  </span>
                  {user?.institution_code && (
                    <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                      {user.institution_code}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Tenant Boundary Active &bull; Elections, rosters, and audit trails are cryptographically and logically isolated to this college.
                </p>
              </div>
            </div>
            <Badge variant="success" size="sm" className="whitespace-nowrap">
              Institution Verified
            </Badge>
          </div>

          {/* RBAC Verification Alert */}
          {rbacTestStatus && (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-start gap-3 shadow-subtle animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs font-mono">{rbacTestStatus}</div>
            </div>
          )}

          {/* Operational Security Pill Notice */}
          <div className="p-4 rounded-2xl border border-blue-200/80 bg-blue-50/60 text-navy-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-subtle">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-navy-950 block">
                  Fail-Closed Voting Architecture Active
                </span>
                Live election voting remains blocked pending independent cryptographic review. Synthetic demonstration workflows are enabled.
              </div>
            </div>
            <Badge variant="primary" size="sm" className="whitespace-nowrap">
              Security Hardened
            </Badge>
          </div>

          {/* Top 4 Metrics Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Elections</p>
                  <h3 className="text-2xl font-extrabold text-navy-950 mt-1">
                    {electionSummary?.active_elections ?? (isLoading ? '...' : 0)}
                  </h3>
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    {electionSummary?.total_elections ?? 0} total cycles
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center">
                  <Vote className="w-6 h-6 text-brand-cyan" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Roster</p>
                  <h3 className="text-2xl font-extrabold text-navy-950 mt-1">
                    {studentSummary?.total_students ?? (isLoading ? '...' : 0)}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {studentSummary?.active_students ?? 0} active students
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Filings</p>
                  <h3 className="text-2xl font-extrabold text-navy-950 mt-1">
                    {electionSummary?.pending_nominations ?? (isLoading ? '...' : 0)}
                  </h3>
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                    Awaiting manifesto review
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <FileCheck className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Surveillance</p>
                  <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">Armed</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Advisory Isolation Forest
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Required: Pending Student Registrations Banner */}
          {(studentSummary?.pending_students || (studentSummary?.by_enrollment_status?.PENDING ?? 0)) > 0 && (
            <div className="p-4 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-white to-amber-50/70 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-subtle animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-950">
                      Action Required: {studentSummary?.pending_students || studentSummary?.by_enrollment_status?.PENDING} New Student Registration{(studentSummary?.pending_students || studentSummary?.by_enrollment_status?.PENDING || 0) > 1 ? 's' : ''} Awaiting Approval
                    </span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-amber-800">
                    New students registered under {activeCollegeName} need your administrative acceptance before they can cast ballots.
                  </p>
                </div>
              </div>
              <Link to="/admin/students?enrollment_status=PENDING">
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs whitespace-nowrap shadow-sm"
                  leftIcon={<Clock className="w-3.5 h-3.5" />}
                >
                  Review & Accept Students ({studentSummary?.pending_students || studentSummary?.by_enrollment_status?.PENDING})
                </Button>
              </Link>
            </div>
          )}

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Link to="/admin/students?enrollment_status=PENDING" className="block">
              <Card hoverEffect className={`h-full border ${(studentSummary?.pending_students || (studentSummary?.by_enrollment_status?.PENDING ?? 0)) > 0 ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-300' : 'border-slate-200'}`}>
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-navy-950">Student Approvals</h3>
                      {(studentSummary?.pending_students || (studentSummary?.by_enrollment_status?.PENDING ?? 0)) > 0 && (
                        <Badge variant="warning" size="sm">
                          {studentSummary?.pending_students || studentSummary?.by_enrollment_status?.PENDING} Pending
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Review and accept incoming student registrations under your college.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-amber-700">
                    <span>Accept Students &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/elections" className="block">
              <Card hoverEffect className="h-full border border-slate-200">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center mb-3">
                      <Vote className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-navy-950">Election Management</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Configure cycles, manage offices, review nominations, and oversee lifecycle transitions.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-brand-primary">
                    <span>Manage Cycles &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/students" className="block">
              <Card hoverEffect className="h-full border border-slate-200">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-navy-950">Student Registry</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Inspect student registrar accounts, evaluate eligibility rules, and manage status flags.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-purple-600">
                    <span>Inspect Roster &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/students/import" className="block">
              <Card hoverEffect className="h-full border border-slate-200">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-navy-950">Batch CSV Ingestion</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Bulk upload student rosters with atomic validation, staging preview, and rollback safety.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-600">
                    <span>Upload CSV &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/elections/new" className="block">
              <Card hoverEffect className="h-full border border-slate-200">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-brand-cyan flex items-center justify-center mb-3">
                      <Layers className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-navy-950">Create New Election</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Wizard for setting time windows, offices, maximum candidates, and eligibility filters.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs font-semibold text-brand-cyan">
                    <span>Launch Wizard &rarr;</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Recent Elections Table / Quick Monitoring Panel */}
          <Card className="border border-slate-200 shadow-subtle">
            <CardHeader className="border-b border-surface-border pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-navy-950">Election Surveillance &amp; Operations</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Quick access to real-time telemetry, AI alerts, and results tabulation</p>
              </div>
              <Link to="/admin/elections">
                <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  All Cycles
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading elections telemetry...</div>
              ) : recentElections.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No elections configured yet. Click "Create Election" to schedule a cycle.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-subtle text-slate-500 border-b border-surface-border uppercase font-semibold text-[11px]">
                      <tr>
                        <th className="px-5 py-3">Election Title</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Offices</th>
                        <th className="px-5 py-3">Candidates</th>
                        <th className="px-5 py-3 text-right">Operational Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-slate-700">
                      {recentElections.map((elec) => (
                        <tr key={elec.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-bold text-navy-950 block">{elec.title}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{elec.academic_year}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              variant={
                                elec.status === 'ACTIVE'
                                  ? 'success'
                                  : elec.status === 'SCHEDULED'
                                  ? 'warning'
                                  : elec.status === 'DRAFT'
                                  ? 'neutral'
                                  : elec.status === 'CANCELLED'
                                  ? 'danger'
                                  : 'info'
                              }
                              size="sm"
                            >
                              {elec.status === 'DRAFT' ? 'Draft (Unpublished)' : elec.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 font-medium">{elec.positions_count} offices</td>
                          <td className="px-5 py-3.5 font-medium">{elec.approved_candidates_count} certified</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {elec.status === 'DRAFT' ? (
                                <Link to={`/admin/elections/${elec.id}`}>
                                  <Button variant="primary" size="sm" className="text-[11px] px-3 py-1 bg-brand-primary hover:bg-brand-secondary text-white font-semibold">
                                    Publish / Schedule &rarr;
                                  </Button>
                                </Link>
                              ) : (
                                <>
                                  <Link to={`/admin/elections/${elec.id}/monitor`}>
                                    <Button variant="outline" size="sm" className="text-[11px] px-2.5 py-1" title="Real-time Turnout Stream">
                                      <Activity className="w-3.5 h-3.5 text-brand-cyan" />
                                    </Button>
                                  </Link>
                                  <Link to={`/admin/elections/${elec.id}/security-monitor`}>
                                    <Button variant="outline" size="sm" className="text-[11px] px-2.5 py-1" title="Advisory AI Security Monitor">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    </Button>
                                  </Link>
                                  <Link to={`/admin/elections/${elec.id}/results`}>
                                    <Button variant="outline" size="sm" className="text-[11px] px-2.5 py-1" title="Results & Tabulation">
                                      <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                                    </Button>
                                  </Link>
                                  <Link to={`/admin/elections/${elec.id}`}>
                                    <Button variant="primary" size="sm" className="text-[11px] px-2.5 py-1">
                                      Manage
                                    </Button>
                                  </Link>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Operational Policy & Privacy Safeguards */}
          <Card className="border border-slate-200">
            <CardHeader className="border-b border-surface-border pb-3">
              <CardTitle className="text-sm font-bold text-navy-950">Administrative Privacy &amp; Governance Safeguards</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Strict Non-Linkability:</strong> Administrators have zero visibility into candidate ballot selections. Zero join keys exist between voter participation and anonymous ballots.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Separation of Duties:</strong> The official who tabulates draft election tallies cannot approve the result. Independent review is required.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Non-Punitive AI Surveillance:</strong> Machine learning anomaly alerts serve as investigative telemetry and cannot invalidate cast ballots or disqualify voters.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
