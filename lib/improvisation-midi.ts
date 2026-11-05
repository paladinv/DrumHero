import { improvisationSoundInstrument, type ImprovisationTake } from './improvisation';

const PERCUSSION_NOTE: Record<string, number> = { kick: 36, snare: 38, hihat: 42, tom: 45, crash: 49 };
const concat = (...arrays: Uint8Array[]) => {
  const result = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of arrays) { result.set(part, offset); offset += part.length; }
  return result;
};
const ascii = (value: string) => Uint8Array.from(value, character => character.charCodeAt(0));
const u32 = (value: number) => Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
function variableLength(value: number) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7) > 0) { buffer <<= 8; buffer |= (value & 0x7f) | 0x80; }
  while (true) { bytes.push(buffer & 0xff); if (buffer & 0x80) buffer >>= 8; else break; }
  return Uint8Array.from(bytes);
}

/** Exports a take as a Standard MIDI File with a GM percussion track on channel 10. */
export function createImprovisationMidi(take: ImprovisationTake): Uint8Array {
  const ppq = 480, tempo = Math.round(60_000_000 / take.settings.bpm);
  const [numerator, denominator] = take.settings.meter.split('/').map(Number);
  const denominatorPower = denominator === 8 ? 3 : 2;
  const keySignature = { C: 0, G: 1, D: 2, F: -1, Bb: -2 }[take.settings.key];
  const keyByte = keySignature < 0 ? 256 + keySignature : keySignature;
  const meta = Uint8Array.from([0x00, 0xff, 0x51, 0x03, (tempo >>> 16) & 0xff, (tempo >>> 8) & 0xff, tempo & 0xff,
    0x00, 0xff, 0x58, 0x04, Math.max(1, Math.min(32, numerator)), denominatorPower, 24, 8,
    0x00, 0xff, 0x59, 0x02, keyByte & 0xff, 0x00]);
  const performance: Array<{ tick: number; order: number; data: number[] }> = [];
  for (const hit of take.hits) {
    const note = hit.articulation === 'open-hat' || hit.articulation === 'foot-splash' ? 46
      : hit.articulation === 'ride' ? 51
        : hit.articulation === 'rimshot' ? 37
          : PERCUSSION_NOTE[improvisationSoundInstrument(hit)];
    if (note === undefined || !Number.isFinite(hit.atMs) || hit.atMs < 0) continue;
    const tick = Math.max(0, Math.round(hit.atMs * take.settings.bpm / 60_000 * ppq));
    performance.push({ tick, order: 1, data: [0x99, note, Math.max(1, Math.min(127, hit.velocity ?? 90))] });
    performance.push({ tick: tick + 48, order: 0, data: [0x89, note, 0] });
  }
  performance.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [...meta];
  let lastTick = 0;
  for (const event of performance) {
    body.push(...variableLength(event.tick - lastTick), ...event.data);
    lastTick = event.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  const track = Uint8Array.from(body);
  return concat(ascii('MThd'), u32(6), Uint8Array.from([0, 0, 0, 1, ppq >>> 8, ppq & 0xff]), ascii('MTrk'), u32(track.length), track);
}

