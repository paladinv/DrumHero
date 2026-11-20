import { createCustomGrooveId } from "./custom-grooves";
import { previewMidiImport, type MidiImportPreview } from "./song-builder-import";
import type { Groove, Instrument, PracticePattern } from "./types";

const TRAINER_VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const DEFAULT_NOTE_MAP: Record<number, Instrument | null> = {
  35: "kick", 36: "kick", 38: "snare", 40: "snare", 37: "snare",
  42: "hihat", 44: "hihat", 46: "hihat", 41: "tom", 43: "tom", 45: "tom",
  47: "tom", 48: "tom", 50: "tom", 49: "crash", 52: "crash", 55: "crash", 57: "crash",
};

function trainerVoice(value: unknown): Instrument | null {
  return TRAINER_VOICES.includes(value as Instrument) ? value as Instrument : null;
}

function meterInfo(meter: string) {
  const match = meter.match(/(\d+)\s*\/\s*(\d+)/);
  const numerator = Number(match?.[1] ?? 4);
  const denominator = Number(match?.[2] ?? 4);
  if (numerator < 1 || numerator > 32 || ![2, 4, 8, 16].includes(denominator)) {
    throw new Error("This MIDI time signature cannot be represented in a Trainer groove.");
  }
  return { meter: `${numerator}/${denominator}`, quarterNotesPerBar: numerator * 4 / denominator };
}

export function trainerMidiPreview(buffer: ArrayBuffer, title: string): MidiImportPreview {
  if (buffer.byteLength > 2_000_000) throw new Error("Trainer MIDI files must be smaller than 2 MB.");
  return previewMidiImport(buffer, title);
}

export function createTrainerPatternFromMidi(preview: MidiImportPreview, options: {
  name: string;
  mapping: Record<number, Instrument | null>;
  level?: Groove["level"];
}): Groove {
  if (preview.notes.length > 20_000) throw new Error("This file has too many note events for a Trainer groove.");
  const meterValues = [...new Set(preview.meters.map(item => item.meter))];
  const tempoValues = [...new Set(preview.tempos.map(item => item.bpm))];
  if (meterValues.length > 1 || tempoValues.length > 1) {
    throw new Error("Trainer grooves use one time signature and tempo. Simplify MIDI files with tempo or meter changes before importing.");
  }
  const meter = meterInfo(meterValues[0] ?? "4/4");
  const bpm = Math.max(40, Math.min(200, Math.round(preview.tempos[0]?.bpm ?? 80)));
  const mapped = preview.notes.flatMap(note => {
    const voice = options.mapping[note.note] === undefined
      ? trainerVoice(DEFAULT_NOTE_MAP[note.note])
      : trainerVoice(options.mapping[note.note]);
    return voice ? [{ ...note, voice }] : [];
  });
  if (!mapped.length) throw new Error("Map at least one MIDI pitch to kick, snare, hi-hat, tom, or crash.");

  const validSubdivisions = ([4, 8, 12, 16] as const).filter(value => Number.isInteger(meter.quarterNotesPerBar * value / 4));
  const subdivision = validSubdivisions.reduce((best, candidate) => {
    const quantizationError = (value: number) => mapped.reduce((sum, note) => {
      const exact = note.tick * value / (preview.ppq * 4);
      return sum + Math.abs(exact - Math.round(exact));
    }, 0);
    const difference = quantizationError(candidate) - quantizationError(best);
    return difference < -0.0001 || (Math.abs(difference) <= 0.0001 && candidate < best) ? candidate : best;
  }, validSubdivisions[0] ?? 16);
  const lastNoteTick = mapped.reduce((latest, note) => Math.max(latest, note.tick), 0);
  const barCount = Math.max(1, Math.ceil(lastNoteTick / (preview.ppq * meter.quarterNotesPerBar)));
  const beats = barCount * meter.quarterNotesPerBar;
  const stepCount = Math.round(beats * subdivision / 4);
  if (stepCount > 512) throw new Error("This MIDI pattern is too long for the Trainer grid. Split it into shorter grooves.");
  const hits = mapped.map(note => {
    const step = Math.round(note.tick * subdivision / (preview.ppq * 4));
    return { step: Math.max(0, Math.min(stepCount - 1, step)), instrument: note.voice, accent: note.velocity >= 108, velocityTarget: note.velocity };
  });
  if (hits.length > 256) throw new Error("This MIDI pattern has more than 256 mapped hits. Split it into shorter grooves.");
  const name = options.name.trim().slice(0, 60);
  if (!name) throw new Error("Give the imported Trainer pattern a name.");
  const low = Math.max(40, bpm - 25), high = Math.min(200, bpm + 35);
  return {
    id: createCustomGrooveId(), name, level: options.level ?? "Intermediate",
    description: `Imported from MIDI · ${barCount} bar${barCount === 1 ? "" : "s"} · ${hits.length} mapped hits. Review the voice mapping and grid before practising.`,
    subdivision, beats, defaultBpm: bpm, tempoRange: [low, Math.max(low, high)], hits,
    style: "MIDI import", focus: "Imported drum pattern", meter: meter.meter,
    tags: ["midi import", `${subdivision === 4 ? "quarter" : subdivision === 8 ? "eighth" : subdivision === 12 ? "triplet" : "sixteenth"}-note grid`],
  };
}

