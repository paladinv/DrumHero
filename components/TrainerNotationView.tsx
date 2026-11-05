"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Instrument, PracticePattern, SongInstrument } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";

const STAFF_Y = [36, 54, 72, 90, 108];
const VOICE_Y: Record<"kick" | "snare" | "hihat" | "tom" | "crash", number> = { crash: 18, hihat: 27, tom: 54, snare: 90, kick: 126 };
const VOICE_LABELS = { crash: "Crash", hihat: "Hi-hat", tom: "Tom", snare: "Snare", kick: "Kick" } as const;

export type DrumNotationEvent = {
  step: number;
  instrument: SongInstrument;
  source?: "reference" | "played" | "target";
  accent?: boolean;
  velocity?: number;
  velocityTarget?: number;
  sticking?: "R" | "L";
  articulation?: string;
  flagCount?: number;
  review?: "matched" | "missed" | "early" | "late" | "violation";
};

export type DrumNotationGridMark = { step: number; label?: string; beat?: boolean };
export type DrumNotationRegion = { start: number; end: number; label: string; kind: "rest" };
export type DrumNotationFrame = {
  name: string;
  meter: string;
  bars: number;
  stepsPerBar: number;
  totalSteps: number;
  stepsPerPulse?: number;
  flagCount?: number;
  grid: DrumNotationGridMark[];
  events: DrumNotationEvent[];
  playheadStep?: number;
  playheadTransitionMs?: number;
  regions?: DrumNotationRegion[];
  allowedInstruments?: Instrument[];
  guidance?: string[];
  autoFollow?: boolean;
  emptyCountLabel?: string;
};

const DISPLAY_VOICE = (instrument: SongInstrument): keyof typeof VOICE_Y => {
  if (instrument === "kick" || instrument === "snare" || instrument === "tom" || instrument === "crash") return instrument;
  if (instrument === "hihat" || instrument === "openhat" || instrument === "ride" || instrument === "cowbell" || instrument === "shaker" || instrument === "tambourine") return "hihat";
  if (instrument === "rimshot") return "snare";
  return "tom";
};

function displayVoiceForEvent(event: DrumNotationEvent): keyof typeof VOICE_Y {
  if (event.articulation === "open-hat" || event.articulation === "closed-hat" || event.articulation === "pedal-hat" || event.articulation === "foot-splash") return "hihat";
  if (event.articulation === "ride" || event.articulation === "crash") return "crash";
  if (event.articulation === "rimshot") return "snare";
  return DISPLAY_VOICE(event.instrument);
}

function describeEvent(event: DrumNotationEvent, t: (key: string, values?: Record<string, string | number>) => string) {
  const voice = displayVoiceForEvent(event);
  const articulation = event.articulation ? ` · ${t(event.articulation)}` : "";
  const source = event.source === "target" ? ` · ${t("Guide note")}` : event.source === "played" ? ` · ${t("Played")}` : "";
  return `${t(VOICE_LABELS[voice])}${event.sticking ? ` · ${event.sticking}` : ""}${event.accent ? ` · ${t("accent")}` : ""}${articulation}${source}`;
}

