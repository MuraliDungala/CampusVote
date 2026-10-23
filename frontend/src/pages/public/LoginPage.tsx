import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  AlertCircle,
  User,
  GraduationCap,
  Building2,
  UserPlus,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types/auth';

export const LoginPage: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialMode =
    (location.state as any)?.mode === 'STAFF_PASSWORD' ||
    searchParams.get('tab') === 'admin' ||
    searchParams.get('role') === 'admin' ||
    searchParams.get('mode') === 'admin'
      ? 'STAFF_PASSWORD'
      : 'STUDENT_PASSWORD';

  const initialIdentifier = (location.state as any)?.identifier || searchParams.get('identifier') || '';

  // Login mode: 'STUDENT_PASSWORD' or 'STAFF_PASSWORD'
  const [loginMode, setLoginMode] = useState<'STUDENT_PASSWORD' | 'STAFF_PASSWORD'>(initialMode);

  // Student mode credentials
  const [studentIdentifier, setStudentIdentifier] = useState(initialIdentifier);
  const [studentPassword, setStudentPassword] = useState('');
  const [isStudentSubmitting, setIsStudentSubmitting] = useState(false);
  const [isUnregistered, setIsUnregistered] = useState(false);

  // Staff mode credentials
  const [staffIdentifier, setStaffIdentifier] = useState(initialIdentifier);
  const [staffPassword, setStaffPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { user, isAuthenticated, logout, login, isLoading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();

  // Sync mode and identifier if navigation state changes
  useEffect(() => {
    const stateMode = (location.state as any)?.mode;
    const stateId = (location.state as any)?.identifier;
    if (stateMode === 'STAFF_PASSWORD') {
      setLoginMode('STAFF_PASSWORD');
    } else if (stateMode === 'STUDENT_ID' || stateMode === 'STUDENT_PASSWORD') {
      setLoginMode('STUDENT_PASSWORD');
    }
    if (stateId) {
      setStudentIdentifier(stateId);
      setStaffIdentifier(stateId);
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

  // Handle Student Email/College ID + Password login
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();
    setIsUnregistered(false);

    const targetId = studentIdentifier.trim();
    if (!targetId) {
      setFormError('Please enter your registered Email address or College ID.');
      return;
    }
    if (!studentPassword) {
      setFormError('Please enter your student password.');
      return;
    }

    setIsStudentSubmitting(true);
    try {
      const loggedUser = await login({ identifier: targetId, password: studentPassword });
      redirectAfterLogin(loggedUser.role);
    } catch (err: any) {
      const msg = err?.message || 'Login failed. Please check your credentials.';
      const cleanMsg = typeof msg === 'string' && (msg.includes('<html') || msg.includes('<!doctype'))
        ? 'A server communication error occurred. Please try again shortly.'
        : msg;

      setFormError(cleanMsg);
      if (
        cleanMsg.toLowerCase().includes('not found') ||
        cleanMsg.toLowerCase().includes('register') ||
        cleanMsg.toLowerCase().includes('does not exist')
      ) {
        setIsUnregistered(true);
      }
    } finally {
      setIsStudentSubmitting(false);
    }
  };

  // Handle Staff Username/Password login
  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!staffIdentifier.trim()) {
      setFormError('Please enter your Username or Email.');
      return;
    }
    if (!staffPassword) {
      setFormError('Please enter your administrator password.');
      return;
    }

    try {
      const loggedUser = await login({ identifier: staffIdentifier.trim(), password: staffPassword });
      redirectAfterLogin(loggedUser.role);
    } catch (err: any) {
      const msg = err?.message || 'Login failed. Please check your credentials.';
      setFormError(msg);
    }
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

        <Card className="shadow-elevated">
          <CardHeader className="text-center pb-4">
            <div className="w-12 h-12 rounded-2xl bg-navy-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-brand-cyan" />
            </div>
            <CardTitle className="text-xl">Campus Portal Access</CardTitle>
            <CardDescription className="text-xs">
              Sign in with your registered institutional credentials to proceed.
            </CardDescription>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mt-4 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setLoginMode('STUDENT_PASSWORD');
                  setFormError(null);
                  clearError();
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  loginMode === 'STUDENT_PASSWORD'
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
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{formError || authError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFormError(null); clearError(); }}
                    className="text-red-500 hover:text-red-800 font-semibold text-[11px] underline shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                {isUnregistered && (
                  <div className="pt-2 border-t border-red-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-red-600">First time using CampusVote?</span>
                    <Link
                      to="/register"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-colors shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Register Student Account
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: Student Login with Email/College ID & Password */}
            {loginMode === 'STUDENT_PASSWORD' && (
              <div className="space-y-4">
                <form onSubmit={handleStudentSubmit} className="space-y-4">
                  <FormField
                    label="Institutional Email or College ID"
                    htmlFor="student-identifier"
                    required
                    helperText="Enter the official email or roll number registered with your college."
                  >
                    <Input
                      id="student-identifier"
                      value={studentIdentifier}
                      onChange={(e) => setStudentIdentifier(e.target.value)}
                      leftIcon={<User className="w-4 h-4" />}
                      autoComplete="username"
                      disabled={isStudentSubmitting}
                      className="font-mono text-xs"
                    />
                  </FormField>

                  <FormField
                    label="Password"
                    htmlFor="student-password"
                    required
                    helperText="Enter the password created during your registration."
                  >
                    <Input
                      id="student-password"
                      type="password"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      leftIcon={<KeyRound className="w-4 h-4" />}
                      autoComplete="current-password"
                      disabled={isStudentSubmitting}
                    />
                  </FormField>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full mt-2"
                    size="md"
                    isLoading={isStudentSubmitting}
                    disabled={!studentIdentifier.trim() || !studentPassword || isStudentSubmitting}
                  >
                    Sign In as Student Voter
                  </Button>
                </form>

                {/* Direct Link to Registration */}
                <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/50 flex items-center justify-between text-xs mt-4">
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
              </div>
            )}

            {/* TAB 2: Staff & Admin Username/Password */}
            {loginMode === 'STAFF_PASSWORD' && (
              <div className="space-y-4">
                <form onSubmit={handleStaffSubmit} className="space-y-4">
                  <FormField label="Username or Email" htmlFor="staff-identifier" required>
                    <Input
                      id="staff-identifier"
                      value={staffIdentifier}
                      onChange={(e) => setStaffIdentifier(e.target.value)}
                      leftIcon={<User className="w-4 h-4" />}
                      autoComplete="username"
                      disabled={isLoading}
                    />
                  </FormField>

                  <FormField label="Password" htmlFor="staff-password" required>
                    <Input
                      id="staff-password"
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
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
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-between text-xs text-slate-500">
            <span>Session Security:</span>
            <span className="font-mono text-emerald-700 font-medium">HTTP-Only / SameSite=None (HTTPS)</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
