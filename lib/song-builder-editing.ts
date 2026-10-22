import { editLinkedPart } from "./song-builder-tools";
import type { DrumPart, DrumSong } from './song-library';
import type { Instrument, Groove, SongInstrument, SongPartHit } from './types';
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
  const voices: Record<SongInstrument, Instrument> = { kick:'kick', snare:'snare',hihat:'hihat',openhat:'hihat',ride:'crash',rimshot:'snare',tom:'tom',crash:'crash',cowbell:'crash',shaker:'hihat',tambourine:'hihat',custom1:'kick',custom2:'snare',custom3:'tom',custom4:'crash' };
  const compatible = new Map<string, { step: number; instrument: Instrument; accent?: boolean }>();
  hits.forEach(hit => compatible.set(`${voices[hit.instrument]}:${hit.step}`,{ ...hit,instrument:voices[hit.instrument] }));
  return { id:`custom-${crypto.randomUUID()}`, name:name.trim().slice(0,60) || part.name.slice(0,60), description:part.notes?.slice(0,240) || 'Created in Song Builder', style:fill?'Custom fill':'Custom groove', focus:tags.slice(0,120), tags:tags.split(',').map(t=>t.trim()).filter(Boolean).slice(0,12), level:'Intermediate', beats:(last-first+1)*4/part.subdivision, subdivision:part.subdivision, defaultBpm:part.bpm,tempoRange:[40,200],meter:part.meter || `${meterBeats('4/4')}/4`,feel:part.subdivision===12?'triplet':'straight',hits:[...compatible.values()],songPattern:{hits} };
}

export function arrangementStartTimes(bars:Array<{beats:number;bpm:number}>){
  const starts:number[]=[];let elapsed=0;for(const bar of bars){starts.push(elapsed);elapsed+=bar.beats*60000/bar.bpm;}return starts;
}
