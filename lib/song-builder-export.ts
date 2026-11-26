import { expressionStrikes } from "./song-builder-creative";
import type { CustomSampleLayers } from "./song-builder-samples";
import { SONG_INSTRUMENTS, type SongInstrument } from "./types";
import { createDrumEffectsBus, DEFAULT_DRUM_EFFECTS, DEFAULT_DRUM_MIX, type DrumEffectsSettings, type DrumMixSettings } from "./audio";
import { arrangementAutomationValue, automationScaleAtHit, type ArrangementBar } from "./song-builder";
import { notationQuarterScale, paginateNotation, notationSystems, percussionRhythm, DEFAULT_NOTATION_OPTIONS, type NotationOptions } from "./song-builder-notation";

export { drawNotationPage, paginateNotation, notationGeometry, notationBarAtPoint, notationStaffStepAtPoint, notationCellAtPoint, NOTATION_VOICES, SHEET_WIDTH, SHEET_HEIGHT, BARS_PER_SHEET_PAGE, DEFAULT_NOTATION_OPTIONS, type NotationView, type NotationOptions } from "./song-builder-notation";

const VOICE_NAMES: Record<SongInstrument, string> = Object.fromEntries([["kick","KICK"],["snare","SNARE"],["hihat","HI-HAT"],["openhat","OPEN HAT"],["ride","RIDE"],["rimshot","RIMSHOT"],["tom","TOM"],["crash","CRASH"],["cowbell","COWBELL"],["shaker","SHAKER"],["tambourine","TAMBOURINE"],...Array.from({length:8},(_,index)=>[`custom${index+1}`,`CUSTOM ${index+1}`])]) as Record<SongInstrument,string>;

export function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the PNG image.")), "image/png"));
}

