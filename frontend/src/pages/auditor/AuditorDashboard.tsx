import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Scale,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Cpu,
  Search,
  RefreshCw,
  Vote
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { testAuditorEndpoint } from '../../services/auth';
import { getSystemAuditLogs, SystemAuditLogItem } from '../../services/results';

export const AuditorDashboard: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SystemAuditLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [rbacTestStatus, setRbacTestStatus] = useState<string | null>(null);
  const [isTestingRbac, setIsTestingRbac] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await getSystemAuditLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleTestRbac = async () => {
    setIsTestingRbac(true);
    setRbacTestStatus(null);
    try {
      const res = await testAuditorEndpoint();
      setRbacTestStatus(`Auditor Clearance Verified: ${res.message} (Role: ${res.role})`);
    } catch (err: any) {
      setRbacTestStatus(`Backend Error: ${err.message}`);
    } finally {
      setIsTestingRbac(false);
    }
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actor_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-surface-canvas">
      <Sidebar portalType="auditor" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="System Auditor & Integrity Center"
          description="Independent supervisory review of immutable operational audit trails, cryptographic digests, and post-election mathematical reconciliation."
          badge={
            <Badge variant="warning">
              {user?.role} Session
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                isLoading={isLoadingLogs}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Refresh Logs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestRbac}
                isLoading={isTestingRbac}
                leftIcon={<ShieldCheck className="w-4 h-4 text-brand-primary" />}
              >
                Verify Clearance
              </Button>
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* RBAC Verification Alert */}
          {rbacTestStatus && (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-start gap-3 shadow-subtle animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs font-mono">{rbacTestStatus}</div>
            </div>
          )}

          {/* Institutional Integrity Notice Banner */}
          <div className="p-4 rounded-2xl border border-amber-200/90 bg-amber-50/70 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-subtle">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900/90 leading-relaxed">
                <span className="font-bold text-amber-950 block">
                  Independent Supervisory Oversight
                </span>
                Auditors inspect immutable append-only logs and result artifact digests. Ballot choices and student PII are mathematically redacted at the architectural boundary.
              </div>
            </div>
            <Badge variant="warning" size="sm" className="whitespace-nowrap">
              Read-Only Supervisory
            </Badge>
          </div>

          {/* Top 3 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recorded Audit Events</p>
                  <h3 className="text-2xl font-extrabold text-navy-950 mt-1">{logs.length}</h3>
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Append-only log store</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center">
                  <FileText className="w-6 h-6 text-brand-primary" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Artifact Digest Engine</p>
                  <h3 className="text-2xl font-extrabold text-navy-950 mt-1">Active</h3>
                  <p className="text-[11px] text-brand-cyan font-medium mt-0.5">SHA-256 Tamper Validation</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Cpu className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-subtle">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PII Sanitization</p>
                  <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">100% Scrubbed</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Zero candidate choices logged</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Scale className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Audit Logs Table */}
          <Card className="border border-slate-200 shadow-subtle">
            <CardHeader className="border-b border-surface-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-navy-950">System Audit Trail</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Immutable record of security and administrative operations</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter actions or actors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingLogs ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading audit events...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No audit log entries match your filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-subtle text-slate-500 border-b border-surface-border uppercase font-semibold text-[11px]">
                      <tr>
                        <th className="px-5 py-3">Timestamp</th>
                        <th className="px-5 py-3">Actor</th>
                        <th className="px-5 py-3">Action</th>
                        <th className="px-5 py-3">Target</th>
                        <th className="px-5 py-3 text-right">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-slate-700 font-mono text-[11px]">
                      {filteredLogs.slice(0, 15).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-3 text-slate-500 whitespace-nowrap font-sans">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-3 font-semibold text-navy-950 font-sans">
                            {log.actor_username || 'System Engine'}
                            <span className="block text-[10px] text-slate-400 font-mono">{log.actor_role}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-sans text-slate-600">
                            {log.target_type} {log.target_id ? `(${log.target_id.slice(0, 8)}...)` : ''}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-500 font-mono">
                            {log.ip_address || '127.0.0.1'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions for Auditor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/elections">
              <Card hoverEffect className="border border-slate-200 h-full">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-navy-950">Elections Directory</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Inspect published collegiate ballots and candidates</p>
                  </div>
                  <Vote className="w-5 h-5 text-brand-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/elections">
              <Card hoverEffect className="border border-slate-200 h-full">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-navy-950">Results &amp; Reconciliation</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Inspect candidate tallies and mathematical digest reports</p>
                  </div>
                  <Scale className="w-5 h-5 text-emerald-600" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
