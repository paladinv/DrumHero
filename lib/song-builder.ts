import { mappedSeconds } from "./song-builder-tools";
import { SONG_INSTRUMENTS, type Groove, type MidiArticulation, type SongHitArticulation, type SongInstrument } from "./types";
import type { DrumPart, DrumSong, SongArrangementAutomationPoint, SongClip, SongClipOverrides, SongFeel, SongPlaybackFeel, SongSection, SongSectionAutomation } from "./song-library";
import type { DrumMixSettings } from "./audio";

export type ArrangedHit = { beat: number; fraction: number; instrument: SongInstrument; accent: boolean; velocity: number; ghost: boolean; step: number; sourceSubdivision?: DrumPart["subdivision"]; sourcePartId?: string; articulation?: SongHitArticulation; notationCue?: MidiArticulation; sticking?: "R" | "L"; diffStatus?: "added" | "removed" | "changed" };
export type ArrangementBar = {
  index: number;
  number: number;
  sectionId: string;
  sectionName: string;
  sectionKind: SongSection["kind"];
  feel?: SongFeel;
  playbackFeel?: SongPlaybackFeel;
  kitMix?: DrumMixSettings;
  sectionRepeat: number;
  sectionBar: number;
  sectionBars: number;
  automation?: SongSectionAutomation;
  voiceLabels?: Partial<Record<SongInstrument, string>>;
  clipId?: string;
  clipRepeat?: number;
  clipRepeats?: number;
  clipOverrides?: SongClipOverrides;
  arrangementAutomation?: SongArrangementAutomationPoint[];
  arrangementBeatStart?: number;
  rehearsalCue?: string;
  endingPass?: 1 | 2;
  marker?: string;
  partId: string;
  partName: string;
  layerPartIds?: string[];
  layerPartNames?: string[];
  annotation?: string;
  dynamics?: string;
  meter: string;
  bpm: number;
  subdivision: DrumPart["subdivision"];
  partBeats: number;
  beats: number;
  measureBeats: number;
  partBeatOffset: number;
  hits: ArrangedHit[];
};

export const BUILDER_VOICES: SongInstrument[] = SONG_INSTRUMENTS;
export const VOICE_LABEL: Record<SongInstrument, string> = Object.fromEntries([
  ["kick","Kick"],["snare","Snare"],["hihat","Hi-hat"],["openhat","Open hi-hat"],["ride","Ride"],["rimshot","Rimshot"],["tom","Tom"],["crash","Crash"],["cowbell","Cowbell"],["shaker","Shaker"],["tambourine","Tambourine"],
  ...Array.from({length:8},(_,index)=>[`custom${index+1}`,`Custom lane ${index+1}`])
]) as Record<SongInstrument,string>;
export function songVoiceLabel(song: Pick<DrumSong, "voiceLabels"> | undefined, voice: SongInstrument) { return song?.voiceLabels?.[voice]?.trim() || VOICE_LABEL[voice]; }

export function automationScaleAtHit(bar: ArrangementBar, hit: ArrangedHit) {
  const automation = bar.automation;
  const audibleVoice = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
  if (automation?.mutedVoices?.includes(audibleVoice) || bar.clipOverrides?.mutedVoices?.includes(audibleVoice)) return 0;
  const clipVolume = bar.clipOverrides?.volume ?? 1;
  if (!automation) return clipVolume * arrangementAutomationValue(bar, audibleVoice, "volume", (bar.arrangementBeatStart ?? 0) + hit.beat, 1);
  const progress = Math.max(0, Math.min(1, (bar.sectionBar + hit.beat / Math.max(0.001, bar.measureBeats)) / Math.max(1, bar.sectionBars)));
  const interpolate = (from: number | undefined, to: number | undefined) => {
    const start = from ?? 1;
    return Math.max(0, Math.min(1, start + ((to ?? start) - start) * progress));
  };
  const cymbal = ["hihat", "openhat", "ride", "crash"].includes(audibleVoice);
  const voiceCurve = automation.voices?.[audibleVoice];
  const arrangementVolume = arrangementAutomationValue(bar, audibleVoice, "volume", (bar.arrangementBeatStart ?? 0) + hit.beat, 1);
  return clipVolume * interpolate(automation.volumeFrom, automation.volumeTo) * (cymbal ? interpolate(automation.cymbalFrom, automation.cymbalTo) : 1) * (voiceCurve ? interpolate(voiceCurve.volumeFrom, voiceCurve.volumeTo) : 1) * arrangementVolume;
}

