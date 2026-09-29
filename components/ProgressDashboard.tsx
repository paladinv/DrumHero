"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateStreak, levelProgress } from "@/lib/progress";
import { TRAINER_KEY, parseTrainerState, type TrainerRound } from "@/lib/trainer";
import type { Level } from "@/lib/types";
import { useProgress } from "./ProgressProvider";

const levels: Level[] = ["Beginner", "Intermediate", "Advanced"];

export function ProgressDashboard() {
  const { progress } = useProgress();
  const [trainerRounds, setTrainerRounds] = useState<TrainerRound[]>([]);
  useEffect(() => {
    const update = () => setTrainerRounds(parseTrainerState(localStorage.getItem(TRAINER_KEY)).rounds);
    const id = window.setTimeout(update, 0);
    window.addEventListener("storage", update);
    return () => { window.clearTimeout(id); window.removeEventListener("storage", update); };
  }, []);
  const streak = calculateStreak(progress.practiceDates);
  const best = Math.max(0, ...Object.values(progress.bestScores), ...trainerRounds.map((round) => round.result?.score ?? 0));
  const scoredRecent = trainerRounds.filter((round) => round.mode === "scored").slice(0, 10);
  const averageAccuracy = scoredRecent.length
    ? Math.round(scoredRecent.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / scoredRecent.length)
    : null;
  const grouped = new Map<string, TrainerRound[]>();
  trainerRounds.forEach((round) => grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]));
  const mostPracticed = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const weakest = [...grouped.entries()].map(([id, rounds]) => ({
    id,
    name: rounds[0]?.patternName ?? id,
    quality: rounds.reduce((sum, round) => sum + (round.mode === "scored"
      ? round.result?.accuracy ?? 0
      : Math.round((round.ratings.filter((rating) => rating === "clean").length + round.ratings.filter((rating) => rating === "needsWork").length * 0.5) / Math.max(1, round.repetitions ?? 10) * 100)), 0) / rounds.length,
  })).sort((a, b) => a.quality - b.quality)[0];
  const recent = [
    ...progress.sessions.map((session) => ({ id: session.id, name: session.patternName, at: session.playedAt, summary: session.bpm + " BPM · " + session.accuracy + "% accuracy", badge: session.score + " score" })),
    ...trainerRounds.map((round) => ({
      id: round.id, name: round.patternName, at: round.playedAt,
      summary: "Trainer · " + round.bpm + " BPM · " + (round.mode === "self"
        ? round.ratings.filter((rating) => rating === "clean").length + "/" + (round.repetitions ?? 10) + " clean"
        : (round.result?.accuracy ?? 0) + "% accuracy"),
      badge: round.mode === "self" ? "Self rated" : (round.result?.score ?? 0) + " score",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return <>
    <section className="stat-grid">
      <div className="stat"><strong>{progress.completedLessons.length}/12</strong><span>Lessons complete</span></div>
      <div className="stat"><strong>{progress.sessions.length + trainerRounds.length}</strong><span>Practice sessions</span></div>
      <div className="stat"><strong>{best}</strong><span>Best score</span></div>
      <div className="stat"><strong>{streak}</strong><span>Day streak</span></div>
    </section>
    <div className="section-heading"><div><span className="eyebrow">Learning path</span><h2>Level progress</h2></div></div>
    <section className="card-grid">{levels.map((level) => {
      const value = levelProgress(progress.completedLessons, level);
      return <article className={"card level-" + level} key={level}><span className="level-mark">{level}</span><h3>{value.done} of {value.total}</h3><div className="progress-track" aria-label={value.percent + "% complete"}><span style={{ width: value.percent + "%" }} /></div><p>{value.percent}% of this level completed.</p></article>;
    })}</section>
    <div className="section-heading"><div><span className="eyebrow">Trainer insights</span><h2>What to practise next</h2></div><Link className="button" href="/trainer">Train now</Link></div>
    <section className="card-grid trainer-insights">
      <article className="card"><span className="level-mark">Timing</span><h3>{averageAccuracy === null ? "—" : averageAccuracy + "%"}</h3><p>{scoredRecent.length ? "Average accuracy across your " + scoredRecent.length + " latest scored rounds." : "Score a Trainer round to see your recent timing accuracy."}</p></article>
      <article className="card"><span className="level-mark">Most practised</span><h3>{mostPracticed ? mostPracticed[1][0].patternName : "—"}</h3><p>{mostPracticed ? mostPracticed[1].length + " Trainer rounds completed." : "Your repeated patterns will appear here."}</p></article>
      <article className="card"><span className="level-mark">Focus area</span><h3>{weakest?.name ?? "—"}</h3><p>{weakest ? "Recent average: " + Math.round(weakest.quality) + "%." : "Finish a round to get a suggested focus."}</p>{weakest && <Link className="button-secondary" href={"/trainer?pattern=" + encodeURIComponent(weakest.id)}>Practise this pattern</Link>}</article>
    </section>
    <div className="section-heading"><div><span className="eyebrow">Latest work</span><h2>Recent sessions</h2></div></div>
    {recent.length ? <section className="lesson-list">{recent.map((session) => <article className="lesson" key={session.id}><span className="lesson-order">♪</span><div className="lesson-copy"><h3>{session.name}</h3><p>{session.summary} · {new Date(session.at).toLocaleDateString()}</p></div><span className="done-mark">{session.badge}</span></article>)}</section> : <div className="empty-state"><h3>No sessions yet</h3><p>Finish a Trainer round or Practice Pad loop to see your history.</p></div>}
  </>;
}
