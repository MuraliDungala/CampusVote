import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Vote, Menu, X, ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { useAuth } from '../../context/AuthContext';

export const PublicHeader: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const handleConfirmLogout = async () => {
    setLogoutModalOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <Link
              to="/"
              className="flex items-center gap-2.5 text-navy-950 font-bold text-xl tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg p-1"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-900 to-brand-primary text-white flex items-center justify-center shadow-sm">
                <Vote className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="leading-none flex items-center gap-1.5">
                  CampusVote
                  <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-blue-100 text-brand-primary">
                    RBAC
                  </span>
                </span>
                <span className="text-[11px] font-normal text-slate-500 tracking-normal">
                  Secure Collegiate Elections
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'text-brand-primary bg-blue-50/70 font-semibold'
                    : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                }`}
              >
                Home
              </Link>

              <Link
                to="/elections"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/elections')
                    ? 'text-brand-primary bg-blue-50/70 font-semibold'
                    : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                }`}
              >
                Elections
              </Link>

              {/* Role-Specific Portal Links */}
              {isAuthenticated && user?.is_student && (
                <Link
                  to="/student/dashboard"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/student/dashboard')
                      ? 'text-brand-primary bg-blue-50/70 font-semibold'
                      : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                  }`}
                >
                  Student Portal
                </Link>
              )}

              {isAuthenticated && user?.is_election_admin && (
                <Link
                  to="/admin/dashboard"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/admin/dashboard')
                      ? 'text-brand-primary bg-blue-50/70 font-semibold'
                      : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                  }`}
                >
                  Admin Console
                </Link>
              )}

              {isAuthenticated && user?.is_auditor && (
                <Link
                  to="/auditor/dashboard"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/auditor/dashboard')
                      ? 'text-brand-primary bg-blue-50/70 font-semibold'
                      : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                  }`}
                >
                  Auditor Console
                </Link>
              )}
            </nav>

            {/* Desktop Right User / Auth Status */}
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-3 pl-2 border-l border-surface-border">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user.full_name} role={user.role} size="sm" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-navy-950 leading-tight">
                        {user.full_name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {user.display_identifier}
                      </div>
                    </div>
                  </div>
                  <Badge variant={user.is_election_admin ? 'primary' : 'neutral'} size="sm">
                    {user.role}
                  </Badge>
                  {user.institution_name && (
                    <span className="hidden lg:inline-flex text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md max-w-[140px] truncate" title={user.institution_name}>
                      {user.institution_name}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoutModalOpen(true)}
                    className="text-slate-500 hover:text-red-600 p-1.5"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/register">
                    <Button
                      variant="outline"
                      size="sm"
                    >
                      Register
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<ShieldCheck className="w-4 h-4" />}
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile menu toggle button */}
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 hover:text-navy-950 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-surface-border bg-white px-4 pt-2 pb-4 space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-surface-subtle"
            >
              Home
            </Link>
            <Link
              to="/elections"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-surface-subtle"
            >
              Elections
            </Link>

            {isAuthenticated && user?.is_student && (
              <Link
                to="/student/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-brand-primary bg-blue-50"
              >
                Student Portal
              </Link>
            )}

            {isAuthenticated && user?.is_election_admin && (
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-brand-primary bg-blue-50"
              >
                Admin Console
              </Link>
            )}

            {isAuthenticated && user?.is_auditor && (
              <Link
                to="/auditor/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-brand-primary bg-blue-50"
              >
                Auditor Console
              </Link>
            )}

            <div className="pt-2 border-t border-surface-border">
              {isAuthenticated && user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1 text-xs text-slate-600">
                    <span>Signed in as:</span>
                    <span className="font-bold text-navy-950">{user.full_name} ({user.role})</span>
                  </div>
                  <Button
                    variant="outline"
                    size="md"
                    className="w-full text-red-600 border-red-200"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLogoutModalOpen(true);
                    }}
                    leftIcon={<LogOut className="w-4 h-4" />}
                  >
                    Sign Out
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="block">
                    <Button variant="outline" size="md" className="w-full">
                      Register Student ID
                    </Button>
                  </Link>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block">
                    <Button variant="primary" size="md" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Logout Confirmation Modal */}
      <ConfirmationDialog
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Sign Out of CampusVote"
        description="Are you sure you wish to terminate your current authenticated session? Any unsubmitted voting choices will not be preserved."
        confirmLabel="Sign Out"
        variant="primary"
      />
    </>
  );
};
