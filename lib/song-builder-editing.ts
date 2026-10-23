import { editLinkedPart } from "./song-builder-tools";
import type { DrumPart, DrumSong } from './song-library';
import type { Groove, Instrument, SongHitArticulation, SongInstrument, SongPartHit } from './types';
import { meterBeats, partStepCount, sectionClips } from './song-builder';

export function previewGridChange(part: DrumPart, subdivision: DrumPart['subdivision']) {
  const steps = part.beats * subdivision / 4;
  if (!Number.isInteger(steps)) return { part, moved: 0, collisions: 0, error: 'This grid cannot represent the current pattern length. Choose a compatible length first.' };
  let moved = 0, collisions = 0;
  const hits = new Map<string, SongPartHit>();
  for (const hit of part.hits) {
    const exact = hit.step * subdivision / part.subdivision;
    const step = Math.min(steps - 1, Math.max(0, Math.round(exact)));
    if (Math.abs(step - exact) > 0.00001) moved++;
    const next = { ...hit, step };
    const key = `${hit.instrument}:${step}`;
    const previous = hits.get(key);
    if (previous) {
      collisions++;
      hits.set(key, { ...previous, accent: previous.accent || next.accent, velocity: Math.max(previous.velocity ?? 86, next.velocity ?? 86), ghost: previous.ghost === true && next.ghost === true });
    } else hits.set(key, next);
  }
  return { part: { ...part, subdivision, hits: [...hits.values()] }, moved, collisions, error: '' };
}

export type PhraseOperation = 'crescendo' | 'decrescendo' | 'alternate-accents' | 'rotate' | 'swap' | 'thin';
export function fitGrooveToMeter(source: Groove, targetMeter: string): Groove {
  const targetBeatsPerBar = meterBeats(targetMeter);
  const measures = Math.max(1, Math.min(16, Math.round(source.beats / targetBeatsPerBar)));
  const targetBeats = Math.max(0.5, Math.min(32, targetBeatsPerBar * measures));
  const sourceSteps = Math.max(1, Math.round(source.beats * source.subdivision / 4));
  const targetSteps = Math.max(1, Math.round(targetBeats * source.subdivision / 4));
  const adaptHits = (hits: Array<{ step: number; instrument: SongInstrument; accent?: boolean; velocity?: number; ghost?: boolean; articulation?: SongHitArticulation; sticking?: "R" | "L" }>) => {
    const adapted = new Map<string, typeof hits[number]>();
    for (const hit of hits) {
      const step = Math.max(0, Math.min(targetSteps - 1, Math.round(hit.step * targetSteps / sourceSteps)));
      const key = `${hit.instrument}:${step}`, previous = adapted.get(key);
      adapted.set(key, previous ? { ...previous, ...hit, step, accent: previous.accent === true || hit.accent === true, velocity: Math.max(previous.velocity ?? 86, hit.velocity ?? 86), ghost: previous.ghost === true && hit.ghost === true } : { ...hit, step });
    }
    return [...adapted.values()].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument));
  };
  const sourceHits = source.songPattern?.hits ?? source.hits;
  const adaptedHits = adaptHits(sourceHits as Array<{ step: number; instrument: SongInstrument; accent?: boolean; velocity?: number; ghost?: boolean; articulation?: SongHitArticulation; sticking?: "R" | "L" }>);
  return { ...source, beats: targetBeats, meter: targetMeter, hits: adaptedHits as Groove["hits"], songPattern: source.songPattern ? { hits: adaptedHits } : undefined, description: `${source.description} · fitted to ${targetMeter} over ${measures} ${measures === 1 ? "bar" : "bars"}` };
}

