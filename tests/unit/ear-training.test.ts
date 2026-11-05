import { describe, expect, it } from "vitest";
import { adaptiveEarLevel, createEarComparison, createEarExercise, earBarDurationMs, earHitOffsetMs, earMeterGroups, earPatternBank, EAR_GROOVE_LESSONS, explainEarAnswer, parseEarHistory, parseEarReviewSchedule, scoreEarAttempt, scoreEarDictation, updateEarReviewSchedule, type EarLevel } from "@/lib/ear-training";
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

  it("supports 5/4 and grouped 7/8 bars with countable grid lengths", () => {
    expect(earMeterGroups("7/8")).toEqual([1, 1, 1.5]);
    for (const meter of ["5/4", "7/8"] as const) {
      const exercise = createEarExercise("rhythm", 145, undefined, { meter, bars: 2 });
      expect(exercise.meter).toBe(meter);
      expect(Number.isInteger(exercise.pattern.beats * exercise.pattern.subdivision / 4)).toBe(true);
      expect(earBarDurationMs(exercise.pattern, 100)).toBe(exercise.pattern.beats * 600);
      expect(exercise.choices[exercise.answer]).toEqual(exercise.pattern);
    }
  });

  it("targets weak skills and changes rhythmic density", () => {
    const rests = createEarExercise("pulse", 91, undefined, { focus: "rests", complexity: 1 });
    expect(rests.focus).toBe("rests");
    expect(rests.pattern.hits.length).toBeLessThanOrEqual(3);

    const sixteenths = createEarExercise("rhythm", 91, undefined, { focus: "sixteenth-notes", complexity: 3 });
    expect(sixteenths.pattern.subdivision).toBe(16);
    expect(sixteenths.pattern.hits.some(hit => hit.step % 2 !== 0)).toBe(true);

    const swung = createEarExercise("triplet", 91, undefined, { feel: "swing", focus: "swing" });
    expect(swung.pattern.hits.length).toBeGreaterThan(0);
    expect(swung.focus).toBe("swing");
  });

  it("makes rock, funk, and clave groove families audibly distinct", () => {
    const rock = earPatternBank("groove", { style: "rock" });
    const funk = earPatternBank("groove", { style: "funk" });
    const clave = earPatternBank("groove", { style: "clave" });
    expect(rock.every(pattern => pattern.hits.filter(hit => hit.instrument !== "hihat").every(hit => hit.step % 4 === 0))).toBe(true);
    expect(funk.some(pattern => pattern.hits.some(hit => hit.instrument === "hihat" && hit.step % 2 !== 0))).toBe(true);
    expect(clave.every(pattern => pattern.hits.filter(hit => hit.instrument === "kick").every(hit => [0, 6, 8, 12, 14].includes(hit.step)))).toBe(true);
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

  it("scores multi-voice dictation by correct placement and creates same-or-changed comparisons", () => {
    const pattern = EAR_GROOVE_LESSONS[0]!.pattern;
    expect(scoreEarDictation(pattern, pattern.hits).score).toBe(100);
    const wrong = pattern.hits.map(hit => ({ ...hit }));
    wrong[0] = { ...wrong[0]!, step: (wrong[0]!.step + 1) % (pattern.beats * pattern.subdivision / 4) };
    expect(scoreEarDictation(pattern, wrong).score).toBeLessThan(100);
    expect(EAR_GROOVE_LESSONS).toHaveLength(9);
    const comparisons = Array.from({ length: 30 }, (_, seed) => createEarComparison(pattern, seed));
    expect(comparisons.some(item => item.changed && item.fromStep !== item.toStep)).toBe(true);
    expect(comparisons.some(item => !item.changed && item.pattern === pattern)).toBe(true);
  });

  it("schedules spaced skill reviews sooner after misses and farther apart after mastery", () => {
    const first = updateEarReviewSchedule([], ["rests"], 90, 0);
    expect(first[0]).toMatchObject({ skill: "rests", intervalDays: 3, streak: 1, lastScore: 90 });
    expect(Date.parse(first[0]!.dueAt)).toBe(3 * 24 * 60 * 60 * 1000);
    const mastered = updateEarReviewSchedule(first, ["rests"], 91, 0);
    expect(mastered[0]).toMatchObject({ intervalDays: 7, streak: 2 });
    const retry = updateEarReviewSchedule(mastered, ["rests"], 45, 0);
    expect(retry[0]).toMatchObject({ intervalDays: 1, streak: 0, lastScore: 45 });
    expect(parseEarReviewSchedule(JSON.stringify(retry))).toEqual(retry);
    expect(parseEarReviewSchedule(JSON.stringify([{ skill: "unknown", dueAt: "bad", intervalDays: 0, streak: -1, lastScore: 101 }]))).toEqual([]);
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
    const hitCount = pattern.hits.length;
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs - 50 }))).summary.great).toBe(hitCount);
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs + 100 }))).summary.good).toBe(hitCount);
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, atMs: hit.atMs + 101 }))).summary).toMatchObject({ miss: hitCount, extra: hitCount, score: 0 });
    expect(scoreEarAttempt(pattern, 80, hits.map(hit => ({ ...hit, instrument: "kick" as const }))).summary).toMatchObject({ miss: hitCount, extra: hitCount });
    expect(scoreEarAttempt(pattern, 80, []).summary).toMatchObject({ miss: hitCount, score: 0 });
  });

  it("validates and bounds local history", () => {
    const entry = { id: "one", playedAt: "2026-10-22T12:00:00Z", level: "pulse", mode: "identify", score: 100, replays: 0, assisted: false };
    expect(parseEarHistory(JSON.stringify({ version: 1, results: [entry] }))).toEqual([entry]);
    for (const raw of [null, "broken", "[]", '{"version":2,"results":[]}', JSON.stringify({ version: 1, results: [{ ...entry, score: 101 }, { ...entry, mode: "unknown" }, { ...entry, replays: -1 }, { ...entry, playedAt: "invalid" }] })]) expect(parseEarHistory(raw)).toEqual([]);
    expect(parseEarHistory(JSON.stringify({ version: 1, results: Array.from({ length: 110 }, (_, id) => ({ ...entry, id: String(id) })) }))).toHaveLength(100);
    expect(parseEarHistory(JSON.stringify({ version: 1, results: [{ ...entry, mode: "meter", meter: "6/8", feel: "shuffle", bars: 2, skills: ["meter", "swing"] }] }))).toHaveLength(1);
  });
});
