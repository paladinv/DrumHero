"use client";

import type { TrainerTrendMetric } from "@/lib/trainer-progress";
import { useLocalization } from "@/components/LocalizationProvider";

const metricDetails: Record<TrainerTrendMetric["id"], { title: string; unit: string; lowerIsBetter: boolean; empty: string }> = {
  tempo: { title: "Tempo reached", unit: "BPM", lowerIsBetter: false, empty: "Complete a scored round to start tracking tempo." },
  timing: { title: "Timing distance", unit: "ms", lowerIsBetter: true, empty: "Reliable scored hit offsets are needed to track timing." },
  dynamics: { title: "Dynamics target error", unit: "velocity points", lowerIsBetter: true, empty: "Use dynamics targets with MIDI or calibrated audio to track strike strength." },
  "fill-return": { title: "First bar after a fill", unit: "% on time", lowerIsBetter: false, empty: "Practise this groove with a fill to track your return to the groove." }
};

function metricValue(value: number, unit: string) {
  return unit === "% on time" ? `${Math.round(value)}%` : `${Math.round(value)} ${unit}`;
}

function trendDescription(metric: TrainerTrendMetric["id"], first: number, last: number) {
  const delta = Math.round(last - first);
  if (delta === 0) return "Steady across these sessions.";
  if (metric === "tempo") return `Tempo ${delta > 0 ? "rose" : "fell"} by ${Math.abs(delta)} BPM.`;
  if (metric === "timing") return `Average timing distance ${delta < 0 ? "fell" : "rose"} by ${Math.abs(delta)} ms.`;
  if (metric === "dynamics") return `Average target error ${delta < 0 ? "fell" : "rose"} by ${Math.abs(delta)} velocity points.`;
  return `First-bar accuracy ${delta > 0 ? "rose" : "fell"} by ${Math.abs(delta)} points.`;
}

function TrainerProgressMetricChart({ metric }: { metric: TrainerTrendMetric }) {
  const { formatDate } = useLocalization();
  const detail = metricDetails[metric.id];
  const points = metric.points;
  const values = points.map((point) => point.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const range = maximum - minimum;
  const plotted = points.map((point, index) => {
    const value = detail.lowerIsBetter ? maximum - point.value : point.value - minimum;
    const ratio = range ? value / range : 0.5;
    return { ...point, x: 12 + index / Math.max(1, points.length - 1) * 216, y: 62 - ratio * 40 };
  });
  const accessibleValues = points.map((point, index) => `session ${index + 1}, ${metricValue(point.value, detail.unit)}, ${formatDate(new Date(point.date))}`).join("; ");
  const first = points[0]?.value;
  const last = points.at(-1)?.value;

  return <article className="trainer-progress-metric">
    <h3>{detail.title}</h3>
    {points.length ? <>
      <strong>{metricValue(last!, detail.unit)}</strong>
      {points.length > 1 ? <p>{trendDescription(metric.id, first!, last!)}</p> : <p>Complete one more comparable round to see a trend.</p>}
      {points.length > 1 && <svg viewBox="0 0 240 76" role="img" aria-label={`${detail.title} over ${points.length} sessions: ${accessibleValues}`}>
        <line x1="8" x2="232" y1="62" y2="62" className="trainer-progress-guide" />
        <polyline points={plotted.map((point) => `${point.x},${point.y}`).join(" ")} className="trainer-progress-line" />
        {plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="3.5" className="trainer-progress-point"><title>{metricValue(point.value, detail.unit)} · {formatDate(new Date(point.date))}</title></circle>)}
      </svg>}
      {points.length > 1 && <small>{formatDate(new Date(points[0].date))} · {formatDate(new Date(points.at(-1)!.date))} · {points.length} sessions</small>}
    </> : <p>{detail.empty}</p>}
  </article>;
}

export function TrainerProgressMetrics({ metrics }: { metrics: TrainerTrendMetric[] }) {
  return <div className="trainer-progress-metrics" aria-label="Tempo, timing, dynamics, and fill return trends">
    {metrics.map((metric) => <TrainerProgressMetricChart key={metric.id} metric={metric} />)}
  </div>;
}