export function arrangementAutomationValue(bar: Pick<ArrangementBar, "arrangementAutomation">, instrument: SongInstrument, property: "volume" | "pan" | "velocity", beat: number, fallback: number) {
  const points = bar.arrangementAutomation ?? [];
  const specific = points.filter(point => point.instrument === instrument && point[property] !== undefined).sort((a,b)=>a.beat-b.beat);
  const global = points.filter(point => point.instrument === undefined && point[property] !== undefined).sort((a,b)=>a.beat-b.beat);
  const lane = specific.length ? specific : global;
  if (!lane.length) return fallback;
  if (beat <= lane[0]!.beat) return lane[0]![property] ?? fallback;
  if (beat >= lane.at(-1)!.beat) return lane.at(-1)![property] ?? fallback;
  const index = lane.findIndex((point, i) => i < lane.length - 1 && beat >= point.beat && beat <= lane[i + 1]!.beat);
  if (index < 0) return fallback;
  const from = lane[index]!, to = lane[index + 1]!;
  const progress = (beat - from.beat) / Math.max(0.001, to.beat - from.beat);
  return (from[property] ?? fallback) + ((to[property] ?? from[property] ?? fallback) - (from[property] ?? fallback)) * progress;
}

export function partStepCount(part: Pick<DrumPart, "beats" | "subdivision">) {
  return Math.max(1, Math.ceil(part.beats * part.subdivision / 4));
}

export function cleanMeterLabel(meter: string) {
  return meter.replace(/^\s*\d+\s+bars?\s*[·:,-]\s*/i, "").trim() || "4/4";
}

export function sectionClips(section: SongSection): SongClip[] {
  if (Array.isArray(section.clips)) return section.clips.filter((clip) => section.parts.some((part) => part.id === clip.partId)).map(clip => ({ ...clip, layers: clip.layers?.filter(id => id !== clip.partId && section.parts.some(part => part.id === id)) }));
  return section.parts.map((part) => ({ id: `legacy-${part.id}`, partId: part.id, repeats: 1 }));
}

export function meterBeats(meter: string, durationHint = 4) {
  const matches = [...meter.matchAll(/(\d+)\s*\/\s*(\d+)/g)];
  const match = matches.at(-1);
  if (!match) return 4;
  const numerator = Number(match[1] ?? 0);
  const denominator = Number(match[2] ?? 0);
  if (numerator < 1 || numerator > 32 || ![2, 4, 8, 16].includes(denominator)) return 4;
  const candidates = [numerator * 4 / denominator];
  if (denominator === 8 && numerator >= 6 && numerator % 3 === 0) candidates.push(numerator / 3);
  return candidates.reduce((best, candidate) => {
    const ratio = durationHint / candidate;
    const error = Math.abs(ratio - Math.round(ratio));
    const bestRatio = durationHint / best;
    return error < Math.abs(bestRatio - Math.round(bestRatio)) ? candidate : best;
  }, candidates[0]);
}

export function gridBeatLabel(meter: string, subdivision: number, step: number, measureSteps: number) {
  const localStep = step % Math.max(1, measureSteps);
  const signature = meter.match(/(\d+)\s*\/\s*(\d+)/);
  const denominator = Number(signature?.[2] ?? 4);
  const groupMatch = meter.match(/\(([^)]+)\)/);
  const groups = groupMatch?.[1]?.match(/\d+/g)?.map(Number).filter((group) => group > 0) ?? [];
  const stepsPerDenominatorUnit = subdivision / denominator;
  if (groups.length && Number.isInteger(stepsPerDenominatorUnit)) {
    let offset = 0;
    for (let index = 0; index < groups.length; index += 1) {
      if (Math.abs(localStep - offset) < 0.001) return String(index + 1);
      offset += (groups[index] ?? 0) * stepsPerDenominatorUnit;
    }
    return "";
  }
  const stepsPerBeat = subdivision / 4;
  return Math.abs(localStep % stepsPerBeat) < 0.001 ? String(Math.floor(localStep / stepsPerBeat) + 1) : "";
}

