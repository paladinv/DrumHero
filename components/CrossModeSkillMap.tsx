"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EAR_HISTORY_KEY, parseEarHistory } from "@/lib/ear-training";
import { IMPROVISATION_KEY, parseImprovisationHistory } from "@/lib/improvisation";
import { SIGHT_HISTORY_KEY, parseSightHistory } from "@/lib/sight-reading";
import { readActiveSongLibrary } from "@/lib/song-library";
import { trainerStorageKey, parseTrainerState } from "@/lib/trainer";
import { learnerStorageKey } from "@/lib/learner-profiles";
import type { ProgressState } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";

type Evidence = { id: string; label: string; href: string; count: number; average: number | null; latest: string | null; summary: string };

export function CrossModeSkillMap({ profileId, progress }: { profileId: string; progress: ProgressState }) {
  const { formatDate, formatNumber, t } = useLocalization();
  const [evidence, setEvidence] = useState<Evidence[]>([]);

  useEffect(() => {
    const update = () => {
      try {
        const trainer = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))).rounds
          .filter((round) => round.mode === "scored" && round.result && !round.uncertainDetections && !round.inputClipped && !round.focusedDrill && !round.learningMode && (!round.adaptation || round.adaptation === "standard"));
        const ear = parseEarHistory(localStorage.getItem(learnerStorageKey(EAR_HISTORY_KEY, profileId))).filter((result) => !result.assisted);
        const reading = parseSightHistory(localStorage.getItem(learnerStorageKey(SIGHT_HISTORY_KEY, profileId))).filter((attempt) => attempt.classification === "reading");
        const improvisations = parseImprovisationHistory(localStorage.getItem(learnerStorageKey(IMPROVISATION_KEY, profileId)));
        const songLibrary = readActiveSongLibrary();
        const songAttempts = songLibrary.progress.flatMap((item) => item.attempts ?? []).filter((attempt) => attempt.completePart !== false);
        const lessonDates = Object.values(progress.lessonCompletedAt ?? {}).filter((date) => Number.isFinite(Date.parse(date)));
        const pad = progress.sessions;
        const trainerOutcomes = trainer.map((round) => ({ at: round.playedAt, score: round.result!.accuracy }));
        const padOutcomes = pad.map((round) => ({ at: round.playedAt, score: round.accuracy }));
        const byDate = (values: Array<{ at: string }>) => values.reduce<string | null>((latest, item) => !latest || item.at > latest ? item.at : latest, null);
        const average = (values: Array<{ score: number; at?: string }>) => {
          const recent = [...values].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).slice(-10);
          return recent.length ? Math.round(recent.reduce((sum, item) => sum + item.score, 0) / recent.length) : null;
        };
        setEvidence([
          { id: "foundations", label: "Foundations", href: "/learn", count: progress.completedLessons.length, average: null, latest: byDate(lessonDates.map((at) => ({ at }))), summary: t("completed lessons") },
          { id: "trainer", label: "Trainer timing", href: "/trainer", count: trainerOutcomes.length, average: average(trainerOutcomes), latest: byDate(trainerOutcomes), summary: t("reliable scored rounds") },
          { id: "pad", label: "Practice Pad accuracy", href: "/practice", count: padOutcomes.length, average: average(padOutcomes), latest: byDate(padOutcomes), summary: t("Practice Pad loops") },
          { id: "reading", label: "Rhythm reading", href: "/sight-reading", count: reading.length, average: average(reading.map((item) => ({ at: item.playedAt, score: item.accuracy }))), latest: byDate(reading.map((item) => ({ at: item.playedAt }))), summary: t("first-reading attempts") },
          { id: "listening", label: "Listening and memory", href: "/ear-training", count: ear.length, average: null, latest: byDate(ear.map((item) => ({ at: item.playedAt }))), summary: t("unassisted attempts") },
          { id: "creative", label: "Creative phrasing", href: "/improvisation", count: improvisations.length, average: null, latest: byDate(improvisations.map((item) => ({ at: item.playedAt }))), summary: t("improvisation sessions") },
          { id: "songs", label: "Song application", href: "/song-library", count: songAttempts.length, average: null, latest: byDate(songAttempts.map((item) => ({ at: item.playedAt }))), summary: t("complete song-section attempts") }
        ]);
      } catch {
        setEvidence([]);
      }
    };
    const timer = window.setTimeout(update, 0);
    const refresh = () => update();
    window.addEventListener("storage", refresh);
    window.addEventListener("drum-hero:learner-profile-change", refresh);
    window.addEventListener("drum-hero:trainer-state-import", refresh);
    window.addEventListener("drum-hero:song-library-change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("drum-hero:learner-profile-change", refresh);
      window.removeEventListener("drum-hero:trainer-state-import", refresh);
      window.removeEventListener("drum-hero:song-library-change", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [profileId, progress, t]);

  return <section className="cross-mode-map card" aria-labelledby="cross-mode-map-heading">
    <div className="cross-mode-map-heading"><div><span className="eyebrow">{t("Across your practice")}</span><h2 id="cross-mode-map-heading">{t("Skill map")}</h2></div><p>{t("See what you have practiced across lessons, timing, listening, reading, creativity, and songs. Scores stay within their own activity.")}</p></div>
    <div className="cross-mode-map-grid">
      {evidence.map((item) => <article className="cross-mode-evidence" key={item.id}>
        <div><h3>{t(item.label)}</h3><strong>{formatNumber(item.count)}</strong><span>{t(item.summary)}</span></div>
        <p>{item.average === null ? t("Activity evidence only") : t("Recent average: {score}%", { score: formatNumber(item.average) })}</p>
        <p>{item.latest ? t("Last practiced {date}", { date: formatDate(new Date(item.latest)) }) : t("No activity recorded yet")}</p>
        <Link href={item.href}>{t("Open {area}", { area: t(item.label) })} <span aria-hidden="true">→</span></Link>
      </article>)}
    </div>
    <small>{t("These indicators describe recent activity, not a combined mastery grade. Timing and detection quality can vary by input and device.")} {t("Song charts stay shared on this device; Song Library practice history follows the active learner.")}</small>
  </section>;
}
