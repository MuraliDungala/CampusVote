import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types/auth';
import { LoadingState } from '../ui/LoadingState';
import { UnauthorizedPage } from './UnauthorizedPage';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <LoadingState message="Verifying security session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export interface RoleGuardProps {
  allowedRoles: Role[];
  children?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <LoadingState message="Validating authorization permissions..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Super Administrators have institutional oversight
  const hasPermission =
    allowedRoles.includes(user.role) || user.role === 'SUPER_ADMIN';

  if (!hasPermission) {
    return <UnauthorizedPage requiredRole={allowedRoles.join(' or ')} />;
  }

  return children ? <>{children}</> : <Outlet />;
};
