import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Info,
  AlertCircle,
  Sparkles,
  User,
  GraduationCap,
  Building2,
  ChevronRight,
  UserPlus,
  Barcode
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types/auth';
import { startCollegeIdVerification } from '../../services/verification';

export const LoginPage: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialMode =
    (location.state as any)?.mode ||
    (searchParams.get('tab') === 'admin' ||
    searchParams.get('role') === 'admin' ||
    searchParams.get('mode') === 'admin'
      ? 'STAFF_PASSWORD'
      : 'STUDENT_ID');
  const initialIdentifier = (location.state as any)?.identifier || searchParams.get('identifier') || '';

  // Login mode: 'STUDENT_ID' or 'STAFF_PASSWORD'
  const [loginMode, setLoginMode] = useState<'STUDENT_ID' | 'STAFF_PASSWORD'>(initialMode);

  // Student ID mode state
  const [collegeId, setCollegeId] = useState('');
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [isUnregistered, setIsUnregistered] = useState(false);

  // Staff Password mode state
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { user, isAuthenticated, logout, login, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  // Sync mode and identifier if navigation state changes
  useEffect(() => {
    const stateMode = (location.state as any)?.mode;
    const stateId = (location.state as any)?.identifier;
    if (stateMode === 'STAFF_PASSWORD' || stateMode === 'STUDENT_ID') {
      setLoginMode(stateMode);
    }
    if (stateId) {
      setIdentifier(stateId);
    }
  }, [location.state]);

  const redirectAfterLogin = (role: Role) => {
    const fromPath = (location.state as any)?.from?.pathname;
    // Guard against cross-role redirects (e.g. an admin redirected to student dashboard)
    if (fromPath && fromPath !== '/login') {
      if (role === 'STUDENT' && !fromPath.startsWith('/admin') && !fromPath.startsWith('/auditor')) {
        navigate(fromPath, { replace: true });
        return;
      }
      if ((role === 'ELECTION_ADMIN' || role === 'SUPER_ADMIN') && !fromPath.startsWith('/student')) {
        navigate(fromPath, { replace: true });
        return;
      }
      if (role === 'AUDITOR' && !fromPath.startsWith('/student') && !fromPath.startsWith('/admin')) {
        navigate(fromPath, { replace: true });
        return;
      }
    }
    if (role === 'STUDENT') {
      navigate('/student/dashboard', { replace: true });
    } else if (role === 'ELECTION_ADMIN' || role === 'SUPER_ADMIN') {
      navigate('/admin/dashboard', { replace: true });
    } else if (role === 'AUDITOR') {
      navigate('/auditor/dashboard', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  // Handle Student Smart ID Verification start
  const handleStudentVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();
    setIsUnregistered(false);

    const targetId = collegeId.trim();
    if (!targetId) {
      setFormError('Please enter your institutional College ID or email address.');
      return;
    }

    setIsStartingVerification(true);
    try {
      const response = await startCollegeIdVerification({
        college_id: targetId,
        channel: 'EMAIL',
      });

      // Navigate to OTP challenge page with session state
      navigate('/login/verify', {
        state: response,
      });
    } catch (err: any) {
      const code = err?.details?.details?.code || err?.details?.code;
      if (code === 'ADMIN_ACCOUNT_DETECTED') {
        const detectedUsername = err?.details?.details?.identifier || err?.details?.identifier || targetId;
        setLoginMode('STAFF_PASSWORD');
        setIdentifier(detectedUsername);
        setFormError(
          err?.details?.error ||
          err?.message ||
          'College Administrator account detected. Please enter your administrator password to sign in.'
        );
        return;
      }

      const msg = err?.details?.error || err?.message || 'Verification initiation failed. Please check your College ID or email.';
      setFormError(msg);
      if (
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('register') ||
        err?.details?.code === 'STUDENT_NOT_FOUND'
      ) {
        setIsUnregistered(true);
      }
    } finally {
      setIsStartingVerification(false);
    }
  };

  // Handle Staff Username/Password login
  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!identifier.trim()) {
      setFormError('Please enter your Username or Email.');
      return;
    }
    if (!password) {
      setFormError('Please enter your password.');
      return;
    }

    try {
      const loggedUser = await login({ identifier: identifier.trim(), password });
      redirectAfterLogin(loggedUser.role);
    } catch {
      // Error handled by AuthContext
    }
  };

  // Synthetic account quick-switch helper for local development
  const handleQuickLogin = async (demoId: string, demoPass: string) => {
    setIdentifier(demoId);
    setPassword(demoPass);
    setFormError(null);
    clearError();
    try {
      const loggedUser = await login({ identifier: demoId, password: demoPass });
      redirectAfterLogin(loggedUser.role);
    } catch {
      // Handled
    }
  };

  const handleQuickStudentId = (id: string) => {
    setCollegeId(id);
    setFormError(null);
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-surface-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy-950 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Public Portal
        </Link>

        {/* Existing Active Session Banner */}
        {isAuthenticated && user && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50/90 text-emerald-950 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Currently Active Session
                </div>
                <div className="text-sm font-bold text-navy-950">
                  {user.full_name} <span className="font-semibold text-xs text-slate-600">({user.role})</span>
                </div>
                <div className="text-xs text-slate-600 font-mono mt-0.5">
                  {user.display_identifier} {user.institution_name ? `• ${user.institution_name}` : ''}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-end gap-1.5 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => redirectAfterLogin(user.role)}
                  className="text-xs"
                >
                  Dashboard &rarr;
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await logout();
                    clearError();
                  }}
                  className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Smart ID Verification Banner */}
        <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50/70 text-navy-950">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                  Smart ID-Based Authentication
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Students authenticate using institutional College ID with multi-factor OTP challenge and QR scanning.
                Staff and administrators sign in using secure role credentials.
              </p>
            </div>
          </div>
        </div>

        <Card className="shadow-elevated">
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 rounded-2xl bg-navy-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-brand-cyan" />
            </div>
            <CardTitle className="text-xl">Campus Portal Access</CardTitle>
            <CardDescription className="text-xs">
              Select your portal access method to proceed.
            </CardDescription>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mt-4 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setLoginMode('STUDENT_ID');
                  setFormError(null);
                  clearError();
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  loginMode === 'STUDENT_ID'
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                <GraduationCap className="w-4 h-4 text-brand-primary" />
                <span>Student Voter</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMode('STAFF_PASSWORD');
                  setFormError(null);
                  clearError();
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  loginMode === 'STAFF_PASSWORD'
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                <Building2 className="w-4 h-4 text-slate-500" />
                <span>Staff & Admin</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            {(formError || authError) && (
              <div
                className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex flex-col gap-2"
                role="alert"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{formError || authError}</span>
                </div>
                {isUnregistered && (
                  <div className="pt-2 border-t border-red-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-red-600">First time using CampusVote?</span>
                    <Link
                      to="/register"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-colors shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Register Student ID
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: Student Smart ID & OTP */}
            {loginMode === 'STUDENT_ID' && (
              <div className="space-y-4">
                <form onSubmit={handleStudentVerificationSubmit} className="space-y-4">
                  <FormField
                    label="Institutional College ID or Email"
                    htmlFor="student-college-id"
                    required
                    helperText="Enter your official student roll number or institutional email."
                  >
                    <Input
                      id="student-college-id"
                      placeholder="e.g. STU-2026-001 or 23341A4234@GMRIT.EDU.IN"
                      value={collegeId}
                      onChange={(e) => setCollegeId(e.target.value)}
                      leftIcon={<User className="w-4 h-4" />}
                      autoComplete="username"
                      disabled={isStartingVerification}
                      className="font-mono"
                    />
                  </FormField>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    size="md"
                    isLoading={isStartingVerification}
                    disabled={!collegeId.trim() || isStartingVerification}
                  >
                    Send Verification Code <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </form>

                {/* Direct Link to Registration */}
                <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-navy-950 block">New Student Voter?</span>
                    <span className="text-[11px] text-slate-500">Register with your institutional details</span>
                  </div>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-900 text-white font-semibold text-xs hover:bg-navy-800 transition-colors shadow-2xs"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Register
                  </Link>
                </div>

                <div className="relative flex items-center justify-center">
                  <div className="border-t border-slate-200 w-full" />
                  <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Or Scan ID Badge
                  </span>
                </div>

                {/* QR and Barcode Scanner Direct Link */}
                <Link to="/login/qr">
                  <button
                    type="button"
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-brand-primary shadow-2xs">
                        <Barcode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-navy-950">Scan Student ID QR Code / Barcode</div>
                        <div className="text-[11px] text-slate-500">Universal scanner for 1D barcodes and QR cards</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </Link>

                {/* Quick Student ID triggers for development testing */}
                <div className="pt-3 border-t border-surface-border">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Synthetic Student IDs (Testing)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleQuickStudentId('STU-2026-001')}
                      className="p-2 rounded-lg border border-surface-border bg-surface-subtle hover:bg-blue-50 text-left transition-colors"
                    >
                      <div className="font-bold text-navy-950 text-[11px]">STU-2026-001</div>
                      <div className="text-[10px] text-slate-500">Alex Rivera (CS Y3)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickStudentId('STU-2026-002')}
                      className="p-2 rounded-lg border border-surface-border bg-surface-subtle hover:bg-blue-50 text-left transition-colors"
                    >
                      <div className="font-bold text-navy-950 text-[11px]">STU-2026-002</div>
                      <div className="text-[10px] text-slate-500">Priya Sharma (EE Y2)</div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Staff & Admin Username/Password */}
            {loginMode === 'STAFF_PASSWORD' && (
              <div className="space-y-4">
                <form onSubmit={handleStaffSubmit} className="space-y-4">
                  <FormField label="Username or Email" htmlFor="staff-identifier" required>
                    <Input
                      id="staff-identifier"
                      placeholder="e.g. admin_demo"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      leftIcon={<User className="w-4 h-4" />}
                      autoComplete="username"
                      disabled={isLoading}
                    />
                  </FormField>

                  <FormField label="Password" htmlFor="staff-password" required>
                    <Input
                      id="staff-password"
                      type="password"
                      placeholder="Enter administrator password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<KeyRound className="w-4 h-4" />}
                      autoComplete="current-password"
                      disabled={isLoading}
                    />
                  </FormField>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full mt-2"
                    size="md"
                    isLoading={isLoading}
                  >
                    Sign In as Administrator
                  </Button>

                  <div className="text-center pt-2">
                    <Link
                      to="/register/college-admin"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                    >
                      <Building2 className="w-3.5 h-3.5" /> Register as a College Administrator &rarr;
                    </Link>
                  </div>
                </form>

                {/* Development Quick Role Switcher */}
                <div className="pt-3 border-t border-surface-border">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Synthetic Staff Logins</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleQuickLogin('admin_demo', 'CampusVote2026!Admin')}
                      disabled={isLoading}
                      className="p-2 rounded-lg border border-surface-border bg-surface-subtle hover:bg-blue-50 hover:border-blue-200 text-left transition-colors"
                    >
                      <div className="font-bold text-navy-950 text-[11px]">Election Admin</div>
                      <div className="text-[10px] text-slate-500 font-mono">admin_demo</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickLogin('auditor_demo', 'CampusVote2026!Auditor')}
                      disabled={isLoading}
                      className="p-2 rounded-lg border border-surface-border bg-surface-subtle hover:bg-blue-50 hover:border-blue-200 text-left transition-colors"
                    >
                      <div className="font-bold text-navy-950 text-[11px]">System Auditor</div>
                      <div className="text-[10px] text-slate-500 font-mono">auditor_demo</div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-between text-xs text-slate-500">
            <span>Session Security:</span>
            <span className="font-mono text-emerald-700 font-medium">HTTP-Only / SameSite=Lax</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
