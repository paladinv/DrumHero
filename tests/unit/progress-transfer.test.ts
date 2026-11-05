import { describe, expect, it } from "vitest";
import { createProgressTransfer, mergeProgressTransfer, parseProgressTransfer } from "@/lib/progress-transfer";
import { defaultProgress } from "@/lib/progress";
import type { DailyPracticeSession } from "@/lib/daily-practice-session";
import type { SessionResult } from "@/lib/types";

function session(index: number): SessionResult {
  return {
    id: `session-${index}`,
    patternId: "quarter-pulse",
    patternName: "Quarter pulse",
    bpm: 80,
    playedAt: new Date(Date.now() - index * 1_000).toISOString(),
    score: 90,
    accuracy: 90,
    great: 4,
    good: 0,
    miss: 0,
    extra: 0,
    maxCombo: 4
  };
}

function guidedSession(): DailyPracticeSession {
  return {
    version: 1,
    id: "guided-session-1",
    createdAt: new Date().toISOString(),
    steps: [{ id: "warmup", title: "Warm up", reason: "Settle into a pulse.", patternId: "quarter-pulse", patternName: "Quarter pulse", minutes: 3, href: "/trainer?pattern=quarter-pulse" }],
    completedStepIds: [],
    skippedStepIds: [],
    elapsedMs: 1_000,
    runStartedAt: Date.now() - 5_000,
    completedAt: null
  };
}

describe("cross-platform progress transfer", () => {
  it("exports only the 50 most recent practice summaries", () => {
    const progress = {
      ...structuredClone(defaultProgress),
      sessions: Array.from({ length: 60 }, (_, index) => session(index))
    };

    const transfer = createProgressTransfer(progress);

    expect(transfer.practiceSessions).toHaveLength(50);
    expect(transfer.practiceSessions[0]?.id).toBe("session-0");
    expect(transfer.practiceSessions.at(-1)?.id).toBe("session-49");
  });

  it("round-trips a paused guided session and weekly goal, and merges repeated imports without duplicates", () => {
    const practicedAt = new Date().toISOString();
    const progress = {
      ...structuredClone(defaultProgress),
      completedLessons: ["meet-the-kit"],
      lessonCompletedAt: { "meet-the-kit": practicedAt },
      sessions: [session(1)],
      bestScores: { "quarter-pulse": 90 },
      settings: { sound: true, preferredBpm: 96 }
    };
    const exported = createProgressTransfer(progress, practicedAt, {
      guidedPracticeSession: guidedSession(),
      weeklyGoal: { version: 1, type: "focus", target: 4, focus: "songs" }
    });

    expect(exported.guidedPracticeSession?.runStartedAt).toBeNull();
    expect(exported.guidedPracticeSession?.elapsedMs).toBeGreaterThanOrEqual(5_000);
    const imported = parseProgressTransfer(JSON.stringify(exported));
    expect(imported.guidedPracticeSession?.completedAt).toBeNull();
    expect(imported.weeklyGoal).toEqual({ version: 1, type: "focus", target: 4, focus: "songs" });

    const firstMerge = mergeProgressTransfer(structuredClone(defaultProgress), imported);
    const secondMerge = mergeProgressTransfer(firstMerge.progress, imported);

    expect(firstMerge.progress.completedLessons).toEqual(["meet-the-kit"]);
    expect(firstMerge.progress.sessions).toHaveLength(1);
    expect(firstMerge.progress.settings.preferredBpm).toBe(96);
    expect(firstMerge.progress.bestScores["quarter-pulse"]).toBe(90);
    expect(secondMerge.progress.completedLessons).toEqual(["meet-the-kit"]);
    expect(secondMerge.progress.sessions).toHaveLength(1);
    expect(secondMerge.addedLessons).toBe(0);
    expect(secondMerge.addedSessions).toBe(0);
  });
});
