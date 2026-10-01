import type { SongInstrument } from "./types";
import { DEFAULT_DRUM_MIX, type DrumMixSettings } from "./audio";
import type { DrumSong } from "./song-library";
import type { ArrangementBar } from "./song-builder";

export type NotationView = "tab" | "staff";
export const BARS_PER_SHEET_PAGE = 6;
export const SHEET_WIDTH = 1100;
export const SHEET_HEIGHT = 850;

const ink = "#20211e";
const muted = "#6e6d67";
const coral = "#e85348";
const voiceY: Record<SongInstrument, number> = { crash: -49, ride: -65, openhat: -33, hihat: -17, tom: 0, rimshot: 33, snare: 17, kick: 49 };

export function drawNotationPage(song: DrumSong, bars: ArrangementBar[], view: NotationView, pageIndex: number, cursor?: { barIndex: number; fraction: number } | null) {
  const canvas = document.createElement("canvas");
  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the notation image.");
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = ink;
  context.font = "700 36px Arial, sans-serif";
  context.fillText(song.title || "Untitled Song", 54, 66, 780);
  context.font = "18px Arial, sans-serif";
  context.fillStyle = muted;
  context.fillText(`${song.artist || "Drum Hero"}   ·   ${song.bpm} BPM   ·   ${song.meter}`, 56, 98, 850);
  context.font = "700 14px Arial, sans-serif";
  context.fillStyle = coral;
  context.fillText(view === "tab" ? "DRUM TAB" : "PERCUSSION STAFF", 56, 132);
  context.textAlign = "right";
  context.fillStyle = muted;
  context.font = "13px Arial, sans-serif";
  context.fillText(`Page ${pageIndex + 1}`, SHEET_WIDTH - 54, 132);
  context.textAlign = "left";

  const pageBars = bars.slice(pageIndex * BARS_PER_SHEET_PAGE, (pageIndex + 1) * BARS_PER_SHEET_PAGE);
  const left = 130;
  const right = SHEET_WIDTH - 42;
  const width = (right - left) / Math.max(1, pageBars.length);
  const top = view === "tab" ? 188 : 190;
  const bottom = view === "tab" ? 706 : 630;
  const names: SongInstrument[] = ["crash", "ride", "openhat", "hihat", "tom", "rimshot", "snare", "kick"];
  context.strokeStyle = "#d7d1c7";
  context.fillStyle = ink;
  context.lineWidth = 1;

  for (let barOffset = 0; barOffset < pageBars.length; barOffset += 1) {
    const bar = pageBars[barOffset];
    const x = left + barOffset * width;
    context.fillStyle = coral;
    context.font = "700 14px Arial, sans-serif";
    const sectionLabel = [bar.marker, bar.endingPass ? `Ending ${bar.endingPass}` : "", bar.sectionName].filter(Boolean).join(" · ").toUpperCase();
    context.fillText(sectionLabel, x + 8, 166, Math.max(30, width - 16));
    context.fillStyle = ink;
    context.font = "700 16px Arial, sans-serif";
    context.fillText(`${bar.number}`, x + 8, 185);
    context.font = "12px Arial, sans-serif";
    context.fillStyle = muted;
    context.fillText(`${bar.meter} · ${bar.bpm} BPM`, x + width - 93, 185, 88);
    context.strokeStyle = "#bdb7ad";
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();

    if (view === "tab") {
      const rowGap = 61;
      names.forEach((voice, row) => {
        const y = 225 + row * rowGap;
        context.strokeStyle = "#ded8ce";
        context.beginPath();
        context.moveTo(x, y + 21);
        context.lineTo(x + width, y + 21);
        context.stroke();
        for (let beat = 1; beat < bar.beats; beat += 1) {
          const beatX = x + 14 + beat / bar.measureBeats * Math.max(1, width - 28);
          context.strokeStyle = "#ece7df";
          context.beginPath();
          context.moveTo(beatX, y - 5);
          context.lineTo(beatX, y + 27);
          context.stroke();
        }
        context.fillStyle = muted;
        context.font = "700 12px Arial, sans-serif";
        if (barOffset === 0) context.fillText(VOICE_NAMES[voice], 50, y + 25, 75);
        bar.hits.filter((hit) => hit.instrument === voice).forEach((hit) => {
          const hitX = x + 14 + hit.fraction * Math.max(1, width - 28);
          context.fillStyle = hit.accent ? coral : ink;
          context.beginPath();
          context.arc(hitX, y + 21, Math.max(4, Math.min(9, hit.velocity / 15)), 0, Math.PI * 2);
          if (hit.ghost) context.stroke();
          else context.fill();
          if (hit.accent) {
            context.font = "700 13px Arial, sans-serif";
            context.fillText(">", hitX - 4, y - 1);
          }
          if (hit.articulation && hit.articulation !== "normal") {
            const label = hit.articulation === "flam" ? "fl" : hit.articulation === "drag" ? "dr" : hit.articulation === "buzz" ? "z" : "FS";
            context.font = "700 10px Arial, sans-serif";
            context.fillStyle = coral;
            context.fillText(label, hitX - 5, y + 8);
          }
        });
      });
    } else {
      const centerY = 408;
      const staffTop = centerY - 40;
      for (let line = 0; line < 5; line += 1) {
        const y = staffTop + line * 20;
        context.strokeStyle = ink;
        context.lineWidth = line === 0 || line === 4 ? 1.5 : 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + width, y);
        context.stroke();
      }
      if (barOffset === 0) {
        context.fillStyle = ink;
        context.font = "30px Georgia, serif";
        context.fillText("𝄥", 63, centerY + 14);
      }
      bar.hits.forEach((hit) => {
        const hitX = x + 14 + hit.fraction * Math.max(1, width - 28);
        const hitY = centerY + voiceY[hit.instrument];
        context.strokeStyle = ink;
        context.fillStyle = ink;
        if (hit.instrument === "hihat" || hit.instrument === "openhat" || hit.instrument === "crash" || hit.instrument === "ride") {
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(hitX - 7, hitY - 7);
          context.lineTo(hitX + 7, hitY + 7);
          context.moveTo(hitX + 7, hitY - 7);
          context.lineTo(hitX - 7, hitY + 7);
          context.stroke();
        } else {
          context.beginPath();
          context.ellipse(hitX, hitY, 8, 5.5, -0.25, 0, Math.PI * 2);
          context.fill();
          context.lineWidth = 1.6;
          context.beginPath();
          context.moveTo(hitX + 7, hitY);
          context.lineTo(hitX + 7, hitY - 34);
          context.stroke();
        }
        if (hit.accent) {
          context.font = "700 18px Arial, sans-serif";
          context.fillText(">", hitX - 5, hitY - 13);
        }
        if (hit.articulation && hit.articulation !== "normal") {
          const label = hit.articulation === "flam" ? "fl" : hit.articulation === "drag" ? "dr" : hit.articulation === "buzz" ? "z" : "FS";
          context.font = "700 11px Arial, sans-serif";
          context.fillStyle = coral;
          context.fillText(label, hitX - 5, hitY + 19);
        }
      });
      context.fillStyle = muted;
      context.font = "13px Arial, sans-serif";
        context.fillText("Percussion staff: cymbals use cross noteheads; dynamics show velocity and accents.", 56, 688, 960);
    }
  }

  context.strokeStyle = ink;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(right, top);
  context.lineTo(right, bottom);
  context.stroke();
  if (cursor && cursor.barIndex >= pageIndex * BARS_PER_SHEET_PAGE && cursor.barIndex < (pageIndex + 1) * BARS_PER_SHEET_PAGE) {
    const localBar = cursor.barIndex - pageIndex * BARS_PER_SHEET_PAGE;
    const x = left + localBar * width + 14 + cursor.fraction * Math.max(1, width - 28);
    context.save();
    context.strokeStyle = coral;
    context.lineWidth = 3;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(x, top - 4);
    context.lineTo(x, bottom + 4);
    context.stroke();
    context.restore();
  }
  context.fillStyle = muted;
  context.font = "13px Arial, sans-serif";
  context.fillText("● hit   ○ ghost note   > accent   fl flam   dr drag   z buzz roll   FS foot splash   · beat lines divide quarter-note pulses", 56, 758, 990);
  context.fillText("Drum Hero Song Builder", 56, 810);
  return canvas;
}

