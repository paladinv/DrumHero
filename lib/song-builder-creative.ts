import type { DrumPart } from './song-library';
import type { SongInstrument, SongPartHit } from './types';
import { partStepCount, meterBeats } from './song-builder';

/** Deterministic, independently editable variation; the original pattern is never mutated. */
export function creativeVariation(source: DrumPart, density: number, complexity: number, fill: number, seed: number): DrumPart {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const steps = partStepCount(source), hits = new Map<string, SongPartHit>();
  for (const hit of source.hits) {
    if (hit.instrument !== 'kick' && hit.instrument !== 'snare' && random() > density / 100) continue;
    hits.set(`${hit.instrument}:${hit.step}`, { ...hit });
  }
  for (let step = 0; step < steps && hits.size < 256; step++) {
    const isFill = step >= Math.max(0,steps - source.subdivision / 4) && random() < fill / 100;
    if (isFill) {
      const instrument = random() < 0.55 ? 'tom' : 'snare';
      hits.set(`${instrument}:${step}`, { step, instrument, velocity: Math.round(70 + 45 * random()), accent: step === steps - 1 });
    } else if (random() < density / 200) {
      const instrument = random() < complexity / 100 ? 'ride' : 'hihat';
      hits.set(`${instrument}:${step}`, { step, instrument, velocity: Math.round(50 + 40 * random()) });
    }
    if (hits.size < 256 && step % 2 && random() < complexity / 400) hits.set(`snare:${step}`, { step, instrument: 'snare', ghost: true, velocity: 35 });
  }
  return { ...structuredClone(source), id: crypto.randomUUID(), sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined, name: `${source.name} variation`.slice(0,80), hits: [...hits.values()].sort((a,b) => a.step - b.step) };
}

export function morphDrumParts(source: DrumPart, target: DrumPart, amount: number): DrumPart {
  const progress = Math.max(0, Math.min(100, amount)) / 100;
  const sourceSteps = partStepCount(source), targetSteps = partStepCount(target);
  const stableChoice = (key: string) => {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
    return (hash >>> 0) / 4294967296;
  };
  const key = (hit: SongPartHit) => `${hit.instrument}:${hit.step}`;
  const sourceHits = new Map(source.hits.map(hit => [key(hit), hit]));
  const targetHits = new Map<string, SongPartHit>();
  for (const hit of target.hits) {
    const mappedStep = Math.max(0, Math.min(sourceSteps - 1, Math.round(hit.step / targetSteps * sourceSteps)));
    const mapped = { ...hit, step: mappedStep };
    const mappedKey = key(mapped), previous = targetHits.get(mappedKey);
    if (!previous || (mapped.velocity ?? 86) > (previous.velocity ?? 86)) targetHits.set(mappedKey, mapped);
  }
  const hits: SongPartHit[] = [];
  for (const id of new Set([...sourceHits.keys(), ...targetHits.keys()])) {
    const from = sourceHits.get(id), to = targetHits.get(id), choice = stableChoice(`${source.id}:${target.id}:${id}`);
    if (from && !to) { if (choice >= progress) hits.push({ ...from }); continue; }
    if (to && !from) { if (choice < progress) hits.push({ ...to }); continue; }
    if (!from || !to) continue;
    hits.push({
      ...from,
      velocity: Math.round((from.velocity ?? (from.accent ? 118 : 86)) * (1 - progress) + (to.velocity ?? (to.accent ? 118 : 86)) * progress),
      accent: progress < 0.5 ? from.accent : to.accent,
      ghost: progress < 0.5 ? from.ghost : to.ghost,
      articulation: progress < 0.5 ? from.articulation : to.articulation,
      sticking: progress < 0.5 ? from.sticking : to.sticking,
      timingOffsetMs: Math.round((from.timingOffsetMs ?? 0) * (1 - progress) + (to.timingOffsetMs ?? 0) * progress)
    });
  }
  const limited = hits.length > 256 ? hits.sort((a, b) => (b.velocity ?? 86) - (a.velocity ?? 86)).slice(0, 256).sort((a, b) => a.step - b.step) : hits.sort((a, b) => a.step - b.step);
  return { ...structuredClone(source), id: crypto.randomUUID(), sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined, name: `${source.name} → ${target.name} · ${Math.round(progress * 100)}%`.slice(0, 80), hits: limited };
}

