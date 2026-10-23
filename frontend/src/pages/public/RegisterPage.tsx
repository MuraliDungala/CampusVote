import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  User,
  Mail,
  Lock,
  ChevronRight,
  ShieldCheck,
  Info,
  Building2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { registerStudent, StudentRegistrationResponse } from '../../services/auth';

export const ACADEMIC_DEPARTMENTS = [
  'Computer Science and Engineering',
  'Artificial Intelligence and Machine Learning',
  'Data Science',
  'Electronics and Communication Engineering',
  'Electrical and Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Information Technology',
  'Other',
];

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(ACADEMIC_DEPARTMENTS[0]);
  const [customDepartment, setCustomDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState<number>(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<StudentRegistrationResponse | null>(null);

  // Safely extract readable error messages from any API or network error
  const extractErrorMessage = (err: any): string => {
    if (!err) {
      return 'Registration could not be completed. Please review your details and try again.';
    }

    const isHtmlOrDebug = (val: string) => {
      if (typeof val !== 'string') return false;
      const lower = val.toLowerCase();
      return (
        lower.includes('<html') ||
        lower.includes('<!doctype') ||
        lower.includes('<body') ||
        lower.includes('<head') ||
        lower.includes('</div>') ||
        lower.includes('traceback')
      );
    };

    // 1. Structured backend error with message
    if (err?.details && typeof err.details === 'object') {
      if (typeof err.details.message === 'string' && !isHtmlOrDebug(err.details.message)) {
        return err.details.message;
      }
      if (typeof err.details.error === 'string' && !isHtmlOrDebug(err.details.error)) {
        return err.details.error;
      }

      // Check field-level errors (e.g. details: { college_name: [...], email: [...] })
      const errorBag = err.details.details && typeof err.details.details === 'object'
        ? err.details.details
        : err.details;

      const keys = Object.keys(errorBag).filter((k) => !['message', 'error', 'status'].includes(k));
      if (keys.length > 0) {
        const fieldKey = keys[0];
        const fieldVal = errorBag[fieldKey];
        const formattedField = fieldKey.replace(/_/g, ' ');

        if (Array.isArray(fieldVal) && fieldVal.length > 0 && typeof fieldVal[0] === 'string') {
          if (!isHtmlOrDebug(fieldVal[0])) {
            return `${formattedField}: ${fieldVal[0]}`;
          }
        } else if (typeof fieldVal === 'string' && !isHtmlOrDebug(fieldVal)) {
          return `${formattedField}: ${fieldVal}`;
        }
      }
    }

    // 2. Safe error message on the error object itself
    if (typeof err?.message === 'string' && !isHtmlOrDebug(err.message)) {
      return err.message;
    }

    // 3. Fallbacks based on HTTP status code
    if (err?.status === 404) {
      return 'Registration service endpoint is currently unreachable. Please verify server connectivity.';
    }
    if (err?.status === 500) {
      return 'The registration service encountered an internal error. Please try again shortly.';
    }
    if (err?.status === 403) {
      return 'Registration request was rejected due to an expired session or CSRF validation failure.';
    }
    if (err?.status === 0) {
      return 'Network connection error. Please verify your internet connection.';
    }

    return 'Registration could not be completed. Please review your information and try again.';
  };

  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setDepartment(val);
    if (val !== 'Other') {
      setCustomDepartment('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedFullName = fullName.trim();
    const trimmedCollegeName = collegeName.trim();
    const trimmedCollegeId = collegeId.trim().toUpperCase();
    const trimmedEmail = email.trim().toLowerCase();
    const isOtherDept = department === 'Other';
    const trimmedCustomDept = customDepartment.trim();

    // Client-side validations with clear human messages
    if (!trimmedFullName) {
      setErrorMessage('Please enter your full registered name.');
      return;
    }
    if (!trimmedCollegeName) {
      setErrorMessage('Please enter your college or institution name.');
      return;
    }
    if (!trimmedCollegeId) {
      setErrorMessage('Please enter your institutional College ID or roll number.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid institutional college email address.');
      return;
    }
    if (isOtherDept && !trimmedCustomDept) {
      setErrorMessage('Please enter your department name.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password entry.');
      return;
    }

    const effectiveDepartment = isOtherDept ? trimmedCustomDept : department;

    setIsLoading(true);
    try {
      const response = await registerStudent({
        full_name: trimmedFullName,
        college_name: trimmedCollegeName,
        college_id: trimmedCollegeId,
        email: trimmedEmail,
        department: effectiveDepartment,
        custom_department: isOtherDept ? trimmedCustomDept : undefined,
        academic_year: academicYear,
        password,
      });

      setRegistrationSuccess(response);
    } catch (err: any) {
      const cleanMsg = extractErrorMessage(err);
      setErrorMessage(cleanMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-surface-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl px-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy-950 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </Link>

        {registrationSuccess ? (
          <Card className="shadow-elevated border-emerald-200">
            <CardHeader className="text-center pb-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl text-navy-950">
                {registrationSuccess.status === 'VERIFIED'
                  ? 'Registration Verified!'
                  : 'Registration Submitted'}
              </CardTitle>
              <CardDescription className="text-xs max-w-md mx-auto">
                {registrationSuccess.message}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Student Name:</span>
                  <span className="font-semibold text-navy-950">{registrationSuccess.full_name}</span>
                </div>
                {registrationSuccess.college_name && (
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500">College / Institution:</span>
                    <span className="font-semibold text-navy-950">{registrationSuccess.college_name}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">College ID:</span>
                  <span className="font-mono font-bold text-brand-primary">{registrationSuccess.college_id}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Roster Verification:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                      registrationSuccess.is_verified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {registrationSuccess.is_verified ? 'Verified Active Roster' : 'Pending Registrar Review'}
                  </span>
                </div>
              </div>

              {registrationSuccess.is_verified ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>
                    Your identity matched the approved institutional student registry. You can now log in using your College ID and OTP verification.
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Your registration has been forwarded to the college registrar. An administrator will verify your enrollment status.
                  </span>
                </div>
              )}

              <Button
                type="button"
                variant="primary"
                className="w-full"
                size="md"
                onClick={() => navigate('/login')}
              >
                Proceed to Login <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-elevated">
            <CardHeader className="text-center pb-4">
              <div className="w-12 h-12 rounded-2xl bg-navy-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                <GraduationCap className="w-6 h-6 text-brand-cyan" />
              </div>
              <CardTitle className="text-xl">Student Voter Registration</CardTitle>
              <CardDescription className="text-xs">
                Create your student voting account using your institutional credentials.
              </CardDescription>

              {/* Institutional Notice */}
              <div className="mt-3 p-3 rounded-xl border border-blue-200 bg-blue-50/70 text-left flex items-start gap-2.5">
                <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  <span className="font-semibold text-navy-950">Institutional Identity Matching:</span>{' '}
                  Submissions are matched against the college registrar roster. Students in the official roster are verified immediately.
                </p>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              {errorMessage && (
                <div
                  className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2.5"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* Full Name */}
                <FormField label="Full Name" htmlFor="reg-fullname" required>
                  <Input
                    id="reg-fullname"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    leftIcon={<User className="w-4 h-4" />}
                    disabled={isLoading}
                    required
                  />
                </FormField>

                {/* College Name & Institutional College ID Side-by-Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="College Name"
                    htmlFor="reg-college-name"
                    required
                    helperText="Official college or university name"
                  >
                    <Input
                      id="reg-college-name"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      leftIcon={<Building2 className="w-4 h-4" />}
                      disabled={isLoading}
                      required
                    />
                  </FormField>

                  <FormField
                    label="Institutional College ID"
                    htmlFor="reg-college-id"
                    required
                    helperText="Roll number or student badge ID"
                  >
                    <Input
                      id="reg-college-id"
                      value={collegeId}
                      onChange={(e) => setCollegeId(e.target.value.toUpperCase())}
                      leftIcon={<GraduationCap className="w-4 h-4" />}
                      className="font-mono uppercase"
                      disabled={isLoading}
                      required
                    />
                  </FormField>
                </div>

                {/* Email Address */}
                <FormField
                  label="Institutional Email Address"
                  htmlFor="reg-email"
                  required
                  helperText="Official university or department issued email"
                >
                  <Input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    leftIcon={<Mail className="w-4 h-4" />}
                    disabled={isLoading}
                    required
                  />
                </FormField>

                {/* Academic Department & Year */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Academic Department" htmlFor="reg-dept" required>
                    <div className="relative">
                      <select
                        id="reg-dept"
                        value={department}
                        onChange={handleDepartmentChange}
                        disabled={isLoading}
                        className="w-full h-10 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-navy-950 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                      >
                        {ACADEMIC_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                  </FormField>

                  <FormField label="Academic Year" htmlFor="reg-year" required>
                    <div className="relative">
                      <select
                        id="reg-year"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(parseInt(e.target.value, 10))}
                        disabled={isLoading}
                        className="w-full h-10 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-navy-950 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
                      >
                        <option value={1}>Year 1 (Freshman)</option>
                        <option value={2}>Year 2 (Sophomore)</option>
                        <option value={3}>Year 3 (Junior)</option>
                        <option value={4}>Year 4 (Senior)</option>
                        <option value={5}>Year 5 (Graduate/Extended)</option>
                      </select>
                    </div>
                  </FormField>
                </div>

                {/* Custom Department Name Field when "Other" is selected */}
                {department === 'Other' && (
                  <FormField
                    label="Enter Department Name"
                    htmlFor="reg-custom-dept"
                    required
                    helperText="Specify your official department or faculty"
                  >
                    <Input
                      id="reg-custom-dept"
                      value={customDepartment}
                      onChange={(e) => setCustomDepartment(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </FormField>
                )}

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Account Password"
                    htmlFor="reg-password"
                    required
                    helperText="Minimum 8 characters"
                  >
                    <Input
                      id="reg-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<Lock className="w-4 h-4" />}
                      disabled={isLoading}
                      required
                    />
                  </FormField>

                  <FormField label="Confirm Password" htmlFor="reg-confirm-password" required>
                    <Input
                      id="reg-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      leftIcon={<Lock className="w-4 h-4" />}
                      disabled={isLoading}
                      required
                    />
                  </FormField>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-2"
                  size="md"
                  isLoading={isLoading}
                  disabled={isLoading}
                >
                  Complete Registration <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </form>

              <div className="pt-4 border-t border-slate-200 text-center space-y-2">
                <p className="text-xs text-slate-600">
                  Already have an account?{' '}
                  <Link to="/login" className="font-semibold text-brand-primary hover:underline">
                    Sign in here
                  </Link>
                </p>
                <p className="text-[11px] text-slate-500">
                  Setting up a college or campus elections?{' '}
                  <Link to="/register/college-admin" className="font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Register as College Administrator &rarr;
                  </Link>
                </p>
              </div>
            </CardContent>

            <CardFooter className="justify-between text-[11px] text-slate-500 border-t border-surface-border">
              <span>Zero-PII Ballot Architecture</span>
              <span className="font-medium text-navy-950">Official Campus Credential</span>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
};