export function grooveToPart(groove: Groove, bpm: number): DrumPart {

  return {
    id: crypto.randomUUID(),
    name: groove.name,
    bpm: Math.max(40, Math.min(200, bpm)),
    beats: groove.beats,
    subdivision: groove.subdivision,
    meter: cleanMeterLabel(groove.meter ?? "4/4"),
    sourceId: groove.id,
    notes: groove.description,
    hits: (groove.songPattern?.hits ?? groove.hits).map((hit) => ({ ...hit }))
  };
}

export function makeBlankPart(name = "New pattern", meter = "4/4", bpm = 80): DrumPart {
  return { id: crypto.randomUUID(), name, bpm, beats: meterBeats(meter), subdivision: 8, meter, hits: [] };
}

export type GrooveVariation = "snare-shift" | "hat-lift" | "half-time" | "double-time";

export function varyDrumPart(source: DrumPart, variation: GrooveVariation): DrumPart {
  const part = structuredClone(source);
  part.id = crypto.randomUUID();
  part.sourceId = undefined;
  part.linkedBaseId = undefined;part.linkOverrides=undefined;part.linkRemoved=undefined;
  part.name = `${source.name} · ${variation === "snare-shift" ? "snare shift" : variation === "hat-lift" ? "hat lift" : variation === "half-time" ? "half-time" : "double-time"}`;
  const fullLength = partStepCount(part);
  const measureSteps = Math.max(1, Math.round(meterBeats(part.meter || "4/4", part.beats) * part.subdivision / 4));
  if (variation === "snare-shift") {
    const oneBeat = Math.max(1, Math.round(part.subdivision / 4));
    part.hits = part.hits.map((hit) => hit.instrument === "snare" ? { ...hit, step: (hit.step + oneBeat) % fullLength } : hit);
  } else if (variation === "hat-lift") {
    if (part.subdivision === 4) {
      part.subdivision = 8;
      part.hits = part.hits.map((hit) => ({ ...hit, step: hit.step * 2 }));
    }
    const stepsPerBeat = part.subdivision / 4;
    const middle = Math.max(1, Math.floor(stepsPerBeat / 2));
    const additions = Array.from({ length: Math.ceil(part.beats) }, (_, beat) => beat * stepsPerBeat + middle)
      .filter((step) => step < partStepCount(part) && !part.hits.some((hit) => hit.step === step && (hit.instrument === "hihat" || hit.instrument === "openhat")))
      .map((step) => ({ step, instrument: "hihat" as const, accent: false, velocity: 64 }));
    part.hits = [...part.hits, ...additions];
  } else if (variation === "half-time") {
    const oldSnares = part.hits.filter((hit) => hit.instrument === "snare");
    const keep = part.hits.filter((hit) => hit.instrument !== "snare");
    const snareByMeasure = new Map<number, typeof oldSnares[number]>();
    for (const hit of oldSnares) {
      const measure = Math.floor(hit.step / measureSteps);
      if (!snareByMeasure.has(measure)) snareByMeasure.set(measure, hit);
    }
    const halfMeasureStep = Math.min(measureSteps - 1, Math.max(0, Math.floor(meterBeats(part.meter || "4/4", part.beats) * part.subdivision / 8)));
    const newSnares = [...snareByMeasure.entries()].flatMap(([measure, original]) => {
      const step = measure * measureSteps + halfMeasureStep;
      return step < fullLength ? [{ ...original, step }] : [];
    });
    part.hits = [...keep, ...newSnares];
  } else {
    const oldSubdivision = part.subdivision;
    const nextSubdivision = oldSubdivision === 12 ? 12 : oldSubdivision < 16 ? (oldSubdivision === 4 ? 8 : 16) : 16;
    const scale = nextSubdivision / oldSubdivision;
    part.subdivision = nextSubdivision as DrumPart["subdivision"];
    part.hits = part.hits.map((hit) => ({ ...hit, step: hit.step * scale }));
    const stepsPerBeat = nextSubdivision / 4;
    const hatSteps = Array.from({ length: Math.ceil(part.beats * stepsPerBeat) }, (_, step) => step)
      .filter((step) => (scale > 1 ? step % scale !== 0 : oldSubdivision === 16) && !part.hits.some((hit) => hit.step === step && (hit.instrument === "hihat" || hit.instrument === "openhat")))
      .map((step) => ({ step, instrument: "hihat" as const, accent: step % stepsPerBeat === 0, velocity: step % stepsPerBeat === 0 ? 86 : 62 }));
    part.hits = [...part.hits, ...hatSteps];
  }
  const uniqueHits = new Map<string, DrumPart["hits"][number]>();
  for (const hit of part.hits) {
    const key = `${hit.step}:${hit.instrument}`;
    const existing = uniqueHits.get(key);
    uniqueHits.set(key, existing ? {
      ...existing,
      accent: existing.accent === true || hit.accent === true,
      velocity: Math.max(existing.velocity ?? 86, hit.velocity ?? 86),
      ghost: existing.ghost === true && hit.ghost === true
    } : hit);
  }
  part.hits = [...uniqueHits.values()]
    .sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument))
    .slice(0, 256);
  return part;
}