export function transformPhrase(part: DrumPart, start: number, end: number, operation: PhraseOperation, from: SongInstrument = 'snare', to: SongInstrument = 'tom') {
  const first = Math.max(0, Math.min(partStepCount(part) - 1, start));
  const last = Math.max(first, Math.min(partStepCount(part) - 1, end));
  const positions = [...new Set(part.hits.filter(h => h.step >= first && h.step <= last).map(h => h.step))].sort((a,b) => a-b);
  const transformed = part.hits.flatMap((hit): SongPartHit[] => {
    if (hit.step < first || hit.step > last) return [hit];
    const index = positions.indexOf(hit.step);
    const progress = positions.length < 2 ? 1 : index / (positions.length - 1);
    if (operation === 'thin' && index % 2 === 1) return [];
    if (operation === 'rotate') return [{ ...hit, step: first + (hit.step - first + 1) % (last - first + 1) }];
    if (operation === 'swap') return [{ ...hit, instrument: hit.instrument === from ? to : hit.instrument === to ? from : hit.instrument }];
    if (operation === 'alternate-accents') return [{ ...hit, accent: index % 2 === 0, ghost: false }];
    if (operation === 'crescendo' || operation === 'decrescendo') return [{ ...hit, velocity: Math.round(35 + 85 * (operation === 'crescendo' ? progress : 1 - progress)), ghost: false }];
    return [hit];
  });
  return { ...part, hits: transformed.sort((a,b) => a.step-b.step) };
}

export function makeClipIndependent(song: DrumSong, sectionId: string, clipId: string): { song: DrumSong; partId: string } {
  let partId = '';
  const sections = song.sections.map(section => {
    if (section.id !== sectionId) return section;
    const clips = sectionClips(section), clip = clips.find(c => c.id === clipId);
    const source = section.parts.find(p => p.id === clip?.partId);
    if (!clip || !source || section.parts.length >= 256) return section;
    const part = { ...structuredClone(source), id: crypto.randomUUID(), sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined, name: `${source.name} · independent`.slice(0,80) };
    partId = part.id;
    return { ...section, parts: [...section.parts, part], clips: clips.map(c => c.id === clipId ? { ...c, partId: part.id } : c) };
  });
  return { song: { ...song, sections }, partId };
}

export function moveClipToSection(song: DrumSong, sourceSectionId: string, clipId: string, targetSectionId: string) {
  if (sourceSectionId === targetSectionId) return song;
  const source = song.sections.find(s => s.id === sourceSectionId), target = song.sections.find(s => s.id === targetSectionId);
  const clip = source && sectionClips(source).find(c => c.id === clipId);
  const part = source?.parts.find(p => p.id === clip?.partId);
  if (!target || !clip || !part || target.parts.length >= 256 || sectionClips(target).length >= 512) return song;
  const copied = { ...structuredClone(part), id: crypto.randomUUID() };
  const copiedVariants = (clip.repeatVariants ?? []).flatMap(variant => {
    const sourcePart = source?.parts.find(item => item.id === variant.partId);
    if (!sourcePart) return [];
    const copy = { ...structuredClone(sourcePart), id: crypto.randomUUID() };
    return [{ repeat: variant.repeat, partId: copy.id, part: copy }];
  });
  if (target.parts.length + 1 + copiedVariants.length > 256) return song;
  const repeatVariants = copiedVariants.map(({ repeat, partId }) => ({ repeat, partId }));
  return { ...song, sections: song.sections.map(s => s.id === sourceSectionId ? { ...s, clips: sectionClips(s).filter(c => c.id !== clipId) } : s.id === targetSectionId ? { ...s, parts: [...s.parts, copied, ...copiedVariants.map(item=>item.part)], clips: [...sectionClips(s), { ...clip, partId: copied.id, repeatVariants }] } : s) };
}

