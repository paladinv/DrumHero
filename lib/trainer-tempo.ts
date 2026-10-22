export function estimateTrainerTempo(taps: number[]): number | null {
  const recentTaps = taps.slice(-9);
  const intervals = recentTaps.slice(1).flatMap((time, index) => {
    const interval = time - recentTaps[index];
    return Number.isFinite(interval) && interval >= 250 && interval <= 2000 ? [interval] : [];
  });
  if (intervals.length < 2) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const stable = intervals.filter(interval => Math.abs(interval - median) <= median * 0.3);
  if (stable.length < 2) return null;
  return Math.round(60000 / (stable.reduce((sum, interval) => sum + interval, 0) / stable.length));
}