export function canvasesPdf(canvases: HTMLCanvasElement[], options: NotationOptions = DEFAULT_NOTATION_OPTIONS) {
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
    const paper=options.paperSize==='a4'?[595.28,841.89]:[612,792];
    const [pageWidth,pageHeight]=options.orientation==='portrait'?paper:[paper[1],paper[0]];
    const pageObject = 3 + index * 3;
    const contentObject = pageObject + 1;
    const imageObject = pageObject + 2;
    const data = canvas.toDataURL("image/jpeg", 0.94).split(",")[1];
    if (!data) throw new Error("Could not encode a PDF page.");
    const jpeg = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    object(pageObject, () => text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`));
    const content = new TextEncoder().encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
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

const midiNotes: Record<SongInstrument, number> = Object.fromEntries([["kick",36],["rimshot",37],["snare",38],["hihat",42],["openhat",46],["tom",50],["crash",49],["ride",51],["cowbell",56],["shaker",82],["tambourine",54],...Array.from({length:8},(_,index)=>[`custom${index+1}`,60+index])]) as Record<SongInstrument,number>;

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

export function arrangementMidi(bars: ArrangementBar[], title: string, noteMap: Record<SongInstrument, number> = midiNotes, swing = 50, separateTracks = true) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  type MidiEvent = { tick: number; priority: number; bytes: number[] };
  const conductor: MidiEvent[] = [];
  const voiceEvents = new Map<SongInstrument, MidiEvent[]>();
  let absoluteBeat = 0;
  let previousBpm = 0;
  let previousMeter = "";
  bars.forEach((bar) => {
    const barTick = Math.round(absoluteBeat * 480);
    if (bar.bpm !== previousBpm) {
      const micros = Math.round(60_000_000 / bar.bpm);
      conductor.push({ tick: barTick, priority: -3, bytes: [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff] });
      previousBpm = bar.bpm;
    }
    if (bar.meter !== previousMeter) {
      const match = bar.meter.match(/(\d+)\s*\/\s*(\d+)/);
      const numerator = Number(match?.[1] ?? 4);
      const denominator = Number(match?.[2] ?? 4);
      const exponent = Math.max(0, Math.round(Math.log2(denominator)));
      conductor.push({ tick: barTick, priority: -2, bytes: [0xff, 0x58, 0x04, numerator & 0xff, exponent, 24, 8] });
      previousMeter = bar.meter;
    }
    const markerText = [bar.marker, bar.rehearsalCue ? `Cue: ${bar.rehearsalCue}` : "", bar.endingPass ? `Ending ${bar.endingPass}` : ""].filter(Boolean).join(" · ");
    if (markerText) {
      const markerBytes = [...new TextEncoder().encode(markerText.slice(0, 100))];
      conductor.push({ tick: barTick, priority: -1, bytes: [0xff, 0x06, ...variableLength(markerBytes.length), ...markerBytes] });
    }
    for (const hit of bar.hits) {
      const hitSubdivision=hit.sourceSubdivision??bar.subdivision;
      const gridPosition=hit.step%hitSubdivision;
      const swingableOffbeat=(hitSubdivision===8&&gridPosition%2===1)||(hitSubdivision===16&&gridPosition%4===2);
      const clipSwing=bar.clipOverrides?.swing??bar.playbackFeel?.swing??(bar.feel?(bar.feel.kind==="straight"?50:bar.feel.amount):swing);
      const swingDelay=swingableOffbeat?Math.round(480*(Math.max(50,Math.min(75,clipSwing))-50)/100):0;
      const at = barTick + Math.max(0, Math.round(hit.beat * 480)+swingDelay);
      const duration = Math.max(1, Math.round((480 * 4 / hitSubdivision) * 0.55));
      const automationScale = automationScaleAtHit(bar, hit);
      if (automationScale <= 0.001) continue;
      const voice = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
      const velocityScale = arrangementAutomationValue(bar, voice, "velocity", (bar.arrangementBeatStart ?? 0) + hit.beat, 1);
      const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity * automationScale * velocityScale)));
      const note = hit.articulation === "foot-splash" ? 44 : noteMap[hit.instrument] ?? midiNotes[hit.instrument];
      const events = separateTracks ? (voiceEvents.get(voice) ?? (voiceEvents.set(voice, []), voiceEvents.get(voice)!)) : conductor;
      const strikes = expressionStrikes(hit.articulation,60000/bar.bpm*4/hitSubdivision).map(([ms,scale]) => [Math.max(barTick,at+Math.round(ms*bar.bpm*480/60000)),Math.max(1,Math.round(velocity*scale))]);
      for (const [strikeAt, strikeVelocity] of strikes) {
        events.push({ tick: strikeAt, priority: 1, bytes: [0x99, note, strikeVelocity] });
        events.push({ tick: strikeAt + (hit.articulation === "choke" ? Math.round(.12*bar.bpm*8) : duration), priority: 0, bytes: [0x89, note, 0] });
      }
    }
    absoluteBeat += bar.beats;
  });
  const tracks = separateTracks ? [{name:title,events:conductor}, ...[...voiceEvents.entries()].map(([voice, events])=>({name:VOICE_NAMES[voice]??voice,events}))] : [{name:title,events:conductor}];
  const encodeTrack = (events: MidiEvent[], name: string) => {
    const encoded: number[] = [];
    const nameBytes = [...new TextEncoder().encode(name.slice(0, 100))];
    encoded.push(...variableLength(0), 0xff, 0x03, ...variableLength(nameBytes.length), ...nameBytes);
    events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
    let previousTick = 0;
    for (const event of events) { encoded.push(...variableLength(Math.max(0,event.tick-previousTick)), ...event.bytes); previousTick = event.tick; }
    encoded.push(...variableLength(0), 0xff, 0x2f, 0x00);
    return encoded;
  };
  const encodedTracks = tracks.map(track=>encodeTrack(track.events,track.name));
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, separateTracks ? 1 : 0, (encodedTracks.length >> 8) & 0xff, encodedTracks.length & 0xff, 1, 0xe0];
  const file = [...header, ...encodedTracks.flatMap(encoded => [0x4d,0x54,0x72,0x6b,...uint32(encoded.length),...encoded])];
  return new Blob([new Uint8Array(file)], { type: "audio/midi" });
}

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);
const midiInstrumentNumber: Record<SongInstrument, number> = midiNotes;
const displayPitch: Record<SongInstrument, [string, number]> = Object.fromEntries([["kick",["F",4]],["rimshot",["C",5]],["snare",["C",5]],["tom",["D",5]],["hihat",["G",5]],["openhat",["G",5]],["crash",["A",5]],["ride",["F",5]],["cowbell",["C",5]],["shaker",["B",5]],["tambourine",["A",5]],...Array.from({length:8},(_,index)=>[`custom${index+1}`,[["C","D","E","F"][index%4],5]])]) as Record<SongInstrument,[string,number]>;
const defaultStaffPositions: Partial<Record<SongInstrument, number>> = { kick: 3, snare: -1, rimshot: -1, tom: -2, hihat: -5, openhat: -5, ride: -4, crash: -6, cowbell: -3, shaker: -7, tambourine: -6, ...Object.fromEntries(SONG_INSTRUMENTS.filter(voice=>voice.startsWith("custom")).map((voice,index)=>[voice,[0,1,-1,2][index%4]])) };
const percussionOrder: SongInstrument[] = ["kick", "rimshot", "snare", "tom", "hihat", "openhat", "crash", "ride", "cowbell", "shaker", "tambourine", ...SONG_INSTRUMENTS.filter(voice=>voice.startsWith("custom"))];
function staffPitch(voice: SongInstrument, options: NotationOptions) {
  const [baseStep, baseOctave] = displayPitch[voice], letter = ["C", "D", "E", "F", "G", "A", "B"];
  const position = Math.max(-8, Math.min(8, options.staffPositions?.[voice] ?? defaultStaffPositions[voice] ?? 0));
  const baseIndex = baseOctave * 7 + letter.indexOf(baseStep);
  const shifted = baseIndex + (defaultStaffPositions[voice] ?? 0) - position;
  return [letter[((shifted % 7) + 7) % 7]!, Math.floor(shifted / 7)] as const;
}

function musicType(ticks: number) {
  const types: Record<number, { type: string; dotted?: boolean; triplet?: boolean }> = {
    192: { type: "whole" }, 144: { type: "half", dotted: true }, 96: { type: "half" },
    72: { type: "quarter", dotted: true }, 48: { type: "quarter" }, 36: { type: "eighth", dotted: true },
    32: { type: "quarter", triplet: true }, 24: { type: "eighth" }, 18: { type: "16th", dotted: true },
    16: { type: "eighth", triplet: true }, 12: { type: "16th" }, 8: { type: "16th", triplet: true }, 6: { type: "32nd" }
  };
  return types[ticks];
}

export function arrangementMusicXml(bars: ArrangementBar[], title: string, artist: string, noteMap: Record<SongInstrument, number> = midiNotes, options:NotationOptions=DEFAULT_NOTATION_OPTIONS) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  const instrumentId=(voice:SongInstrument)=>`P1-I${percussionOrder.indexOf(voice)+1}`;
  const instruments=percussionOrder.map(voice=>`<score-instrument id="${instrumentId(voice)}"><instrument-name>${xmlEscape(bars[0]?.voiceLabels?.[voice] || VOICE_NAMES[voice])}</instrument-name></score-instrument>`).join('');
  const midiInstruments=percussionOrder.map(voice=>`<midi-instrument id="${instrumentId(voice)}"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>${(noteMap[voice]??midiInstrumentNumber[voice])+1}</midi-unpitched></midi-instrument>`).join('');
  const pages=paginateNotation(bars,options),newPages=new Set(pages.slice(1).map(page=>page[0]));
  const newSystems=new Set(pages.flatMap(page=>notationSystems(page,options).slice(1).map(system=>system[0])));
  const measures=bars.map((bar,index)=>{
    const signature=bar.meter.match(/(\d+)\s*\/\s*(\d+)/),numerator=Number(signature?.[1]??4),denominator=Number(signature?.[2]??4),scale=notationQuarterScale(bar);
    const divisions=bar.subdivision===20||bar.hits.some(hit=>hit.sourceSubdivision===20)?240:48;
    const measureTicks=Math.max(1,Math.round(bar.beats*scale*divisions));
    const attributes=`<attributes><divisions>${divisions}</divisions><time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>`;
    const label=[bar.marker,bar.sectionName,bar.dynamics,bar.annotation,bar.endingPass?`Ending ${bar.endingPass}`:''].filter(Boolean).join(' · ');
    const dynamic=bar.dynamics && /^(ppp|pp|p|mp|mf|f|ff|fff|sfz)$/.test(bar.dynamics.trim())?`<dynamics><${bar.dynamics.trim()}/></dynamics>`:'';
    const rehearsal=bar.marker?`<rehearsal>${xmlEscape(bar.marker)}</rehearsal>`:'';
    const direction=`<direction placement="above"><direction-type>${rehearsal}${dynamic}<words>${xmlEscape(label)}</words><metronome><beat-unit>quarter</beat-unit>${scale===1.5?'<beat-unit-dot/>':''}<per-minute>${bar.bpm}</per-minute></metronome></direction-type><sound tempo="${bar.bpm*scale}"/></direction>`;
    const body=(['hands','feet'] as const).map((lane,laneIndex)=>{
      const events=percussionRhythm(bar,lane,options),voice=laneIndex+1,stem=lane==='feet'?'down':'up';
      return `${laneIndex?`<backup><duration>${measureTicks}</duration></backup>`:''}`+events.map((event,eventIndex)=>{
        const duration=event.measureRest?measureTicks:Math.max(1,Math.round(event.duration*4/bar.subdivision*scale*divisions)),quintuplet=bar.subdivision===20&&event.duration===1,type=quintuplet?{type:"16th",dotted:scale===1.5,triplet:false}:musicType(duration*48/divisions);
        const durationXml=`<duration>${duration}</duration><voice>${voice}</voice>${type&&!event.measureRest?`<type>${type.type}</type>${type.dotted?'<dot/>':''}`:''}${quintuplet&&!event.measureRest?'<time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification>':type?.triplet&&!event.measureRest?'<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>':''}`;
        const group=quintuplet?5:bar.subdivision===12&&scale===1&&event.duration===1?3:0;
        const tuplet=group?`${event.step%group===0?'<tuplet type="start" bracket="yes"/>':''}${event.step%group===group-1?'<tuplet type="stop"/>':''}`:'';
        if(!event.hits.length)return `<note><rest${event.measureRest?' measure="yes"':''}/>${durationXml}${tuplet?`<notations>${tuplet}</notations>`:''}</note>`;
        const previous=events[eventIndex-1],next=events[eventIndex+1];
        const beamBefore=Boolean(previous?.hits.length&&previous.group===event.group&&previous.step+previous.duration===event.step);
        const beamAfter=Boolean(next?.hits.length&&next.group===event.group&&event.step+event.duration===next.step);
        const beamCount=type?.type==='16th'?2:type?.type==='eighth'?1:0;
        const beams=options.beamGrouping!=='off'&&(beamBefore||beamAfter)?Array.from({length:beamCount},(_,beam)=>`<beam number="${beam+1}">${beamBefore&&beamAfter?'continue':beamBefore?'end':'begin'}</beam>`).join(''):'';
        return event.hits.map((hit,hitIndex)=>{
          const [step,octave]=staffPitch(hit.instrument,options),cymbal=['hihat','openhat','crash','ride','rimshot'].includes(hit.instrument);
          const pitch=`<unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched>`;
          const technical=options.showSticking&&hit.sticking?`<technical><fingering>${hit.sticking}</fingering></technical>`:'';
          const showMarks=options.showArticulationMarks!==false;
          const articulations=showMarks&&hit.accent?'<articulations><accent/></articulations>':'';
          const notations=`${hitIndex===0?tuplet:''}${technical}${articulations}${hit.instrument==='openhat'?'<technical><open-string/></technical>':''}${showMarks&&hit.ghost?'<technical><other-technical>ghost</other-technical></technical>':''}${showMarks&&(hit.articulation==='buzz'||hit.articulation==='roll')?'<ornaments><tremolo type="single">3</tremolo></ornaments>':''}${showMarks&&hit.articulation==='choke'?'<technical><stopped/></technical>':''}${showMarks&&hit.articulation==='foot-splash'?'<other-notation type="single">foot splash</other-notation>':''}`;
          const graceCount=showMarks?(hit.articulation==='drag'?2:hit.articulation==='flam'?1:0):0;
          const grace=hitIndex===0?Array.from({length:graceCount},()=>`<note><grace slash="yes"/>${pitch}<instrument id="${instrumentId(hit.instrument)}"/><voice>${voice}</voice><type>eighth</type><stem>${stem}</stem></note>`).join(''):'';
          return `${grace}<note dynamics="${Math.round(hit.velocity/90*100)}">${hitIndex?'<chord/>':''}${pitch}${durationXml.replace(`<voice>${voice}</voice>`,`<instrument id="${instrumentId(hit.instrument)}"/><voice>${voice}</voice>`)}<stem>${stem}</stem>${cymbal||(hit.ghost&&options.showArticulationMarks!==false)?`<notehead${hit.ghost&&options.showArticulationMarks!==false?' parentheses="yes"':''}>${cymbal?hit.instrument==='rimshot'||options.cymbalNoteheads==='cross'?'x':'diamond':'normal'}</notehead>`:''}${hitIndex===0?beams:''}${notations?`<notations>${notations}</notations>`:''}</note>`;
        }).join('');
      }).join('');
    }).join('');
    const implicit=Math.abs(bar.beats*scale-numerator*4/denominator)>0.001?' implicit="yes"':'';
    const print=newPages.has(bar)?'<print new-page="yes"/>':newSystems.has(bar)?'<print new-system="yes"/>':'';
    return `<measure number="${index+1}"${implicit}>${print}${attributes}${direction}${body}</measure>`;
  }).join('');
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(title)}</work-title></work><identification><creator type="composer">${xmlEscape(artist)}</creator></identification><part-list><score-part id="P1"><part-name>Drum Set</part-name>${instruments}${midiInstruments}</score-part></part-list><part id="P1">${measures}</part></score-partwise>`],{type:'application/vnd.recordare.musicxml+xml'});
}

