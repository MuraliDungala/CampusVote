import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../context/AuthContext';

export interface UnauthorizedPageProps {
  requiredRole?: string;
}

export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({ requiredRole }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const getHomeRoute = () => {
    if (!user) return '/login';
    if (user.role === 'STUDENT') return '/student/dashboard';
    if (user.role === 'ELECTION_ADMIN') return '/admin/dashboard';
    if (user.role === 'AUDITOR') return '/auditor/dashboard';
    if (user.role === 'SUPER_ADMIN') return '/admin/dashboard';
    return '/';
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8 bg-surface-canvas">
      <Card className="max-w-md w-full shadow-elevated border-red-200">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-6 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <Badge variant="danger" size="md" className="mb-3">
            403 Forbidden
          </Badge>

          <h2 className="text-2xl font-bold text-navy-950 tracking-tight mb-2">
            Access Denied
          </h2>

          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Your authenticated account lacks the authorized security clearance required to inspect this administrative surface.
          </p>

          {requiredRole && (
            <p className="text-xs text-slate-500 mb-6 font-medium">
              Required Clearance: <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">{requiredRole}</span>
            </p>
          )}

          {user && (
            <div className="bg-surface-subtle p-4 rounded-xl border border-surface-border text-xs text-left mb-6 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Authenticated As:</span>
                <span className="font-semibold text-navy-950">{user.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Role:</span>
                <span className="font-mono font-semibold text-brand-primary">{user.role}</span>
              </div>
              {requiredRole && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Required Role:</span>
                  <span className="font-mono font-semibold text-red-600">{requiredRole}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={getHomeRoute()} className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                Return to My Portal
              </Button>
            </Link>

            <Button
              variant="outline"
              size="md"
              className="w-full sm:w-auto text-slate-700"
              onClick={handleLogout}
              leftIcon={<LogOut className="w-4 h-4" />}
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
