import React from 'react';
import { DepartmentTurnoutCohort } from '../../types/monitoring';
import { ShieldCheck, EyeOff, Building2 } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface DepartmentTurnoutChartProps {
  departments: DepartmentTurnoutCohort[];
  threshold: number;
}

export const DepartmentTurnoutChart: React.FC<DepartmentTurnoutChartProps> = ({
  departments,
  threshold,
}) => {
  if (!departments || departments.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <Building2 className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-600">No departmental cohorts configured</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Departmental breakdown will be calculated once student demographic rosters are associated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {departments.map((dept) => {
        if (dept.is_suppressed) {
          return (
            <div
              key={dept.department}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-200/80 text-slate-500 flex items-center justify-center shrink-0">
                  <EyeOff className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-navy-950 block">{dept.department}</span>
                  <span className="text-[11px] text-slate-500">
                    Cohort statistics privacy-suppressed
                  </span>
                </div>
              </div>

              <Badge variant="neutral" size="sm" className="whitespace-nowrap flex items-center gap-1 self-start sm:self-auto">
                <ShieldCheck className="w-3 h-3 text-slate-500" />
                <span>Threshold Protected (&lt; {threshold} students)</span>
              </Badge>
            </div>
          );
        }

        const pct = dept.turnout_percentage ?? 0;

        return (
          <div
            key={dept.department}
            className="p-3.5 rounded-xl border border-surface-border bg-white shadow-2xs hover:border-slate-300 transition-all space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-navy-950">{dept.department}</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ({dept.recorded_participants} of {dept.eligible_voters} voted)
                </span>
              </div>
              <span className="text-xs font-bold text-brand-primary">{pct}%</span>
            </div>

            {/* Horizontal progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-brand-primary h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${dept.department} turnout progress`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
