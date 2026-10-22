import { buildArrangementBars, type ArrangementBar } from "./song-builder";
import { allSongs, songPartEvidenceFingerprint, type DrumSong, type SongLibraryState } from "./song-library";
import type { SongInstrument } from "./types";

export type SongPracticeOptions = { sectionId?: string; partId?: string; repetitions?: number; targetBpm?: number; startBar?: number; endBar?: number; practiceLayer?: "all" | "hands" | "feet"; leadHand?: "R" | "L"; footVoices?: SongInstrument[]; allowUnclippedPart?: boolean };
export type SongTimelineBar = ArrangementBar & { startsAtMs: number; durationMs: number };
export type SongTarget = { atMs: number; instrument: SongInstrument; sectionId: string; partId: string; barIndex: number; accent: boolean; velocity: number; sticking?: "R" | "L"; playedSticking?: "R" | "L"; matched?: boolean; rating?: "great" | "good" | "miss"; offsetMs?: number; confidence?: number };
export type SongTimeline = { bars: SongTimelineBar[]; targets: SongTarget[]; durationMs: number };
export function buildSongTimeline(song: DrumSong, options: SongPracticeOptions = {}): SongTimeline {
  let scoped = buildArrangementBars(song).filter((bar) => (!options.sectionId || bar.sectionId === options.sectionId) && (!options.partId || bar.partId === options.partId));
  if(!scoped.length&&options.partId&&options.allowUnclippedPart!==false){const section=song.sections.find(section=>(!options.sectionId||section.id===options.sectionId)&&section.parts.some(part=>part.id===options.partId));if(section)scoped=buildArrangementBars({...song,sections:[{...section,repeats:1,clips:[{id:'practice-variation',partId:options.partId,repeats:1}]}]});}
  const first = Number.isFinite(options.startBar) ? Math.max(1, Math.min(scoped.length || 1, Math.round(options.startBar!))) : 1;
  const last = Number.isFinite(options.endBar) ? Math.max(first, Math.min(scoped.length, Math.round(options.endBar!))) : scoped.length;
  const bars = scoped.slice(first - 1, last);
  const repetitions = Math.max(1, Math.min(20, Math.round(options.repetitions ?? 1)));
  const ratio = options.targetBpm ? Math.max(40, Math.min(200, options.targetBpm)) / song.bpm : 1;
  let startsAtMs = 0;
  const timelineBars: SongTimelineBar[] = [];
  const targets: SongTarget[] = [];
  for (let repeat = 0; repeat < repetitions; repeat++) for (const bar of bars) {
    const bpm = Math.max(40, Math.min(200, bar.bpm * ratio));
    const durationMs = bar.beats * 60000 / bpm;
    const index = timelineBars.length;
    timelineBars.push({ ...bar, index, bpm, startsAtMs, durationMs });
    targets.push(...bar.hits.map((hit) => {
      const section = song.sections.find((candidate) => candidate.id === bar.sectionId);
      const feel = section?.feel;
      const offbeat = Math.abs((hit.beat % 1) - 0.5) < 0.001;
      const swingDelay = feel && feel.kind !== "straight" && offbeat ? Math.max(0, Math.min(25, feel.amount - 50)) / 100 : 0;
      return { atMs: startsAtMs + (hit.beat + swingDelay) * 60000 / bpm, instrument: hit.instrument, sectionId: bar.sectionId, partId: bar.partId, barIndex: index, accent: hit.accent, velocity: hit.velocity, sticking: hit.sticking };
    }));
    startsAtMs += durationMs;
  }
  return { bars: timelineBars, targets: targets.sort((a, b) => a.atMs - b.atMs), durationMs: startsAtMs };
}
export function timingScore(great: number, good: number, miss: number, extra: number) { const count = great + good + miss; return count ? Math.max(0, Math.round((great * 100 + good * 70) / count - extra * 2)) : 0; }
export type TodayItem = { songId: string; sectionId?: string; partId?: string; targetBpm?: number; estimatedMinutes: number; title: string; reason: string; priority: number };
export function buildSongTodayPlan(state: SongLibraryState, now = Date.now(), limit = 5, minutesAvailable = 30): TodayItem[] {
  const songs = allSongs(state).filter((song) => !song.archived && song.sections.some((section) => section.parts.some((part) => part.hits.length)));
  const items: TodayItem[] = [];
  const minuteBudget = Math.max(5, Math.min(120, Math.round(minutesAvailable)));
  for (const song of songs) {
    const scheduled = state.schedules.filter((item) => item.songId === song.id && Date.parse(item.dueAt) <= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    for (const section of song.sections.filter((section) => section.parts.some((part) => part.hits.length))) {
      const review = state.reviews.find((item) => item.songId === song.id && item.sectionId === section.id);
      const progress = state.progress.find((item) => item.songId === song.id && item.sectionId === section.id);
      const dueReview = !!review && Date.parse(review.dueAt) <= now;
      const playable = section.parts.filter(part => part.hits.length).map(part => {
        const baseBpm = song.bpm;
        const attempts = (progress?.attempts ?? []).filter(attempt => attempt.partId === part.id && attempt.completePart !== false && !["self", "unknown"].includes(attempt.inputMode) && attempt.patternFingerprint === songPartEvidenceFingerprint(part)).slice(-5);
        const average = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : undefined;
        const voiceMisses = attempts.flatMap(attempt => attempt.timing?.voices ?? []).reduce((totals, item) => totals.set(item.instrument, (totals.get(item.instrument) ?? 0) + item.missed), new Map<SongInstrument, number>());
        const weakestVoice = [...voiceMisses].sort((a, b) => b[1] - a[1])[0];
        const suggestedBpm = average !== undefined && average < 85 ? Math.max(40, Math.round(baseBpm * (average < 70 ? 0.75 : 0.85))) : baseBpm;
        const timelineMs = buildSongTimeline(song, { sectionId: section.id, partId: part.id, targetBpm: suggestedBpm }).durationMs;
        const estimatedMinutes = Math.max(2, Math.min(12, Math.ceil(timelineMs / 60000 * 2.5)));
        if (scheduled) return { songId: song.id, sectionId: section.id, partId: part.id, targetBpm: suggestedBpm, estimatedMinutes, title: `${song.title} · ${section.name} / ${part.name}`, reason: `Scheduled: ${scheduled.note || "Song practice"}${average !== undefined ? ` · recent average ${average}%` : ""}`, priority: 0 };
        if (dueReview) return { songId: song.id, sectionId: section.id, partId: part.id, targetBpm: suggestedBpm, estimatedMinutes, title: `${song.title} · ${section.name} / ${part.name}`, reason: `Section review overdue${average !== undefined ? ` · recent average ${average}%` : ""}`, priority: 1 };
        if (average !== undefined && average < 85) return { songId: song.id, sectionId: section.id, partId: part.id, targetBpm: suggestedBpm, estimatedMinutes, title: `${song.title} · ${section.name} / ${part.name}`, reason: `${average}% across ${attempts.length} recent scored passes${weakestVoice?.[1] ? ` · ${weakestVoice[0]} had ${weakestVoice[1]} missed targets` : ""}`, priority: 2 };
        if (progress && progress.mastery < 80) return { songId: song.id, sectionId: section.id, partId: part.id, targetBpm: suggestedBpm, estimatedMinutes, title: `${song.title} · ${section.name} / ${part.name}`, reason: `Build section mastery from ${progress.mastery}%`, priority: 3 };
        if (!progress?.lastPracticedAt || now - Date.parse(progress.lastPracticedAt) > 7 * 86400000) return { songId: song.id, sectionId: section.id, partId: part.id, targetBpm: suggestedBpm, estimatedMinutes, title: `${song.title} · ${section.name} / ${part.name}`, reason: progress ? "Return to a section not played this week" : "Try an unpracticed section", priority: 4 };
        return undefined;
      }).filter((item): item is NonNullable<typeof item> => !!item);
      if (playable.length) items.push(playable.sort((a, b) => a.priority - b.priority || a.estimatedMinutes - b.estimatedMinutes)[0]);
    }
  }
  const seen = new Set<string>();
  const plan: TodayItem[] = [];
  let usedMinutes = 0;
  for (const item of items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))) {
    const key = item.songId;
    if (seen.has(key) || plan.length >= Math.max(1, limit)) continue;
    if (plan.length && usedMinutes + item.estimatedMinutes > minuteBudget) continue;
    seen.add(key); plan.push(item); usedMinutes += item.estimatedMinutes;
  }
  return plan;
}
