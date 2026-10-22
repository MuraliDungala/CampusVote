import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Vote,
  Users,
  FileSpreadsheet,
  ShieldCheck,
  FileText,
  Layers
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../context/AuthContext';

export interface SidebarProps {
  portalType: 'admin' | 'auditor';
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const Sidebar: React.FC<SidebarProps> = ({ portalType }) => {
  const { user } = useAuth();

  const adminNav: NavItem[] = [
    { name: 'Dashboard Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Election Management', href: '/admin/elections', icon: Vote },
    { name: 'Create New Election', href: '/admin/elections/new', icon: Layers },
    { name: 'Student Registry', href: '/admin/students', icon: Users },
    { name: 'Batch Roster Ingestion', href: '/admin/students/import', icon: FileSpreadsheet },
  ];

  const auditorNav: NavItem[] = [
    { name: 'Auditor Overview', href: '/auditor/dashboard', icon: LayoutDashboard },
    { name: 'Audit Logs & Security', href: '/auditor/dashboard', icon: FileText },
    { name: 'Elections Directory', href: '/elections', icon: Vote },
  ];

  const navItems = portalType === 'admin' ? adminNav : auditorNav;

  return (
    <aside className="w-64 bg-white border-r border-surface-border flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      {/* User Header in Sidebar */}
      {user && (
        <div className="p-5 border-b border-surface-border/60 bg-surface-subtle/40">
          <div className="flex items-center gap-3 mb-2">
            <Avatar name={user.full_name} role={user.role} size="md" />
            <div className="overflow-hidden">
              <h4 className="text-sm font-bold text-navy-950 truncate">
                {user.full_name}
              </h4>
              <p className="text-xs text-slate-500 font-mono truncate">
                {user.display_identifier}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge
              variant={
                user.role === 'SUPER_ADMIN'
                  ? 'primary'
                  : user.role === 'ELECTION_ADMIN'
                  ? 'info'
                  : user.role === 'AUDITOR'
                  ? 'warning'
                  : 'neutral'
              }
              size="sm"
            >
              {user.role}
            </Badge>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Active
            </span>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {portalType === 'admin' ? 'Election Admin Services' : 'Institutional Oversight'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.href}
              end
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-brand-primary bg-blue-50/80 font-bold shadow-subtle'
                    : 'text-slate-600 hover:text-navy-950 hover:bg-surface-subtle'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </div>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};