export type RecordedBuilderHit = { sectionId: string; partId: string; instrument: SongInstrument; step: number; velocity: number; bpm: number; subdivision?: DrumPart["subdivision"]; atMs: number };
export type BuilderTake = { id: string; songId: string; name: string; createdAt: string; mode: 'overdub' | 'replace'; hits: RecordedBuilderHit[]; targets: Array<{ sectionId: string; partId: string }> };
export function builderTakeMeasureIndex(song: DrumSong, hit: RecordedBuilderHit) {
  const section = song.sections.find(item => item.id === hit.sectionId), part = section?.parts.find(item => item.id === hit.partId);
  if (!section || !part) return Math.floor(hit.step / Math.max(1, (hit.subdivision ?? 8) / 4)) + 1;
  const measureSteps = Math.max(1, meterBeats(part.meter || section.meter || song.meter, part.beats) * part.subdivision / 4);
  return Math.floor(hit.step / measureSteps) + 1;
}
export function builderTakeMeasureKey(song: DrumSong, hit: RecordedBuilderHit) {
  return `${hit.sectionId}:${hit.partId}:${builderTakeMeasureIndex(song, hit)}`;
}
export function mergeBuilderTakes(song: DrumSong, first: BuilderTake, second: BuilderTake, choices: Record<string, 'a' | 'b'>): BuilderTake {
  if (first.songId !== song.id || second.songId !== song.id) throw new Error('Choose two takes from this song.');
  if (first.id === second.id) throw new Error('Choose two different takes to make a comp.');
  const existingTargets = new Set(song.sections.flatMap(section => section.parts.map(part => `${section.id}:${part.id}`)));
  const targets = [...new Map([...first.targets, ...second.targets].filter(target => existingTargets.has(`${target.sectionId}:${target.partId}`)).map(target => [`${target.sectionId}:${target.partId}`, target])).values()];
  if (!targets.length) throw new Error('Neither take contains notes for patterns in the current arrangement.');
  const hits = [
    ...first.hits.filter(hit => choices[builderTakeMeasureKey(song, hit)] !== 'b'),
    ...second.hits.filter(hit => choices[builderTakeMeasureKey(song, hit)] === 'b')
  ].filter(hit => existingTargets.has(`${hit.sectionId}:${hit.partId}`)).sort((a,b) => a.sectionId.localeCompare(b.sectionId) || a.partId.localeCompare(b.partId) || a.step-b.step || a.instrument.localeCompare(b.instrument));
  if (hits.length > 20_000) throw new Error('This comp would exceed the take size limit. Use shorter takes.');
  return { id: crypto.randomUUID(), songId: song.id, name: `Comp · ${first.name.slice(0,24)} + ${second.name.slice(0,24)}`.slice(0,100), createdAt: new Date().toISOString(), mode: 'overdub', hits, targets };
}
export function contextualFillMatch(source: Groove, before: DrumPart, after: DrumPart | undefined, targetBeats: number, desiredDensity: number) {
  const durationFit = Math.max(0, 1 - Math.abs(source.beats - targetBeats) / Math.max(1, targetBeats));
  const sourceDensity = source.hits.length / Math.max(0.5, source.beats);
  const baseDensity = before.hits.length / Math.max(0.5, before.beats);
  const targetDensity = baseDensity + 0.5 + Math.max(0, Math.min(100, desiredDensity)) / 40;
  const densityFit = Math.max(0, 1 - Math.abs(sourceDensity - targetDensity) / Math.max(1, targetDensity));
  const contextVoices = new Set([...before.hits, ...(after?.hits ?? [])].map(hit => hit.instrument));
  const sourceVoices = new Set(source.hits.map(hit => hit.instrument));
  const voiceFit = sourceVoices.size ? [...sourceVoices].filter(voice => contextVoices.has(voice)).length / sourceVoices.size : 0;
  const nextStartsWithCrash = after?.hits.some(hit => hit.instrument === 'crash' && hit.step === 0) ?? false;
  const fillEndsWithCrash = source.hits.some(hit => hit.instrument === 'crash' && hit.step >= Math.ceil(source.beats * source.subdivision / 4) - 1);
  const arrivalFit = nextStartsWithCrash && fillEndsWithCrash ? 1 : 0;
  const score = Math.round(Math.min(1, durationFit * 0.4 + densityFit * 0.35 + voiceFit * 0.2 + arrivalFit * 0.05) * 100);
  const lengthLabel = Math.abs(source.beats - targetBeats) < 0.01 ? 'bar length match' : `${source.beats} beats for a ${targetBeats}-beat bar`;
  const arrivalLabel = arrivalFit ? 'crash leads into the next section' : `${Math.round(voiceFit * 100)}% voice overlap with neighboring patterns`;
  return { score, detail: `${lengthLabel} · ${arrivalLabel}` };
}
export function quantizeRecordedHit(hit: RecordedBuilderHit, strength: number, subdivision: DrumPart['subdivision'], stepCount = Infinity) {
  const exact = hit.step * subdivision / (hit.subdivision ?? subdivision);
  const step = Math.max(0,Math.min(stepCount-1,Math.round(exact))), gridMs = 60000 / hit.bpm * 4 / subdivision;
  return { ...hit, gridStep: step, timingOffsetMs: Math.round((exact - step) * gridMs * (1 - Math.max(0, Math.min(100,strength)) / 100)) };
}
export function applyBuilderTake(song: DrumSong, take: BuilderTake, strength: number, velocityScale = 100) {
  if(!song.sections.some(section=>section.parts.some(part=>take.targets.some(target=>target.sectionId===section.id&&target.partId===part.id))))throw new Error('This take refers to patterns that are no longer in the arrangement. Restore the original version before applying it.');
  return { ...song, sections: song.sections.map(section => { const changed=section.parts.map(part => {
    if (!take.targets.some(t => t.sectionId === section.id && t.partId === part.id)) return part;
    const hits = new Map<string, SongPartHit>((take.mode === 'replace' ? [] : part.hits).map(h => [`${h.instrument}:${h.step}`,h]));
    for (const raw of take.hits.filter(h => h.sectionId === section.id && h.partId === part.id)) {
      if(raw.step*part.subdivision/(raw.subdivision??part.subdivision)>=partStepCount(part))throw new Error('This take contains notes beyond the current pattern length. Restore the original length before applying it.');
      const hit = quantizeRecordedHit(raw,strength,part.subdivision,partStepCount(part));
      const step = Math.max(0, Math.min(partStepCount(part)-1,hit.gridStep));
      const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity * Math.max(25, Math.min(200, velocityScale)) / 100)));
      hits.set(`${hit.instrument}:${step}`,{ instrument: hit.instrument, step, velocity, accent: velocity >= 112, ghost: velocity < 40, timingOffsetMs: hit.timingOffsetMs });
    }
    if(hits.size>256)throw new Error('This take would exceed 256 hits in a pattern. Use a shorter recording range or replace mode.');
    return { ...part, hits: [...hits.values()].sort((a,b) => a.step-b.step) };
  });
    let next=section;
    const targets=changed.filter(part=>take.targets.some(target=>target.sectionId===section.id&&target.partId===part.id)).sort((a,b)=>Number(!!a.linkedBaseId)-Number(!!b.linkedBaseId));
    for(const part of targets)next=editLinkedPart(next,part.id,()=>part);
    return next;
  }) };
}