const VOICE_NAMES: Record<SongInstrument, string> = { kick: "KICK", snare: "SNARE", hihat: "HI-HAT", openhat: "OPEN HAT", ride: "RIDE", rimshot: "RIMSHOT", tom: "TOM", crash: "CRASH" };

export function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PNG image.")), "image/png"));
}

export function canvasesPdf(canvases: HTMLCanvasElement[]) {
  if (!canvases.length) throw new Error("There is no notation to export yet.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const append = (chunk: Uint8Array) => { chunks.push(chunk); length += chunk.length; };
  const text = (value: string) => append(new TextEncoder().encode(value));
  const offsets: number[] = [0];
  const objectCount = 2 + canvases.length * 3;
  text("%PDF-1.4\n");
  const object = (index: number, body: () => void) => {
    offsets[index] = length;
    text(`${index} 0 obj\n`);
    body();
    text("\nendobj\n");
  };

  object(1, () => text(`<< /Type /Catalog /Pages 2 0 R >>`));
  const pageRefs = canvases.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  object(2, () => text(`<< /Type /Pages /Count ${canvases.length} /Kids [${pageRefs}] >>`));
  canvases.forEach((canvas, index) => {
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    const data = canvas.toDataURL("image/jpeg", 0.94).split(",")[1];
    if (!data) throw new Error("Could not encode a PDF page.");
    const jpeg = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    object(pageObject, () => text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`));
    const content = new TextEncoder().encode("q\n792 0 0 612 0 0 cm\n/Im0 Do\nQ\n");
    object(contentObject, () => { text(`<< /Length ${content.length} >>\nstream\n`); append(content); text("endstream"); });
    object(imageObject, () => { text(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); append(jpeg); text("\nendstream"); });
  });
  const xrefOffset = length;
  text(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objectCount; index += 1) text(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  const buffers = chunks.map((chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
  return new Blob(buffers, { type: "application/pdf" });
}

const midiNotes: Record<SongInstrument, number> = { kick: 36, rimshot: 37, snare: 38, hihat: 42, openhat: 46, tom: 50, crash: 49, ride: 51 };

function variableLength(value: number) {
  let buffer = Math.max(0, Math.floor(value)) & 0x7f;
  const output: number[] = [];
  while ((value = Math.floor(value / 128)) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    output.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return output;
}

function uint32(value: number) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export function arrangementMidi(bars: ArrangementBar[], title: string, noteMap: Record<SongInstrument, number> = midiNotes) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  const events: { tick: number; priority: number; bytes: number[] }[] = [];
  let absoluteBeat = 0;
  let previousBpm = 0;
  let previousMeter = "";
  bars.forEach((bar) => {
    const barTick = Math.round(absoluteBeat * 480);
    if (bar.bpm !== previousBpm) {
      const micros = Math.round(60_000_000 / bar.bpm);
      events.push({ tick: barTick, priority: -3, bytes: [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff] });
      previousBpm = bar.bpm;
    }
    if (bar.meter !== previousMeter) {
      const match = bar.meter.match(/(\d+)\s*\/\s*(\d+)/);
      const numerator = Number(match?.[1] ?? 4);
      const denominator = Number(match?.[2] ?? 4);
      const exponent = Math.max(0, Math.round(Math.log2(denominator)));
      events.push({ tick: barTick, priority: -2, bytes: [0xff, 0x58, 0x04, numerator & 0xff, exponent, 24, 8] });
      previousMeter = bar.meter;
    }
    const markerText = [bar.marker, bar.endingPass ? `Ending ${bar.endingPass}` : ""].filter(Boolean).join(" · ");
    if (markerText) {
      const markerBytes = [...new TextEncoder().encode(markerText.slice(0, 100))];
      events.push({ tick: barTick, priority: -1, bytes: [0xff, 0x06, ...variableLength(markerBytes.length), ...markerBytes] });
    }
    for (const hit of bar.hits) {
      const at = barTick + Math.max(0, Math.round(hit.beat * 480));
      const duration = Math.max(1, Math.round((480 * 4 / bar.subdivision) * 0.55));
      const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity)));
      const note = hit.articulation === "foot-splash" ? 44 : noteMap[hit.instrument] ?? midiNotes[hit.instrument];
      const grace = Math.max(1, Math.round(bar.bpm * 0.02 * 8));
      const strikes = hit.articulation === "flam" ? [[Math.max(barTick, at - grace), Math.round(velocity * 0.48)], [at, velocity]]
        : hit.articulation === "drag" ? [[Math.max(barTick, at - grace * 2), Math.round(velocity * 0.35)], [Math.max(barTick, at - grace), Math.round(velocity * 0.55)], [at, velocity]]
        : hit.articulation === "buzz" ? Array.from({ length: 5 }, (_, index) => [at + index * grace, Math.round(velocity * (index === 0 ? 1 : 0.58))])
        : [[at, velocity]];
      for (const [strikeAt, strikeVelocity] of strikes) {
        events.push({ tick: strikeAt, priority: 1, bytes: [0x99, note, strikeVelocity] });
        events.push({ tick: strikeAt + duration, priority: 0, bytes: [0x89, note, 0] });
      }
    }
    absoluteBeat += bar.beats;
  });
  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  const encoded: number[] = [];
  const nameBytes = [...new TextEncoder().encode(title.slice(0, 100))];
  encoded.push(...variableLength(0), 0xff, 0x03, ...variableLength(nameBytes.length), ...nameBytes);
  let previousTick = 0;
  for (const event of events) {
    encoded.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  encoded.push(...variableLength(0), 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, ...uint32(encoded.length)];
  return new Blob([new Uint8Array([...header, ...trackHeader, ...encoded])], { type: "audio/midi" });
}

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);
const midiInstrumentNumber: Record<SongInstrument, number> = { kick: 36, rimshot: 37, snare: 38, hihat: 42, openhat: 46, tom: 50, crash: 49, ride: 51 };
const displayPitch: Record<SongInstrument, [string, number]> = { kick: ["F", 4], rimshot: ["B", 4], snare: ["C", 5], tom: ["A", 4], hihat: ["G", 5], openhat: ["A", 5], crash: ["E", 5], ride: ["D", 6] };
const percussionOrder: SongInstrument[] = ["kick", "rimshot", "snare", "tom", "hihat", "openhat", "crash", "ride"];

function musicType(ticks: number) {
  const types: Record<number, { type: string; dotted?: boolean; triplet?: boolean }> = {
    192: { type: "whole" }, 144: { type: "half", dotted: true }, 96: { type: "half" },
    72: { type: "quarter", dotted: true }, 48: { type: "quarter" }, 36: { type: "eighth", dotted: true },
    32: { type: "quarter", triplet: true }, 24: { type: "eighth" }, 18: { type: "16th", dotted: true },
    16: { type: "eighth", triplet: true }, 12: { type: "16th" }, 8: { type: "16th", triplet: true }, 6: { type: "32nd" }
  };
  return types[ticks];
}

function xmlRest(ticks: number, voice: number) {
  const notation = musicType(ticks);
  const modification = notation?.triplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "";
  return `<note><rest/><duration>${ticks}</duration><voice>${voice}</voice>${notation ? `<type>${notation.type}</type>${notation.dotted ? "<dot/>" : ""}` : ""}${modification}</note>`;
}

export function arrangementMusicXml(bars: ArrangementBar[], title: string, artist: string, noteMap: Record<SongInstrument, number> = midiNotes) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  const instruments = percussionOrder.map((voice, index) => `<score-instrument id="P1-I${index + 1}"><instrument-name>${xmlEscape(VOICE_NAMES[voice])}</instrument-name></score-instrument>`).join("");
  const midiInstruments = percussionOrder.map((voice, index) => `<midi-instrument id="P1-I${index + 1}"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>${noteMap[voice] ?? midiInstrumentNumber[voice]}</midi-unpitched></midi-instrument>`).join("");
  const measures = bars.map((bar, index) => {
    const match = bar.meter.match(/(\d+)\s*\/\s*(\d+)/);
    const numerator = Number(match?.[1] ?? 4);
    const denominator = Number(match?.[2] ?? 4);
    const fullMeasureBeats = numerator * 4 / denominator;
    const measureTicks = Math.max(1, Math.round(bar.beats * 48));
    const meter = `<attributes><divisions>48</divisions><time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>`;
    const directionLabel = [bar.marker, bar.endingPass ? `Ending ${bar.endingPass}` : "", bar.sectionName].filter(Boolean).join(" · ");
    const direction = `<direction placement="above"><direction-type><words>${xmlEscape(directionLabel)} · ${bar.bpm} BPM</words><metronome><beat-unit>quarter</beat-unit><per-minute>${bar.bpm}</per-minute></metronome></direction-type><sound tempo="${bar.bpm}"/></direction>`;
    const voices = percussionOrder.map((voice, voiceIndex) => {
      const lane = voiceIndex + 1;
      const events = bar.hits.filter((hit) => hit.instrument === voice).map((hit) => ({ tick: Math.max(0, Math.min(measureTicks, Math.round(hit.beat * 48))), hit })).sort((a, b) => a.tick - b.tick);
      const uniqueEvents = events.filter((item, eventIndex) => eventIndex === 0 || item.tick !== events[eventIndex - 1]?.tick);
      let cursor = 0;
      let body = "";
      const appendRest = (amount: number) => {
        let left = amount;
        const values = [192, 144, 96, 72, 48, 36, 32, 24, 18, 16, 12, 8, 6, 4, 3, 2, 1];
        while (left > 0) {
          const value = values.find((candidate) => candidate <= left) ?? 1;
          body += xmlRest(value, lane);
          left -= value;
        }
      };
      uniqueEvents.forEach((event, eventIndex) => {
        if (event.tick > cursor) appendRest(event.tick - cursor);
        const nextTick = uniqueEvents[eventIndex + 1]?.tick ?? measureTicks;
        const duration = Math.max(1, nextTick - event.tick);
        const notation = musicType(duration);
        const [step, octave] = displayPitch[voice];
        const isCymbal = voice === "hihat" || voice === "openhat" || voice === "crash" || voice === "ride";
        const notehead = isCymbal ? "<notehead>x</notehead>" : "";
        const timeModification = notation?.triplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "";
        const articulation = event.hit.articulation && event.hit.articulation !== "normal"
          ? `<other-notation type="single">${event.hit.articulation}</other-notation>` : "";
        const dynamics = event.hit.ghost || event.hit.accent || articulation
          ? `<notations>${event.hit.ghost ? "<technical><other-technical>ghost</other-technical></technical>" : ""}${event.hit.accent ? "<articulations><accent/></articulations>" : ""}${articulation}</notations>` : "";
        body += `<note><unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched><duration>${duration}</duration><instrument id="P1-I${percussionOrder.indexOf(voice) + 1}"/><voice>${lane}</voice>${notation ? `<type>${notation.type}</type>${notation.dotted ? "<dot/>" : ""}` : ""}${timeModification}<stem>up</stem>${notehead}${dynamics}</note>`;
        cursor = event.tick + duration;
      });
      if (cursor < measureTicks) appendRest(measureTicks - cursor);
      return `${voiceIndex ? `<backup><duration>${measureTicks}</duration></backup>` : ""}${body}`;
    }).join("");
    const implicit = Math.abs(bar.beats - fullMeasureBeats) > 0.001 ? ' implicit="yes"' : "";
    return `<measure number="${index + 1}"${implicit}>${meter}${direction}${voices}</measure>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="4.0"><work><work-title>${xmlEscape(title)}</work-title></work><identification><creator type="composer">${xmlEscape(artist)}</creator><encoding><software>Drum Hero Song Builder</software></encoding></identification><part-list><score-part id="P1"><part-name>Drum Set</part-name>${instruments}${midiInstruments}</score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  return new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });
}

const wavSamplePaths: Record<SongInstrument, string[]> = {
  kick: [1, 2, 3, 4].map((take) => `/audio/drums/kick-${take}.wav`), snare: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  hihat: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`), openhat: [4, 3, 2, 1].map((take) => `/audio/drums/hihat-${take}.wav`),
  tom: [1, 2, 3].map((take) => `/audio/drums/tom-${take}.wav`), crash: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`),
  ride: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`), rimshot: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`)
};

