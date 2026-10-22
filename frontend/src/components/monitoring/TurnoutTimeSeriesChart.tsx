import React, { useState } from 'react';
import { TurnoutBucket } from '../../types/monitoring';
import { TrendingUp, Clock } from 'lucide-react';

interface TurnoutTimeSeriesChartProps {
  buckets: TurnoutBucket[];
  interval: string;
}

export const TurnoutTimeSeriesChart: React.FC<TurnoutTimeSeriesChartProps> = ({
  buckets,
  interval,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<TurnoutBucket | null>(null);

  if (!buckets || buckets.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        <TrendingUp className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-600">No participation recorded yet</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Aggregate turnout data points will appear here once eligible voters begin participating.
        </p>
      </div>
    );
  }

  // Calculate scales for SVG rendering
  const width = 800;
  const height = 260;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Max percentage on Y-axis (at least 10%, ceiling up to next multiple of 10 or 100)
  const maxRecordedPct = Math.max(...buckets.map((b) => b.turnout_percentage), 5);
  const yMax = Math.min(100, Math.ceil(maxRecordedPct / 10) * 10 || 10);

  // Map coordinates
  const points = buckets.map((bucket, index) => {
    const x =
      padding.left +
      (buckets.length > 1
        ? (index / (buckets.length - 1)) * graphWidth
        : graphWidth / 2);
    const y =
      padding.top +
      graphHeight -
      (bucket.turnout_percentage / yMax) * graphHeight;
    return { x, y, bucket };
  });

  // SVG path definitions
  const linePath =
    points.length > 0
      ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`
      : '';

  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${padding.top + graphHeight} L ${points
          .map((p) => `${p.x},${p.y}`)
          .join(' L ')} L ${points[points.length - 1].x},${
          padding.top + graphHeight
        } Z`
      : '';

  // Generate 4 horizontal grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1.0].map((fraction) => {
    const value = Math.round(yMax * fraction);
    const yPos = padding.top + graphHeight - fraction * graphHeight;
    return { value, yPos };
  });

  // Pick evenly spaced x-axis labels
  const labelStep = Math.max(1, Math.floor(buckets.length / 6));
  const xLabels = buckets.filter(
    (_, i) => i === 0 || i === buckets.length - 1 || i % labelStep === 0
  );

  return (
    <div className="relative w-full overflow-hidden">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-64 select-none"
          role="img"
          aria-label={`Turnout over time chart in ${interval} intervals`}
        >
          <defs>
            <linearGradient id="turnoutGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
              <stop offset="90%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y labels */}
          {gridLines.map(({ value, yPos }) => (
            <g key={value}>
              <line
                x1={padding.left}
                y1={yPos}
                x2={width - padding.right}
                y2={yPos}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={yPos + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {value}%
              </text>
            </g>
          ))}

          {/* Area fill under curve */}
          {areaPath && <path d={areaPath} fill="url(#turnoutGradient)" />}

          {/* Line curve */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive point markers */}
          {points.map(({ x, y, bucket }, idx) => {
            const isHovered = hoveredPoint?.timestamp === bucket.timestamp;
            return (
              <g key={idx}>
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 3.5}
                  fill={isHovered ? '#1d4ed8' : '#ffffff'}
                  stroke="#2563eb"
                  strokeWidth={isHovered ? 2.5 : 2}
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(bucket)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}

          {/* X-axis labels */}
          {xLabels.map((bucket, i) => {
            const originalIndex = buckets.findIndex(
              (b) => b.timestamp === bucket.timestamp
            );
            const x =
              padding.left +
              (buckets.length > 1
                ? (originalIndex / (buckets.length - 1)) * graphWidth
                : graphWidth / 2);

            return (
              <text
                key={i}
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="text-[10px] fill-slate-500 font-medium"
              >
                {bucket.display_label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Floating active point tooltip */}
      {hoveredPoint && (
        <div className="absolute top-2 right-4 bg-navy-950/95 text-white text-xs rounded-xl p-3 shadow-xl backdrop-blur-sm border border-slate-700 animate-in fade-in zoom-in-95 pointer-events-none">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Time Bucket: {hoveredPoint.display_label}</span>
          </div>
          <div className="font-bold text-sm text-emerald-400">
            {hoveredPoint.turnout_percentage}% Total Turnout
          </div>
          <div className="text-[11px] text-slate-300 mt-1">
            Interval votes: <span className="font-semibold text-white">+{hoveredPoint.interval_count}</span> | Cumulative: <span className="font-semibold text-white">{hoveredPoint.cumulative_count}</span>
          </div>
        </div>
      )}
    </div>
  );
};