export function humanizeArrangementBars(bars: ArrangementBar[], amount: number, seed: number, velocityAmount = amount): ArrangementBar[] {
  if (!amount && !velocityAmount && !bars.some(bar => bar.playbackFeel?.humanizeAmount || bar.playbackFeel?.humanizeVelocityAmount || bar.clipOverrides?.humanizeAmount || bar.clipOverrides?.humanizeVelocityAmount)) return bars;
  const variation = (key: string) => {
    let hash = (seed | 0) ^ 0x811c9dc5;
    for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
  };
  return bars.map((bar) => ({
    ...bar,
    hits: bar.hits.map((hit) => {
      const strength = Math.max(0, Math.min(100, bar.clipOverrides?.humanizeAmount ?? bar.playbackFeel?.humanizeAmount ?? amount)) / 100;
      const velocityStrength = Math.max(0, Math.min(100, bar.clipOverrides?.humanizeVelocityAmount ?? bar.playbackFeel?.humanizeVelocityAmount ?? velocityAmount)) / 100;
      if (!strength && !velocityStrength) return hit;
      const random = variation(`${bar.index}:${hit.sourcePartId ?? bar.partId}:${hit.step}:${hit.instrument}`);
      const timingRangeBeats = (60 / bar.bpm) * 0.18 * strength;
      const beat = Math.max(0, Math.min(Math.max(0, bar.beats - 0.001), hit.beat + random * timingRangeBeats));
      const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity + variation(`${bar.index}:${hit.sourcePartId ?? bar.partId}:${hit.step}:${hit.instrument}:velocity`) * 24 * velocityStrength)));
      return { ...hit, beat, fraction: beat / Math.max(0.001, bar.measureBeats), velocity };
    })
  }));
}

function expandEndingGroups(sections: SongSection[]) {
  const expanded: Array<{ section: SongSection; repeat: number; endingPass?: 1 | 2 }> = [];
  for (let index = 0; index < sections.length;) {
    const section = sections[index];
    if (!section) { index += 1; continue; }
    if (!section.endingGroup) {
      expanded.push({ section, repeat: 1 });
      index += 1;
      continue;
    }
    const group = section.endingGroup;
    const members: SongSection[] = [];
    while (sections[index]?.endingGroup === group) {
      const member = sections[index];
      if (member) members.push(member);
      index += 1;
    }
    const repeats = Math.max(2, Math.min(8, Math.max(...members.map((member) => Math.round(member.endingRepeats ?? 2)))));
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const pass: 1 | 2 = repeat === repeats ? 2 : 1;
      for (const member of members) {
        if (member.endingPass && member.endingPass !== pass) continue;
        expanded.push({ section: member, repeat, endingPass: member.endingPass ? pass : undefined });
      }
    }
  }
  return expanded;
}

export function sectionTempoAtMeasure(section:SongSection,baseBpm:number,measureIndex:number){
  const points=section.tempoPoints??[];
  if(!points.length){const ramp=section.tempoRamp,progress=ramp?Math.min(1,(measureIndex+1)/ramp.bars):0;return Math.round(baseBpm+((ramp?.targetBpm??baseBpm)-baseBpm)*progress);}
  const sorted=[...points].sort((a,b)=>a.measure-b.measure),timeline=sorted[0]?.measure===1?sorted:[{id:"section-start",measure:1,bpm:baseBpm,curve:"linear" as const},...sorted],measure=measureIndex+1;
  let left=timeline[0]!;
  for(let index=1;index<timeline.length;index++){const candidate=timeline[index];if(candidate&&candidate.measure<=measure)left=candidate;else break;}
  const leftIndex=timeline.findIndex(point=>point===left),right=timeline[leftIndex+1];if(!right||right.measure<=left.measure)return left.bpm;
  const raw=Math.max(0,Math.min(1,(measure-left.measure)/(right.measure-left.measure))),progress=left.curve==="ease-in"?raw*raw:left.curve==="ease-out"?1-(1-raw)*(1-raw):left.curve==="ease-in-out"?raw<.5?2*raw*raw:1-Math.pow(-2*raw+2,2)/2:raw;
  return Math.round(left.bpm+(right.bpm-left.bpm)*progress);
}

