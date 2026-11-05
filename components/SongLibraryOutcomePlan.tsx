"use client";

import { useState } from "react";
import { buildSongTodayPlan } from "@/lib/song-practice";
import { goalProgress } from "@/lib/song-library-improvements";
import { learnerProfileIdFromBrowser } from "@/lib/learner-profiles";
import { songPartEvidenceFingerprint, type DrumSong, type SongLibraryState, type SongQueue } from "@/lib/song-library";

export function SongLibraryOutcomePlan({ state, songs, save, practice }: { state: SongLibraryState; songs: DrumSong[]; save: (state: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void; practice: (songId: string, sectionId: string, partId: string, bpm?: number) => void }) {
  const [minutes, setMinutes] = useState(20);
  const [message, setMessage] = useState("");
  const learnerId = learnerProfileIdFromBrowser();
  const now = Date.now();
  const plan = buildSongTodayPlan(state, now, 8, minutes);
  const goalRows = (state.goals ?? []).filter(goal => (goal.learnerId ?? "default") === learnerId).flatMap(goal => {
    const song = songs.find(item => item.id === goal.songId);
    const section = song?.sections.find(item => item.id === goal.sectionId);
    const part = section?.parts.find(item => item.id === goal.partId);
    if (!song || !section || !part) return [];
    const complete = goalProgress(goal, state, part);
    const stale = goal.fingerprint !== songPartEvidenceFingerprint(part);
    return [{ goal, song, section, part, complete, stale, overdue: Boolean(goal.dueAt && Date.parse(goal.dueAt) <= now && complete < goal.passes) }];
  }).filter(item => item.complete < item.goal.passes).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.goal.dueAt ?? "9999").localeCompare(b.goal.dueAt ?? "9999")).slice(0, 8);
  const estimatedMinutes = plan.reduce((total, item) => total + item.estimatedMinutes, 0);

  const createQueue = () => {
    if (!plan.length || state.queues.length >= 100) return;
    const queue: SongQueue = {
      learnerId,
      id: crypto.randomUUID(),
      name: `Adaptive practice · ${new Date().toLocaleDateString()}`.slice(0, 80),
      songIds: plan.map(item => item.songId),
      sectionIds: Object.fromEntries(plan.flatMap(item => item.sectionId ? [[item.songId, item.sectionId] as const] : [])),
      targets: Object.fromEntries(plan.flatMap(item => item.songId && item.partId ? [[item.songId, { partId: item.partId, repetitions: 2, bpm: item.targetBpm }] as const] : []))
    };
    save(current => ({ ...current, queues: [...current.queues, queue].slice(-100) }));
    setMessage(`Saved ${plan.length} songs as an adaptive queue. Recent scored results, reviews, schedules, and open goals shape the next plan.`);
  };

  return <section className="song-tool-panel song-outcome-plan" aria-labelledby="song-outcome-plan-title">
    <div className="song-heading"><div><h3 id="song-outcome-plan-title">Library practice dashboard</h3><p>Today’s plan responds to recent scored passes, missed drum voices, section reviews, schedules, and your goals.</p></div><label>Time available<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={10}>10 minutes</option><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label></div>
    <p><strong>{goalRows.length}</strong> open goal{goalRows.length === 1 ? "" : "s"} in view · <strong>{plan.length}</strong> suggested song{plan.length === 1 ? "" : "s"} · about <strong>{estimatedMinutes} min</strong></p>
    {goalRows.length > 0 && <details className="song-open-goals"><summary>Goals to watch ({goalRows.length})</summary><ul>{goalRows.map(({ goal, song, section, part, complete, overdue, stale }) => <li key={goal.id}><strong>{song.title}</strong> · {section.name} / {part.name} · {Math.min(complete, goal.passes)}/{goal.passes} clean passes ≥{goal.score}% at {goal.bpm} BPM{overdue ? " · overdue" : goal.dueAt ? ` · due ${new Date(goal.dueAt).toLocaleDateString()}` : " · no target date"}{stale ? " · arrangement changed; refresh this goal" : ""} {!stale && <button type="button" onClick={() => practice(song.id, section.id, part.id, goal.bpm)}>Practice goal</button>}</li>)}</ul></details>}
    {plan.length ? <><ol>{plan.map(item => <li key={`${item.songId}:${item.sectionId}:${item.partId}`}><strong>{item.title}</strong><small>{item.estimatedMinutes} min · {item.targetBpm ?? "song"} BPM · {item.reason}</small><button type="button" onClick={() => item.sectionId && item.partId && practice(item.songId, item.sectionId, item.partId, item.targetBpm)}>Practice</button></li>)}</ol><div className="song-actions"><button type="button" disabled={state.queues.length >= 100} onClick={createQueue}>Save as focused practice queue</button></div></> : <p>No due work fits this window. Add a playable song, a practice goal, or a schedule and the plan will update here.</p>}
    <p role="status" aria-live="polite">{message}</p>
    <small>The plan updates from the active learner’s local practice data. Self ratings and partial passes do not count as scored outcomes.</small>
  </section>;
}
