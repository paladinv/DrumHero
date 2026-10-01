"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { patterns } from "@/lib/curriculum";
import { readCustomGrooves } from "@/lib/custom-grooves";
import { allSongs, readSongLibrary, songPartPattern, type DrumSong } from "@/lib/song-library";
import { TRAINER_KEY, parseTrainerState, type TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { recommendNext } from "@/lib/progress";
import { useProgress } from "./ProgressProvider";

type PlanKind = "warmup" | "focus" | "music";
type PlanItem = { kind: PlanKind; title: string; reason: string; pattern: PracticePattern };

const planTitles: Record<PlanKind, string> = { warmup: "Warm up", focus: "Focus", music: "Play musically" };
const bundledOptions = [...patterns].sort((a, b) => a.name.localeCompare(b.name));

function dueSongPattern(songs: DrumSong[], reviews: ReturnType<typeof readSongLibrary>["reviews"], progress: ReturnType<typeof readSongLibrary>["progress"]): PracticePattern | undefined {
  const now = Date.now();
  const due = [
    ...reviews.map((review) => ({ songId: review.songId, sectionId: review.sectionId, dueAt: review.dueAt })),
    ...progress.flatMap((item) => item.dueAt ? [{ songId: item.songId, sectionId: item.sectionId, dueAt: item.dueAt }] : [])
  ].filter((item) => Date.parse(item.dueAt) <= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  if (!due) return undefined;
  const song = songs.find((item) => item.id === due.songId);
  const section = song?.sections.find((item) => item.id === due.sectionId) ?? song?.sections[0];
  const part = section?.parts[0];
  return song && section && part ? songPartPattern(song, section, part) : undefined;
}

function weakestPattern(rounds: TrainerRound[], choices: PracticePattern[]): PracticePattern | undefined {
  const recent = rounds.filter((round) => round.mode === "scored" && round.result).sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50);
  const grouped = new Map<string, TrainerRound[]>();
  for (const round of recent) grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]);
  const ranked = [...grouped.entries()].map(([id, roundsForPattern]) => {
    const sample = roundsForPattern.slice(0, 5);
    return { id, accuracy: sample.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / sample.length, count: sample.length };
  }).sort((a, b) => a.accuracy - b.accuracy || b.count - a.count);
  return choices.find((item) => item.id === ranked[0]?.id);
}

export function DailyPracticePlan() {
  const { progress } = useProgress();
  const [choices, setChoices] = useState<PracticePattern[]>(bundledOptions);
  const [items, setItems] = useState<PlanItem[]>([]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const localChoices = [
        ...bundledOptions,
        ...readCustomGrooves(),
        ...allSongs(readSongLibrary()).flatMap((song) => song.sections.flatMap((section) => section.parts.map((part) => songPartPattern(song, section, part))))
      ];
      const library = readSongLibrary();
      const dueSong = dueSongPattern(allSongs(library), library.reviews, library.progress);
      const weakest = weakestPattern(parseTrainerState(window.localStorage.getItem(TRAINER_KEY)).rounds, localChoices);
      const nextLesson = recommendNext(progress.completedLessons);
      const warmup = localChoices.find((item) => item.id === "quarter-pulse") ?? bundledOptions[0];
      const musical = dueSong ?? localChoices.find((item) => item.id === "motown-pocket") ?? bundledOptions[0];
      const fallbackFocusId = nextLesson.practicePatternId ?? "first-beat";
      const focus = weakest && weakest.id !== warmup.id && weakest.id !== musical.id
        ? weakest
        : localChoices.find((item) => item.id === fallbackFocusId) ?? localChoices.find((item) => item.id !== warmup.id && item.id !== musical.id) ?? bundledOptions[1];
      setChoices(localChoices);
      setItems([
        { kind: "warmup", title: planTitles.warmup, reason: "Settle into an even pulse for a few minutes.", pattern: warmup },
        { kind: "focus", title: planTitles.focus, reason: weakest ? "Your lowest recent scored pattern; take it slowly and build control." : nextLesson.practicePatternId ? `Practice the exercise for “${nextLesson.title}”. Scored results will personalize this step.` : `Build a steady backbeat while you work through “${nextLesson.title}”.`, pattern: focus },
        { kind: "music", title: planTitles.music, reason: dueSong ? "This song section is due for review." : "Put the pulse into an original groove.", pattern: musical }
      ]);
    }, 0);
    return () => window.clearTimeout(task);
  }, [progress.completedLessons]);

  const selectPattern = (kind: PlanKind, patternId: string) => {
    const pattern = choices.find((item) => item.id === patternId);
    if (pattern) setItems((current) => current.map((item) => item.kind === kind ? { ...item, pattern, reason: item.kind === "music" && pattern.id.startsWith("song:") ? "Song section selected for focused review." : item.reason } : item));
  };

  return <section className="daily-plan card" aria-labelledby="daily-plan-heading">
    <div className="daily-plan-heading">
      <div><span className="eyebrow">A focused session</span><h2 id="daily-plan-heading">Your 12-minute practice</h2></div>
      <p>Start with a pulse, work on one focus, then play a groove. Choose a different pattern in any step.</p>
    </div>
    {items.length ? <ol className="daily-plan-items">
      {items.map((item, index) => {
        const href = item.pattern.id.startsWith("song:") ? `/practice?pattern=${encodeURIComponent(item.pattern.id)}` : `/trainer?pattern=${encodeURIComponent(item.pattern.id)}`;
        return <li key={item.kind}>
          <span className="daily-plan-number">{index + 1}</span>
          <div className="daily-plan-copy"><strong>{item.title} · {index === 0 ? "3 min" : index === 1 ? "5 min" : "4 min"}</strong><span>{item.reason}</span></div>
          <label><span className="visually-hidden">Choose {item.title.toLowerCase()} pattern</span><select value={item.pattern.id} onChange={(event) => selectPattern(item.kind, event.target.value)}>{choices.map((pattern) => <option key={`${item.kind}-${pattern.id}`} value={pattern.id}>{pattern.name}</option>)}</select></label>
          <Link className="button-secondary" href={href}>Start</Link>
        </li>;
      })}
    </ol> : <p className="daily-plan-loading">Building your plan from this browser’s practice history…</p>}
    <small className="daily-plan-note">Recommendations use your local practice history and song review dates.</small>
  </section>;
}
