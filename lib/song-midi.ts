import { meterBeats } from "./song-builder";
import { buildSongTimeline } from "./song-practice";
import type { DrumPart, DrumSong, SongSection } from "./song-library";
import type { SongInstrument, SongPartHit } from "./types";

export const GM_DRUM_NOTES: Partial<Record<number, SongInstrument>> = {
  35: "kick", 36: "kick", 37: "rimshot", 38: "snare", 39: "rimshot", 40: "snare",
  41: "tom", 43: "tom", 45: "tom", 47: "tom", 48: "tom", 50: "tom",
  42: "hihat", 44: "hihat", 46: "openhat", 49: "crash", 51: "ride", 52: "crash",
  53: "ride", 54: "tambourine", 55: "crash", 56: "cowbell", 57: "crash", 59: "ride", 82: "shaker",
};
export const MIDI_VOICES: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine"];
export const DEFAULT_GM_NOTE: Record<SongInstrument, number> = { kick: 36, snare: 38, hihat: 42, openhat: 46, ride: 51, rimshot: 37, tom: 50, crash: 49, cowbell: 56, shaker: 82, tambourine: 54, custom1: 60, custom2: 61, custom3: 62, custom4: 63, custom5: 64, custom6: 65, custom7: 66, custom8: 67 };
export type MidiNoteEvent = { tick: number; note: number; velocity: number };
export type MidiTrack = { name: string; notes: MidiNoteEvent[]; endTick: number; truncatedNotes?: number };
export type ParsedDrumMidi = { division: number; bpm: number; meter: string; sourceBpm?: number; tempoClamped?: boolean; tracks: MidiTrack[] };

function readU32(bytes: Uint8Array, at: number) { if (at + 4 > bytes.length) throw new Error("This MIDI file is incomplete."); return ((bytes[at]! * 0x1000000) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!) >>> 0; }
function readU16(bytes: Uint8Array, at: number) { if (at + 2 > bytes.length) throw new Error("This MIDI file is incomplete."); return (bytes[at]! << 8) | bytes[at + 1]!; }
function textAt(bytes: Uint8Array, at: number, size: number) {
  const chunks: string[] = [];
  for (let offset = at; offset < at + size; offset += 4096) chunks.push(String.fromCharCode(...bytes.subarray(offset, Math.min(at + size, offset + 4096))));
  return chunks.join("");
}
function readVar(bytes: Uint8Array, cursor: { at: number }, end: number) {
  let value = 0;
  for (let count = 0; count < 4; count++) { if (cursor.at >= end) throw new Error("This MIDI track has an incomplete event."); const byte = bytes[cursor.at++]!; value = (value << 7) | (byte & 0x7f); if (!(byte & 0x80)) return value; }
  throw new Error("This MIDI file has an invalid variable-length value.");
}
function parseTrack(bytes: Uint8Array, start: number, end: number, eventBudget: { remaining: number }): { track: MidiTrack; tempo?: number; meter?: string } {
  const cursor = { at: start }, noteStarts = new Map<string, MidiNoteEvent[]>(), notes: MidiNoteEvent[] = [];
  let tick = 0, running = 0, name = "MIDI drum track", tempo: number | undefined, meter: string | undefined, pendingCount = 0, truncatedNotes = 0;
  while (cursor.at < end) {
    if (--eventBudget.remaining < 0) throw new Error("This MIDI file contains too many events for safe browser import.");
    tick += readVar(bytes, cursor, end);
    if (cursor.at >= end) break;
    let status = bytes[cursor.at]!;
    if (status < 0x80) { if (!running) throw new Error("This MIDI track is missing an event status."); status = running; }
    else cursor.at++;
    if (status === 0xff) {
      running = 0;
      if (cursor.at >= end) throw new Error("This MIDI track has an incomplete meta event.");
      const type = bytes[cursor.at++]!, length = readVar(bytes, cursor, end), at = cursor.at;
      if (at + length > end) throw new Error("This MIDI file contains an incomplete meta event.");
      if (type === 0x03) name = textAt(bytes, at, length).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) || name;
      if (type === 0x51 && length === 3 && tempo === undefined) { const micros = (bytes[at]! << 16) | (bytes[at + 1]! << 8) | bytes[at + 2]!; if (micros > 0) tempo = 60000000 / micros; }
      if (type === 0x58 && length >= 2 && meter === undefined) { const numerator = bytes[at]!, denominator = 2 ** bytes[at + 1]!; if (numerator < 1 || numerator > 32 || ![2, 4, 8, 16].includes(denominator)) throw new Error("This MIDI time signature is unsupported. Use a numerator up to 32 and denominator 2, 4, 8, or 16."); meter = `${numerator}/${denominator}`; }
      cursor.at += length;
      if (type === 0x2f) break;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) { const length = readVar(bytes, cursor, end); cursor.at = Math.min(end, cursor.at + length); running = 0; continue; }
    if (status >= 0xf0) throw new Error("System-exclusive MIDI events are not supported in imported drum tracks.");
    running = status;
    const kind = status & 0xf0, channel = status & 0x0f;
    const dataBytes = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    if (cursor.at + dataBytes > end) throw new Error("This MIDI track has an incomplete channel event.");
    const note = bytes[cursor.at++]!;
    const velocity = dataBytes === 2 ? bytes[cursor.at++]! : 0;
    if (note >= 0x80 || velocity >= 0x80) throw new Error("This MIDI track contains an invalid channel event.");
    if ((kind === 0x90 || kind === 0x80) && channel === 9) {
      const key = `${channel}:${note}`;
      if (kind === 0x90 && velocity > 0) {
        if (notes.length + pendingCount < 20000) { const list = noteStarts.get(key) ?? []; list.push({ tick, note, velocity }); noteStarts.set(key, list); pendingCount++; }
        else truncatedNotes++;
      } else { const list = noteStarts.get(key); const hit = list?.shift(); if (hit) { notes.push(hit); pendingCount--; } }
    }
  }
  for (const pending of noteStarts.values()) notes.push(...pending);
  notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
  return { track: { name, notes, endTick: tick, truncatedNotes }, tempo, meter };
}