function variableLength(value: number) {
  let current = Math.max(0, Math.floor(value));
  const bytes = [current & 0x7f];
  while ((current >>= 7) > 0) bytes.unshift((current & 0x7f) | 0x80);
  return bytes;
}

function uint32(value: number) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export function trainerPatternMidi(pattern: PracticePattern, bpm: number) {
  const noteFor: Record<Instrument, number> = { kick: 36, snare: 38, hihat: 42, tom: 50, crash: 49 };
  const safeBpm = Math.max(40, Math.min(220, Math.round(bpm)));
  const micros = Math.round(60_000_000 / safeBpm);
  const signature = "meter" in pattern && typeof pattern.meter === "string" ? meterInfo(pattern.meter).meter : "4/4";
  const [numeratorText, denominatorText] = signature.split("/");
  const numerator = Number(numeratorText) || 4;
  const denominator = Number(denominatorText) || 4;
  const exponent = Math.max(0, Math.round(Math.log2(denominator)));
  const encoder = new TextEncoder();
  const title = [...encoder.encode(pattern.name.slice(0, 100))];
  const events: Array<{ tick: number; priority: number; bytes: number[] }> = [];
  pattern.hits.forEach(hit => {
    const tick = Math.max(0, Math.round(hit.step * 480 * 4 / pattern.subdivision));
    const velocity = Math.max(1, Math.min(127, Math.round(hit.velocityTarget ?? (hit.accent ? 112 : 86))));
    const duration = Math.max(1, Math.round(480 * 4 / pattern.subdivision * 0.45));
    events.push({ tick, priority: 1, bytes: [0x99, noteFor[hit.instrument], velocity] });
    events.push({ tick: tick + duration, priority: 0, bytes: [0x89, noteFor[hit.instrument], 0] });
  });
  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  const track: number[] = [
    0, 0xff, 0x03, ...variableLength(title.length), ...title,
    0, 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff,
    0, 0xff, 0x58, 0x04, numerator & 0xff, exponent, 24, 8,
  ];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  track.push(0, 0xff, 0x2f, 0);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0];
  const file = [...header, 0x4d, 0x54, 0x72, 0x6b, ...uint32(track.length), ...track];
  return new Blob([new Uint8Array(file)], { type: "audio/midi" });
}

function xmlEscape(value: string) {
  return value.replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
}

