import type { TrainerRound } from "./trainer";
import type { PracticePattern } from "./types";

export type TrainerInsightText = { key: string; values?: Record<string, string | number> };

export type TrainerRoundInsightText = {
  title: TrainerInsightText;
  message: TrainerInsightText;
  nextStep: TrainerInsightText;
  reliability: TrainerInsightText;
  timingSummary: TrainerInsightText;
  warning: TrainerInsightText[];
};

export type TrainerRoundInsight = {
  title: string;
  message: string;
  nextStep: string;
  reliability: string;
  warning?: string;
  localized: TrainerRoundInsightText;
};

type TrainerRoundInsightFields = {
  title: TrainerInsightText;
  message: TrainerInsightText;
  nextStep: TrainerInsightText;
  reliability: TrainerInsightText;
};

const text = (key: string, values?: TrainerInsightText["values"]): TrainerInsightText => ({ key, values });

function buildInsight(fields: TrainerRoundInsightFields, timingSummary: TrainerInsightText, warning: TrainerInsightText[]): TrainerRoundInsight {
  const renderSource = (item: TrainerInsightText): string => {
    const values = { ...item.values };
    if (values.timing !== undefined) values.timing = renderSource(timingSummary);
    return item.key.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
  };
  const localized = { ...fields, timingSummary, warning };
  return {
    title: renderSource(fields.title),
    message: renderSource(fields.message),
    nextStep: renderSource(fields.nextStep),
    reliability: renderSource(fields.reliability),
    warning: warning.length ? warning.map(renderSource).join(" ") : undefined,
    localized,
  };
}

export function summarizeTrainerRoundInsight(round: TrainerRound, pattern: PracticePattern): TrainerRoundInsight | null {
  if (round.mode !== "scored" || !round.result) return null;
  const hits = round.hits ?? [];
  const targetHits = hits.filter(hit => hit.rating !== "extra");
  const offsets = targetHits.flatMap(hit => typeof hit.offsetMs === "number" ? [hit.offsetMs] : []);
  const meanOffset = offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : null;
  const meanDistance = offsets.length ? offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length : null;
  const timingSummary = meanOffset === null
    ? text("This input did not provide measured hit timing.")
    : text("Measured hits averaged {offset} ms {direction}; typical timing distance was {distance} ms.", {
      offset: Math.round(Math.abs(meanOffset)),
      direction: meanOffset > 8 ? "late" : meanOffset < -8 ? "early" : "from the target",
      distance: Math.round(meanDistance ?? 0),
    });
  const sourceName = round.inputProfile ?? round.source;
  const reliability = text("Scored with {source}. Compare progress using the same input profile and setup.", { source: sourceName });
  const warningParts = [
    ...(round.inputClipped ? [text("The audio input clipped; lower gain or move the microphone farther away.")] : []),
    ...(round.uncertainDetections ? [text("{count} audio detections were uncertain; recalibrate before comparing this score.", { count: round.uncertainDetections })] : []),
  ];
  const withTiming = (key: string, values: Record<string, string | number> = {}) => text(key, values);

  if (warningParts.length) {
    return buildInsight({
      title: text("Check the input before using this score"),
      message: withTiming("{accuracy}% of scored targets were {great} or {good}. {timing}", { accuracy: round.result.accuracy, great: "Great", good: "Good" }),
      nextStep: text(round.inputClipped ? "Adjust microphone gain, then run the strike signal check again." : "Recalibrate the uncertain drum voices, then score another round."),
      reliability,
    }, timingSummary, warningParts);
  }

  const missesByTarget = new Map<string, { instrument: string; beat: number; count: number }>();
  for (const hit of hits) {
    if (hit.rating !== "miss" || hit.step === undefined) continue;
    const beat = Math.floor(hit.step / (pattern.subdivision / 4)) + 1;
    const key = `${hit.instrument}:${beat}`;
    const group = missesByTarget.get(key) ?? { instrument: hit.instrument, beat, count: 0 };
    group.count += 1;
    missesByTarget.set(key, group);
  }
  const weakest = [...missesByTarget.values()].sort((a, b) => b.count - a.count)[0];
  if (weakest) {
    return buildInsight({
      title: text("Focus on the missed strokes"),
      message: withTiming("{accuracy}% accuracy. {instrument} on beat {beat} had the most missed targets ({count}). {timing}", {
        accuracy: round.result.accuracy, instrument: weakest.instrument, beat: weakest.beat, count: weakest.count,
      }),
      nextStep: text("Loop beat {beat} at {bpm} BPM, then retry the full groove.", { beat: weakest.beat, bpm: Math.max(pattern.tempoRange[0], round.bpm - 5) }),
      reliability,
    }, timingSummary, warningParts);
  }
  if ((round.result.extra ?? 0) > 0) {
    return buildInsight({
      title: text("Keep the pattern uncluttered"),
      message: withTiming(round.result.extra === 1
        ? "One extra stroke was played outside the target pattern. {timing}"
        : "{count} extra strokes were played outside the target pattern. {timing}", { count: round.result.extra }),
      nextStep: text("Listen to one bar, then play only the notes shown in the target grid."),
      reliability,
    }, timingSummary, warningParts);
  }
  if (meanDistance !== null && meanDistance > 50 && meanOffset !== null) {
    return buildInsight({
      title: text("Settle the pulse"),
      message: text("{accuracy}% accuracy. Hits tended {direction} by {offset} ms on average.", {
        accuracy: round.result.accuracy, direction: meanOffset > 0 ? "late" : "early", offset: Math.round(Math.abs(meanOffset)),
      }),
      nextStep: text("Repeat at {bpm} BPM and keep each stroke with the click.", { bpm: Math.max(pattern.tempoRange[0], round.bpm - 5) }),
      reliability,
    }, timingSummary, warningParts);
  }
  return buildInsight({
    title: text("Good control"),
    message: withTiming("{accuracy}% accuracy with {missed} missed targets and {extra} extra strokes. {timing}", {
      accuracy: round.result.accuracy, missed: round.result.miss, extra: round.result.extra,
    }),
    nextStep: text(round.result.accuracy >= 90
      ? "Try the next tempo step or move to the next groove in your skill path."
      : "Repeat this round once more and aim for the same steady pulse."),
    reliability,
  }, timingSummary, warningParts);
}
