import { describe, expect, it } from "vitest";
import { patterns, rudiments } from "@/lib/curriculum";
import { parseCustomGrooves } from "@/lib/custom-grooves";
import { parseTrainerState } from "@/lib/trainer";
import { summarizeTrainerProgress } from "@/lib/trainer-progress";
import { TRAINER_RUDIMENTS } from "@/lib/trainer-rudiments";
import { createTrainerChallenge, parseTrainerChallenge } from "@/lib/trainer-challenge";
import type { TrainerRound } from "@/lib/trainer";

describe("Trainer practice additions", () => {
  it("gives the existing and added rudiments canonical sticking without duplicate pattern IDs", () => {
    expect(TRAINER_RUDIMENTS).toHaveLength(rudiments.length + 6);
    expect(new Set(TRAINER_RUDIMENTS.map((item) => item.id)).size).toBe(TRAINER_RUDIMENTS.length);
    expect(TRAINER_RUDIMENTS.find((item) => item.id === "single-stroke")?.hits.map((hit) => hit.sticking)).toEqual(["R", "L", "R", "L", "R", "L", "R", "L"]);
    expect(TRAINER_RUDIMENTS.find((item) => item.id === "rudiment-five-stroke-roll")?.hits.map((hit) => hit.sticking)).toEqual(["R", "R", "L", "L", "R", "L", "L", "R", "R", "L"]);
    expect(patterns.filter((item) => TRAINER_RUDIMENTS.some((rudiment) => rudiment.id === item.id))).toHaveLength(rudiments.length);
  });

  it("keeps right and left targets in saved custom patterns and multi-pattern challenges", () => {
    const pattern = TRAINER_RUDIMENTS.find((item) => item.id === "rudiment-flam-taps")!;
    const custom = { ...pattern, id: "custom-handed-pattern" };
    expect(parseCustomGrooves(JSON.stringify([custom]))[0].hits[0]).toMatchObject({ sticking: "R", articulation: "flam" });
    const challenge = createTrainerChallenge([pattern, TRAINER_RUDIMENTS[0]], { bpm: 72, goal: "Even hands", attribution: "Teacher", targetAccuracy: 85, durationSeconds: 60 });
    const parsed = parseTrainerChallenge(JSON.stringify(challenge));
    expect(parsed.patterns).toHaveLength(2);
    expect(parsed.pattern.hits[0].sticking).toBe("R");
    expect(parsed.patterns[0].hits[0].articulation).toBe("flam");
  });

  it("persists journal notes and tags and keeps voice-isolation rounds out of full-groove progress", () => {
    const pattern = patterns[0];
    const round: TrainerRound = {
      id: "round-1", patternId: pattern.id, patternName: pattern.name, bpm: 72, playedAt: "2026-10-23T12:00:00.000Z",
      mode: "scored", source: "keyboard", ratings: [], result: { id: "round-1", patternId: pattern.id, patternName: pattern.name, bpm: 72, playedAt: "2026-10-23T12:00:00.000Z", score: 90, accuracy: 90, great: 9, good: 1, miss: 0, extra: 0, maxCombo: 10 },
      notes: "Keep the hats relaxed", tags: ["focused"], voicePractice: "all"
    };
    const saved = parseTrainerState(JSON.stringify({ version: 2, rounds: [round] }));
    expect(saved.rounds[0]).toMatchObject({ notes: "Keep the hats relaxed", tags: ["focused"] });
    expect(parseTrainerState(JSON.stringify({ version: 2, rounds: [{ ...round, tags: ["unknown"] }] })).rounds).toHaveLength(0);
    const isolated = { ...round, id: "isolated", voicePractice: "single" as const, voiceFocus: "snare" as const };
    const summary = summarizeTrainerProgress([round, isolated], round, pattern);
    expect(summary.matchingAttemptCount).toBe(1);
    expect(summarizeTrainerProgress([round, isolated], isolated, pattern).matchingAttemptCount).toBe(0);
  });
});