export function parseDrumMidi(buffer: ArrayBuffer): ParsedDrumMidi {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14 || textAt(bytes, 0, 4) !== "MThd") throw new Error("Choose a Standard MIDI file (.mid or .midi).");
  const headerLength = readU32(bytes, 4);
  if (headerLength < 6 || 8 + headerLength > bytes.length) throw new Error("This MIDI header is invalid.");
  const format = readU16(bytes, 8), trackCount = readU16(bytes, 10), division = readU16(bytes, 12);
  if (format > 1 || trackCount < 1 || trackCount > 128) throw new Error("Use a Standard MIDI format 0 or 1 file with up to 128 tracks.");
  if (!division || division & 0x8000) throw new Error("SMPTE-timed MIDI is not supported. Export using quarter-note (PPQN) timing.");
  let at = 8 + headerLength, bpm = 120, sourceBpm = 120, tempoClamped = false, meter = "4/4", foundTempo = false, foundMeter = false;
  const eventBudget = { remaining: 500000 };
  const tracks: MidiTrack[] = [];
  while (at + 8 <= bytes.length && tracks.length < trackCount) {
    const tag = textAt(bytes, at, 4), size = readU32(bytes, at + 4), start = at + 8, end = start + size;
    if (end > bytes.length) throw new Error("This MIDI track is incomplete.");
    if (tag === "MTrk") { const parsed = parseTrack(bytes, start, end, eventBudget); tracks.push(parsed.track); if (!foundTempo && parsed.tempo) { sourceBpm = Math.round(parsed.tempo); bpm = Math.max(40, Math.min(200, sourceBpm)); tempoClamped = bpm !== sourceBpm; foundTempo = true; } if (!foundMeter && parsed.meter) { meter = parsed.meter; foundMeter = true; } }
    at = end;
  }
  const drumTracks = tracks.filter(track => track.notes.length);
  if (!drumTracks.length) throw new Error("No drum note events on MIDI channel 10 were found. Export the drum part on channel 10 and try again.");
  return { division, bpm, meter, sourceBpm, tempoClamped, tracks: drumTracks };
}

