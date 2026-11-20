import type { TrainerFeel } from "./trainer";
import type { TrainerRound } from "./trainer";
import type { PracticePattern } from "./types";

export type TrainerStyleProgression = {
  id: string;
  title: string;
  feel: TrainerFeel;
  cue: string;
  steps: Array<{ patternId: string; bpm: number }>;
};

/** Original, ordered practice sets. Compound groove/fill patterns provide a clear transition at the final step. */
export const TRAINER_STYLE_PROGRESSIONS: TrainerStyleProgression[] = [
  {
    id: "rock-backbeat-to-fill", title: "Rock · backbeat to fill", feel: "straight",
    cue: "Keep the eighth-note pulse even, anchor the snare on 2 and 4, then land beat one after the fill.",
    steps: [{ patternId: "first-beat", bpm: 72 }, { patternId: "straight-sixteenth-rock", bpm: 82 }, { patternId: "rock-groove-into-fill", bpm: 78 }],
  },
  {
    id: "pop-pulse-to-fill", title: "Pop · steady pulse to fill", feel: "straight",
    cue: "Keep the kick steady while the hi-hat opens up; make the fill resolve without pushing the next bar.",
    steps: [{ patternId: "straight-pop", bpm: 78 }, { patternId: "disco-open-hat", bpm: 92 }, { patternId: "pop-groove-into-fill", bpm: 82 }],
  },
  {
    id: "funk-pocket-to-fill", title: "Funk · ghost notes to linear fill", feel: "straight",
    cue: "Keep the backbeat stable as the kick moves between beats, then make every fill note distinct.",
    steps: [{ patternId: "ghost-note-pocket", bpm: 72 }, { patternId: "syncopated-funk", bpm: 76 }, { patternId: "funk-groove-into-fill", bpm: 72 }],
  },
  {
    id: "blues-shuffle-to-fill", title: "Blues · shuffle pocket to fill", feel: "shuffle",
    cue: "Feel the long-short subdivision evenly and keep the backbeat relaxed through the triplet fill.",
    steps: [{ patternId: "classic-shuffle-pocket", bpm: 72 }, { patternId: "shuffle-kick-walk", bpm: 76 }, { patternId: "shuffle-groove-into-fill", bpm: 68 }],
  },
];

export type RecommendedTrainerStyleStep = {
  pattern: PracticePattern;
  bpm: number;
  difficulty: { rank: number; label: string };
  note: string;
};

/** A visible, notation-based complexity cue for ordering style-path steps. */
export function trainerPatternDifficulty(pattern: PracticePattern) {
  const level = pattern.level === "Beginner" ? 1 : pattern.level === "Intermediate" ? 2 : 3;
  const stepsPerBeat = pattern.subdivision / 4;
  const offbeatHits = pattern.hits.filter(hit => hit.step % stepsPerBeat !== 0).length;
  const offbeatShare = pattern.hits.length ? offbeatHits / pattern.hits.length : 0;
  const density = pattern.beats > 0 ? pattern.hits.length / pattern.beats : 0;
  const complexity = Math.min(5,
    level +
    Number(pattern.subdivision >= 16) +
    Number(offbeatShare >= 0.3) +
    Number(density >= 3.25) +
    Number(Boolean(pattern.trainerFillStepRanges?.length)) +
    Number(!Number.isInteger(pattern.beats))
  );
  const labels = ["Foundation", "Developing", "Steady", "Challenging", "Advanced"];
  return { rank: complexity, label: labels[complexity - 1] };
}

/** Personalize path tempos only after two reliable rounds from the same setup. */
export function recommendTrainerStyleSteps(path: TrainerStyleProgression, patterns: PracticePattern[], rounds: TrainerRound[]): RecommendedTrainerStyleStep[] {
  return path.steps.flatMap((step) => {
    const pattern = patterns.find((item) => item.id === step.patternId);
    if (!pattern) return [];
    const difficulty = trainerPatternDifficulty(pattern);

    const history = rounds
      .filter((round) => round.patternId === pattern.id && round.mode === "scored" && round.result && !round.inputClipped && !round.uncertainDetections && round.feel === path.feel)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    const latest = history[0];
    const comparable = latest
      ? history.filter((round) => round.source === latest.source && round.inputProfile === latest.inputProfile).slice(0, 3)
      : [];

    if (comparable.length < 2) {
      return [{ pattern, bpm: clampStyleTempo(step.bpm, pattern), difficulty, note: "Starting tempo · two reliable rounds on the same setup are needed to adapt." }];
    }

    const averageAccuracy = comparable.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / comparable.length;
    const baseline = latest?.bpm ?? step.bpm;
    const adjustment = averageAccuracy >= 88 ? 4 : averageAccuracy < 65 ? -4 : 0;
    const bpm = clampStyleTempo(baseline + adjustment, pattern);
    const note = adjustment > 0
      ? `${comparable.length} reliable rounds · ${Math.round(averageAccuracy)}% average · start ${adjustment} BPM faster.`
      : adjustment < 0
        ? `${comparable.length} reliable rounds · ${Math.round(averageAccuracy)}% average · start ${Math.abs(adjustment)} BPM slower.`
        : `${comparable.length} reliable rounds · ${Math.round(averageAccuracy)}% average · hold the recent tempo.`;
    return [{ pattern, bpm, difficulty, note }];
  });
}

function clampStyleTempo(bpm: number, pattern: PracticePattern) {
  return Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], Math.round(bpm)));
}
