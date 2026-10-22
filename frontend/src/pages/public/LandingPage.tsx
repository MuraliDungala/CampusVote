import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Activity,
  Vote,
  ArrowRight,
  Fingerprint,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  ChevronRight,
  Lock,
  Compass
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { getElections } from '../../services/elections';
import { Election } from '../../types/election';

export const LandingPage: React.FC = () => {
  const [featuredElections, setFeaturedElections] = useState<Election[]>([]);
  const [loadingElections, setLoadingElections] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadFeatured() {
      try {
        const response = await getElections({ page_size: 3 });
        if (isMounted) {
          setFeaturedElections(response.results || []);
        }
      } catch {
        // Fallback gracefully on network/unauthenticated initial load
        if (isMounted) setFeaturedElections([]);
      } finally {
        if (isMounted) setLoadingElections(false);
      }
    }
    loadFeatured();
    return () => {
      isMounted = false;
    };
  }, []);

  const scrollToHowItWorks = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Institutional Security Notice Pill Banner */}
      <div className="bg-navy-950 text-white/90 border-b border-navy-800 py-2.5 px-4 text-center">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan-light text-[11px] font-semibold uppercase tracking-wider">
            <Lock className="w-3 h-3" /> Security Standard
          </span>
          <span className="text-slate-300">
            Real voting remains disabled under fail-closed restrictions pending independent cryptographic review.
          </span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-surface-canvas to-surface-canvas pt-12 pb-16 lg:pt-16 lg:pb-24 border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headline and Actions */}
            <div className="lg:col-span-7 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/70 text-navy-900 text-xs font-semibold uppercase tracking-wider mb-6 shadow-subtle">
                <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
                <span>Collegiate Elections Platform</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-navy-950 tracking-tight leading-[1.12] mb-6">
                Your Campus. <br />
                <span className="bg-gradient-to-r from-navy-900 via-brand-primary to-brand-cyan bg-clip-text text-transparent">
                  Your Voice. Your Vote.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed max-w-xl">
                The smart ID-based collegiate voting system engineered for verifiable student democracy.
                Combines multi-factor campus ID verification with mathematically decoupled anonymous ballots and real-time operational turnout monitoring.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 mb-10">
                <Link to="/elections">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto shadow-elevated bg-navy-900 hover:bg-navy-800 text-white font-semibold"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Explore Elections
                  </Button>
                </Link>

                <Link to="/register">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto font-medium text-slate-700 hover:text-navy-950 border-slate-300"
                  >
                    Register Student ID
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  size="lg"
                  onClick={scrollToHowItWorks}
                  className="w-full sm:w-auto font-medium text-slate-600 hover:text-navy-950"
                >
                  How It Works
                </Button>
              </div>

              {/* Core Trust Indicators */}
              <div className="pt-6 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Zero-Linkage Privacy</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>One-Student-One-Vote</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700 col-span-2 sm:col-span-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verifiable Tallies</span>
                </div>
              </div>
            </div>

            {/* Right Column: Campus Photograph with Modern Card Overlay */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80 bg-navy-900 group">
                <img
                  src="/images/campus-hero.svg"
                  alt="CampusVote modern university campus quad"
                  className="w-full h-auto aspect-[16/10] object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-900/30 to-transparent flex flex-col justify-end p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-brand-cyan-light">
                        University Democracy
                      </p>
                      <h4 className="text-white font-bold text-lg mt-0.5">
                        Central University Quad
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold">
                      Active Portal
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating Smart Badge Preview Card */}
              <div className="hidden sm:flex absolute -bottom-6 -left-6 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-elevated border border-slate-200/80 items-center gap-3.5 max-w-xs z-10">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-navy-900 flex items-center justify-center shrink-0 border border-blue-100">
                  <Fingerprint className="w-5 h-5 text-brand-cyan" />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-950">Smart ID Authentication</p>
                  <p className="text-[11px] text-slate-500">Fast 2-factor OTP verification</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Feature Pillars: Core Platform Capabilities */}
      <section className="py-16 lg:py-20 bg-white border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-cyan">
              Engineered For Security & Trust
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight mt-2">
              Platform Capabilities
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
              Designed specifically for institutional colleges to guarantee fair participation with provable ballot confidentiality.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1: Smart ID Verification */}
            <Card hoverEffect className="flex flex-col border border-slate-200">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-navy-900 border border-blue-200/70 flex items-center justify-center mb-5 shadow-sm">
                  <Fingerprint className="w-6 h-6 text-brand-cyan" />
                </div>
                <h3 className="text-base font-bold text-navy-950 mb-2">
                  Smart ID Verification
                </h3>
                <p className="text-xs font-semibold text-brand-cyan mb-2">
                  Multi-Factor Student Verification
                </p>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Three-tier identity validation pairing college ID credentials with time-sensitive OTP delivery and ephemeral QR challenge nonces for remote or kiosk voting.
                </p>
              </CardContent>
            </Card>

            {/* Feature 2: Secure Voting Architecture */}
            <Card hoverEffect className="flex flex-col border border-slate-200">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/70 flex items-center justify-center mb-5 shadow-sm">
                  <Vote className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-navy-950 mb-2">
                  Secure Voting Architecture
                </h3>
                <p className="text-xs font-semibold text-emerald-700 mb-2">
                  Zero-Linkage Ballot Secrecy
                </p>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Strict mathematical and architectural decoupling of participation records from anonymous ballot storage. No student identifier is ever stored on a ballot.
                </p>
              </CardContent>
            </Card>

            {/* Feature 3: Real-Time Election Monitoring */}
            <Card hoverEffect className="flex flex-col border border-slate-200">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-800 border border-sky-200/70 flex items-center justify-center mb-5 shadow-sm">
                  <Activity className="w-6 h-6 text-brand-cyan" />
                </div>
                <h3 className="text-base font-bold text-navy-950 mb-2">
                  Real-Time Election Monitoring
                </h3>
                <p className="text-xs font-semibold text-brand-cyan mb-2">
                  Transparent Real-Time Monitoring
                </p>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Live operational turnout tracking broadcast across departments and cohorts via WebSockets. Aggregated metrics provide administrative visibility with zero ballot choice exposure.
                </p>
              </CardContent>
            </Card>

            {/* Feature 4: Election Results & Audit */}
            <Card hoverEffect className="flex flex-col border border-slate-200">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-navy-50 text-navy-900 border border-navy-200/70 flex items-center justify-center mb-5 shadow-sm">
                  <ShieldCheck className="w-6 h-6 text-navy-900" />
                </div>
                <h3 className="text-base font-bold text-navy-950 mb-2">
                  Election Results and Audit Verification
                </h3>
                <p className="text-xs font-semibold text-navy-800 mb-2">
                  Secure Election Management
                </p>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Deterministic tabulation, SHA-256 cryptographic artifact digests, mandatory separation of duties between calculator and approver, and auditable reconciliation receipts.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 3-Step Workflow Explanation */}
      <section id="how-it-works" className="py-16 lg:py-20 bg-surface-canvas border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-900">
              Simplified Democratic Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight mt-2">
              How It Works
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
              Three seamless steps from student authentication to sealed confidential participation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white p-8 rounded-card border border-surface-border shadow-subtle relative flex flex-col">
              <div className="w-10 h-10 rounded-full bg-navy-900 text-white font-bold text-sm flex items-center justify-center mb-6 shadow-sm">
                01
              </div>
              <h3 className="text-lg font-bold text-navy-950 mb-2.5">
                Smart ID Authentication
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4 flex-1">
                Enter your verified College Registration ID to receive a secure time-based OTP or scan an ephemeral polling kiosk QR challenge code.
              </p>
              <div className="pt-4 border-t border-slate-100 flex items-center text-xs font-medium text-slate-500">
                <span>Verified against registrar roster</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-8 rounded-card border border-surface-border shadow-subtle relative flex flex-col">
              <div className="w-10 h-10 rounded-full bg-brand-primary text-white font-bold text-sm flex items-center justify-center mb-6 shadow-sm">
                02
              </div>
              <h3 className="text-lg font-bold text-navy-950 mb-2.5">
                Eligibility Check
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4 flex-1">
                The institutional engine evaluates your enrollment standing, academic year, and department against active election criteria.
              </p>
              <div className="pt-4 border-t border-slate-100 flex items-center text-xs font-medium text-slate-500">
                <span>Atomic one-vote validation</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-8 rounded-card border border-surface-border shadow-subtle relative flex flex-col">
              <div className="w-10 h-10 rounded-full bg-brand-cyan text-white font-bold text-sm flex items-center justify-center mb-6 shadow-sm">
                03
              </div>
              <h3 className="text-lg font-bold text-navy-950 mb-2.5">
                Sealed Anonymous Ballot
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4 flex-1">
                Cast your confidential candidate selections. Ballots are cryptographically isolated without identity metadata and sealed in the vault.
              </p>
              <div className="pt-4 border-t border-slate-100 flex items-center text-xs font-medium text-slate-500">
                <span>Zero voter-to-ballot linkage</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real-Data Election Discovery Section */}
      <section className="py-16 bg-white border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-cyan">
                Live Campus Elections
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight mt-1">
                Explore Available Elections
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Active and scheduled collegiate ballots open for student participation.
              </p>
            </div>
            <Link to="/elections">
              <Button variant="outline" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
                View All Elections
              </Button>
            </Link>
          </div>

          {loadingElections ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-card bg-slate-100 animate-pulse border border-slate-200" />
              ))}
            </div>
          ) : featuredElections.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredElections.map((election) => (
                <Card key={election.id} hoverEffect className="flex flex-col border border-slate-200 overflow-hidden">
                  <div className="relative h-32 bg-navy-900 overflow-hidden">
                    <img
                      src="/images/election-banner.svg"
                      alt={election.title}
                      className="w-full h-full object-cover opacity-80"
                    />
                    <div className="absolute top-3 right-3">
                      <Badge
                        variant={election.status === 'ACTIVE' ? 'success' : 'neutral'}
                        size="sm"
                      >
                        {election.status}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-base font-bold text-navy-950 line-clamp-1 mb-1.5">
                        {election.title}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                        {election.description || 'Collegiate election scheduled for verified students.'}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 pt-3 border-t border-slate-100">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{election.academic_year || 'Academic Year'}</span>
                        <span className="text-slate-300">•</span>
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span>{election.positions_count ?? 1} Positions</span>
                      </div>

                      <Link to={`/elections/${election.id}`}>
                        <Button variant="outline" size="sm" className="w-full font-medium">
                          Inspect Ballot
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-surface-subtle p-8 rounded-card border border-surface-border text-center max-w-lg mx-auto">
              <Compass className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-navy-950 mb-1">Elections Scheduled Soon</h4>
              <p className="text-xs text-slate-500 mb-4">
                No active elections are currently open for general voting. Visit the elections directory to inspect past results or scheduled cycles.
              </p>
              <Link to="/elections">
                <Button variant="primary" size="sm">Browse Directory</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Security Governance Notice */}
      <section className="py-12 bg-white border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-6 flex flex-col sm:flex-row items-start gap-4">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-900 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-950 mb-1">
                Institutional Security & Privacy Standard
              </h3>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                CampusVote adheres to strict electronic voting governance. The system enforces software-decoupled ballot anonymity. Real-election voting remains disabled pending independent cryptographic audit and institutional election committee certification.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Call to Action Section */}
      <section className="py-16 bg-navy-950 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
            Ready to participate in campus democracy?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto mb-8">
            Access your student portal to review active elections, inspect candidate platforms, and prepare your ballot.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login">
              <Button
                variant="primary"
                size="lg"
                className="bg-brand-cyan hover:bg-brand-cyan-hover text-white font-semibold"
                leftIcon={<Vote className="w-4 h-4" />}
              >
                Proceed to Student Portal
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