function variable(value: number) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7) > 0) { buffer <<= 8; buffer |= (value & 0x7f) | 0x80; }
  while (true) { bytes.push(buffer & 0xff); if (buffer & 0x80) buffer >>= 8; else break; }
  return bytes;
}
function chunk(tag: string, bytes: number[]) { return [...tag].map(char => char.charCodeAt(0)).concat([(bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255], bytes); }
function eventTrack(events: Array<{ tick: number; bytes: number[] }>, name: string) {
  const nameBytes = [...new TextEncoder().encode(name)];
  const output: number[] = [0, 0xff, 0x03, ...variable(nameBytes.length), ...nameBytes];
  let prior = 0;
  const isNoteOff = (event: { bytes: number[] }) => ((event.bytes[0] ?? 0) & 0xf0) === 0x80;
  for (const event of events.sort((a, b) => a.tick - b.tick || (isNoteOff(a) === isNoteOff(b) ? 0 : isNoteOff(a) ? -1 : 1))) { output.push(...variable(Math.max(0, event.tick - prior)), ...event.bytes); prior = event.tick; }
  output.push(0, 0xff, 0x2f, 0);
  return chunk("MTrk", output);
}
const midiNote: Partial<Record<SongInstrument, number>> = { kick: 36, snare: 38, hihat: 42, openhat: 46, ride: 51, rimshot: 37, tom: 50, crash: 49, cowbell: 56, shaker: 82, tambourine: 54 };
function timeSignature(meter: string) { const match = meter.match(/(\d+)\s*\/\s*(\d+)/); const numerator = Math.max(1, Math.min(32, Number(match?.[1] ?? 4))), denominator = Number(match?.[2] ?? 4); return { numerator, power: [2, 4, 8, 16].includes(denominator) ? Math.log2(denominator) : 2 }; }
export function exportSongMidi(song: DrumSong, sectionId?: string, partId?: string): Blob {
  const timeline = buildSongTimeline(song, { sectionId, partId });
  if (!timeline.bars.length) throw new Error("Choose a song section with an arranged drum part before exporting MIDI.");
  if (timeline.bars.length > 4096) throw new Error("MIDI export is limited to 4,096 bars. Export a section or shorten the arrangement first.");
  const ppqn = 480, tempoEvents: Array<{ tick: number; bytes: number[] }> = [], noteEvents: Array<{ tick: number; bytes: number[] }> = [];
  let beatCursor = 0;
  for (const bar of timeline.bars) {
    const at = Math.round(beatCursor * ppqn), micros = Math.max(1, Math.round(60000000 / bar.bpm)), signature = timeSignature(bar.meter);
    tempoEvents.push({ tick: at, bytes: [0xff, 0x51, 3, (micros >>> 16) & 255, (micros >>> 8) & 255, micros & 255] });
    tempoEvents.push({ tick: at, bytes: [0xff, 0x58, 4, signature.numerator, signature.power, 24, 8] });
    for (const hit of bar.hits) {
      const note = midiNote[hit.instrument];
      if (note === undefined) continue;
      const tick = at + Math.max(0, Math.round(hit.beat * ppqn)), velocity = Math.max(1, Math.min(127, Math.round(hit.velocity ?? (hit.accent ? 110 : hit.ghost ? 45 : 80))));
      noteEvents.push({ tick, bytes: [0x99, note, velocity] }, { tick: tick + 60, bytes: [0x89, note, 0] });
    }
    beatCursor += bar.beats;
  }
  const header = chunk("MThd", [0, 1, 0, 2, (ppqn >>> 8) & 255, ppqn & 255]);
  const tempoTrack = eventTrack(tempoEvents, "Drum Hero tempo and meter");
  const drumTrack = eventTrack(noteEvents, `Drum Hero · ${song.title}`);
  return new Blob([new Uint8Array([...header, ...tempoTrack, ...drumTrack])], { type: "audio/midi" });
}

export function midiTrackToSections(track: MidiTrack, midi: Pick<ParsedDrumMidi, "division" | "bpm" | "meter" | "sourceBpm" | "tempoClamped">, mapping: Record<number, SongInstrument | "skip">, id: () => string, title = "MIDI arrangement"): { section: SongSection; barCount: number; unmapped: number } {
  const meter = midi.meter, beats = meterBeats(meter, meterQuarterBeats(meter)), barTicks = Math.max(1, Math.round(meterQuarterBeats(meter) * midi.division));
  const requestedBars = Math.max(1, Math.ceil(Math.max(track.endTick, ...track.notes.map(note => note.tick + 1)) / barTicks));
  const barCount = Math.min(128, requestedBars);
  const subdivision = 16 as const, stepsPerBar = Math.max(1, Math.round(beats * subdivision / 4));
  const parts: DrumPart[] = Array.from({ length: barCount }, (_, barIndex) => ({ id: id(), name: `Bar ${barIndex + 1}`, bpm: midi.bpm, beats, subdivision, meter, hits: [] }));
  let unmapped = track.truncatedNotes ?? 0;
  for (const note of track.notes) {
    const instrument = mapping[note.note] ?? "skip";
    if (instrument === "skip") { unmapped++; continue; }
    const barIndex = Math.floor(note.tick / barTicks);
    if (barIndex >= parts.length) { unmapped++; continue; }
    const relative = note.tick - barIndex * barTicks;
    const step = Math.max(0, Math.min(stepsPerBar - 1, Math.round(relative / barTicks * stepsPerBar)));
    const part = parts[barIndex]!;
    const previous = part.hits.find(hit => hit.step === step && hit.instrument === instrument);
    const velocity = Math.max(previous?.velocity ?? 0, note.velocity);
    const hit: SongPartHit = { step, instrument, velocity, accent: velocity >= 100, ghost: velocity <= 45 };
    if (previous) part.hits = part.hits.map(item => item === previous ? hit : item);
    else if (part.hits.length < 256) part.hits.push(hit);
    else unmapped++;
  }
  const sizeNote = requestedBars > 128 ? " Import was capped at 128 bars." : "";
  const tempoNote = midi.tempoClamped ? ` Source tempo ${midi.sourceBpm} BPM was set to ${midi.bpm} BPM to fit Drum Hero's supported range.` : "";
  const section: SongSection = { id: id(), name: title.slice(0, 80), kind: "other", notes: `Imported from MIDI track “${track.name}”. Review the note map, 16th-note quantization, initial tempo, and meter before sharing.${tempoNote}${sizeNote}`, bpm: midi.bpm, meter, parts, clips: parts.map(part => ({ id: id(), partId: part.id, repeats: 1 })) };
  return { section, barCount, unmapped };
}
function meterQuarterBeats(meter: string) { const match = meter.match(/(\d+)\s*\/\s*(\d+)/); return Number(match?.[1] ?? 4) * 4 / Number(match?.[2] ?? 4); }
