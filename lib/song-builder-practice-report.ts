import type { ArrangementBar } from "./song-builder";

export type SongBuilderPracticeSession = {
  id: string;
  songId: string;
  songTitle: string;
  completed: boolean;
  durationMs: number;
  startedAt: string;
  startBpm: number;
  endBpm: number;
  manualSeeks: number;
  measureVisits: Record<string, number>;
  seekVisits?: Record<string, number>;
};

export type SuggestedPracticeTarget = { measure: number; index: number; score: number; visits: number; seeks: number; reason: string };

/** Rank measures using locally recorded repeats/seeks plus a small pattern-complexity estimate. */
export function suggestPracticeTargets(bars: ArrangementBar[], sessions: SongBuilderPracticeSession[], limit = 3): SuggestedPracticeTarget[] {
  const visits = new Map<number, number>(), seeks = new Map<number, number>();
  for (const session of sessions) {
    for (const [measure, count] of Object.entries(session.measureVisits ?? {})) {
      const index = Number(measure) - 1;
      if (Number.isInteger(index) && index >= 0) visits.set(index, (visits.get(index) ?? 0) + Math.max(0, count));
    }
    for (const [measure, count] of Object.entries(session.seekVisits ?? {})) {
      const index = Number(measure) - 1;
      if (Number.isInteger(index) && index >= 0) seeks.set(index, (seeks.get(index) ?? 0) + Math.max(0, count));
    }
  }
  return bars.map((bar, index) => {
    const measure = index + 1, repeatCount = visits.get(index) ?? 0, seekCount = seeks.get(index) ?? 0;
    const syncopations = bar.hits.filter(hit => Math.abs(hit.beat - Math.round(hit.beat)) > 0.01).length;
    const ornaments = bar.hits.filter(hit => hit.articulation && hit.articulation !== "normal").length;
    const complexity = Math.min(8, Math.log2(bar.hits.length + 1) + syncopations * 0.12 + ornaments * 0.3 + (bar.subdivision >= 12 ? 0.75 : 0));
    const score = complexity + Math.log2(repeatCount + 1) * 0.6 + Math.log2(seekCount + 1) * 2;
    const reason = seekCount ? `${seekCount} manual return${seekCount === 1 ? "" : "s"} · ${repeatCount} playback pass${repeatCount === 1 ? "" : "es"}` : repeatCount ? `${repeatCount} playback pass${repeatCount === 1 ? "" : "es"} · ${bar.hits.length} hits` : `${bar.hits.length} hits · ${syncopations} offbeat${syncopations === 1 ? "" : "s"}`;
    return { measure, index, score, visits: repeatCount, seeks: seekCount, reason };
  }).sort((a, b) => b.score - a.score || a.measure - b.measure).slice(0, Math.max(1, limit));
}

const STORAGE_KEY = "drum-hero-song-builder-practice-v1";

function readAll(): SongBuilderPracticeSession[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SongBuilderPracticeSession => Boolean(
      item && typeof item === "object" && typeof item.id === "string" && typeof item.songId === "string" &&
      typeof item.songTitle === "string" && typeof item.durationMs === "number" && typeof item.startedAt === "string" &&
      item.measureVisits && typeof item.measureVisits === "object",
    ));
  } catch { return []; }
}

export function readSongBuilderPracticeSessions(songId: string): SongBuilderPracticeSession[] {
  if (typeof window === "undefined") return [];
  return readAll().filter(session => session.songId === songId).slice(0, 50);
}

export function saveSongBuilderPracticeSession(session: SongBuilderPracticeSession): SongBuilderPracticeSession[] {
  if (typeof window === "undefined") return [];
  const next = [session, ...readAll().filter(item => item.id !== session.id)].slice(0, 200);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Reports are optional when browser storage is full. */ }
  return next.filter(item => item.songId === session.songId).slice(0, 50);
}
