import type { DrumPart, DrumSong, SongSection } from "./song-library";
import type { SongInstrument } from "./types";

export type MidiVoiceMapping = Record<number, SongInstrument | "ignore">;
export type MidiTrackVoiceMapping = Record<string, SongInstrument | "ignore">;
export type MidiImportPreview = {
  title: string;
  notes: Array<{ tick: number; note: number; velocity: number; track: number }>;
  tempos: Array<{ tick: number; bpm: number }>;
  meters: Array<{ tick: number; meter: string }>;
  tracks: Array<{ id: number; name: string; noteCount: number; pitches: Array<{ note: number; count: number }> }>;
  pitches: Array<{ note: number; count: number; defaultVoice: SongInstrument | null }>;
  ppq: number;
  lastTick: number;
};
export type MidiImportResult = { song: DrumSong; noteCount: number; ignoredNoteCount: number };

type MidiNote = MidiImportPreview["notes"][number];
type MidiTempo = MidiImportPreview["tempos"][number];
type MidiMeter = MidiImportPreview["meters"][number];

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
  const format = view.getUint16(8, false);
  if (format > 1) throw new Error("MIDI format 2 contains separate sequences and cannot be combined into one Song Builder arrangement.");
  const trackCount = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  if (division & 0x8000 || !division) throw new Error("SMPTE-based MIDI timing is not supported yet. Export the file with a musical tick resolution.");
  let offset = 8 + headerLength;
  const notes: MidiNote[] = [];
  const tempos: MidiTempo[] = [];
  const meters: MidiMeter[] = [];
  const trackNames = new Map<number, string>();
  let lastTick = 0;

  for (let track = 0; track < trackCount; track += 1) {
    if (offset + 8 > data.length || String.fromCharCode(...data.slice(offset, offset + 4)) !== "MTrk") throw new Error("The MIDI file is missing one or more track chunks.");
    const length = readU32(view, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + length;
    if (trackEnd > data.length) throw new Error("A MIDI track is incomplete.");
    offset = trackEnd;
    let cursor = trackStart;
    let tick = 0;
    let runningStatus = 0;
    while (cursor < trackEnd) {
      const delta = readVariable(data, cursor, trackEnd);
      tick += delta.value;
      lastTick = Math.max(lastTick, tick);
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
        if (type === 0x03 && size.value > 0) {
          const name = new TextDecoder().decode(data.slice(cursor, end)).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
          if (name) trackNames.set(track, name);
        } else if (type === 0x51 && size.value >= 3) {
          const micros = ((data[cursor] ?? 0) << 16) | ((data[cursor + 1] ?? 0) << 8) | (data[cursor + 2] ?? 0);
          if (micros > 0) tempos.push({ tick, bpm: Math.max(40, Math.min(200, Math.round(60_000_000 / micros))) });
        } else if (type === 0x58 && size.value >= 2) {
          const numerator = data[cursor] ?? 4;
          const exponent = data[cursor + 1] ?? 2;
          const denominator = 2 ** Math.min(5, exponent);
          const beats = numerator * 4 / denominator;
          if (numerator > 0 && numerator <= 32 && [2, 4, 8, 16].includes(denominator) && Number.isInteger(numerator * 8 / denominator) && beats <= 32) meters.push({ tick, meter: `${numerator}/${denominator}` });
          else throw new Error("This MIDI time signature cannot be represented by Song Builder's pattern grid yet.");
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
      if (command === 0x90 && second > 0) notes.push({ tick, note: first, velocity: second, track });
    }
  }
  if (!notes.length) throw new Error("No drum note events were found in that MIDI file.");
  notes.sort((left, right) => left.tick - right.tick);
  tempos.sort((left, right) => left.tick - right.tick);
  meters.sort((left, right) => left.tick - right.tick);
  return { notes, tempos, meters, lastTick, ppq: division, trackNames };
}

function identifyVoice(note: number): SongInstrument | null {
  if (note === 54) return "tambourine";
  if (note === 56) return "cowbell";
  if (note === 82) return "shaker";
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

export function previewMidiImport(buffer: ArrayBuffer, title = "Imported MIDI"): MidiImportPreview {
  const decoded = decodeMidi(buffer);
  const { trackNames, ...previewData } = decoded;
  const tracks = new Map<number, number>();
  const trackPitches = new Map<number, Map<number, number>>();
  const pitches = new Map<number, number>();
  for (const note of decoded.notes) {
    tracks.set(note.track, (tracks.get(note.track) ?? 0) + 1);
    const perTrack = trackPitches.get(note.track) ?? new Map<number, number>();
    perTrack.set(note.note, (perTrack.get(note.note) ?? 0) + 1);
    trackPitches.set(note.track, perTrack);
    pitches.set(note.note, (pitches.get(note.note) ?? 0) + 1);
  }
  return {
    ...previewData,
    title: title.trim().slice(0, 120) || "Imported MIDI",
    tracks: [...tracks].map(([id, noteCount]) => ({ id, name: trackNames.get(id) ?? `Track ${id + 1}`, noteCount, pitches: [...(trackPitches.get(id) ?? [])].sort((a, b) => a[0] - b[0]).map(([note, count]) => ({ note, count })) })),
    pitches: [...pitches].sort((a, b) => a[0] - b[0]).map(([note, count]) => ({ note, count, defaultVoice: identifyVoice(note) }))
  };
}

function meterBeats(meter: string) {
  const match = meter.match(/(\d+)\s*\/\s*(\d+)/);
  return Math.max(0.25, Number(match?.[1] ?? 4) * 4 / Number(match?.[2] ?? 4));
}

function midiBars(preview: MidiImportPreview, lastIncludedTick: number) {
  const tempos = preview.tempos.length ? preview.tempos : [{ tick: 0, bpm: 80 }];
  const meters = preview.meters.length ? preview.meters : [{ tick: 0, meter: "4/4" }];
  let tempoIndex = 0, meterIndex = 0, bpm = 80, meter = "4/4", start = 0;
  const bars: Array<{ start: number; end: number; bpm: number; meter: string; beats: number }> = [];
  do {
    while (tempoIndex < tempos.length && tempos[tempoIndex]!.tick <= start) { bpm = tempos[tempoIndex]!.bpm; tempoIndex += 1; }
    while (meterIndex < meters.length && meters[meterIndex]!.tick <= start) { meter = meters[meterIndex]!.meter; meterIndex += 1; }
    const beats = meterBeats(meter), end = start + beats * preview.ppq;
    bars.push({ start, end, bpm, meter, beats });
    start = end;
  } while (start <= lastIncludedTick && bars.length < 8192);
  if (start <= lastIncludedTick) throw new Error("That MIDI arrangement is too long to import at once. Split it into shorter files.");
  return bars;
}

export function createSongFromMidiPreview(preview: MidiImportPreview, options: { artist?: string; mapping?: MidiVoiceMapping; trackMapping?: MidiTrackVoiceMapping; excludedTracks?: number[] } = {}): MidiImportResult {
  const excluded = new Set(options.excludedTracks ?? []);
  const selectedNotes = preview.notes.filter(note => !excluded.has(note.track));
  if (!selectedNotes.length) throw new Error("Include at least one MIDI track with drum notes.");
  const mappedNotes = selectedNotes.flatMap(note => {
    const trackKey = `${note.track}:${note.note}`;
    const voice = options.trackMapping?.[trackKey] ?? options.mapping?.[note.note] ?? identifyVoice(note.note);
    return voice && voice !== "ignore" ? [{ ...note, voice }] : [];
  });
  if (!mappedNotes.length) throw new Error("Map at least one MIDI note pitch to a supported drum voice.");
  const ignoredNoteCount = preview.notes.length - mappedNotes.length;
  const lastIncludedTick = mappedNotes.reduce((latest, note) => Math.max(latest, note.tick), 0);
  const bars = midiBars(preview, lastIncludedTick);
  const subdivision = [4, 8, 12, 16, 20].reduce((best, candidate) => {
    const error = mappedNotes.reduce((sum, note) => { const step = note.tick * candidate / (preview.ppq * 4); return sum + Math.abs(step - Math.round(step)); }, 0);
    const bestError = mappedNotes.reduce((sum, note) => { const step = note.tick * best / (preview.ppq * 4); return sum + Math.abs(step - Math.round(step)); }, 0);
    return error < bestError - 0.0001 || (Math.abs(error - bestError) < 0.0001 && candidate < best) ? candidate : best;
  }, 16 as 4 | 8 | 12 | 16 | 20) as 4 | 8 | 12 | 16 | 20;
  const notesByBar: typeof mappedNotes[] = Array.from({ length: bars.length }, () => []);
  let barIndex = 0;
  for (const note of mappedNotes) {
    while (barIndex < bars.length - 1 && note.tick >= bars[barIndex]!.end) barIndex += 1;
    notesByBar[barIndex]?.push(note);
  }
  if (notesByBar.some(items => items.length > 256)) throw new Error("A MIDI measure contains more than 256 drum hits. Reduce the note density and import again.");

  const sections: SongSection[] = [];
  let importedCount = 0;
  for (let segmentStart = 0; segmentStart < bars.length;) {
    const first = bars[segmentStart]!;
    let segmentEnd = segmentStart + 1;
    while (segmentEnd < bars.length && bars[segmentEnd]!.bpm === first.bpm && bars[segmentEnd]!.meter === first.meter) segmentEnd += 1;
    const parts: DrumPart[] = [];
    const clips: NonNullable<SongSection["clips"]> = [];
    const barsPerPart = Math.max(1, Math.floor(32 / first.beats));
    for (let firstBar = segmentStart; firstBar < segmentEnd;) {
      let count = Math.min(barsPerPart, segmentEnd - firstBar);
      let noteCount = notesByBar.slice(firstBar, firstBar + count).reduce((sum, items) => sum + items.length, 0);
      while ((noteCount > 256 || (subdivision !== 20 && !Number.isInteger(first.beats * count * subdivision / 4))) && count > 1) {
        count -= 1;
        noteCount = notesByBar.slice(firstBar, firstBar + count).reduce((sum, items) => sum + items.length, 0);
      }
      if (noteCount > 256) throw new Error("A MIDI pattern contains more than 256 drum hits. Reduce the note density and import again.");
      let patternSubdivision = subdivision;
      if (patternSubdivision !== 20 && !Number.isInteger(first.beats * count * patternSubdivision / 4)) {
        const compatible = ([4, 8, 12, 16, 20] as const).filter(candidate => candidate === 20 || Number.isInteger(first.beats * count * candidate / 4));
        const patternNotes = notesByBar.slice(firstBar, firstBar + count).flatMap((items, localBar) => items.map(note => ({ note, beat: localBar * first.beats + (note.tick - bars[firstBar + localBar]!.start) / preview.ppq })));
        patternSubdivision = compatible.sort((left, right) => {
          const error = (candidate: number) => patternNotes.reduce((sum, item) => {
            const exact = item.beat * candidate / 4;
            return sum + Math.abs(exact - Math.round(exact)) * 4 / candidate;
          }, 0);
          return error(left) - error(right) || right - left;
        })[0] ?? 16;
      }
      const beats = first.beats * count;
      const stepCount = Math.ceil(beats * patternSubdivision / 4);
      const hits = notesByBar.slice(firstBar, firstBar + count).flatMap((items, localBar) => items.map(note => {
        const beat = localBar * first.beats + (note.tick - bars[firstBar + localBar]!.start) / preview.ppq;
        const step = Math.round(beat * patternSubdivision / 4);
        importedCount += 1;
        return { step: Math.max(0, Math.min(stepCount - 1, step)), instrument: note.voice, accent: note.velocity >= 108, velocity: note.velocity, ghost: note.velocity <= 40 };
      }));
      const part: DrumPart = { id: crypto.randomUUID(), name: `MIDI bars ${firstBar + 1}–${firstBar + count}`, bpm: first.bpm, beats, subdivision: patternSubdivision, meter: first.meter, hits };
      parts.push(part);
      clips.push({ id: crypto.randomUUID(), partId: part.id, repeats: 1 });
      firstBar += count;
    }
    const last = segmentEnd;
    const section: SongSection = {
      id: crypto.randomUUID(), name: sections.length ? `MIDI ${sections.length + 1} · ${first.meter} · ${first.bpm} BPM` : `Imported · ${first.meter} · ${first.bpm} BPM`,
      kind: "other", notes: `MIDI bars ${segmentStart + 1}–${last}. Tempo and meter changes are applied at the next measure boundary.`, parts, clips,
      bpm: first.bpm, meter: first.meter
    };
    sections.push(section);
    if (sections.length > 32 || sections.reduce((sum, item) => sum + item.parts.length, 0) > 256) throw new Error("This MIDI file has too many tempo or meter sections to import as one song.");
    segmentStart = segmentEnd;
  }
  if (!importedCount) throw new Error("The MIDI notes could not be placed in Song Builder patterns.");
  const baseBpm = sections[0]?.bpm ?? 80, baseMeter = sections[0]?.meter ?? "4/4", now = new Date().toISOString();
  const tempoChanges = [...new Set(sections.map(section => section.bpm))].length;
  const meterChanges = [...new Set(sections.map(section => section.meter))].length;
  const song: DrumSong = {
    id: crypto.randomUUID(), title: preview.title, artist: options.artist?.trim().slice(0, 120) || "MIDI import",
    difficulty: "Intermediate", bpm: baseBpm, meter: baseMeter, tags: ["midi import"],
    notes: `Imported with ${preview.ppq} ticks per quarter note. ${tempoChanges} tempo value(s), ${meterChanges} meter value(s); events take effect at the next measure boundary.`,
    sections, createdAt: now, updatedAt: now
  };
  return { song, noteCount: importedCount, ignoredNoteCount };
}

export function importMidiSong(buffer: ArrayBuffer, title = "Imported MIDI", artist = "MIDI import", mapping?: MidiVoiceMapping, excludedTracks?: number[]): MidiImportResult {
  return createSongFromMidiPreview(previewMidiImport(buffer, title), { artist, mapping, excludedTracks });
}
