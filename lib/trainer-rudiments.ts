import { rudiments } from "./curriculum";
import type { Groove, PatternHit, PracticePattern, Rudiment } from "./types";

type StickingNote = Pick<PatternHit, "sticking" | "accent" | "articulation">;

function addWrittenSticking(pattern: Rudiment): Groove {
  const phrase = pattern.sticking.match(/\b[RL]\b/g) as Array<"R" | "L"> | null;
  const hands: Array<"R" | "L"> = phrase?.length ? phrase : ["R", "L"];
  return {
    ...pattern,
    style: "Rudiment",
    focus: pattern.coaching,
    meter: `${pattern.beats}/4`,
    tags: ["rudiment", "sticking"],
    hits: pattern.hits.map((hit, index) => ({ ...hit, sticking: hit.sticking ?? hands[index % hands.length] }))
  };
}

function buildRudiment(id: string, name: string, level: Groove["level"], beats: number, subdivision: Groove["subdivision"], sticking: StickingNote[], focus: string): Groove & { sticking: string; coaching: string } {
  const cells = beats * subdivision / 4;
  const hits = Array.from({ length: cells }, (_, step) => {
    const note = sticking[step % sticking.length];
    return { step, instrument: "snare" as const, sticking: note.sticking, accent: note.accent, articulation: note.articulation };
  });
  return { id, name, level, beats, subdivision, defaultBpm: level === "Beginner" ? 60 : level === "Intermediate" ? 72 : 84, tempoRange: [40, 180], description: focus, style: "Rudiment", focus, sticking: sticking.map((note) => note.sticking).join(" "), coaching: focus, meter: beats === 6 ? "6/8" : `${beats}/4`, tags: ["rudiment", "sticking"], hits };
}

const notes = (sequence: string, accented: number[] = [], articulationAt: (index: number) => PatternHit["articulation"] = () => undefined): StickingNote[] =>
  [...sequence].map((sticking, index) => ({ sticking: sticking as "R" | "L", accent: accented.includes(index), articulation: articulationAt(index) }));

const additionalRudiments: Groove[] = [
  buildRudiment("rudiment-double-paradiddle", "Double paradiddle", "Intermediate", 3, 16, notes("RLRLRRLRLRLL", [0, 6]), "RLRLRR LRLRLL in an even six-beat phrase."),
  buildRudiment("rudiment-paradiddle-diddle", "Paradiddle-diddle", "Intermediate", 3, 8, notes("RLRRLL", [0, 3]), "Repeat RLRRLL evenly and move the accents without rushing."),
  buildRudiment("rudiment-five-stroke-roll", "Five-stroke roll", "Intermediate", 5, 8, notes("RRLLRLLRRL", [0, 5]), "Alternate accented five-stroke groups with even spacing."),
  buildRudiment("rudiment-flam-taps", "Flam taps", "Intermediate", 4, 8, notes("RLRLRLRL", [0, 2, 4, 6], index => index % 2 === 0 ? "flam" : undefined), "Alternate flam accents and taps while keeping the grace notes low."),
  buildRudiment("rudiment-flam-accents", "Flam accents", "Advanced", 4, 12, notes("RLRLRLRLRLRL", [0, 3, 6, 9], index => index % 3 === 0 ? "flam" : undefined), "Shape each triplet group with a clear flam accent."),
  buildRudiment("rudiment-drag-taps", "Drag taps", "Advanced", 4, 16, notes("RLRLRLRLRLRLRLRL", [0, 2, 4, 6, 8, 10, 12, 14], index => index % 2 === 0 ? "drag" : undefined), "Keep drag strokes compact and the following taps controlled.")
];

export const TRAINER_RUDIMENTS: Groove[] = [...rudiments.map(addWrittenSticking), ...additionalRudiments];

export function rudimentWithLeadHand(pattern: PracticePattern, leadHand: "R" | "L"): PracticePattern {
  if (leadHand === "R" || !pattern.hits.some(hit => hit.sticking)) return pattern;
  const swap = (hand: "R" | "L") => hand === "R" ? "L" as const : "R" as const;
  const hits = pattern.hits.map(hit => hit.sticking ? { ...hit, sticking: swap(hit.sticking) } : hit);
  const writtenSticking = "sticking" in pattern && typeof pattern.sticking === "string" ? pattern.sticking : "";
  const leftLeadSticking = writtenSticking.replaceAll("R", "x").replaceAll("L", "R").replaceAll("x", "L");
  return { ...pattern, name: `${pattern.name} · left lead`, hits, ...(writtenSticking ? { sticking: leftLeadSticking } : {}) };
}
