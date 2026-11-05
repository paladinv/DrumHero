import { arrangementAutomationValue, automationScaleAtHit, buildArrangementBars, humanizeArrangementBars, type ArrangementBar } from './song-builder';
import { expressionStrikes } from './song-builder-creative';
import type { DrumSong } from './song-library';
import type { SongInstrument } from './types';
import { DEFAULT_DRUM_MIX, type DrumMixSettings } from './audio';
export type PlaybackCue = { choke?: boolean; at: number; kind: "click" | "hit"; instrument?: SongInstrument; accent?: boolean; velocity?: number; volumeScale?: number; pan?: number; barIndex: number; mixOverride: DrumMixSettings };
export type TrackBar = ArrangementBar & { startsAt: number; duration: number; startBeat?: number };
export type PlaybackTrack = { bars: TrackBar[]; cues: PlaybackCue[]; duration: number };
const clampBpm=(value:number)=>Math.max(40,Math.min(200,value));

/** Scale a rendered track's tempo map while keeping every cue on its musical beat. */
export function scalePlaybackTrack(track: PlaybackTrack, scale: number): PlaybackTrack {
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.0001) return track;
  let cursor = 0;
  const bars = track.bars.map((bar) => {
    const bpm = clampBpm(bar.bpm * scale);
    const beatSpan = bar.duration * bar.bpm / 60_000;
    const duration = beatSpan * 60_000 / bpm;
    const next = { ...bar, bpm, startsAt: cursor, duration };
    cursor += duration;
    return next;
  });
  const byIndex = new Map(bars.map((bar) => [bar.index, bar]));
  const sourceBars = new Map(track.bars.map((bar) => [bar.index, bar]));
  const cues = track.cues.map((cue) => {
    const source = sourceBars.get(cue.barIndex), target = byIndex.get(cue.barIndex);
    if (!source || !target) return cue;
    const beatOffset = Math.max(0, (cue.at - source.startsAt) * source.bpm / 60_000);
    return { ...cue, at: target.startsAt + beatOffset * 60_000 / target.bpm };
  }).sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "click" ? -1 : 1));
  return { bars, cues, duration: cursor };
}

/** Convert a musical beat position into milliseconds in a tempo-scaled track. */
export function playbackTimeAtBeat(track: PlaybackTrack, beat: number): number {
  let remaining = Math.max(0, beat);
  for (const bar of track.bars) {
    const span = bar.duration * bar.bpm / 60_000;
    if (remaining <= span) return bar.startsAt + remaining * 60_000 / bar.bpm;
    remaining -= span;
  }
  return track.duration;
}

export function playbackTrack(song: DrumSong, sectionId?: string, swing = 50, clickSubdivision = 1, range?: [number, number], humanizeAmount = 0, humanizeSeed = 1729, bpmOffset = 0, velocityAmount = humanizeAmount, defaultMix: DrumMixSettings = DEFAULT_DRUM_MIX): PlaybackTrack {
  const unfilteredBars = buildArrangementBars(song, sectionId);
  const selectedBars = unfilteredBars.slice(Math.max(0, range ? range[0] - 1 : 0), range ? Math.max(range[0], range[1]) : undefined);
  const sourceBars = humanizeArrangementBars(selectedBars.map((bar) => ({ ...bar, bpm: clampBpm(bar.bpm + bpmOffset) })), humanizeAmount, humanizeSeed, velocityAmount);
  const offset = sectionId ? Math.max(0, buildArrangementBars(song).find((bar) => bar.sectionId === sectionId)?.index ?? 0) : 0;
  const bars: TrackBar[] = [];
  const cues: PlaybackCue[] = [];
  let cursor = 0;
  for (const source of sourceBars) {
    const duration = source.beats * 60_000 / source.bpm;
    const bar: TrackBar = { ...source, index: source.index + offset, startsAt: cursor, duration };
    bars.push(bar);
    const quarterMs = 60_000 / source.bpm;
    const clickStep = quarterMs / Math.max(1, clickSubdivision);
    for (let clickAt = 0, subdivision = 0; clickAt < duration - 0.00001; clickAt += clickStep, subdivision += 1) {
      cues.push({ at: cursor + clickAt, kind: "click", barIndex: bar.index, accent: subdivision % clickSubdivision === 0 && clickAt === 0, mixOverride: source.kitMix ?? defaultMix });
    }
    for (const hit of source.hits) {
      const volumeScale = automationScaleAtHit(source, hit);
      if (volumeScale <= 0.001) continue;
      const audibleVoice = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
      const automationBeat = (source.arrangementBeatStart ?? 0) + hit.beat;
      const arrangementVelocityScale = arrangementAutomationValue(source, audibleVoice, "velocity", automationBeat, 1);
      const pan = arrangementAutomationValue(source, audibleVoice, "pan", automationBeat, Number.NaN);
      const hitSubdivision = hit.sourceSubdivision ?? source.subdivision;
      const gridPosition = hit.step % hitSubdivision;
      const swingableOffbeat = (hitSubdivision === 8 && gridPosition % 2 === 1) || (hitSubdivision === 16 && gridPosition % 4 === 2);
      const clipSwing = source.clipOverrides?.swing ?? swing;
      const swingDelay = swingableOffbeat ? quarterMs * (Math.max(50, Math.min(75, clipSwing)) - 50) / 100 : 0;
      const hitAt = cursor + hit.beat * quarterMs + swingDelay;
      const articulation = hit.articulation ?? "normal";
      const strikes = expressionStrikes(articulation,quarterMs*4/hitSubdivision);
      for (const [delay, articulationVelocityScale] of strikes) cues.push({
        at: Math.max(cursor, hitAt + delay),
        kind: "hit",
        choke: articulation === "choke",
        instrument: articulation === "foot-splash" ? "openhat" : hit.instrument,
        accent: hit.accent,
        velocity: Math.max(1, Math.min(127, Math.round(hit.velocity * arrangementVelocityScale * articulationVelocityScale))),
        volumeScale,
        pan: Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : undefined,
        barIndex: bar.index,
        mixOverride: source.kitMix ?? defaultMix
      });
    }
    cursor += duration;
  }
  cues.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "click" ? -1 : 1));
  return { bars, cues, duration: cursor };
}


/** Boundary positions are zero-based measure fractions; end is exclusive. */
export function trimPlaybackTrack(track:PlaybackTrack,start:number,end:number):PlaybackTrack {
  const boundary=(value:number)=>{const index=Math.floor(value),bar=track.bars[index];return bar?bar.startsAt+(value-index)*bar.duration:track.duration;};
  const from=boundary(Math.max(0,start)),to=boundary(Math.min(track.bars.length,end));
  if(to<=from)return {bars:[],cues:[],duration:0};
  return {duration:to-from,cues:track.cues.filter(c=>c.at>=from&&c.at<to).map(c=>({...c,at:c.at-from})),bars:track.bars.filter(b=>b.startsAt+b.duration>from&&b.startsAt<to).map(b=>({...b,startBeat:Math.max(0,from-b.startsAt)*b.bpm/60000,startsAt:Math.max(0,b.startsAt-from),duration:Math.min(to,b.startsAt+b.duration)-Math.max(from,b.startsAt)}))};
}
