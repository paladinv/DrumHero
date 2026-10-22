import { arrangementAutomationValue, automationScaleAtHit, buildArrangementBars, humanizeArrangementBars, type ArrangementBar } from './song-builder';
import { expressionStrikes } from './song-builder-creative';
import type { DrumSong } from './song-library';
import type { SongInstrument } from './types';
export type PlaybackCue = { choke?: boolean; at: number; kind: "click" | "hit"; instrument?: SongInstrument; accent?: boolean; velocity?: number; volumeScale?: number; pan?: number; barIndex: number };
export type TrackBar = ArrangementBar & { startsAt: number; duration: number; startBeat?: number };
export type PlaybackTrack = { bars: TrackBar[]; cues: PlaybackCue[]; duration: number };
const clampBpm=(value:number)=>Math.max(40,Math.min(200,value));
export function playbackTrack(song: DrumSong, sectionId?: string, swing = 50, clickSubdivision = 1, range?: [number, number], humanizeAmount = 0, humanizeSeed = 1729, bpmOffset = 0, velocityAmount = humanizeAmount): PlaybackTrack {
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
      cues.push({ at: cursor + clickAt, kind: "click", barIndex: bar.index, accent: subdivision % clickSubdivision === 0 && clickAt === 0 });
    }
    for (const hit of source.hits) {
      const volumeScale = automationScaleAtHit(source, hit);
      if (volumeScale <= 0.001) continue;
      const audibleVoice = hit.articulation === "foot-splash" ? "openhat" : hit.instrument;
      const automationBeat = (source.arrangementBeatStart ?? 0) + hit.beat;
      const arrangementVelocityScale = arrangementAutomationValue(source, audibleVoice, "velocity", automationBeat, 1);
      const pan = arrangementAutomationValue(source, audibleVoice, "pan", automationBeat, Number.NaN);
      const gridPosition = hit.step % source.subdivision;
      const swingableOffbeat = (source.subdivision === 8 && gridPosition % 2 === 1) || (source.subdivision === 16 && gridPosition % 4 === 2);
      const clipSwing = source.clipOverrides?.swing ?? swing;
      const swingDelay = swingableOffbeat ? quarterMs * (Math.max(50, Math.min(75, clipSwing)) - 50) / 100 : 0;
      const hitAt = cursor + hit.beat * quarterMs + swingDelay;
      const articulation = hit.articulation ?? "normal";
      const strikes = expressionStrikes(articulation,quarterMs*4/source.subdivision);
      for (const [delay, articulationVelocityScale] of strikes) cues.push({
        at: Math.max(cursor, hitAt + delay),
        kind: "hit",
        choke: articulation === "choke",
        instrument: articulation === "foot-splash" ? "openhat" : hit.instrument,
        accent: hit.accent,
        velocity: Math.max(1, Math.min(127, Math.round(hit.velocity * arrangementVelocityScale * articulationVelocityScale))),
        volumeScale,
        pan: Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : undefined,
        barIndex: bar.index
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
