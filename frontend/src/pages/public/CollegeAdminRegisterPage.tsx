import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  Lock,
  Mail,
  User,
  Phone,
  Sparkles,
  Info
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import {
  registerCollegeAdmin,
  fetchInstitutions,
  InstitutionItem,
  CollegeAdminRegistrationResponse
} from '../../services/auth';

export const CollegeAdminRegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [email, setEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isDemoClaim, setIsDemoClaim] = useState(true);

  // Institution discovery
  const [knownInstitutions, setKnownInstitutions] = useState<InstitutionItem[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<CollegeAdminRegistrationResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadInstitutions() {
      try {
        const list = await fetchInstitutions();
        if (isMounted) {
          setKnownInstitutions(list);
        }
      } catch (err) {
        console.warn('Could not fetch institutions list', err);
      }
    }
    loadInstitutions();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectExistingInstitution = (inst: InstitutionItem) => {
    setCollegeName(inst.name);
    setInstitutionCode(inst.code);
    if (inst.email_domain) {
      setEmail((prev) => {
        if (!prev || !prev.includes('@')) return `admin@${inst.email_domain}`;
        const prefix = prev.split('@')[0];
        return `${prefix}@${inst.email_domain}`;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedFullName = fullName.trim();
    const trimmedCollegeName = collegeName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFullName) {
      setErrorMessage('Please enter your full administrative name.');
      return;
    }
    if (!trimmedCollegeName) {
      setErrorMessage('Please enter or select your college/institution name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid institutional email address.');
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

    setIsLoading(true);
    try {
      const response = await registerCollegeAdmin({
        full_name: trimmedFullName,
        college_name: trimmedCollegeName,
        institution_code: institutionCode.trim().toUpperCase(),
        email: trimmedEmail,
        contact_phone: contactPhone.trim(),
        password,
        confirm_password: confirmPassword,
        is_simulation_demo: isDemoClaim,
      });

      setRegistrationResult(response);
    } catch (err: any) {
      const msg = err?.details?.message || err?.details?.error || err?.message || 'Registration failed. Please verify your details.';
      setErrorMessage(msg);
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

        {registrationResult ? (
          <Card className="shadow-elevated border-indigo-200">
            <CardHeader className="text-center pb-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl text-navy-950">
                College Admin Registered!
              </CardTitle>
              <CardDescription className="text-xs max-w-md mx-auto">
                {registrationResult.message}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Administrator Name:</span>
                  <span className="font-semibold text-navy-950">{registrationResult.user.full_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">College Domain:</span>
                  <span className="font-bold text-navy-950">{registrationResult.institution.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Institution Code:</span>
                  <span className="font-mono font-bold text-brand-primary">{registrationResult.institution.code}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Login Username:</span>
                  <span className="font-mono text-slate-700">{registrationResult.user.username}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Institution Status:</span>
                  <span className="font-semibold px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800">
                    {registrationResult.institution.status}
                    {registrationResult.institution.is_demo && ' (Demo Sandbox)'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Multi-Tenant Isolation Enforced</span>
                  Your administrative account is bound strictly to {registrationResult.institution.name}. You may manage elections and rosters within this domain.
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2 flex flex-col gap-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() =>
                  navigate('/login', {
                    state: {
                      mode: 'STAFF_PASSWORD',
                      identifier: registrationResult.user.username,
                    },
                  })
                }
              >
                Sign In to Admin Console as {registrationResult.user.username} &rarr;
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card className="shadow-elevated border-surface-border">
            <CardHeader className="text-center pb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/80 text-indigo-700 flex items-center justify-center mx-auto mb-3 shadow-subtle">
                <Building2 className="w-6 h-6" />
              </div>
              <CardTitle className="text-2xl text-navy-950">
                College Admin Registration
              </CardTitle>
              <CardDescription className="text-xs">
                Register an institutional administrator account to create elections, approve candidates, and oversee voting for your college.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Simulation Sandbox Notice */}
              <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Development Demonstration Mode</span>
                  Local multi-tenant institution onboarding is active. In production, official college administrator privileges require formal verification of credentials and domain ownership.
                </div>
              </div>

              {errorMessage && (
                <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* Quick Institution Selection */}
              {knownInstitutions.length > 0 && (
                <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <span className="text-slate-500 font-semibold block mb-2">
                    Or select an existing campus tenant:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {knownInstitutions.map((inst) => (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => handleSelectExistingInstitution(inst)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          collegeName === inst.name
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {inst.name} ({inst.code})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Administrator Full Name" required>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Dr. Arthur Pendelton"
                      className="pl-9 text-xs"
                      required
                    />
                  </div>
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <FormField label="College / Institution Name" required>
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          type="text"
                          value={collegeName}
                          onChange={(e) => setCollegeName(e.target.value)}
                          placeholder="e.g. Oxford Institute of Technology"
                          className="pl-9 text-xs"
                          required
                        />
                      </div>
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Tenant Code">
                      <Input
                        type="text"
                        value={institutionCode}
                        onChange={(e) => setInstitutionCode(e.target.value)}
                        placeholder="e.g. OIT-MAIN"
                        className="text-xs uppercase font-mono"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Official Institutional Email" required>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@college.edu"
                        className="pl-9 text-xs"
                        required
                      />
                    </div>
                  </FormField>

                  <FormField label="Contact Phone (Optional)">
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+1 (555) 019-2831"
                        className="pl-9 text-xs"
                      />
                    </div>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Password" required>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="pl-9 text-xs"
                        required
                        minLength={8}
                      />
                    </div>
                  </FormField>

                  <FormField label="Confirm Password" required>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="pl-9 text-xs"
                        required
                        minLength={8}
                      />
                    </div>
                  </FormField>
                </div>

                <div className="flex items-center gap-2 pt-1 pb-1">
                  <input
                    id="is-demo-claim"
                    type="checkbox"
                    checked={isDemoClaim}
                    onChange={(e) => setIsDemoClaim(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="is-demo-claim" className="text-xs text-slate-700">
                    Register as Demonstration / Sandbox Tenant (Self-Service Verification)
                  </label>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    isLoading={isLoading}
                    leftIcon={<ShieldCheck className="w-4 h-4" />}
                  >
                    Register College Administrator
                  </Button>
                </div>
              </form>
            </CardContent>

            <CardFooter className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-surface-border">
              <span>Are you an enrolled student?</span>
              <Link to="/register" className="font-semibold text-brand-primary hover:underline">
                Student Registration &rarr;
              </Link>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
};
