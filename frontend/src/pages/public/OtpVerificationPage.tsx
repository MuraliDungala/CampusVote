import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCw,
  Lock
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FormField } from '../../components/ui/FormField';
import { useAuth } from '../../context/AuthContext';
import { verifyOtpCode, resendOtpCode } from '../../services/verification';
import { StartVerificationResponse } from '../../types/verification';

export const OtpVerificationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const stateData = (location.state as StartVerificationResponse | undefined);

  const sessionId = stateData?.session_id || '';
  const collegeId = stateData?.college_id || '';
  const destinationMasked = stateData?.destination_masked || '';

  const [otp, setOtp] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Expiry countdown timer (in seconds)
  const [expirySeconds, setExpirySeconds] = useState<number>(stateData?.expires_in_seconds || 300);
  // Resend cooldown timer (in seconds)
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(stateData?.resend_cooldown_seconds || 60);
  const [resendsRemaining, setResendsRemaining] = useState<number>(3);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Tick timers
  useEffect(() => {
    const timer = setInterval(() => {
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setError('Missing verification session. Please restart verification.');
      return;
    }
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit numeric verification code.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await verifyOtpCode({
        session_id: sessionId,
        otp: otp.trim(),
      });

      setSuccessMessage('Identity verified successfully! Redirecting to student dashboard...');
      // Sync auth state
      await refreshUser();

      setTimeout(() => {
        navigate('/student/dashboard', { replace: true });
      }, 800);
    } catch (err: any) {
      const errMsg = err?.details?.error || err?.message || 'Verification failed. Please try again.';
      setError(errMsg);
      if (err?.details?.details?.is_locked || err?.status === 423) {
        setIsLocked(true);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!sessionId || cooldownSeconds > 0 || isResending) return;

    setIsResending(true);
    setError(null);

    try {
      const res = await resendOtpCode({ session_id: sessionId });
      setCooldownSeconds(res.resend_cooldown_seconds || 60);
      setExpirySeconds(res.expires_in_seconds || 300);
      setResendsRemaining(res.resends_remaining ?? 2);
      setSuccessMessage('A fresh verification code has been dispatched.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification code.');
    } finally {
      setIsResending(false);
    }
  };

  // If session was not initialized, provide prompt to return to login
  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-surface-canvas">
        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 text-center">
          <Card className="shadow-elevated p-6">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-navy-950 mb-2">No Active Verification Session</h3>
            <p className="text-xs text-slate-600 mb-6">
              Please enter your College ID or scan your identity badge to initiate a secure verification challenge.
            </p>
            <Link to="/login">
              <Button variant="primary" size="md" className="w-full">
                Go to Identification Portal
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-surface-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy-950 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Change College ID
        </Link>

        <Card className="shadow-elevated">
          <CardHeader className="text-center pb-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-brand-cyan" />
            </div>
            <CardTitle className="text-xl">Two-Factor ID Verification</CardTitle>
            <CardDescription className="text-xs">
              Enter the 6-digit verification code sent to your registered institutional contact.
            </CardDescription>

            {destinationMasked && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-medium mx-auto">
                <span>Contact:</span>
                <span className="font-semibold text-navy-950">{destinationMasked}</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            {error && (
              <div
                className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2.5"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {successMessage && (
              <div
                className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-start gap-2.5"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-5">
              <FormField
                label="One-Time Verification Code"
                htmlFor="otp-input"
                required
                helperText="6-digit numeric passcode from your institutional email."
              >
                <div className="relative">
                  <Input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(val);
                    }}
                    disabled={isVerifying || isLocked}
                    className="text-center font-mono text-xl tracking-[0.4em] font-bold h-12"
                    autoFocus
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-4 pointer-events-none" />
                </div>
              </FormField>

              {/* Countdown and Expiry Row */}
              <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Code Expiry:</span>
                  <span className={`font-mono font-bold ${expirySeconds <= 30 ? 'text-red-600' : 'text-navy-950'}`}>
                    {formatTimer(expirySeconds)}
                  </span>
                </div>

                {isLocked ? (
                  <Badge variant="danger" size="sm" className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked
                  </Badge>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldownSeconds > 0 || isResending || isLocked}
                    className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                      cooldownSeconds > 0 || isLocked
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-brand-primary hover:text-navy-950 hover:underline'
                    }`}
                  >
                    <RotateCw className={`w-3 h-3 ${isResending ? 'animate-spin' : ''}`} />
                    {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : `Resend Code (${resendsRemaining} left)`}
                  </button>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                size="md"
                isLoading={isVerifying}
                disabled={otp.length !== 6 || isLocked || isVerifying}
              >
                Verify & Enter Portal
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-between text-[11px] text-slate-500 border-t border-surface-border">
            <span>Student Record: <strong className="text-navy-900 font-mono">{collegeId}</strong></span>
            <span className="text-emerald-700 font-medium">Constant-Time SHA-256</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
