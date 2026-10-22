import React from 'react';
import { Role } from '../../types/auth';

export interface AvatarProps {
  name: string;
  role?: Role;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  role,
  size = 'md',
  className = '',
}) => {
  const getInitials = (str: string) => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  const roleGradients: Record<string, string> = {
    STUDENT: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
    ELECTION_ADMIN: 'bg-gradient-to-br from-navy-900 to-slate-800 text-white',
    AUDITOR: 'bg-gradient-to-br from-amber-600 to-orange-700 text-white',
    SUPER_ADMIN: 'bg-gradient-to-br from-purple-700 to-navy-950 text-white',
    DEFAULT: 'bg-gradient-to-br from-slate-600 to-slate-800 text-white',
  };

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm font-semibold',
    lg: 'w-12 h-12 text-base font-bold',
  };

  const gradient = (role && roleGradients[role]) || roleGradients.DEFAULT;

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 shadow-subtle ${sizeClasses[size]} ${gradient} ${className}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
};