/** Export the Trainer's active score as a percussion MusicXML part. */
export function trainerPatternMusicXml(pattern: PracticePattern, bpm: number) {
  const meter = meterInfo("meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "4/4");
  const [numeratorText, denominatorText] = meter.meter.split("/");
  const numerator = Number(numeratorText), denominator = Number(denominatorText);
  const beatsPerBar = meter.quarterNotesPerBar;
  const stepsPerBar = Math.max(1, Math.round(beatsPerBar * pattern.subdivision / 4));
  const bars = Math.max(1, Math.ceil(pattern.beats / beatsPerBar));
  const divisions = 60;
  const stepDuration = Math.round(divisions * 4 / pattern.subdivision);
  const safeBpm = Math.max(40, Math.min(220, Math.round(bpm)));
  const notes: Record<Instrument, { gm: number; step: string; octave: number; label: string }> = {
    kick: { gm: 36, step: "C", octave: 3, label: "Bass Drum" },
    snare: { gm: 38, step: "E", octave: 4, label: "Acoustic Snare" },
    hihat: { gm: 42, step: "G", octave: 5, label: "Closed Hi-Hat" },
    tom: { gm: 50, step: "A", octave: 4, label: "High Tom" },
    crash: { gm: 49, step: "F", octave: 5, label: "Crash Cymbal 1" },
  };
  const usedVoices = [...new Set(pattern.hits.map(hit => hit.instrument))];
  const instrumentId = (voice: Instrument) => `P1-I${usedVoices.indexOf(voice) + 1}`;
  const scoreInstruments = usedVoices.map(voice => `<score-instrument id="${instrumentId(voice)}"><instrument-name>${notes[voice].label}</instrument-name></score-instrument><midi-instrument id="${instrumentId(voice)}"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>${notes[voice].gm + 1}</midi-unpitched></midi-instrument>`).join("");
  const noteType = pattern.subdivision === 4 ? "quarter" : pattern.subdivision === 8 || pattern.subdivision === 12 ? "eighth" : "16th";
  const timeModification = pattern.subdivision === 12
    ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>"
    : pattern.subdivision === 20
      ? "<time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification>"
      : "";
  const hitByStep = new Map<number, typeof pattern.hits>();
  for (const hit of pattern.hits) hitByStep.set(hit.step, [...(hitByStep.get(hit.step) ?? []), hit]);
  const measureXml = Array.from({ length: bars }, (_, bar) => {
    const body = Array.from({ length: stepsPerBar }, (_, localStep) => {
      const step = bar * stepsPerBar + localStep;
      const group = (hitByStep.get(step) ?? []).filter(hit => usedVoices.includes(hit.instrument));
      if (!group.length) return `<note><rest/><duration>${stepDuration}</duration><voice>1</voice><type>${noteType}</type>${timeModification}</note>`;
      return group.map((hit, index) => {
        const note = notes[hit.instrument];
        const accents = hit.accent ? "<articulations><accent/></articulations>" : "";
        const sticking = hit.sticking ? `<technical><other-technical>${hit.sticking}</other-technical></technical>` : "";
        const articulation = hit.articulation ? `<other-notation type="single">${xmlEscape(hit.articulation)}</other-notation>` : "";
        const articulationText = hit.midiArticulationTarget ? `<other-notation type="single">${xmlEscape(hit.midiArticulationTarget.replaceAll("-", " "))}</other-notation>` : "";
        const notations = accents || sticking || articulation || articulationText
          ? `<notations>${accents}${sticking}${articulation}${articulationText}</notations>` : "";
        return `<note>${index ? "<chord/>" : ""}<unpitched><display-step>${note.step}</display-step><display-octave>${note.octave}</display-octave></unpitched><instrument id="${instrumentId(hit.instrument)}"/><duration>${stepDuration}</duration><voice>1</voice><type>${noteType}</type>${timeModification}<stem>${hit.instrument === "kick" || hit.instrument === "snare" || hit.instrument === "tom" ? "down" : "up"}</stem>${notations}</note>`;
      }).join("");
    }).join("");
    const attributes = `<attributes><divisions>${divisions}</divisions><time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>`;
    const direction = `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${safeBpm}</per-minute></metronome></direction-type><sound tempo="${safeBpm}"/></direction>`;
    return `<measure number="${bar + 1}">${bar === 0 ? attributes + direction : ""}${body}</measure>`;
  }).join("");
  const partList = `<part-list><score-part id="P1"><part-name>Drum Set</part-name>${scoreInstruments}</score-part></part-list>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(pattern.name)}</work-title></work><identification><creator type="composer">Drum Hero Trainer</creator></identification>${partList}<part id="P1">${measureXml}</part></score-partwise>`;
  return new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });
}
