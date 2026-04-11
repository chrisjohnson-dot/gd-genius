/**
 * PaceSparkline.tsx
 * Lightweight SVG sparkline showing items/hr trend over the last 10 minutes.
 * Renders as a polyline path with a filled area beneath it.
 * Color-coded to match the session's pace status.
 */
import { useMemo } from "react";

interface SparkPoint {
  bucketTs: number;
  itemsPerHour: number;
}

interface PaceSparklineProps {
  data: SparkPoint[];
  expectedRate: number;
  paceStatus: "ahead" | "on_pace" | "behind";
  width?: number;
  height?: number;
  className?: string;
}

const STATUS_COLORS = {
  ahead:    { stroke: "#10b981", fill: "rgba(16,185,129,0.15)", target: "rgba(16,185,129,0.35)" },
  on_pace:  { stroke: "#3b82f6", fill: "rgba(59,130,246,0.15)", target: "rgba(59,130,246,0.35)" },
  behind:   { stroke: "#ef4444", fill: "rgba(239,68,68,0.15)",  target: "rgba(239,68,68,0.35)"  },
};

export function PaceSparkline({
  data,
  expectedRate,
  paceStatus,
  width = 200,
  height = 48,
  className = "",
}: PaceSparklineProps) {
  const colors = STATUS_COLORS[paceStatus];

  const { points, targetY, hasData } = useMemo(() => {
    if (!data || data.length === 0) return { points: [], targetY: 0, hasData: false };

    // Sort by time ascending
    const sorted = [...data].sort((a, b) => a.bucketTs - b.bucketTs);

    // Determine Y scale: include expectedRate in the range so the target line is always visible
    const maxVal = Math.max(...sorted.map((d) => d.itemsPerHour), expectedRate * 1.2, 1);
    const minVal = 0;
    const range = maxVal - minVal || 1;

    const pad = 4;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    // Map each point to SVG coordinates
    const pts = sorted.map((d, i) => {
      const x = pad + (sorted.length === 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW);
      const y = pad + innerH - ((d.itemsPerHour - minVal) / range) * innerH;
      return { x, y, value: d.itemsPerHour };
    });

    // Target line Y position
    const ty = pad + innerH - ((expectedRate - minVal) / range) * innerH;

    return { points: pts, targetY: ty, hasData: true };
  }, [data, expectedRate, width, height]);

  if (!hasData) {
    return (
      <div className={`flex items-center justify-center text-[10px] text-muted-foreground ${className}`} style={{ width, height }}>
        No data yet
      </div>
    );
  }

  // Build SVG polyline string
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Build filled area path: line + close to bottom
  const areaPath = points.length > 0
    ? `M ${points[0].x},${height - 4} ` +
      points.map((p) => `L ${p.x},${p.y}`).join(" ") +
      ` L ${points[points.length - 1].x},${height - 4} Z`
    : "";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label="Pace sparkline"
    >
      {/* Filled area */}
      {areaPath && (
        <path d={areaPath} fill={colors.fill} strokeWidth={0} />
      )}

      {/* Target rate dashed line */}
      <line
        x1={4}
        y1={targetY}
        x2={width - 4}
        y2={targetY}
        stroke={colors.target}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />

      {/* Sparkline polyline */}
      <polyline
        points={linePoints}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots at each data point */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill={colors.stroke}
        />
      ))}

      {/* Latest value label */}
      {points.length > 0 && (
        <text
          x={width - 4}
          y={points[points.length - 1].y - 5}
          textAnchor="end"
          fontSize={9}
          fill={colors.stroke}
          fontWeight="600"
        >
          {points[points.length - 1].value}/hr
        </text>
      )}
    </svg>
  );
}