export function buildArrangementBars(song: DrumSong, sectionId?: string): ArrangementBar[] {
  const selectedSections = sectionId ? song.sections.filter((section) => section.id === sectionId) : song.sections;
  const expandedSections: Array<{ section: SongSection; repeat: number; endingPass?: 1 | 2 }> = sectionId ? selectedSections.flatMap((section) => Array.from({ length: Math.max(1, Math.min(32, Math.round(section.repeats ?? 1))) }, (_, index) => ({ section, repeat: index + 1 }))) : expandEndingGroups(selectedSections);
  const bars: ArrangementBar[] = [];
  for (const entry of expandedSections) {
    const section = entry.section;
    const sectionRepeats = sectionId || section.endingGroup ? 1 : Math.max(1, Math.min(32, Math.round(section.repeats ?? 1)));
    const clips = sectionClips(section);
    const sectionBars = clips.reduce((total, clip) => {
      const repeats = Math.max(1, Math.min(64, Math.round(clip.repeats || 1)));
      return total + Array.from({ length: repeats }, (_, index) => section.parts.find(item => item.id === (clip.repeatVariants?.find(variant => variant.repeat === index + 1)?.partId ?? clip.partId))).reduce((sum, part) => {
        if (!part) return sum;
        const measureLength = meterBeats(part.meter || section.meter || song.meter, part.beats);
        const longestLayer = Math.max(part.beats, ...(clip.layers ?? []).map(layerId => section.parts.find(layer => layer.id === layerId)?.beats ?? 0));
        return sum + Math.max(1, Math.min(32, Math.ceil(longestLayer / measureLength - 0.00001)));
      }, 0);
    }, 0);
    const baseBpm = Math.max(40, Math.min(200, Math.round(section.bpm ?? song.bpm)));
    for (let repeatIndex = 0; repeatIndex < sectionRepeats; repeatIndex += 1) {
      const sectionRepeat = section.endingGroup ? entry.repeat : repeatIndex + 1;
      let repeatBarCursor = 0;
      for (const clip of clips) {
        const repeats = Math.max(1, Math.min(64, Math.round(clip.repeats || 1)));
        for (let clipRepeat = 0; clipRepeat < repeats; clipRepeat += 1) {
          const partId = clip.repeatVariants?.find(variant=>variant.repeat===clipRepeat+1)?.partId ?? clip.partId;
          const part = section.parts.find((item) => item.id === partId);
          if (!part) continue;
          const layerParts = [part, ...(clip.layers ?? []).flatMap(layerId => {
            const layer = section.parts.find(item => item.id === layerId);
            return layer ? [layer] : [];
          })];
          const meter = part.meter || section.meter || song.meter;
          const measureLength = meterBeats(meter, part.beats);
          const longestLayer = Math.max(...layerParts.map(layer => layer.beats));
          const barCount = Math.max(1, Math.min(32, Math.ceil(longestLayer / measureLength - 0.00001)));
          for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
            const bpm = sectionTempoAtMeasure(section,baseBpm,repeatBarCursor);
            const pickup = sectionRepeat === 1 && repeatBarCursor === 0 && section.pickupBeats
              ? Math.min(measureLength, Math.max(0.5, section.pickupBeats))
              : 0;
            const startBeat = barIndex * measureLength + (pickup ? measureLength - pickup : 0);
            const remaining = Math.max(0.001, Math.min(measureLength, longestLayer - startBeat));
            const mutedLayers = new Set(clip.overrides?.mutedLayers ?? []);
            const hits = layerParts.flatMap((layer): ArrangedHit[] => {
              if (mutedLayers.has(layer.id) || (clip.overrides?.soloLayer && clip.overrides.soloLayer !== layer.id)) return [];
              const layerRemaining = Math.max(0.001, Math.min(measureLength, layer.beats - startBeat));
              return layer.hits.flatMap((hit): ArrangedHit[] => {
                const beat = hit.step * 4 / layer.subdivision;
                const localBeat = beat - startBeat;
                if (localBeat < -0.00001 || localBeat >= layerRemaining - 0.00001) return [];
                const performanceBeat = Math.max(0, Math.min(layerRemaining - 0.001, localBeat + (hit.timingOffsetMs ?? 0) * bpm / 60000));
                return [{ beat: performanceBeat, fraction: performanceBeat / (pickup ? layerRemaining : measureLength), instrument: hit.instrument, accent: hit.accent === true, velocity: hit.ghost ? Math.min(hit.velocity ?? 86, 42) : hit.velocity ?? (hit.accent ? 118 : 86), ghost: hit.ghost === true, step: hit.step, sourceSubdivision: layer.subdivision, sourcePartId: layer.id, articulation: hit.articulation, sticking: hit.sticking }];
              });
            });
            const measureCues = section.rehearsalCues?.filter(cue => cue.measure === repeatBarCursor + 1) ?? [];
            const cueText = measureCues.map(cue => `${cue.kind === "chord" ? "Chord" : cue.kind === "lyric" ? "Lyric" : "Band"}: ${cue.text}`).join(" · ");
            bars.push({
              index: bars.length,
              number: bars.length + 1,
              sectionId: section.id,
              sectionName: section.name,
              sectionKind: section.kind,
              feel: section.feel,
              playbackFeel: section.playbackFeel,
              kitMix: section.kitMix,
              sectionRepeat,
              sectionBar: repeatBarCursor,
              sectionBars: Math.max(1, sectionBars),
              automation: section.automation,
              voiceLabels: song.voiceLabels,
              endingPass: entry.endingPass,
              marker: repeatBarCursor === 0 ? section.marker : undefined,
              clipId: clip.id,
              clipRepeat: clipRepeat + 1,
              clipRepeats: repeats,
              clipOverrides: clip.overrides,
              rehearsalCue: cueText || undefined,
              partId: part.id,
              partName: part.name,
              layerPartIds: layerParts.map(layer => layer.id),
              layerPartNames: layerParts.map(layer => layer.name),
            annotation: [section.notes, ...layerParts.map((layer,index) => index === 0 ? layer.notes : `Layer: ${layer.name}${layer.notes ? ` · ${layer.notes}` : ""}`), cueText ? `Cue: ${cueText}` : undefined].filter(Boolean).join(" · "),
            dynamics: part.dynamics,
              meter,
              bpm,
              subdivision: part.subdivision,
              partBeats: longestLayer,
              beats: remaining,
              measureBeats: measureLength,
              partBeatOffset: startBeat,
              arrangementBeatStart: 0,
              arrangementAutomation: song.arrangementAutomation,
              hits
            });
            repeatBarCursor += 1;
          }
        }
      }
    }
  }
  const fullForScope = sectionId ? buildArrangementBars({ ...song, referenceTempoMap: undefined }) : bars;
  const firstScopedIndex = sectionId ? fullForScope.findIndex(bar=>bar.sectionId===sectionId) : 0;
  const prefixBeats = sectionId ? fullForScope.slice(0,Math.max(0,firstScopedIndex)).reduce((sum,bar)=>sum+bar.beats,0) : 0;
  let arrangementBeat = prefixBeats;
  for (const bar of bars) { bar.arrangementBeatStart = arrangementBeat; arrangementBeat += bar.beats; }
  if(song.referenceTempoMap && song.referenceTempoMap.length>=2){
    // Use the full arrangement to locate section anchors, including repeated forms.
    const full=fullForScope;
    let beat=sectionId?full.slice(0,full.findIndex(bar=>bar.sectionId===sectionId)).reduce((n,bar)=>n+bar.beats,0):0;
    return bars.map(bar=>{const seconds=mappedSeconds(beat+bar.beats,song.referenceTempoMap!,song.bpm)-mappedSeconds(beat,song.referenceTempoMap!,song.bpm);beat+=bar.beats;return {...bar,bpm:60*bar.beats/seconds};});
  }
  return bars;
}
