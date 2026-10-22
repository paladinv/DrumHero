import { describe, expect, it } from "vitest";
import { storedRecordingBlob } from "@/lib/song-recording";
import { parseLocalBackup } from "@/lib/local-backup";
import { emptySongLibrary, examples, mergeSongLibraries, migrateSongLibrary, readiness, recordSongScore, type DrumSong } from "@/lib/song-library";
import { buildSongTimeline, buildSongTodayPlan } from "@/lib/song-practice";
import { cloudLibraryState, cloudSongConflicts, librarySyncSignature } from "@/lib/song-cloud";
import { parseLibrarySongImport, replaceImportedSong } from "@/lib/song-library-import";
import { DEFAULT_SONG_BUILDER_SETTINGS } from "@/lib/song-builder-settings";
import { makeSongProjectFile } from "@/lib/song-builder-project";
const song = (): DrumSong => structuredClone(examples[0]);

describe("Song Library workspaces", () => {
  it("reads legacy and portable recording records without changing audio bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const legacy = new Blob([bytes], { type: "audio/wav" });
    expect(storedRecordingBlob(legacy)).toBe(legacy);
    const portable = storedRecordingBlob({ data: bytes.buffer, mimeType: "audio/wav" });
    expect(new Uint8Array(await portable!.arrayBuffer())).toEqual(bytes);
    expect(storedRecordingBlob({ data: "invalid", mimeType: "audio/wav" })).toBeNull();
  });
  it("does not restore account sessions from a full-device backup", () => {
    const backup = { application: "Drum Hero", format: "drum-hero-full-backup", version: 1, createdAt: "2026-10-19T00:00:00Z", localStorage: { "drum-hero:cloud-account:v1": "session" }, songRecordings: [], customSamples: [] };
    expect(() => parseLocalBackup(JSON.stringify(backup))).toThrow(/Account sessions/);
  });
  it("plays the arranged repeats at each section's own tempo", () => {
    const source = song(); source.sections[0].repeats = 2; source.sections[0].bpm = 60;
    source.sections.push({ ...structuredClone(source.sections[0]), id: "chorus", name: "Chorus", repeats: 1, bpm: 120 });
    const timeline = buildSongTimeline(source);
    expect(timeline.bars).toHaveLength(3);
    expect(buildSongTimeline(source, { sectionId: "verse" }).bars).toHaveLength(2);
    expect(timeline.bars.map((bar) => bar.startsAtMs)).toEqual([0, 4000, 8000]);
    expect(timeline.durationMs).toBe(10000);
    expect(timeline.targets.some((target) => target.sectionId === "chorus" && target.atMs >= 8000)).toBe(true);
    expect(buildSongTimeline(source, { sectionId: "chorus", repetitions: 2 }).durationMs).toBe(4000);
  });
  it("keeps slow practice and self ratings out of performance readiness", () => {
    const source = song(), part = source.sections[0].parts[0];
    let state = { ...emptySongLibrary(), songs: [source] };
    state = recordSongScore(state, source.id, "verse", 100, { partId: part.id, bpm: 50, inputMode: "keyboard", engine: "song" });
    state = recordSongScore(state, source.id, "verse", 100, { partId: part.id, bpm: part.bpm, inputMode: "self", engine: "song" });
    expect(readiness(state, source).ready).toBe(false);
    for (let attempt = 0; attempt < 3; attempt++) state = recordSongScore(state, source.id, "verse", 90, { partId: part.id, bpm: part.bpm, inputMode: "keyboard", engine: "song" });
    expect(readiness(state, source).ready).toBe(true);
    expect(state.progress[0].attempts).toHaveLength(5);
    const changed = structuredClone(source); changed.sections[0].parts[0].hits.push({ step: 1, instrument: "tom" });
    expect(readiness(state, changed).ready).toBe(false);
  });
  it("does not treat a five-voice subset as a complete extended-kit performance", () => {
    const source = song(); source.sections[0].parts[0].hits.push({ step: 1, instrument: "ride" });
    const state = recordSongScore({ ...emptySongLibrary(), songs: [source] }, source.id, "verse", 100, { partId: "main", bpm: source.bpm, inputMode: "keyboard", engine: "pad" });
    expect(readiness(state, source).ready).toBe(false);
    expect(state.progress[0].attempts?.[0].completePart).toBe(false);
  });
  it("merges distinct device attempts without duplicating shared history", () => {
    const source = song(), base = { ...emptySongLibrary(), songs: [source] };
    const local = recordSongScore(base, source.id, "verse", 90, { partId: "main", bpm: 82, inputMode: "keyboard" });
    const remote = recordSongScore(base, source.id, "verse", 80, { partId: "main", bpm: 82, inputMode: "touch" });
    const merged = mergeSongLibraries(local, remote);
    expect(merged.progress[0].attempts).toHaveLength(2);
    expect(mergeSongLibraries(merged, remote).progress[0].attempts).toHaveLength(2);
  });
  it("accepts both song export formats and preserves IDs when replacing matching sections", () => {
    const source = song();
    const legacy = parseLibrarySongImport(JSON.stringify({ format: "drum-hero-song-v1", song: source }));
    expect(legacy.song.id).not.toBe(source.id);
    const project = parseLibrarySongImport(JSON.stringify(makeSongProjectFile(source, DEFAULT_SONG_BUILDER_SETTINGS)));
    expect(project.project).toBeDefined();
    project.song.sections[0].id = "different-verse"; project.song.sections[0].parts[0].id = "different-part";
    const replaced = replaceImportedSong(source, project.song);
    expect(replaced.id).toBe(source.id); expect(replaced.sections[0].id).toBe("verse"); expect(replaced.sections[0].parts[0].id).toBe("main");
    expect(() => parseLibrarySongImport('{"format":"wrong"}')).toThrow();
  });
  it("excludes recordings from cloud data and uses canonical signatures", () => {
    const state = { ...emptySongLibrary(), songs: [song()] };
    const withTake = { ...state, recordings: [{ id: "private", songId: state.songs[0].id, createdAt: "2026-10-19T00:00:00Z", durationMs: 1000, mimeType: "audio/webm", timingConsistency: null, hitCount: 0 }] };
    expect(cloudLibraryState(withTake).recordings).toEqual([]);
    expect(librarySyncSignature(withTake)).toBe(librarySyncSignature(state));
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as unknown as typeof state;
    expect(librarySyncSignature(reordered)).toBe(librarySyncSignature(state));
    const remote = structuredClone(state); remote.songs[0].notes = "Changed on another device";
    expect(cloudSongConflicts(state, remote)).toHaveLength(1);
  });
  it("validates nested backup data before rendering it", () => {
    const migrated = migrateSongLibrary({ version: 1, songs: [song()], queues: [{ id: "bad", name: "Corrupt", songIds: null }], notes: [{ id: "bad", songId: "s", text: { injected: true }, kind: "annotation" }], checklists: [{ id: "c", name: "Checklist", items: null }] });
    expect(migrated.queues[0].songIds).toEqual([]); expect(migrated.notes).toEqual([]); expect(migrated.checklists[0].items).toEqual([]);
  });
  it("prioritizes scheduled and overdue songs in the daily plan", () => {
    const state = { ...emptySongLibrary(), songs: [song()], schedules: [{ id: "due", songId: examples[0].id, dueAt: "2026-01-01T00:00:00Z", note: "Rehearsal" }] };
    const plan = buildSongTodayPlan(state, Date.parse("2026-10-19T12:00:00Z"));
    expect(plan[0].reason).toBe("Scheduled: Rehearsal");
  });
});
