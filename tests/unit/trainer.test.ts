import { describe, expect, it } from "vitest";
import { patterns } from "@/lib/curriculum";
import { classifyDrumAudio } from "@/lib/trainer-audio";
import { expectedRoundHits, midiNoteFromMessage, parseTrainerState, roundDurationMs, scoreTrainerHit, summarizeTrainerRound } from "@/lib/trainer";

describe("drum trainer", () => {
  const pattern = patterns.find((item) => item.id === "single-stroke")!;
  it("builds exactly ten bounded repetitions at the chosen tempo", () => {
    const duration = roundDurationMs(pattern, 60);
    const hits = expectedRoundHits(pattern, 60, 1000);
    expect(duration).toBe(4000);
    expect(hits).toHaveLength(pattern.hits.length * 10);
    expect(hits[0].at).toBe(1000);
    expect(hits.at(-1)!.at).toBeLessThan(1000 + duration * 10);
  });
  it("scores latency-adjusted hits once and leaves wrong voices extra", () => {
    const expected = expectedRoundHits(pattern, 60, 1000);
    expect(scoreTrainerHit(1080, expected, "snare", 80).rating).toBe("great");
    expect(scoreTrainerHit(1080, expected, "snare", 80).rating).toBe("extra");
    expect(scoreTrainerHit(1500, expected, "kick").rating).toBe("extra");
  });
  it("saves a self-rated round without inventing a timing score", () => {
    const round = summarizeTrainerRound(pattern, 80, "self", "self", Array(10).fill("clean"), []);
    expect(round.ratings).toHaveLength(10);
    expect(round.result).toBeNull();
  });
  it("accepts MIDI note-on with positive velocity only", () => {
    expect(midiNoteFromMessage([0x99, 38, 95])).toBe(38);
    expect(midiNoteFromMessage([0x89, 38, 95])).toBeNull();
    expect(midiNoteFromMessage([0x99, 38, 0])).toBeNull();
  });
  it("recovers corrupt storage and bounds settings", () => {
    expect(parseTrainerState("{").rounds).toEqual([]);
    const state = parseTrainerState(JSON.stringify({ version: 1, rounds: [], latencyMs: 900, midiMap: { "38": "snare", "999": "kick", "42": "unknown" } }));
    expect(state.latencyMs).toBe(200);
    expect(state.midiMap[999]).toBeUndefined();
    expect(state.midiMap[42]).toBe("hihat");
    expect(parseTrainerState(JSON.stringify({ version: 1, rounds: [], midiMap: { "38": null } })).midiMap[38]).toBeNull();
    expect(parseTrainerState(JSON.stringify({ version: 1, rounds: [{ id: "broken", patternId: "single-stroke", mode: "self", ratings: [] }] })).rounds).toEqual([]);
  });
  it("rejects silence as an audio hit", () => {
    expect(classifyDrumAudio(new Float32Array(1024), 48000).instrument).toBeNull();
  });
});
