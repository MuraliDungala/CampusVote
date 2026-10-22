import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Vote,
  QrCode,
  FileText,
  Compass,
  AlertCircle,
  Info
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { testStudentEndpoint } from '../../services/auth';
import { getElections } from '../../services/elections';
import { getMyVoterId, generateMyVoterId, VoterIdStatusResponse } from '../../services/students';
import { SmartVoterCard } from '../../components/students/SmartVoterCard';
import { Election } from '../../types/election';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const [elections, setElections] = useState<Election[]>([]);
  const [isLoadingElections, setIsLoadingElections] = useState(true);
  const [rbacTestStatus, setRbacTestStatus] = useState<string | null>(null);
  const [isTestingRbac, setIsTestingRbac] = useState(false);

  // Voter ID Credential state
  const [voterIdStatus, setVoterIdStatus] = useState<VoterIdStatusResponse | null>(null);
  const [isLoadingVoterId, setIsLoadingVoterId] = useState(true);
  const [isGeneratingVoterId, setIsGeneratingVoterId] = useState(false);
  const [voterIdError, setVoterIdError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadStudentElections() {
      try {
        const res = await getElections({ page_size: 6 });
        if (isMounted) {
          setElections(res.results || []);
        }
      } catch {
        if (isMounted) setElections([]);
      } finally {
        if (isMounted) setIsLoadingElections(false);
      }
    }

    async function loadVoterIdData() {
      try {
        const res = await getMyVoterId();
        if (isMounted) setVoterIdStatus(res);
      } catch (err) {
        console.warn('Voter ID load notice:', err);
      } finally {
        if (isMounted) setIsLoadingVoterId(false);
      }
    }

    loadStudentElections();
    loadVoterIdData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGenerateVoterId = async () => {
    setIsGeneratingVoterId(true);
    setVoterIdError(null);
    try {
      const res = await generateMyVoterId();
      setVoterIdStatus({
        has_voter_id: true,
        voter_id: res.voter_id,
        eligible_to_generate: true,
      });
    } catch (err: any) {
      setVoterIdError(err?.details?.error || err?.message || 'Failed to generate Smart Voter ID.');
    } finally {
      setIsGeneratingVoterId(false);
    }
  };

  const handleTestRbac = async () => {
    setIsTestingRbac(true);
    setRbacTestStatus(null);
    try {
      const res = await testStudentEndpoint();
      setRbacTestStatus(`Backend Response: ${res.message} (Role: ${res.role})`);
    } catch (err: any) {
      setRbacTestStatus(`Backend Error: ${err.message}`);
    } finally {
      setIsTestingRbac(false);
    }
  };

  const activeElections = elections.filter((e) => e.status === 'ACTIVE');
  const upcomingElections = elections.filter((e) => e.status === 'SCHEDULED' || e.status === 'DRAFT');

  return (
    <div className="flex-1 pb-16 bg-surface-canvas">
      <PageHeader
        title={`Welcome, ${user?.first_name || user?.username || 'Student'}`}
        description="Verify your enrollment standing, review upcoming collegiate ballots, and cast your sealed votes."
        badge={<Badge variant="success">Voter Session Active</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/elections">
              <Button variant="primary" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Browse Elections
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
        {/* RBAC Verification Alert */}
        {rbacTestStatus && (
          <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-start gap-3 shadow-subtle animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs font-mono">{rbacTestStatus}</div>
          </div>
        )}

        {/* Top 3 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-slate-200 shadow-subtle">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Ballots</p>
                <h3 className="text-2xl font-extrabold text-navy-950 mt-1">{activeElections.length}</h3>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Open for voting</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-cyan flex items-center justify-center">
                <Vote className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-subtle">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled Cycles</p>
                <h3 className="text-2xl font-extrabold text-navy-950 mt-1">{upcomingElections.length}</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Upcoming ballots</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-subtle">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Voter Status</p>
                <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">Eligible</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Registrar verified</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-subtle">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Smart ID</p>
                <h3 className="text-2xl font-extrabold text-navy-950 mt-1">Active</h3>
                <p className="text-[11px] text-brand-cyan font-medium mt-0.5">Dual-channel OTP</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <QrCode className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Smart Voter ID Credential Section */}
        <Card className="border border-slate-200 shadow-subtle overflow-hidden">
          <CardHeader className="border-b border-surface-border pb-4 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg text-navy-950 font-bold">
                    Smart Voter ID Credential
                  </CardTitle>
                  <Badge variant={voterIdStatus?.has_voter_id ? 'success' : 'neutral'} size="sm">
                    {voterIdStatus?.has_voter_id ? 'Card Issued' : 'Digital Credential'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Institutionally verified digital voter pass with cryptographic QR verification token.
                </p>
              </div>

              {!voterIdStatus?.has_voter_id && voterIdStatus?.eligible_to_generate && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateVoterId}
                  isLoading={isGeneratingVoterId}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                >
                  Generate Voter ID
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {voterIdError && (
              <div
                className="mb-4 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2.5"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{voterIdError}</span>
              </div>
            )}

            {isLoadingVoterId ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Checking voter credential standing with registrar...</p>
              </div>
            ) : voterIdStatus?.has_voter_id && voterIdStatus.voter_id ? (
              <SmartVoterCard cardData={voterIdStatus.voter_id} />
            ) : voterIdStatus?.eligible_to_generate ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-brand-primary flex items-center justify-center mx-auto shadow-xs">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-950">Voter Credential Ready to Generate</h4>
                  <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
                    Generate your digital CampusVote Smart Voter ID to obtain your unique cryptographic voter reference and terminal QR token.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleGenerateVoterId}
                  isLoading={isGeneratingVoterId}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                >
                  Generate My Voter ID Card
                </Button>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 text-xs flex items-start gap-3">
                <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-sm mb-1 text-navy-950">
                    Voter ID Generation Status
                  </span>
                  <p className="leading-relaxed">
                    {voterIdStatus?.message ||
                      'Your student account is currently not active. Please contact the administrator.'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Student Profile Card & Smart ID Badge */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1 border border-slate-200">
            <CardHeader className="border-b border-surface-border pb-4">
              <div className="flex items-center gap-3">
                <Avatar name={user?.full_name || 'Student'} role={user?.role} size="md" />
                <div>
                  <CardTitle className="text-base text-navy-950">{user?.full_name || 'Verified Voter'}</CardTitle>
                  <p className="text-xs text-slate-500 font-mono">{user?.display_identifier || user?.username}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs text-slate-600">
              <div className="flex justify-between py-1.5 border-b border-surface-border">
                <span className="text-slate-500">College ID:</span>
                <span className="font-mono font-semibold text-navy-950">
                  {user?.college_id || 'Registered'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border">
                <span className="text-slate-500">Email:</span>
                <span className="font-semibold text-navy-950 truncate max-w-[160px]">
                  {user?.email || 'student@campus.edu'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border">
                <span className="text-slate-500">Account Status:</span>
                <Badge variant="success" size="sm">
                  {user?.status || 'ACTIVE'}
                </Badge>
              </div>
              <div className="flex justify-between py-1.5 border-b border-surface-border">
                <span className="text-slate-500">Voter Role:</span>
                <Badge variant="primary" size="sm">
                  {user?.role}
                </Badge>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Last Authentication:</span>
                <span className="font-mono text-slate-600">
                  {user?.last_login_at
                    ? new Date(user.last_login_at).toLocaleTimeString()
                    : 'Current Active Session'}
                </span>
              </div>

              {/* Action Buttons in Profile */}
              <div className="pt-3 flex flex-col gap-2">
                <Link to="/student/nominations">
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" leftIcon={<FileText className="w-4 h-4 text-brand-primary" />}>
                    My Candidate Nominations
                  </Button>
                </Link>
                <Link to="/login/qr">
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" leftIcon={<QrCode className="w-4 h-4 text-brand-cyan" />}>
                    Open QR Terminal Challenge
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Active & Upcoming Elections List */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-slate-200">
              <CardHeader className="border-b border-surface-border pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base text-navy-950">Active &amp; Scheduled Elections</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Collegiate ballots open for review and participation</p>
                </div>
                <Link to="/elections">
                  <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    All Elections
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {isLoadingElections ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : elections.length > 0 ? (
                  <div className="space-y-3">
                    {elections.slice(0, 3).map((election) => (
                      <div
                        key={election.id}
                        className="p-4 rounded-xl border border-surface-border hover:border-slate-300 bg-white transition-all hover:shadow-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-navy-950 text-sm">
                              {election.title}
                            </span>
                            <Badge
                              variant={election.status === 'ACTIVE' ? 'success' : 'neutral'}
                              size="sm"
                            >
                              {election.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                            {election.description || 'Verified collegiate democratic cycle.'}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {election.academic_year || 'Academic Year'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3 text-slate-400" />
                              {election.positions_count ?? 1} Positions
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {election.status === 'ACTIVE' ? (
                            <Link to={`/elections/${election.id}/ballot`} className="w-full sm:w-auto">
                              <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<Vote className="w-4 h-4" />}
                                className="w-full sm:w-auto font-semibold shadow-sm bg-navy-900 text-white"
                              >
                                Cast Ballot
                              </Button>
                            </Link>
                          ) : (
                            <Link to={`/elections/${election.id}`} className="w-full sm:w-auto">
                              <Button variant="outline" size="sm" className="w-full sm:w-auto font-medium">
                                View Details
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-surface-subtle rounded-xl border border-surface-border">
                    <Compass className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-navy-950">No elections found</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                      Check back shortly when the election board publishes the schedule.
                    </p>
                    <Link to="/elections">
                      <Button variant="outline" size="sm">Browse Directory</Button>
                    </Link>
                  </div>
                )}

                {/* Candidate Nomination Callout */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-brand-primary flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-navy-950">Contest a Student Council Office</p>
                      <p className="text-slate-500 text-[11px]">File your candidate manifesto for scheduled positions.</p>
                    </div>
                  </div>
                  <Link to="/student/nominations">
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      View Open Nominations
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