export function phraseAwareEnding(source: DrumPart, window: 'one-beat' | 'two-beats' | 'measure', preserveBackbeat: boolean): DrumPart {
  const measureBeats = meterBeats(source.meter ?? '4/4', source.beats);
  const subdivision = Number.isInteger(measureBeats * source.subdivision / 4) ? source.subdivision : 16;
  const steps = Math.max(1, Math.round(measureBeats * subdivision / 4));
  const windowBeats = window === 'measure' ? measureBeats : Math.min(measureBeats, window === 'two-beats' ? 2 : 1);
  const firstFillStep = Math.max(0, Math.floor((measureBeats - windowBeats) * subdivision / 4));
  const sourceMeasureStart = Math.max(0, source.beats - measureBeats);
  const hits = new Map<string, SongPartHit>();
  for (const hit of source.hits) {
    const sourceBeat = hit.step * 4 / source.subdivision;
    const localBeat = sourceBeat - sourceMeasureStart;
    if (localBeat < -0.0001 || localBeat >= measureBeats) continue;
    const step = Math.max(0, Math.min(steps - 1, Math.round(localBeat * subdivision / 4)));
    const isBackbeat = hit.instrument === 'snare' && [1, 3].some(beat => Math.abs(localBeat - beat) < 0.001);
    if (step < firstFillStep || (preserveBackbeat && isBackbeat)) hits.set(`${hit.instrument}:${step}`, { ...hit, step });
  }
  for (let step = firstFillStep; step < steps; step += 1) {
    const beat = step * 4 / subdivision;
    const isBackbeat = beat >= 1 && [1, 3].some(position => Math.abs(beat - position) < 0.001);
    if (preserveBackbeat && isBackbeat) continue;
    const progress = (step - firstFillStep + 1) / Math.max(1, steps - firstFillStep);
    const instrument: SongInstrument = step % 2 === 0 ? 'tom' : 'snare';
    const hit = { step, instrument, velocity: Math.round(64 + progress * 54), accent: progress > 0.82 } satisfies SongPartHit;
    hits.set(`${instrument}:${step}`, hit);
  }
  return { ...structuredClone(source), id: crypto.randomUUID(), sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined, name: `${source.name} phrase ending`, beats: measureBeats, subdivision, hits: [...hits.values()].sort((a, b) => a.step - b.step) };
}

export function expressionStrikes(articulation?: string, stepMs = 240): Array<[number, number]> {
  return articulation === 'flam' ? [[-34,.48],[0,1]] : articulation === 'drag' ? [[-58,.35],[-29,.58],[0,1]] : articulation === 'buzz' ? [[0,1],[18,.72],[36,.62],[54,.52]] : articulation === 'roll' ? [[0,1],[stepMs/4,.8],[stepMs/2,.9],[stepMs*3/4,.75]] : [[0,1]];
}

export function boundaryTransition(source: DrumPart, kind: 'fill' | 'break' | 'pickup' | 'crash'): DrumPart {
  const beats = meterBeats(source.meter ?? '4/4',source.beats);
  const subdivision = Number.isInteger(beats * source.subdivision / 4) ? source.subdivision : 16;
  const steps = Math.max(1,Math.round(beats*subdivision/4)), hits: SongPartHit[] = [];
  if (kind === 'crash') hits.push({step:0,instrument:'crash',accent:true,velocity:118},{step:0,instrument:'kick',velocity:108});
  if (kind === 'pickup') for(let step=Math.max(0,steps-2);step<steps;step++) hits.push({step,instrument:'snare',velocity:step===steps-1?108:70});
  if (kind === 'fill') for(let step=Math.max(0,steps-Math.ceil(subdivision/4));step<steps;step++) hits.push({step,instrument:step%2?'tom':'snare',velocity:Math.round(75+40*step/steps)});
  return {...structuredClone(source),id:crypto.randomUUID(),name:`${kind[0].toUpperCase()+kind.slice(1)} transition`,sourceId:undefined,linkedBaseId:undefined,linkOverrides:undefined,linkRemoved:undefined,beats,subdivision,hits};
}

