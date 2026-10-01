import type { DrumPart, DrumSong, SongSection } from "./song-library";
import type { SongInstrument } from "./types";

export type MidiImportResult = { song: DrumSong; noteCount: number; ignoredNoteCount: number };

type MidiNote = { tick: number; note: number; velocity: number };
type MidiTempo = { tick: number; bpm: number };

function readU32(view: DataView, at: number) {
  return view.getUint32(at, false);
}

function readVariable(data: Uint8Array, start: number, end: number) {
  let value = 0;
  let offset = start;
  while (offset < end) {
    const byte = data[offset++] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return { value, offset };
  }
  throw new Error("The MIDI file contains an incomplete event.");
}

function decodeMidi(buffer: ArrayBuffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (data.length < 14 || String.fromCharCode(...data.slice(0, 4)) !== "MThd") throw new Error("Choose a valid Standard MIDI file (.mid or .midi).");
  const headerLength = readU32(view, 4);
  if (headerLength < 6 || 8 + headerLength > data.length) throw new Error("The MIDI header is incomplete.");
  const trackCount = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  if (division & 0x8000 || !division) throw new Error("SMPTE-based MIDI timing is not supported yet. Export the file with a musical tick resolution.");
  let offset = 8 + headerLength;
  const notes: MidiNote[] = [];
  const tempos: MidiTempo[] = [];
  let meter = "4/4";
  let meterSeen = false;

  for (let track = 0; track < trackCount; track += 1) {
    if (offset + 8 > data.length || String.fromCharCode(...data.slice(offset, offset + 4)) !== "MTrk") break;
    const length = readU32(view, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = Math.min(data.length, trackStart + length);
    offset = trackEnd;
    let cursor = trackStart;
    let tick = 0;
    let runningStatus = 0;
    while (cursor < trackEnd) {
      const delta = readVariable(data, cursor, trackEnd);
      tick += delta.value;
      cursor = delta.offset;
      let status = data[cursor] ?? 0;
      if (status & 0x80) {
        cursor += 1;
        if (status < 0xf0) runningStatus = status;
      } else {
        if (!runningStatus) throw new Error("The MIDI track uses running status without an initial event.");
        status = runningStatus;
      }

      if (status === 0xff) {
        const type = data[cursor++] ?? 0;
        const size = readVariable(data, cursor, trackEnd);
        cursor = size.offset;
        const end = Math.min(trackEnd, cursor + size.value);
        if (type === 0x51 && size.value >= 3) {
          const micros = ((data[cursor] ?? 0) << 16) | ((data[cursor + 1] ?? 0) << 8) | (data[cursor + 2] ?? 0);
          if (micros > 0) tempos.push({ tick, bpm: Math.max(40, Math.min(200, Math.round(60_000_000 / micros))) });
        } else if (type === 0x58 && size.value >= 2 && !meterSeen) {
          const numerator = data[cursor] ?? 4;
          const exponent = data[cursor + 1] ?? 2;
          const denominator = 2 ** Math.min(5, exponent);
          if (numerator > 0 && [2, 4, 8, 16].includes(denominator)) { meter = `${numerator}/${denominator}`; meterSeen = true; }
        }
        cursor = end;
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const size = readVariable(data, cursor, trackEnd);
        cursor = Math.min(trackEnd, size.offset + size.value);
        continue;
      }

      const command = status & 0xf0;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      const first = data[cursor++] ?? 0;
      const second = dataLength === 2 ? data[cursor++] ?? 0 : 0;
      if (command === 0x90 && second > 0) notes.push({ tick, note: first, velocity: second });
    }
  }
  if (!notes.length) throw new Error("No drum note events were found in that MIDI file.");
  notes.sort((left, right) => left.tick - right.tick);
  tempos.sort((left, right) => left.tick - right.tick);
  return { notes, bpm: tempos[0]?.bpm ?? 80, meter, ppq: division };
}

function identifyVoice(note: number): SongInstrument | null {
  if (note === 35 || note === 36) return "kick";
  if (note === 37) return "rimshot";
  if (note === 38 || note === 40) return "snare";
  if (note === 42 || note === 44) return "hihat";
  if (note === 46) return "openhat";
  if ([41, 43, 45, 47, 48, 50].includes(note)) return "tom";
  if ([49, 52, 55, 57].includes(note)) return "crash";
  if ([51, 53, 59].includes(note)) return "ride";
  return null;
}

function chooseSubdivision(ticks: number[], ppq: number): 4 | 8 | 12 | 16 {
  const candidates = [4, 8, 12, 16] as const;
  return candidates.reduce((best, subdivision) => {
    const error = ticks.reduce((sum, tick) => {
      const step = tick * subdivision / (ppq * 4);
      return sum + Math.abs(step - Math.round(step));
    }, 0);
    const bestError = ticks.reduce((sum, tick) => {
      const step = tick * best / (ppq * 4);
      return sum + Math.abs(step - Math.round(step));
    }, 0);
    return error < bestError - 0.0001 || (Math.abs(error - bestError) < 0.0001 && subdivision < best) ? subdivision : best;
  }, 16);
}

export function importMidiSong(buffer: ArrayBuffer, title = "Imported MIDI", artist = "MIDI import"): MidiImportResult {
  const midi = decodeMidi(buffer);
  const signature = midi.meter.match(/(\d+)\s*\/\s*(\d+)/);
  const numerator = Number(signature?.[1] ?? 4);
  const denominator = Number(signature?.[2] ?? 4);
  const measureBeats = numerator * 4 / denominator;
  if (!Number.isFinite(measureBeats) || measureBeats > 32) throw new Error("This time signature is longer than Song Builder can represent in one pattern.");
  const subdivision = chooseSubdivision(midi.notes.map((item) => item.tick), midi.ppq);
  const stepPerMeasure = measureBeats * subdivision / 4;
  let groupingBars = 1;
  while (!Number.isInteger(stepPerMeasure * groupingBars) && groupingBars < 16) groupingBars += 1;
  const mappedNotes = midi.notes.flatMap((item) => {
    const voice = identifyVoice(item.note);
    return voice ? [{ ...item, voice }] : [];
  });
  const ignoredCount = midi.notes.length - mappedNotes.length;
  const lastBeat = midi.notes.at(-1)!.tick / midi.ppq;
  const requiredBars = Math.floor(lastBeat / measureBeats + 0.0000001) + 1;
  const bars = Math.max(groupingBars, Math.ceil(requiredBars / groupingBars) * groupingBars);
  const barsPerGroup = Math.floor(32 / (measureBeats * groupingBars)) * groupingBars;
  if (barsPerGroup < groupingBars) throw new Error("This time signature is too short to group into a Song Builder pattern.");
  if (bars > barsPerGroup * 256) throw new Error("That MIDI arrangement is too long for one Song Builder song. Split it into shorter files and import the sections separately.");
  const notesByBar: typeof mappedNotes[] = Array.from({ length: bars }, () => []);
  mappedNotes.forEach((item) => {
    const bar = Math.floor((item.tick / midi.ppq) / measureBeats + 0.0000001);
    if (bar >= 0 && bar < bars) notesByBar[bar]?.push(item);
  });
  if (notesByBar.some((items) => items.length > 256)) throw new Error("A MIDI measure contains more than 256 drum hits. Reduce the note density and import again.");

  const parts: DrumPart[] = [];
  const clips: Array<{ id: string; partId: string; repeats: number }> = [];
  let importedCount = 0;

  for (let firstBar = 0; firstBar < bars && parts.length < 256;) {
    let count = groupingBars;
    let hitCount = notesByBar.slice(firstBar, firstBar + count).reduce((sum, items) => sum + items.length, 0);
    if (hitCount > 256) throw new Error("A minimum duration MIDI pattern contains more than 256 drum hits. Reduce the note density and import again.");
    while (firstBar + count < bars && count + groupingBars <= barsPerGroup) {
      const nextCount = count + groupingBars;
      const nextHitCount = hitCount + notesByBar.slice(firstBar + count, firstBar + nextCount).reduce((sum, items) => sum + items.length, 0);
      if (nextHitCount > 256) break;
      count = nextCount;
      hitCount = nextHitCount;
    }
    const beats = count * measureBeats;
    const stepCount = Math.round(beats * subdivision / 4);
    const hits = notesByBar.slice(firstBar, firstBar + count).flatMap((items) => items).flatMap((item) => {
      const beat = item.tick / midi.ppq - firstBar * measureBeats;
      const step = Math.round(beat * subdivision / 4);
      if (step < 0 || step >= stepCount) return [];
      importedCount += 1;
      return [{ step, instrument: item.voice, accent: item.velocity >= 108, velocity: item.velocity, ghost: item.velocity <= 40 }];
    });
    const part: DrumPart = { id: crypto.randomUUID(), name: `MIDI bars ${firstBar + 1}–${firstBar + count}`, bpm: midi.bpm, beats, subdivision, meter: midi.meter, hits };
    parts.push(part);
    clips.push({ id: crypto.randomUUID(), partId: part.id, repeats: 1 });
    firstBar += count;
  }
  if (!importedCount) throw new Error("The MIDI notes did not match any supported General MIDI drum voices.");
  const now = new Date().toISOString();
  const section: SongSection = { id: crypto.randomUUID(), name: "Imported arrangement", kind: "other", notes: `Imported ${importedCount} drum hits from MIDI. Unrecognized pitches were skipped.`, parts, clips, bpm: midi.bpm, meter: midi.meter };
  const song: DrumSong = {
    id: crypto.randomUUID(), title: title.trim().slice(0, 120) || "Imported MIDI", artist: artist.trim().slice(0, 120) || "MIDI import",
    difficulty: "Intermediate", bpm: midi.bpm, meter: midi.meter, tags: ["midi import"], notes: `Imported with ${midi.ppq} ticks per quarter note.`, sections: [section], createdAt: now, updatedAt: now
  };
  return { song, noteCount: importedCount, ignoredNoteCount: ignoredCount };
}
