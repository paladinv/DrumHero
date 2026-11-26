"use client";

import { useEffect, useState } from "react";
import type { TrainerRound } from "@/lib/trainer";
import type { Instrument, PracticePattern } from "@/lib/types";
import { TrainerNotationView } from "@/components/TrainerNotationView";
import { useLocalization } from "@/components/LocalizationProvider";
import { localizedPattern } from "@/lib/teaching-pattern-display";

const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

function accuracy(round: TrainerRound) {
  if (round.mode !== "scored" || !round.result || round.inputClipped || round.uncertainDetections) return null;
  return round.result.accuracy;
}

function cell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function TrainerProgressReport({ rounds, patterns, onClearHistory }: { rounds: TrainerRound[]; patterns: PracticePattern[]; onClearHistory: () => void }) {
  const { t, locale } = useLocalization();
  const [now, setNow] = useState<number | null>(null);
  const [range, setRange] = useState<"30" | "365" | "all">("30");
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const cutoff = range === "all" ? Number.NEGATIVE_INFINITY : now === null ? Number.POSITIVE_INFINITY : now - Number(range) * 24 * 60 * 60 * 1000;
  const recent = rounds.filter(round => Date.parse(round.playedAt) >= cutoff).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const reliable = recent.filter(round => accuracy(round) !== null);
  const average = reliable.length ? Math.round(reliable.reduce((sum, round) => sum + (accuracy(round) ?? 0), 0) / reliable.length) : null;
  const patternTotals = new Map<string, { pattern: PracticePattern; sessions: number; reliableScores: number; accuracyTotal: number }>();
  for (const round of recent) {
    const pattern = patterns.find(item => item.id === round.patternId);
    if (!pattern) continue;
    const item = patternTotals.get(pattern.id) ?? { pattern, sessions: 0, reliableScores: 0, accuracyTotal: 0 };
    item.sessions += 1;
    const score = accuracy(round);
    if (score !== null) { item.reliableScores += 1; item.accuracyTotal += score; }
    patternTotals.set(pattern.id, item);
  }
  const mostPractised = [...patternTotals.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 3);
  const voiceTotals = new Map<Instrument, { onTime: number; total: number }>(VOICES.map(voice => [voice, { onTime: 0, total: 0 }]));
  const scoredRounds = reliable.filter(item => item.mode === "scored");
  for (const round of scoredRounds) {
    if (round.hits?.length) {
      for (const hit of round.hits) {
        if (hit.rating === "extra" || hit.transition === "landing") continue;
        const total = voiceTotals.get(hit.instrument)!;
        total.total += 1;
        if (hit.rating === "great" || hit.rating === "good") total.onTime += 1;
      }
    } else for (const voice of VOICES) {
      const metric = round.compactAnalysis?.byVoice[voice];
      if (!metric) continue;
      const total = voiceTotals.get(voice)!;
      total.total += metric.total;
      total.onTime += metric.onTime;
    }
  }
  const compactRounds = scoredRounds.filter(round => !round.hits?.length && round.compactAnalysis).length;

  const exportCsv = () => {
    const rangeLabel = range === "all" ? "all-saved" : `last-${range}-days`;
    const rows: Array<Array<string | number | boolean | null>> = [
      [t("Trainer progress report · {range}", { range: range === "all" ? t("all saved rounds") : t("last {days} days", { days: range }) })],
      [t("Saved rounds"), recent.length],
      [t("Reliable comparable scores"), reliable.length],
      [t("Average reliable score percent"), average],
      [t("Rounds with compact hit analysis"), compactRounds],
      [],
      [t("Played at"), t("Pattern"), t("Transfer source pattern"), t("Mode"), t("Input"), t("Tempo BPM"), t("Accuracy percent"), t("Targets"), t("Great"), t("Good"), t("Miss"), t("Extra"), t("Timing calibrated"), t("Uncertain detections"), t("Clipping"), ...VOICES.flatMap(voice => [t("{voice} on time", { voice: t(voice) }), t("{voice} targets", { voice: t(voice) })])],
      ...recent.map(round => {
        const hits = round.hits ?? [];
        const byVoice = VOICES.flatMap(voice => {
          const voiceHits = hits.filter(hit => hit.instrument === voice && hit.rating !== "extra" && hit.transition !== "landing");
          const compact = round.compactAnalysis?.byVoice[voice];
          return [voiceHits.length ? voiceHits.filter(hit => hit.rating === "great" || hit.rating === "good").length : compact?.onTime ?? 0, voiceHits.length || compact?.total || 0];
        });
        return [round.playedAt, round.patternName, round.transferFromPatternId ?? "", round.mode, round.source, round.bpm, accuracy(round),
          round.result ? round.result.great + round.result.good + round.result.miss : round.ratings.length,
          round.result?.great ?? "", round.result?.good ?? "", round.result?.miss ?? "", round.result?.extra ?? "",
          round.timingCalibrated === true, round.uncertainDetections ?? 0, round.inputClipped === true, ...byVoice];
      }),
    ];
    const csv = rows.map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `drum-hero-trainer-progress-${rangeLabel}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="trainer-progress-report" aria-labelledby="trainer-progress-report-title">
    <div className="trainer-progress-report-heading"><div><span className="eyebrow">{t("Teacher report")}</span><h3 id="trainer-progress-report-title">{range === "all" ? t("All saved rounds") : t("The last {days} days", { days: range })}</h3><p>{t("{rounds} saved rounds · {scores} reliable comparable scores{average}", { rounds: recent.length, scores: reliable.length, average: average === null ? "" : ` · ${average}% ${t("average")}` })}.</p><small>{t("Compact per-voice analysis contributes from {count} older scored rounds", { count: compactRounds })}.</small></div>
      <div className="trainer-progress-report-actions"><label>{t("History range")}<select value={range} onChange={event => setRange(event.target.value as typeof range)} aria-label={t("Trainer report history range")}><option value="30">{t("Last 30 days")}</option><option value="365">{t("Last 365 days")}</option><option value="all">{t("All saved rounds")}</option></select></label><button type="button" className="button-secondary" onClick={exportCsv} disabled={!recent.length}>{t("Download CSV")}</button><button type="button" className="button-secondary" disabled={!rounds.length} onClick={() => { if (window.confirm(t("Delete all {count} Trainer rounds saved in this learner profile? This cannot be undone.", { count: rounds.length }))) onClearHistory(); }}>{t("Clear Trainer history")}</button></div>
    </div>
    {mostPractised.length > 0 && <div className="trainer-report-patterns"><h4>{t("Most-practised patterns")}</h4><div>{mostPractised.map(item => <article key={item.pattern.id}>
      <TrainerNotationView pattern={item.pattern} compact />
      <p><strong>{localizedPattern(item.pattern, locale).name}</strong><span>{item.reliableScores
        ? t("{rounds} rounds · {percent}% reliable average", { rounds: item.sessions, percent: Math.round(item.accuracyTotal / item.reliableScores) })
        : t("{rounds} rounds · no comparable score yet", { rounds: item.sessions })}</span></p>
    </article>)}</div></div>}
    <div className="trainer-report-voices"><h4>{t("Reliable scored hits by voice")}</h4>{VOICES.map(voice => {
      const item = voiceTotals.get(voice)!;
      return <span key={voice}><strong>{t(voice)}</strong>{item.total ? ` · ${t("{onTime}/{total} on time ({percent}%)", { onTime: item.onTime, total: item.total, percent: Math.round(item.onTime / item.total * 100) })}` : ` · ${t("no comparable hits")}`}</span>;
    })}</div>
    <details><summary>{t("Review included rounds")}</summary><ol>{recent.map(round => {
      const score = accuracy(round);
      const pattern = patterns.find(item => item.id === round.patternId);
      const transferSource = patterns.find(item => item.id === round.transferFromPatternId);
      return <li key={round.id}><strong>{pattern ? localizedPattern(pattern, locale).name : round.patternName}</strong><span>{new Date(round.playedAt).toISOString().slice(0, 10)} · {t("{bpm} BPM", { bpm: round.bpm })} · {round.transferFromPatternId ? `transfer from ${transferSource ? localizedPattern(transferSource, locale).name : round.transferFromPatternId} · ` : ""}{score === null ? round.mode === "self" ? t("self-rated · no scored accuracy") : round.inputClipped ? t("clipped input · score excluded") : round.uncertainDetections ? t("uncertain input · score excluded") : t("no comparable score") : `${score}% · ${t(round.source)}`}</span></li>;
    })}</ol></details>
    <small>{t("Trainer keeps up to 1,000 rounds for this learner profile. The 50 newest rounds can retain hit timing; older rounds keep compact per-voice and beat summaries. Reports do not include recordings, audio, or device identifiers. Audio confidence is not a substitute for a teacher-verified accuracy measure.")}</small>
  </section>;
}