/** Adapts a copied fill's ending to the surrounding patterns without changing its source grid or length. */
export function contextualizeFill(source: DrumPart, before: DrumPart, after: DrumPart | undefined, density: number, complexity: number): DrumPart {
  const next = structuredClone(source), steps = partStepCount(next);
  const densityAmount = Math.max(0, Math.min(100, density)) / 100;
  const complexityAmount = Math.max(0, Math.min(100, complexity)) / 100;
  const previousRate = before.hits.length / Math.max(1, partStepCount(before));
  const nextRate = after ? after.hits.length / Math.max(1, partStepCount(after)) : previousRate;
  const targetRate = Math.max(0.12, Math.min(0.9, (previousRate + nextRate) / 2));
  const targetCount = Math.max(1, Math.min(steps, Math.round(steps * (targetRate * 0.35 + densityAmount * 0.48))));
  const hits = new Map<string, SongPartHit>(next.hits.map(hit => [`${hit.instrument}:${hit.step}`, { ...hit }]));
  const protectedVoices = new Set<SongInstrument>(['kick', 'snare']);
  if (hits.size > targetCount) {
    const ranked = [...hits.values()].sort((a, b) => Number(protectedVoices.has(a.instrument)) - Number(protectedVoices.has(b.instrument)) || Number(b.accent) - Number(a.accent) || a.step - b.step);
    for (const hit of ranked.slice(0, hits.size - targetCount)) if (!protectedVoices.has(hit.instrument)) hits.delete(`${hit.instrument}:${hit.step}`);
  }
  const tailSteps = Math.max(1, Math.ceil(next.subdivision / 4));
  const tailStart = Math.max(0, steps - tailSteps);
  const targetTailHits = Math.max(1, Math.min(tailSteps, Math.round(tailSteps * (0.2 + densityAmount * 0.8))));
  const tailHits = [...hits.values()].filter(hit => hit.step >= tailStart).sort((a, b) => Number(b.accent) - Number(a.accent) || (b.velocity ?? 86) - (a.velocity ?? 86) || a.step - b.step);
  for (const hit of tailHits.slice(targetTailHits)) hits.delete(`${hit.instrument}:${hit.step}`);
  const arrivalVoices = new Set(after?.hits.filter(hit => hit.step === 0).map(hit => hit.instrument) ?? []);
  const arrivalKick = arrivalVoices.has('kick') || arrivalVoices.size === 0;
  const arrivalCrash = arrivalVoices.has('crash');
  const runVoices: SongInstrument[] = complexityAmount > 0.62 ? ['tom', 'snare', 'tom', 'snare'] : ['snare', 'tom', 'snare', 'tom'];
  for (let step = tailStart; step < steps && [...hits.values()].filter(hit => hit.step >= tailStart).length < targetTailHits; step += 1) {
    const instrument = runVoices[(step - tailStart) % runVoices.length]!;
    const key = `${instrument}:${step}`;
    if (!hits.has(key)) hits.set(key, { step, instrument, velocity: Math.round(70 + densityAmount * 20 + complexityAmount * 12), accent: step === steps - 1 });
  }
  const finalStep = Math.max(0, steps - 1);
  if (arrivalKick && hits.size < 256 && !hits.has(`kick:${finalStep}`)) hits.set(`kick:${finalStep}`, { step: finalStep, instrument: 'kick', velocity: 96, accent: true });
  if (arrivalCrash && hits.size < 256 && !hits.has(`crash:${finalStep}`)) hits.set(`crash:${finalStep}`, { step: finalStep, instrument: 'crash', velocity: 110, accent: true });
  next.id = crypto.randomUUID();
  next.sourceId = undefined;
  next.linkedBaseId = undefined;
  next.linkOverrides = undefined;
  next.linkRemoved = undefined;
  next.name = `${source.name} · contextual fill`.slice(0, 80);
  next.hits = [...hits.values()].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)).slice(0, 256);
  return next;
}