export function partToSavedGroove(part: DrumPart, name: string, tags: string, fill: boolean, startStep = 0, endStep = partStepCount(part)-1): Groove {
  const first = Math.max(0,startStep), last = Math.min(partStepCount(part)-1,endStep);
  const beats=(last-first+1)*4/part.subdivision;
  if(beats<=0||!Number.isInteger(beats*2))throw new Error('Select a measure range that aligns with this pattern’s grid and duration.');
  const hits = part.hits.filter(h => h.step >= first && h.step <= last).map(h => ({ ...h, step: h.step-first }));
  const voices: Record<SongInstrument, Instrument> = { kick:'kick', snare:'snare',hihat:'hihat',openhat:'hihat',ride:'crash',rimshot:'snare',tom:'tom',crash:'crash',cowbell:'crash',shaker:'hihat',tambourine:'hihat',custom1:'kick',custom2:'snare',custom3:'tom',custom4:'crash',custom5:'kick',custom6:'snare',custom7:'tom',custom8:'crash' };
  const compatible = new Map<string, { step: number; instrument: Instrument; accent?: boolean }>();
  hits.forEach(hit => compatible.set(`${voices[hit.instrument]}:${hit.step}`,{ ...hit,instrument:voices[hit.instrument] }));
  return { id:`custom-${crypto.randomUUID()}`, name:name.trim().slice(0,60) || part.name.slice(0,60), description:part.notes?.slice(0,240) || 'Created in Song Builder', style:fill?'Custom fill':'Custom groove', focus:tags.slice(0,120), tags:tags.split(',').map(t=>t.trim()).filter(Boolean).slice(0,12), level:'Intermediate', beats:(last-first+1)*4/part.subdivision, subdivision:part.subdivision, defaultBpm:part.bpm,tempoRange:[40,200],meter:part.meter || `${meterBeats('4/4')}/4`,feel:part.subdivision===12?'triplet':'straight',hits:[...compatible.values()],songPattern:{hits} };
}

export function arrangementStartTimes(bars:Array<{beats:number;bpm:number}>){
  const starts:number[]=[];let elapsed=0;for(const bar of bars){starts.push(elapsed);elapsed+=bar.beats*60000/bar.bpm;}return starts;
}
