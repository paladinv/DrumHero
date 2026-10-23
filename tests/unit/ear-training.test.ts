import { describe, expect, it } from "vitest";
import { adaptiveEarLevel, createEarExercise, earBarDurationMs, earHitOffsetMs, earPatternBank, explainEarAnswer, parseEarHistory, scoreEarAttempt, type EarLevel } from "@/lib/ear-training";
import { stepDurationMs } from "@/lib/scoring";

describe("ear training exercises", () => {
  for (const level of ["pulse", "rhythm", "triplet", "groove"] as EarLevel[]) {
    it(`${level} supplies four unique, equally dense choices and avoids immediate repeats`, () => {
      const bank = earPatternBank(level);
      expect(new Set(bank.map(pattern => JSON.stringify(pattern.hits))).size).toBe(bank.length);
      const positions = new Set<number>();
      for (let seed = 0; seed < 200; seed++) {
        const exercise = createEarExercise(level, seed);
        expect(exercise.choices[exercise.answer]).toEqual(exercise.pattern);
        expect(new Set(exercise.choices.map(pattern => pattern.id)).size).toBe(4);
        expect(new Set(exercise.choices.map(pattern => pattern.hits.length)).size).toBe(1);
        expect(createEarExercise(level, seed, exercise.pattern.id).pattern.id).not.toBe(exercise.pattern.id);
        expect(createEarExercise(level, seed)).toEqual(exercise);
        positions.add(exercise.answer);
      }
      expect(positions.size).toBe(4);
    });
  }

  it("scores an exact multi-voice answer without consuming simultaneous hits twice", () => {
    const pattern = earPatternBank("groove")[0];
    const hits = pattern.hits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * stepDurationMs(80, pattern.subdivision) }));
    expect(scoreEarAttempt(pattern, 80, hits).summary).toMatchObject({ score: 100, accuracy: 100, miss: 0, extra: 0, great: pattern.hits.length });
    expect(scoreEarAttempt(pattern, 80, [...hits, hits[0]]).summary.extra).toBe(1);
  });

  it("creates stable exercises in each meter and feel while keeping the correct bar length", () => {
    for (const options of [{ meter: "4/4", feel: "straight", bars: 1 }, { meter: "3/4", feel: "swing", bars: 1 }, { meter: "6/8", feel: "shuffle", bars: 1 }, { meter: "3/4", feel: "straight", bars: 2 }] as const) {
      const first = createEarExercise("triplet", 2468, undefined, options);
      expect(createEarExercise("triplet", 2468, undefined, options)).toEqual(first);
      expect(first).toMatchObject({ meter: options.meter, feel: options.feel, bars: options.bars });
      expect(first.choices[first.answer]).toEqual(first.pattern);
      expect(first.pattern.hits.every(hit => hit.step >= 0 && hit.step < first.pattern.beats * first.pattern.subdivision / 4)).toBe(true);
      expect(earBarDurationMs(first.pattern, 80)).toBe(first.pattern.beats * 750);
    }
    expect(createEarExercise("pulse", 19, undefined, { meter: "3/4", bars: 2 }).pattern.beats).toBe(6);
  });

  it("scores swung offbeats at their performed position and gives specific feedback", () => {
    const pattern = earPatternBank("pulse", { feel: "swing" })[0]!;
    const hits = pattern.hits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * stepDurationMs(80, pattern.subdivision) + earHitOffsetMs(hit.step, 80, pattern.subdivision, "swing") }));
    expect(scoreEarAttempt(pattern, 80, hits, "swing").summary.score).toBe(100);
    expect(explainEarAnswer(pattern, [{ instrument: "snare", rating: "miss", offsetMs: null, atMs: 0, step: 2 }])).toContain("grid step 3");
    const nearby = pattern.hits.map(hit => ({ ...hit }));
    const moved = nearby[0]!;
    const openStep = Array.from({ length: pattern.subdivision }, (_, step) => step).find(step => !pattern.hits.some(hit => hit.instrument === moved.instrument && hit.step === step))!;
    nearby[0] = { ...moved, step: openStep };
    expect(explainEarAnswer(pattern, [], { ...pattern, hits: nearby })).toContain("moved the snare");
  });

  it("reports rhythm placement separately from timing quality", () => {
    const pattern = earPatternBank("pulse")[0]!;
    const goodHits = pattern.hits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * stepDurationMs(80, pattern.subdivision) + 75 }));
    expect(scoreEarAttempt(pattern, 80, goodHits).summary).toMatchObject({ placementScore: 100, timingScore: 70 });
    expect(scoreEarAttempt(pattern, 80, []).summary).toMatchObject({ placementScore: 0, timingScore: 0 });
  });

  it("raises and lowers difficulty from recent unassisted first attempts", () => {
    const entry = (score: number, level: EarLevel = "pulse") => ({ id: String(score), playedAt: "2026-10-22T12:00:00Z", level, mode: "play" as const, score, replays: 0, assisted: false });
    expect(adaptiveEarLevel([entry(90), entry(90), entry(90)], "pulse", "play")).toBe("rhythm");
    expect(adaptiveEarLevel([entry(40, "rhythm"), entry(45, "rhythm"), entry(50, "rhythm")], "rhythm", "play")).toBe("pulse");
    expect(adaptiveEarLevel([entry(100), entry(100), { ...entry(0), assisted: true }], "pulse", "play")).toBe("pulse");
  });

  it("distinguishes timing windows, wrong voices, missing hits, and extra taps", () => {
    const pattern = earPatternBank("pulse")[0];
    const hits = pattern.hits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * stepDurationMs(80, 8) }));
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs - 50 }))).summary.great).toBe(4);
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs + 100 }))).summary.good).toBe(4);
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs + 101 }))).summary).toMatchObject({ miss: 4, extra: 4, score: 0 });
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, instrument: "kick" as const }))).summary).toMatchObject({ miss: 4, extra: 4 });
    expect(scoreEarAttempt(pattern, 80, []).summary).toMatchObject({ miss: 4, score: 0 });
  });

  it("validates and bounds local history", () => {
    const entry = { id: "one", playedAt: "2026-10-22T12:00:00Z", level: "pulse", mode: "identify", score: 100, replays: 0, assisted: false };
    expect(parseEarHistory(JSON.stringify({ version: 1, results: [entry] }))).toEqual([entry]);
    for (const raw of [null, "broken", "[]", '{"version":2,"results":[]}', JSON.stringify({ version: 1, results: [{ ...entry, score: 101 }, { ...entry, mode: "unknown" }, { ...entry, replays: -1 }, { ...entry, playedAt: "invalid" }] })]) expect(parseEarHistory(raw)).toEqual([]);
    expect(parseEarHistory(JSON.stringify({ version: 1, results: Array.from({ length: 110 }, (_, id) => ({ ...entry, id: String(id) })) }))).toHaveLength(100);
    expect(parseEarHistory(JSON.stringify({ version: 1, results: [{ ...entry, mode: "meter", meter: "6/8", feel: "shuffle", bars: 2, skills: ["meter", "swing"] }] }))).toHaveLength(1);
  });
});
