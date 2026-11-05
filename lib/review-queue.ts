import { lessons } from "./curriculum";
import { allSongs, songPartPattern, type SongLibraryState } from "./song-library";
import type { ProgressState } from "./types";
import type { TrainerRound } from "./trainer";
import type { TrainerReviewReminder } from "./trainer-review-reminders";

export type ReviewQueueItem = {
  id: string;
  kind: "song" | "lesson" | "trainer";
  title: string;
  reason: string;
  reasonValues?: Record<string, string | number>;
  href: string;
  dueAt: string;
  priority: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildReviewQueue(progress: ProgressState, rounds: TrainerRound[], library: SongLibraryState, now = Date.now(), reminders: TrainerReviewReminder[] = []): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];
  const songs = allSongs(library);
  const dueSections = new Map<string, { songId: string; sectionId: string; dueAt: string }>();
  for (const review of library.reviews) {
    if (!Number.isFinite(Date.parse(review.dueAt)) || Date.parse(review.dueAt) > now) continue;
    const key = `${review.songId}:${review.sectionId}`;
    const previous = dueSections.get(key);
    if (!previous || review.dueAt < previous.dueAt) dueSections.set(key, { songId: review.songId, sectionId: review.sectionId, dueAt: review.dueAt });
  }
  for (const state of library.progress) {
    if (!state.dueAt || !Number.isFinite(Date.parse(state.dueAt)) || Date.parse(state.dueAt) > now) continue;
    const key = `${state.songId}:${state.sectionId}`;
    const previous = dueSections.get(key);
    if (!previous || state.dueAt < previous.dueAt) dueSections.set(key, { songId: state.songId, sectionId: state.sectionId, dueAt: state.dueAt });
  }
  for (const due of dueSections.values()) {
    const song = songs.find((item) => item.id === due.songId);
    const section = song?.sections.find((item) => item.id === due.sectionId) ?? song?.sections[0];
    const part = section?.parts[0];
    if (!song || !section || !part) continue;
    const pattern = songPartPattern(song, section, part);
    items.push({
      id: `song:${song.id}:${section.id}`,
      kind: "song",
      title: `${song.title} · ${section.name}`,
      reason: "This song section is due for review.",
      href: `/practice?pattern=${encodeURIComponent(pattern.id)}`,
      dueAt: due.dueAt,
      priority: 0,
    });
  }

  const validLessonIds = new Set(progress.completedLessons);
  for (const lesson of lessons) {
    const completedAt = progress.lessonCompletedAt?.[lesson.id];
    const completedTime = completedAt ? Date.parse(completedAt) : Number.NaN;
    if (!validLessonIds.has(lesson.id) || !Number.isFinite(completedTime) || now - completedTime < 7 * DAY_MS || !lesson.practicePatternId) continue;
    const followUpSessions = progress.sessions.some((session) => session.patternId === lesson.practicePatternId && Date.parse(session.playedAt) > completedTime);
    const followUpRounds = rounds.some((round) => round.patternId === lesson.practicePatternId && Date.parse(round.playedAt) > completedTime && round.mode === "scored");
    if (followUpSessions || followUpRounds) continue;
    const days = Math.floor((now - completedTime) / DAY_MS);
    items.push({
      id: `lesson:${lesson.id}`,
      kind: "lesson",
      title: lesson.title,
      reason: "Review this lesson skill; it has been {days} days since you completed it.",
      reasonValues: { days },
      href: `/learn?lesson=${encodeURIComponent(lesson.id)}`,
      dueAt: completedAt ?? new Date(completedTime).toISOString(),
      priority: 1,
    });
  }

  const reliableRounds = rounds.filter((round) => round.mode === "scored" && round.result && !round.uncertainDetections && !round.inputClipped && !round.focusedDrill && !round.learningMode && (!round.adaptation || round.adaptation === "standard"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 60);
  const grouped = new Map<string, TrainerRound[]>();
  for (const round of reliableRounds) grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]);
  for (const [patternId, patternRounds] of grouped) {
    const sample = patternRounds.slice(0, 3);
    if (sample.length < 2) continue;
    const accuracy = Math.round(sample.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / sample.length);
    if (accuracy >= 80) continue;
    const latest = sample[0]!;
    items.push({
      id: `trainer:${patternId}`,
      kind: "trainer",
      title: latest.patternName,
      reason: "Your last {count} reliable rounds averaged {accuracy}% accuracy.",
      reasonValues: { count: sample.length, accuracy },
      href: `/trainer?pattern=${encodeURIComponent(patternId)}`,
      dueAt: latest.playedAt,
      priority: 2,
    });
  }

  for (const reminder of reminders) {
    if (!Number.isFinite(Date.parse(reminder.dueAt)) || Date.parse(reminder.dueAt) > now) continue;
    items.push({
      id: `trainer-reminder:${reminder.id}`,
      kind: "trainer",
      title: reminder.patternName,
      reason: "A saved Trainer reminder is due for review.",
      href: `/trainer?pattern=${encodeURIComponent(reminder.patternId)}`,
      dueAt: reminder.dueAt,
      priority: 1,
    });
  }

  return items.sort((a, b) => a.priority - b.priority || a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title)).slice(0, 6);
}