export function DrumStaffNotation({ frame, showRhythmStems = false }: { frame: DrumNotationFrame; showRhythmStems?: boolean }) {
  const { t } = useLocalization();
  const scroller = useRef<HTMLDivElement>(null);
  const [stepWidth, setStepWidth] = useState(34);
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const followPlayhead = followOverride ?? (frame.autoFollow ?? false);
  const width = Math.max(320, 36 + frame.totalSteps * stepWidth);
  const xFor = useCallback((step: number) => 18 + step * stepWidth, [stepWidth]);
  const playhead = frame.playheadStep === undefined ? null : Math.max(0, Math.min(frame.totalSteps, frame.playheadStep));
  const currentGrid = playhead === null ? null : [...frame.grid].reverse().find(mark => mark.beat && mark.step <= playhead + 0.001);
  const middleVoiceLabel = frame.allowedInstruments && frame.allowedInstruments.includes("snare") && !frame.allowedInstruments.includes("tom")
    ? t("Snare")
    : frame.allowedInstruments && frame.allowedInstruments.includes("tom") && !frame.allowedInstruments.includes("snare")
      ? t("Tom")
      : t("Snare · tom");
  const hitsByStep = useMemo(() => {
    const grouped = new Map<number, DrumNotationEvent[]>();
    for (const event of frame.events) {
      const key = Math.round(event.step);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [frame.events]);
  const beams = useMemo(() => {
    const groups = new Map<string, Array<{ index: number; step: number; x: number; y: number; flags: number; down: boolean }>>();
    const compoundMeter = frame.meter.endsWith("/8") && (frame.stepsPerPulse ?? 0) === 2;
    const groupSteps = compoundMeter ? 6 : frame.stepsPerPulse ?? 1;
    frame.events.forEach((event, index) => {
      const source = event.source ?? "reference", flags = event.flagCount ?? frame.flagCount ?? 1;
      if (source === "target" || flags < 1) return;
      const voice = displayVoiceForEvent(event), y = VOICE_Y[voice], side = y <= 72 ? "down" : "up";
      const key = `${source}:${Math.floor(event.step / groupSteps)}:${side}:${flags}`;
      const list = groups.get(key) ?? [];
      if (!list.some(item => Math.abs(item.step - event.step) < 0.001)) list.push({ index, step: event.step, x: xFor(event.step) + 5 + (source === "played" ? 3 : 0), y: y <= 72 ? y + 38 : y - 38, flags, down: y <= 72 });
      groups.set(key, list);
    });
    const result: Array<{ from: number; to: number; x1: number; x2: number; y1: number; y2: number; flags: number; down: boolean }> = [];
    const maxGap = compoundMeter ? 2 : Math.max(1, (frame.stepsPerPulse ?? 1) / 2);
    for (const notes of groups.values()) {
      notes.sort((a, b) => a.step - b.step);
      for (let index = 0; index < notes.length - 1; index++) {
        const first = notes[index], next = notes[index + 1];
        if (next.step - first.step <= maxGap + 0.001) result.push({ from: first.index, to: next.index, x1: first.x, x2: next.x, y1: first.y, y2: next.y, flags: first.flags, down: first.down });
      }
    }
    return result;
  }, [frame.events, frame.flagCount, frame.meter, frame.stepsPerPulse, xFor]);
  const beamedEvents = useMemo(() => new Set(beams.flatMap(beam => [beam.from, beam.to])), [beams]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setStepWidth(entry.contentRect.width < 560 ? 23 : 34));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!followPlayhead || playhead === null || !scroller.current) return;
    const element = scroller.current;
    const x = 18 + playhead * stepWidth;
    const inset = Math.min(112, Math.max(48, element.clientWidth * 0.2));
    if (x > element.scrollLeft + element.clientWidth - inset) element.scrollLeft = Math.max(0, x - element.clientWidth + inset);
    else if (x < element.scrollLeft + inset * 0.5) element.scrollLeft = Math.max(0, x - inset);
  }, [followPlayhead, playhead, stepWidth]);

  const eventAt = (step: number) => hitsByStep.get(Math.round(step)) ?? [];
  const beatStart = currentGrid?.step ?? (playhead === null ? 0 : Math.floor(playhead / (frame.stepsPerPulse ?? 1)) * (frame.stepsPerPulse ?? 1));
  const currentEvents = playhead === null ? [] : frame.events.filter(event => event.step >= beatStart - 0.001 && event.step < beatStart + (frame.stepsPerPulse ?? 1) - 0.001);
  const currentReadout = playhead === null ? "" : `${t("Bar {bar}, beat {beat}", { bar: Math.min(frame.bars, Math.floor(Math.min(playhead, Math.max(0, frame.totalSteps - 0.001)) / frame.stepsPerBar) + 1), beat: currentGrid?.label ?? "—" })} · ${currentEvents.length ? currentEvents.map(event => describeEvent(event, t)).join("; ") : frame.emptyCountLabel ?? t("No note at this count yet")}`;

  return <section className="trainer-notation-scroll" aria-label={t("{name} drum notation", { name: frame.name })}>
    <div className="trainer-notation-heading"><strong>{frame.name}</strong><span>{frame.meter}</span></div>
    {frame.allowedInstruments && <p className="trainer-notation-allowed">{t("Allowed drums")}: {frame.allowedInstruments.map(instrument => t(VOICE_LABELS[instrument])).join(", ")}</p>}
    {frame.guidance?.map((item, index) => <p className="trainer-notation-guidance" key={`${index}-${item}`}>{item}</p>)}
    {playhead !== null && <button type="button" className="trainer-notation-follow" aria-pressed={followPlayhead} onClick={() => setFollowOverride(!followPlayhead)}>{t(followPlayhead ? "Following playhead · tap to browse" : "Return to playhead")}</button>}
    <div className="trainer-notation-viewport" ref={scroller} tabIndex={0} role="region" aria-label={t("Scrollable drum score")}>
      <svg className="trainer-notation" width={width} height="172" viewBox={`0 0 ${width} 172`} role="img" aria-label={t("{name}, {meter} drum staff. Current count: {count}. {events} events shown.", { name: frame.name, meter: frame.meter, count: currentGrid?.label ?? t("ready"), events: frame.events.length })}>
        {playhead !== null && <rect x={xFor(0) - 12} y="20" width="26" height="132" rx="5" className="trainer-notation-playhead" style={{ transform: `translateX(${playhead * stepWidth}px)`, transitionDuration: `${frame.playheadTransitionMs ?? 0}ms` }} aria-hidden="true" />}
        {STAFF_Y.map(y => <line key={y} x1="8" x2={width - 8} y1={y} y2={y} className="trainer-notation-staff" />)}
        {frame.regions?.map((region, index) => <g key={`${region.kind}-${index}`}>
          <rect x={xFor(region.start) - 9} y="24" width={Math.max(12, (region.end - region.start) * stepWidth)} height="128" rx="4" className="trainer-notation-rest-region" aria-hidden="true" />
          <text x={xFor(region.start) - 9 + Math.max(12, (region.end - region.start) * stepWidth) / 2} y="33" className="trainer-notation-region-label" aria-hidden="true">{t("Rest")}</text>
          <title>{region.label}</title>
        </g>)}
        {frame.grid.map((mark, index) => <g key={`${mark.step}-${index}`}>
          {mark.label && <text x={xFor(mark.step)} y="158" className={`trainer-notation-count${mark.beat ? " trainer-notation-count-beat" : ""}`}>{mark.label}</text>}
          {!mark.label && <line x1={xFor(mark.step)} x2={xFor(mark.step)} y1="34" y2="110" className="trainer-notation-subdivision" />}
        </g>)}
        {Array.from({ length: frame.bars }, (_, bar) => <line key={`bar-${bar}`} x1={xFor(bar * frame.stepsPerBar) - 12} x2={xFor(bar * frame.stepsPerBar) - 12} y1="28" y2="116" className="trainer-notation-bar" />)}
        {beams.map((beam, index) => {
          const offset = beam.down ? 4 : -4;
          return <g key={`beam-${index}`} className="trainer-notation-beam" aria-hidden="true">
            <line x1={beam.x1} x2={beam.x2} y1={beam.y1} y2={beam.y2} />
            {beam.flags > 1 && <line x1={beam.x1} x2={beam.x2} y1={beam.y1 + offset} y2={beam.y2 + offset} />}
          </g>;
        })}
        {frame.events.map((event, index) => {
          const voice = displayVoiceForEvent(event), y = VOICE_Y[voice];
          const source = event.source ?? "reference";
          const offset = source === "target" ? -3 : source === "played" ? 3 : 0;
          const x = xFor(event.step) + 5 + offset;
          const stemX = y <= 72 ? x - 5 : x + 5;
          const stemEnd = y <= 72 ? y + 38 : y - 38;
          const velocity = event.velocity ?? event.velocityTarget;
          const className = `trainer-notation-event trainer-notation-${source}${velocity !== undefined && velocity < 45 ? " trainer-notation-ghost" : ""}${event.review ? ` trainer-notation-review-${event.review}` : ""}`;
          const articulationMark = event.articulation === "flam" ? "f" : event.articulation === "drag" ? "d" : event.articulation === "open-hat" ? "O" : event.articulation === "pedal-hat" ? "P" : event.articulation === "foot-splash" ? "FS" : event.articulation === "ride" ? "R" : event.articulation === "rimshot" ? "RS" : event.articulation === "crash" ? "C" : "";
          return <g key={`${source}-${event.step}-${event.instrument}-${index}`} className={className}>
            {showRhythmStems && <>
              <line x1={stemX} x2={stemX} y1={y} y2={stemEnd} className="trainer-notation-stem" />
              {Array.from({ length: beamedEvents.has(index) ? 0 : event.flagCount ?? frame.flagCount ?? 1 }, (_, flag) => <path key={`flag-${flag}`} d={y <= 72 ? `M ${stemX} ${stemEnd + flag * 5} q -11 2 -8 11` : `M ${stemX} ${stemEnd - flag * 5} q 11 -2 8 -11`} className="trainer-notation-flag" />)}
            </>}
            {voice === "hihat" || voice === "crash" ? <path d={`M ${x - 6} ${y - 5} L ${x + 6} ${y + 5} M ${x - 6} ${y + 5} L ${x + 6} ${y - 5}`} className="trainer-notation-cymbal" /> : <ellipse cx={x} cy={y} rx={velocity !== undefined && velocity < 45 ? 4.3 : 6} ry="4.4" className="trainer-notation-drum" transform={`rotate(-20 ${x} ${y})`} />}
            {event.accent && <text x={x - 4} y={y - 11} className="trainer-notation-accent">&gt;</text>}
            {articulationMark && <text x={x + 8} y={y - 7} className="trainer-notation-articulation">{articulationMark}</text>}
            {event.sticking && <text x={x - 3} y={Math.min(148, y + 14)} className="trainer-notation-sticking">{event.sticking}</text>}
            <title>{describeEvent(event, t)} · {t("count {count}", { count: event.step + 1 })}{velocity === undefined ? "" : ` · ${t("velocity {velocity}", { velocity })}`}</title>
          </g>;
        })}
        <text x="12" y="12" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.some(instrument => instrument === "crash" || instrument === "hihat") ? " trainer-notation-muted-voice" : ""}`}>{t("Crash / hi-hat")}</text>
        <text x="12" y="70" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.some(instrument => instrument === "snare" || instrument === "tom") ? " trainer-notation-muted-voice" : ""}`}>{middleVoiceLabel}</text>
        <text x="12" y="142" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.includes("kick") ? " trainer-notation-muted-voice" : ""}`}>{t("Kick")}</text>
      </svg>
    </div>
    {playhead !== null && <p className="trainer-notation-live-step" aria-live="polite" aria-atomic="true">{currentReadout}</p>}
    <details className="trainer-notation-text"><summary>{t("Read notation as a step list")}</summary><ol>{frame.grid.map((mark, index) => {
      const stepHits = eventAt(mark.step);
      return <li key={`${mark.step}-${index}`} className={playhead !== null && Math.floor(playhead) === Math.floor(mark.step) ? "is-active" : ""} aria-current={playhead !== null && Math.floor(playhead) === Math.floor(mark.step) ? "step" : undefined}>
        {t("Count {count}", { count: mark.label ?? Math.floor(mark.step) + 1 })}: {stepHits.length ? stepHits.map(event => describeEvent(event, t)).join("; ") : frame.emptyCountLabel ?? t("rest")}
      </li>;
    })}</ol></details>
    <small>{t("Drum staff · × cymbal · oval drum note · > accent · f flam · d drag. Beams group notes; beat counts and subdivisions appear below the staff.")}</small>
  </section>;
}

export function TrainerNotationView({ pattern, currentStep, meter: meterOverride, showRhythmStems = false }: { pattern: PracticePattern; currentStep?: number; meter?: string; showRhythmStems?: boolean }) {
  const { t } = useLocalization();
  const stepsPerBeat = pattern.subdivision / 4;
  const totalSteps = Math.max(1, Math.round(pattern.beats * stepsPerBeat));
  const meterLabel = meterOverride ?? ("meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : undefined);
  const meter = meterLabel?.match(/(\d+)\s*\/\s*(\d+)/) ?? null;
  const stepsPerBar = meter ? Number(meter[1]) * pattern.subdivision / Number(meter[2]) : totalSteps;
  const compoundEighths = meter && Number(meter[2]) === 8 && Number(meter[1]) % 3 === 0 && pattern.subdivision === 8;
  const countLabel = (step: number) => {
    if (compoundEighths) return step % 3 === 0 ? String(Math.floor(step / 3) + 1) : step % 3 === 1 ? "la" : "li";
    const beat = Math.floor(step / stepsPerBeat) + 1;
    const subdivision = step % stepsPerBeat;
    if (subdivision === 0) return String(beat);
    if (stepsPerBeat === 2) return "&";
    if (stepsPerBeat === 3) return ["trip", "let"][subdivision - 1] ?? "";
    if (stepsPerBeat === 4) return ["e", "&", "a"][subdivision - 1] ?? "";
    if (stepsPerBeat === 5) return ["ta", "ka", "di", "mi"][subdivision - 1] ?? "";
    return String(subdivision + 1);
  };
  const frame: DrumNotationFrame = {
    name: pattern.name,
    meter: meterLabel ?? `${pattern.beats}/4`,
    bars: Math.max(1, Math.ceil(totalSteps / stepsPerBar)),
    stepsPerBar,
    totalSteps,
    stepsPerPulse: stepsPerBeat,
    flagCount: pattern.subdivision === 16 ? 2 : 1,
    grid: Array.from({ length: totalSteps }, (_, step) => ({ step, label: countLabel(step), beat: step % stepsPerBeat === 0 })),
    events: pattern.hits.map(hit => ({ ...hit, step: hit.step, instrument: hit.instrument, source: "reference" as const, velocityTarget: hit.velocityTarget })),
    ...(currentStep === undefined ? {} : { playheadStep: currentStep }),
  };
  return <DrumStaffNotation frame={frame} showRhythmStems={showRhythmStems} />;
}