const wavSamplePaths = {
  kick: [1, 2, 3, 4].map((take) => `/audio/drums/kick-${take}.wav`), snare: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  hihat: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`), openhat: [4, 3, 2, 1].map((take) => `/audio/drums/hihat-${take}.wav`),
  tom: [1, 2, 3].map((take) => `/audio/drums/tom-${take}.wav`), crash: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`),
  ride: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`), rimshot: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  cowbell: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`), shaker: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`), tambourine: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`),
  ...Object.fromEntries(Array.from({length:8},(_,index)=>[`custom${index+1}`, [`/audio/drums/${["kick","snare","tom","crash"][index%4]}-1.wav`]]))
} as Record<SongInstrument, string[]>;

export type AudioRenderOptions = { sampleRate: 44100 | 48000; bitDepth: 16 | 24; normalizeToDbfs?: number };
export type BackingAudioInput = { id?: string; name?: string; blob: Blob; downbeat: number; volume: number; muted?: boolean; solo?: boolean };
export async function arrangementWav(bars: ArrangementBar[], swing = 50, mix: DrumMixSettings = DEFAULT_DRUM_MIX, customSamples: Partial<Record<SongInstrument, Blob | CustomSampleLayers>> = {}, options: { metronome?: boolean; backing?: BackingAudioInput | BackingAudioInput[]; backingOffsetSeconds?: number; effects?: DrumEffectsSettings; render?: AudioRenderOptions; onProgress?: (progress: { completed: number; total: number; label: string }) => void; shouldCancel?: () => boolean } = {}) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  if (options.shouldCancel?.()) throw new Error("WAV export cancelled.");
  options.onProgress?.({ completed: 0, total: 1, label: "Preparing WAV audio" });
  const sampleRate = options.render?.sampleRate ?? 44_100;
  const bitDepth = options.render?.bitDepth ?? 16;
  const totalSeconds = bars.reduce((sum, bar) => sum + bar.beats * 60 / bar.bpm, 0) + 1;
  if (totalSeconds > 8 * 60) throw new Error("This song is longer than the eight-minute WAV export limit. Export it in sections.");
  const Offline = window.OfflineAudioContext;
  if (!Offline) throw new Error("Offline audio export is unavailable in this browser.");
  const context = new Offline(2, Math.ceil(totalSeconds * sampleRate), sampleRate);
  const effects = createDrumEffectsBus(context, context.destination, options.effects ?? DEFAULT_DRUM_EFFECTS);
  const voices = [...new Set(bars.flatMap((bar) => bar.hits.map((hit) => hit.articulation === "foot-splash" ? "openhat" : hit.instrument)))];
  const buffers = new Map<string, { primary: AudioBuffer; soft?: AudioBuffer; accent?: AudioBuffer; alternates?: Partial<Record<"primary" | "soft" | "accent", AudioBuffer[]>> }>();
  const sampleKeys = [...new Set(bars.flatMap(bar => voices.map(voice => `${voice}:${(bar.kitMix ?? mix).sampleIndex[voice] ?? 0}`)))];
  await Promise.all(sampleKeys.map(async (key) => {
    const separator = key.lastIndexOf(":");
    const voice = key.slice(0, separator) as SongInstrument;
    const sampleIndex = Number(key.slice(separator + 1));
    if (!bars.some(bar => { const barMix = bar.kitMix ?? mix; return bar.hits.some(hit => (hit.articulation === "foot-splash" ? "openhat" : hit.instrument) === voice) && !barMix.muted[voice] && (!barMix.solo || barMix.solo === voice) && barMix.sampleIndex[voice] === sampleIndex; })) return;
    if (sampleIndex < 0 && customSamples[voice]) {
      const source = customSamples[voice]!;
      const layers = source instanceof Blob ? { primary: source } : source;
      const primary = await context.decodeAudioData(await layers.primary.arrayBuffer());
      const soft = layers.soft ? await context.decodeAudioData(await layers.soft.arrayBuffer()).catch(() => undefined) : undefined;
      const accent = layers.accent ? await context.decodeAudioData(await layers.accent.arrayBuffer()).catch(() => undefined) : undefined;
      const alternates = Object.fromEntries(await Promise.all(Object.entries(layers.alternates ?? {}).map(async ([layer, blobs]) => [layer, await Promise.all((blobs ?? []).map(async blob => context.decodeAudioData(await blob.arrayBuffer()).catch(() => null))).then(items => items.filter((item): item is AudioBuffer => item !== null))]))) as Partial<Record<"primary" | "soft" | "accent", AudioBuffer[]>>;
      buffers.set(key, { primary, ...(soft ? { soft } : {}), ...(accent ? { accent } : {}), ...(Object.keys(alternates).length ? { alternates } : {}) });
      return;
    }
    const samplePaths = wavSamplePaths[voice];
    const samplePath = samplePaths[Math.max(0, Math.min(samplePaths.length - 1, sampleIndex))] ?? samplePaths[0];
    const response = await fetch(samplePath);
    if (!response.ok) throw new Error(`Could not load the ${VOICE_NAMES[voice]} sample for WAV export.`);
    buffers.set(key, { primary: await context.decodeAudioData(await response.arrayBuffer()) });
  }));
  if (options.shouldCancel?.()) throw new Error("WAV export cancelled before rendering.");
  options.onProgress?.({ completed: 0, total: 1, label: "Rendering WAV audio" });
  let startSeconds = 0;
  const nextSampleTake: Record<SongInstrument, Record<"primary" | "soft" | "accent", number>> = Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice, { primary: 0, soft: 0, accent: 0 }])) as Record<SongInstrument, Record<"primary" | "soft" | "accent", number>>;
  let activeOpenHat: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  for (const bar of bars) {
    const quarterSeconds = 60 / bar.bpm;
    if (options.metronome) for (let beat = 0; beat < bar.beats; beat++) {
      const at = startSeconds + beat * quarterSeconds, oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = beat === 0 ? 1400 : 1000;
      gain.gain.setValueAtTime(.16,at); gain.gain.exponentialRampToValueAtTime(.001,at+.04);
      oscillator.connect(gain).connect(context.destination); oscillator.start(at); oscillator.stop(at+.05);
    }
    for (const hit of bar.hits) {
      const instrument = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
      const barMix = bar.kitMix ?? mix;
      const automationScale = automationScaleAtHit(bar, hit);
      if (automationScale <= 0.001 || barMix.muted[instrument] || (barMix.solo && barMix.solo !== instrument)) continue;
      const sampleLayers = buffers.get(`${instrument}:${barMix.sampleIndex[instrument] ?? 0}`);
      if (!sampleLayers) continue;
      const automationBeat = (bar.arrangementBeatStart ?? 0) + hit.beat;
      const arrangementVelocityScale = arrangementAutomationValue(bar, instrument, "velocity", automationBeat, 1);
      const panAutomation = arrangementAutomationValue(bar, instrument, "pan", automationBeat, barMix.pan[instrument] ?? 0);
      const hitSubdivision = hit.sourceSubdivision ?? bar.subdivision;
      const gridPosition = hit.step % hitSubdivision;
      const swingableOffbeat = (hitSubdivision === 8 && gridPosition % 2 === 1) || (hitSubdivision === 16 && gridPosition % 4 === 2);
      const clipSwing = bar.clipOverrides?.swing ?? bar.playbackFeel?.swing ?? (bar.feel ? (bar.feel.kind === "straight" ? 50 : bar.feel.amount) : swing);
      const swingSeconds = swingableOffbeat ? quarterSeconds * (Math.max(50, Math.min(75, clipSwing)) - 50) / 100 : 0;
      const hitAt = startSeconds + hit.beat * quarterSeconds + swingSeconds;
      const articulation = hit.articulation ?? "normal";
      const strikes = expressionStrikes(articulation,quarterSeconds*4000/hitSubdivision).map(([ms, velocity]) => [ms / 1000, velocity] as const);
      for (const [delay, articulationVelocityScale] of strikes) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        const eventAt = Math.max(0, hitAt + delay);
        if ((instrument === "hihat" || instrument === "openhat") && activeOpenHat) {
          const previous = activeOpenHat;
          previous.gain.gain.setValueAtTime(Math.max(0.0001, previous.gain.gain.value), eventAt);
          previous.gain.gain.linearRampToValueAtTime(0.0001, eventAt + 0.045);
          try { previous.source.stop(eventAt + 0.05); } catch { /* The sample may already have ended. */ }
          activeOpenHat = null;
        }
        const strikeVelocity = hit.velocity * arrangementVelocityScale * articulationVelocityScale;
        const layer = strikeVelocity < 48 ? "soft" : strikeVelocity >= 96 ? "accent" : "primary";
        const baseSample = layer === "soft" ? sampleLayers.soft ?? sampleLayers.primary : layer === "accent" ? sampleLayers.accent ?? sampleLayers.primary : sampleLayers.primary;
        const roundRobin = [baseSample, ...(sampleLayers.alternates?.[layer] ?? [])];
        source.buffer = roundRobin[nextSampleTake[instrument][layer] % roundRobin.length]!;
        nextSampleTake[instrument][layer] += 1;
        gain.gain.value = Math.max(0, Math.min(1, strikeVelocity / 127)) * Math.max(0, Math.min(1, barMix.levels[instrument] ?? 0.82)) * automationScale;
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, panAutomation));
        const playbackRate = Math.pow(2, Math.max(-12, Math.min(12, barMix.pitch?.[instrument] ?? 0)) / 12);
        source.playbackRate.setValueAtTime(playbackRate, eventAt);
        source.connect(gain).connect(panner).connect(effects.input);
        const decay = Math.max(0.05, Math.min(1, barMix.decay?.[instrument] ?? 1));
        if (decay < 0.999 && articulation !== 'choke') {
          const audibleDuration = Math.max(0.04, source.buffer.duration / playbackRate * decay);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), eventAt + audibleDuration * 0.82);
          gain.gain.linearRampToValueAtTime(0.0001, eventAt + audibleDuration);
          source.start(eventAt); source.stop(eventAt + audibleDuration + 0.005);
        } else source.start(eventAt);
        if (articulation === 'choke') { gain.gain.setValueAtTime(gain.gain.value,eventAt+.08); gain.gain.linearRampToValueAtTime(0,eventAt+.12); source.stop(eventAt+.13); }
        if (instrument === "openhat") activeOpenHat = { source, gain };
      }
    }
    startSeconds += bar.beats * quarterSeconds;
  }
  if (options.backing) {
    const backingTracks = Array.isArray(options.backing) ? options.backing : [options.backing];
    const hasSolo = backingTracks.some(track => track.solo && !track.muted);
    for (const backing of backingTracks) {
      if (backing.muted || (hasSolo && !backing.solo)) continue;
      const buffer = await context.decodeAudioData(await backing.blob.arrayBuffer());
      const source = context.createBufferSource(), gain = context.createGain(); source.buffer = buffer;
      gain.gain.value = Math.max(0, Math.min(1, backing.volume)); source.connect(gain).connect(context.destination);
      const offset = backing.downbeat + (options.backingOffsetSeconds ?? 0), start = Math.max(0,-offset);
      if (Math.max(0,offset) < buffer.duration && start < totalSeconds) source.start(start,Math.max(0,offset),Math.min(buffer.duration-Math.max(0,offset),totalSeconds-start));
    }
  }
  const rendered = await context.startRendering();
  if (options.shouldCancel?.()) throw new Error("WAV export cancelled after the current audio render.");
  options.onProgress?.({ completed: 1, total: 1, label: "WAV audio ready" });
  const leftSamples = rendered.getChannelData(0);
  const rightSamples = rendered.getChannelData(1);
  let peak = 0;
  for (let index = 0; index < leftSamples.length; index += 1) peak = Math.max(peak, Math.abs(leftSamples[index] ?? 0), Math.abs(rightSamples[index] ?? 0));
  const normalizationGain = options.render?.normalizeToDbfs !== undefined && peak > 0 ? Math.pow(10, options.render.normalizeToDbfs / 20) / peak : 1;
  const bytesPerSample = bitDepth / 8;
  const dataBytes = leftSamples.length * 2 * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const writeText = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2 * bytesPerSample, true); view.setUint16(32, 2 * bytesPerSample, true); view.setUint16(34, bitDepth, true);
  writeText(36, "data"); view.setUint32(40, dataBytes, true);
  for (let index = 0; index < leftSamples.length; index += 1) {
    for (const [channel, samples] of [leftSamples, rightSamples].entries()) {
      const sample = Math.max(-1, Math.min(1, (samples[index] ?? 0) * normalizationGain));
      const offset = 44 + (index * 2 + channel) * bytesPerSample;
      if (bitDepth === 24) {
        const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
        view.setUint8(offset, value & 0xff); view.setUint8(offset + 1, (value >> 8) & 0xff); view.setUint8(offset + 2, (value >> 16) & 0xff);
      } else view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}

type StemZipFile = { name: string; blob: Blob };

function zipHeader(signature: number, size: number, filename: Uint8Array, crc = 0, offset = 0) {
  const central = signature === 0x02014b50;
  const header = new Uint8Array((central ? 46 : 30) + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, signature, true);
  if (central) {
    view.setUint16(4, 20, true); view.setUint16(6, 20, true);
    view.setUint32(16, crc, true); view.setUint32(20, size, true); view.setUint32(24, size, true);
    view.setUint16(28, filename.length, true); view.setUint32(42, offset, true);
    header.set(filename, 46);
  } else {
    view.setUint16(4, 20, true); view.setUint32(14, crc, true);
    view.setUint32(18, size, true); view.setUint32(22, size, true);
    view.setUint16(26, filename.length, true); header.set(filename, 30);
  }
  return header;
}

async function blobCrc32(blob: Blob) {
  let crc = 0xffffffff;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function storedZip(files: StemZipFile[]) {
  const local: BlobPart[] = [], central: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const filename = new TextEncoder().encode(file.name), crc = await blobCrc32(file.blob);
    const header = zipHeader(0x04034b50, file.blob.size, filename, crc);
    local.push(header, file.blob);
    central.push(zipHeader(0x02014b50, file.blob.size, filename, crc, localOffset));
    localOffset += header.length + file.blob.size;
  }
  const centralOffset = localOffset, centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true); view.setUint32(16, centralOffset, true);
  const blobParts: BlobPart[] = [...local, ...central, end].map((chunk) => {
    if (chunk instanceof Blob) return chunk;
    const view = chunk as Uint8Array;
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: "application/zip" });
}

