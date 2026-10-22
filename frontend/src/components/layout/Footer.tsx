import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, FileCheck, Vote } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-navy-950 text-slate-400 border-t border-slate-800 text-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="md:col-span-2 space-y-3">
            <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg inline-flex">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-primary to-brand-cyan flex items-center justify-center shadow-sm">
                <Vote className="w-4 h-4 text-white" />
              </div>
              <span>CampusVote</span>
            </Link>
            <p className="text-slate-400 text-xs sm:text-sm max-w-md leading-relaxed">
              Smart ID-Based College Voting System with Real-Time Voter Monitoring.
              Architected for guaranteed one-voter-one-vote eligibility enforcement and
              mathematically decoupled ballot confidentiality.
            </p>
            <div className="flex items-center gap-4 pt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-brand-cyan" /> Decoupled Ballot Vault
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" /> Audit Logged
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs tracking-wider uppercase mb-3">
              Platform Portals
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link to="/" className="hover:text-white transition-colors">Home Portal</Link>
              </li>
              <li>
                <Link to="/elections" className="hover:text-white transition-colors">Active Elections</Link>
              </li>
              <li>
                <Link to="/student/dashboard" className="hover:text-white transition-colors">Student Portal</Link>
              </li>
              <li>
                <Link to="/admin/dashboard" className="hover:text-white transition-colors">Admin Console</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-xs tracking-wider uppercase mb-3">
              Governance &amp; Security
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Fail-closed voting gate active. Real campus elections require institutional approval and independent cryptographic review.
            </p>
            <span className="inline-block text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded">
              Security Hardened
            </span>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} CampusVote. Collegiate Election Platform. Synthetic Data Only.</p>
          <div className="flex items-center gap-6">
            <span>WCAG 2.1 AA Compliant</span>
            <span>Zero-PII Ballot Policy</span>
            <span>Fail-Closed Enforced</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