export async function arrangementWav(bars: ArrangementBar[], swing = 50, mix: DrumMixSettings = DEFAULT_DRUM_MIX) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  const sampleRate = 44_100;
  const totalSeconds = bars.reduce((sum, bar) => sum + bar.beats * 60 / bar.bpm, 0) + 1;
  if (totalSeconds > 8 * 60) throw new Error("This song is longer than the eight-minute WAV export limit. Export it in sections.");
  const Offline = window.OfflineAudioContext;
  if (!Offline) throw new Error("Offline audio export is unavailable in this browser.");
  const context = new Offline(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
  const voices = [...new Set(bars.flatMap((bar) => bar.hits.map((hit) => hit.articulation === "foot-splash" ? "openhat" : hit.instrument)))];
  const buffers = new Map<SongInstrument, AudioBuffer>();
  await Promise.all(voices.map(async (voice) => {
    const samplePaths = wavSamplePaths[voice];
    const samplePath = samplePaths[Math.max(0, Math.min(samplePaths.length - 1, mix.sampleIndex[voice] ?? 0))] ?? samplePaths[0];
    const response = await fetch(samplePath);
    if (!response.ok) throw new Error(`Could not load the ${VOICE_NAMES[voice]} sample for WAV export.`);
    buffers.set(voice, await context.decodeAudioData(await response.arrayBuffer()));
  }));
  let startSeconds = 0;
  for (const bar of bars) {
    const quarterSeconds = 60 / bar.bpm;
    for (const hit of bar.hits) {
      const instrument = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
      const buffer = buffers.get(instrument);
      if (!buffer) continue;
      const gridPosition = hit.step % bar.subdivision;
      const swingableOffbeat = (bar.subdivision === 8 && gridPosition % 2 === 1) || (bar.subdivision === 16 && gridPosition % 4 === 2);
      const swingSeconds = swingableOffbeat ? quarterSeconds * (Math.max(50, Math.min(75, swing)) - 50) / 100 : 0;
      const hitAt = startSeconds + hit.beat * quarterSeconds + swingSeconds;
      const articulation = hit.articulation ?? "normal";
      const strikes: Array<[number, number]> = articulation === "flam" ? [[-0.034, 0.48], [0, 1]]
        : articulation === "drag" ? [[-0.058, 0.35], [-0.029, 0.58], [0, 1]]
        : articulation === "buzz" ? [[0, 1], [0.018, 0.72], [0.036, 0.62], [0.054, 0.52]]
        : [[0, 1]];
      for (const [delay, velocityScale] of strikes) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = Math.max(0, Math.min(1, hit.velocity / 127)) * Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82)) * velocityScale;
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, mix.pan[instrument] ?? 0));
        source.connect(gain).connect(panner).connect(context.destination);
        source.start(Math.max(0, hitAt + delay));
      }
    }
    startSeconds += bar.beats * quarterSeconds;
  }
  const rendered = await context.startRendering();
  const leftSamples = rendered.getChannelData(0);
  const rightSamples = rendered.getChannelData(1);
  const dataBytes = leftSamples.length * 4;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const writeText = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, dataBytes, true);
  for (let index = 0; index < leftSamples.length; index += 1) {
    for (const [channel, samples] of [leftSamples, rightSamples].entries()) {
      const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
      view.setInt16(44 + (index * 2 + channel) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}