export async function arrangementStemsZip(
  bars: ArrangementBar[],
  swing = 50,
  mix: DrumMixSettings = DEFAULT_DRUM_MIX,
  customSamples: Partial<Record<SongInstrument, Blob | CustomSampleLayers>> = {},
  options: { metronome?: boolean; backing?: BackingAudioInput | BackingAudioInput[]; backingOffsetSeconds?: number; effects?: DrumEffectsSettings; render?: AudioRenderOptions; stemPrefix?: string; onProgress?: (progress: { completed: number; total: number; label: string }) => void; shouldCancel?: () => boolean } = {}
) {
  if (!bars.length) throw new Error("There is no arrangement to export yet.");
  const durationSeconds = bars.reduce((sum, bar) => sum + bar.beats * 60 / bar.bpm, 0);
  if (durationSeconds > 8 * 60) throw new Error("Stem ZIP exports support arrangements up to eight minutes. Export longer works in sections to keep browser memory use predictable.");
  const voices = [...new Set(bars.flatMap(bar => bar.hits.map(hit => hit.articulation === "foot-splash" ? "openhat" : hit.instrument)))];
  const backingTracks = options.backing ? Array.isArray(options.backing) ? options.backing : [options.backing] : [];
  if (!voices.length && !options.metronome && !backingTracks.some(track => !track.muted)) throw new Error("There are no drum hits or optional tracks to export in this range.");
  const files: StemZipFile[] = [];
  const total = voices.length + 1 + Number(!!options.metronome) + backingTracks.filter(track => !track.muted).length;
  let completed = 0;
  const progress = (label: string) => { completed += 1; options.onProgress?.({ completed, total, label }); };
  const checkCancelled = () => { if (options.shouldCancel?.()) throw new Error("Stem export cancelled after the current render step."); };
  for (const voice of voices) {
    checkCancelled();
    options.onProgress?.({ completed, total, label: `${voice} stem` });
    const soloMix = (source: DrumMixSettings): DrumMixSettings => ({ ...source, solo: "", muted: Object.fromEntries(Object.keys(source.muted).map(key => [key, key === voice ? source.muted[voice] : true])) as DrumMixSettings["muted"] });
    const stemMix = soloMix(mix);
    const stemBars = bars.map(bar => bar.kitMix ? { ...bar, kitMix: soloMix(bar.kitMix) } : bar);
    files.push({ name: `${options.stemPrefix || "drums"}-${voice}.wav`, blob: await arrangementWav(stemBars, swing, stemMix, customSamples, { effects: options.effects, render: options.render }) });
    progress(`${voice} stem ready`);
  }
  checkCancelled();
  files.push({ name: "tempo-map.mid", blob: arrangementMidi(bars.map(bar => ({ ...bar, hits: [] })), "Tempo and meter map") });
  progress("tempo map ready");
  if (options.metronome) {
    checkCancelled(); options.onProgress?.({ completed, total, label: "Metronome stem" });
    files.push({ name: `${options.stemPrefix || "drums"}-metronome.wav`, blob: await arrangementWav(bars.map(bar => ({ ...bar, hits: [] })), swing, { ...mix, solo: "" }, {}, { metronome: true, render: options.render }) });
    progress("Metronome stem ready");
  }
  for (const [index, backing] of backingTracks.entries()) {
    if (backing.muted) continue;
    checkCancelled(); options.onProgress?.({ completed, total, label: `${backing.name || `reference ${index + 1}`} stem` });
    const safeName = (backing.name || `reference-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `reference-${index + 1}`;
    files.push({ name: `${options.stemPrefix || "drums"}-reference-${index + 1}-${safeName}.wav`, blob: await arrangementWav(bars.map(bar => ({ ...bar, hits: [] })), swing, { ...mix, solo: "" }, {}, { backing, backingOffsetSeconds: options.backingOffsetSeconds, render: options.render }) });
    progress(`${safeName} stem ready`);
  }
  checkCancelled();
  const minutes = Math.floor(durationSeconds / 60), seconds = Math.round(durationSeconds % 60);
  const readme = [
    "Drum Hero aligned WAV stems",
    `Arrangement duration: ${minutes}:${String(seconds).padStart(2, "0")}`,
    "Every stem starts at the same arrangement position and uses the same sample rate and bit depth.",
    `Audio format: ${options.render?.sampleRate ?? 44100} Hz · ${options.render?.bitDepth ?? 16}-bit PCM${options.render?.normalizeToDbfs === undefined ? " · normalization off" : ` · peak-normalized to ${options.render.normalizeToDbfs} dBFS`}`,
    "Drum stems follow the selected kit samples, per-voice level, pan, pitch and decay.",
    "Import tempo-map.mid into the same DAW session to recover section tempo, meter and marker changes.",
    "Metronome and backing audio are included as separate stems when selected.",
    ...files.map(file => `- ${file.name}`)
  ].join("\n");
  files.push({ name: "README.txt", blob: new Blob([readme], { type: "text/plain" }) });
  return storedZip(files);
}
