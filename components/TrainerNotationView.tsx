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
  tuplet?: { actualNotes: number; normalNotes: number };
  grace?: true;
  flagCount?: number;
  review?: "matched" | "missed" | "early" | "late" | "violation";
  timingOffsetMs?: number;
  count?: number;
};

export type DrumNotationGridMark = { step: number; label?: string; beat?: boolean };
export type DrumNotationRegion = { start: number; end: number; label: string; kind: "rest" };
export type DrumNotationAnnotation = { step: number; body: string; voice?: string };
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
  annotations?: DrumNotationAnnotation[];
  allowedInstruments?: Instrument[];
  guidance?: string[];
  autoFollow?: boolean;
  emptyCountLabel?: string;
  showRests?: boolean;
  editor?: { instrument: Instrument; onToggle: (step: number) => void; isActive: (step: number) => boolean; isEnabled: (step: number) => boolean; label?: (step: number, active: boolean) => string };
  tupletLabel?: string;
  tupletGroupSteps?: number;
  groupBoundaries?: number[];
  groupingLabel?: string;
  feedback?: Array<{ instrument: SongInstrument; step: number; review: NonNullable<DrumNotationEvent["review"]>; count?: number }>;
  barActions?: { selectedBar?: number; onSelect: (bar: number) => void };
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
  if (event.articulation === "rimshot" || event.articulation === "side-stick") return "snare";
  return DISPLAY_VOICE(event.instrument);
}

function describeEvent(event: DrumNotationEvent, t: (key: string, values?: Record<string, string | number>) => string) {
  const voice = displayVoiceForEvent(event);
  const articulation = event.articulation ? ` · ${t(event.articulation)}` : "";
  const tuplet = event.tuplet ? ` · ${t("{actual}:{normal} tuplet", { actual: event.tuplet.actualNotes, normal: event.tuplet.normalNotes })}` : "";
  const grace = event.grace ? ` · ${t("grace note")}` : "";
  const source = event.source === "target" ? ` · ${t("Guide note")}` : event.source === "played" ? ` · ${t("Played")}` : "";
  const review = event.review ? ` · ${t(event.review === "matched" ? "Matched" : event.review === "missed" ? "Missed" : event.review === "violation" ? "Extra" : event.review === "early" ? "Early" : "Late")}` : "";
  const timing = event.timingOffsetMs === undefined ? "" : ` · ${Math.abs(event.timingOffsetMs)} ms ${event.timingOffsetMs < 0 ? t("early") : t("late")}`;
  return `${t(VOICE_LABELS[voice])}${event.sticking ? ` · ${event.sticking}` : ""}${event.accent ? ` · ${t("accent")}` : ""}${articulation}${grace}${tuplet}${source}${review}${timing}`;
}

export function DrumStaffNotation({ frame, showRhythmStems = true, improvisationControls = false }: { frame: DrumNotationFrame; showRhythmStems?: boolean; improvisationControls?: boolean }) {
  const { t } = useLocalization();
  const scroller = useRef<HTMLDivElement>(null);
  const [baseStepWidth, setBaseStepWidth] = useState(34), [zoom, setZoom] = useState(100), [focusBar, setFocusBar] = useState<number | null>(null);
  const selectedBar = focusBar !== null && focusBar <= frame.bars ? focusBar
    : frame.barActions?.selectedBar && frame.barActions.selectedBar <= frame.bars ? frame.barActions.selectedBar : null;
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const followPlayhead = followOverride ?? (frame.autoFollow ?? false);
  const stepWidth = baseStepWidth * zoom / 100;
  const viewStartStep = selectedBar === null ? 0 : (selectedBar - 1) * frame.stepsPerBar;
  const viewEndStep = selectedBar === null ? frame.totalSteps : Math.min(frame.totalSteps, viewStartStep + frame.stepsPerBar);
  const viewSteps = Math.max(1, viewEndStep - viewStartStep);
  const width = Math.max(320, 36 + viewSteps * stepWidth);
  const xFor = useCallback((step: number) => 18 + (step - viewStartStep) * stepWidth, [stepWidth, viewStartStep]);
  const absolutePlayhead = frame.playheadStep === undefined ? null : Math.max(0, Math.min(frame.totalSteps, frame.playheadStep));
  const playhead = absolutePlayhead !== null && absolutePlayhead >= viewStartStep && absolutePlayhead <= viewEndStep ? absolutePlayhead : null;
  const currentGrid = playhead === null ? null : [...frame.grid].reverse().find(mark => mark.beat && mark.step <= playhead + 0.001);
  const visibleGrid = frame.grid.filter(mark => mark.step >= viewStartStep - 0.001 && mark.step < viewEndStep - 0.001);
  const transcriptBars = Array.from({ length: selectedBar === null ? frame.bars : 1 }, (_, index) => {
    const start = selectedBar === null ? index * frame.stepsPerBar : (selectedBar - 1) * frame.stepsPerBar;
    const end = Math.min(viewEndStep, start + frame.stepsPerBar);
    return { number: Math.floor(start / frame.stepsPerBar) + 1, marks: visibleGrid.filter(mark => mark.step >= start && mark.step < end) };
  }).filter(bar => bar.marks.length > 0);
  const visibleRegions = frame.regions?.filter(region => region.end > viewStartStep && region.start < viewEndStep).map(region => ({ ...region, start: Math.max(viewStartStep, region.start), end: Math.min(viewEndStep, region.end) }));
  const restMarks = frame.showRests ? visibleGrid.filter(mark => mark.beat && !frame.events.some(event => event.step >= mark.step - 0.001 && event.step < mark.step + (frame.stepsPerPulse ?? 1) - 0.001)) : [];
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
    const meterMatch = frame.meter.match(/(\d+)\s*\/\s*(\d+)/);
    const compoundMeter = Boolean(meterMatch && Number(meterMatch[2]) === 8 && Number(meterMatch[1]) % 3 === 0);
    const numerator = meterMatch ? Number(meterMatch[1]) : 0, denominator = meterMatch ? Number(meterMatch[2]) : 0;
    const groupSteps = compoundMeter ? (frame.stepsPerPulse ?? 1) * 3 : frame.stepsPerPulse ?? 1;
    const beamGroup = (step: number) => {
      const bar = Math.floor(step / frame.stepsPerBar), local = step - bar * frame.stepsPerBar;
      if (denominator === 8 && numerator === 7) {
        const pulse = Math.floor(local / (frame.stepsPerPulse ?? 1));
        return `${bar}:${pulse < 2 ? 0 : pulse < 4 ? 1 : 2}`;
      }
      return `${bar}:${Math.floor(local / groupSteps)}`;
    };
    frame.events.forEach((event, index) => {
      const source = event.source ?? "reference", flags = event.flagCount ?? frame.flagCount ?? 1;
      if (source === "target" || flags < 1) return;
      const voice = displayVoiceForEvent(event), y = VOICE_Y[voice], side = y <= 72 ? "down" : "up";
      const key = `${source}:${beamGroup(event.step)}:${side}:${flags}`;
      const list = groups.get(key) ?? [];
      if (!list.some(item => Math.abs(item.step - event.step) < 0.001)) list.push({ index, step: event.step, x: xFor(event.step) + 5 + (source === "played" ? 3 : 0), y: y <= 72 ? y + 38 : y - 38, flags, down: y <= 72 });
      groups.set(key, list);
    });
    const result: Array<{ from: number; to: number; x1: number; x2: number; y1: number; y2: number; flags: number; down: boolean }> = [];
    const maxGap = compoundMeter ? Math.max(1, Math.floor(groupSteps / 3)) : Math.max(2, (frame.stepsPerPulse ?? 1) / 2);
    for (const notes of groups.values()) {
      notes.sort((a, b) => a.step - b.step);
      for (let index = 0; index < notes.length - 1; index++) {
        const first = notes[index], next = notes[index + 1];
        if (next.step - first.step <= maxGap + 0.001) result.push({ from: first.index, to: next.index, x1: first.x, x2: next.x, y1: first.y, y2: next.y, flags: first.flags, down: first.down });
      }
    }
    return result;
  }, [frame.events, frame.flagCount, frame.meter, frame.stepsPerBar, frame.stepsPerPulse, xFor]);
  const beamedEvents = useMemo(() => new Set(beams.flatMap(beam => [beam.from, beam.to])), [beams]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setBaseStepWidth(entry.contentRect.width < 560 ? 23 : 34));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!followPlayhead || playhead === null || !scroller.current) return;
    const element = scroller.current;
    const x = xFor(playhead);
    const inset = Math.min(112, Math.max(48, element.clientWidth * 0.2));
    if (x > element.scrollLeft + element.clientWidth - inset) element.scrollLeft = Math.max(0, x - element.clientWidth + inset);
    else if (x < element.scrollLeft + inset * 0.5) element.scrollLeft = Math.max(0, x - inset);
  }, [followPlayhead, playhead, stepWidth, xFor]);

  const eventAt = (step: number) => hitsByStep.get(Math.round(step)) ?? [];
  const beatStart = currentGrid?.step ?? (playhead === null ? 0 : Math.floor(playhead / (frame.stepsPerPulse ?? 1)) * (frame.stepsPerPulse ?? 1));
  const currentEvents = playhead === null ? [] : frame.events.filter(event => event.step >= beatStart - 0.001 && event.step < beatStart + (frame.stepsPerPulse ?? 1) - 0.001);
  const currentReadout = playhead === null ? "" : `${t("Bar {bar}, beat {beat}", { bar: Math.min(frame.bars, Math.floor(Math.min(playhead, Math.max(0, frame.totalSteps - 0.001)) / frame.stepsPerBar) + 1), beat: currentGrid?.label ?? "—" })} · ${currentEvents.length ? currentEvents.map(event => describeEvent(event, t)).join("; ") : frame.showRests ? t("Rest on this beat") : frame.emptyCountLabel ?? t("No note at this count yet")}`;

  return <section className="trainer-notation-scroll" aria-label={t("{name} drum notation", { name: frame.name })}>
    <div className="trainer-notation-heading"><strong>{frame.name}</strong><span>{frame.meter}{frame.groupingLabel ? ` · ${frame.groupingLabel}` : ""}</span></div>
    {frame.allowedInstruments && <p className="trainer-notation-allowed">{t("Allowed drums")}: {frame.allowedInstruments.map(instrument => t(VOICE_LABELS[instrument])).join(", ")}</p>}
    {frame.guidance?.map((item, index) => <p className="trainer-notation-guidance" key={`${index}-${item}`}>{item}</p>)}
    {improvisationControls && <div className="trainer-notation-controls">
      <label>{t("Score range")}<select aria-label={t("Score range")} value={selectedBar ?? "all"} onChange={event => setFocusBar(event.target.value === "all" ? null : Number(event.target.value))}><option value="all">{t("Full phrase")}</option>{Array.from({ length: frame.bars }, (_, bar) => <option value={bar + 1} key={bar}>{t("Bar {bar}", { bar: bar + 1 })}</option>)}</select></label>
      <div className="trainer-notation-zoom"><button type="button" aria-label={t("Zoom out")} disabled={zoom <= 75} onClick={() => setZoom(value => Math.max(75, value - 25))}>−</button><span>{t("Score zoom {percent}%", { percent: zoom })}</span><button type="button" aria-label={t("Zoom in")} disabled={zoom >= 175} onClick={() => setZoom(value => Math.min(175, value + 25))}>+</button></div>
    </div>}
    {playhead !== null && <button type="button" className="trainer-notation-follow" aria-pressed={followPlayhead} onClick={() => setFollowOverride(!followPlayhead)}>{t(followPlayhead ? "Following playhead · tap to browse" : "Return to playhead")}</button>}
    <div className="trainer-notation-viewport" ref={scroller} tabIndex={0} role="region" aria-label={t("Scrollable drum score")}>
      <svg className="trainer-notation" width={width} height="172" viewBox={`0 0 ${width} 172`} role={frame.editor || frame.barActions ? "group" : "img"} aria-label={t("Drum staff notation for {name}, {meter}.{annotations}", { name: frame.name, meter: frame.meter, annotations: frame.annotations?.length ? ` ${t("{count} teacher annotations are marked on the score.", { count: frame.annotations.length })}` : "" })}>
        {playhead !== null && <rect x={xFor(viewStartStep) - 12} y="20" width="26" height="132" rx="5" className="trainer-notation-playhead" style={{ transform: `translateX(${(playhead - viewStartStep) * stepWidth}px)`, transitionDuration: `${frame.playheadTransitionMs ?? 0}ms` }} aria-hidden="true" />}
        {frame.annotations?.filter(annotation => annotation.step >= viewStartStep - 0.001 && annotation.step < viewEndStep - 0.001).map((annotation, index) => <g key={`teacher-annotation-${index}`} className="trainer-notation-teacher-annotation">
          <circle cx={xFor(annotation.step) + 5} cy="22" r="7" />
          <text x={xFor(annotation.step) + 5} y="25">i</text>
          <title>{t("Teacher comment{voice}: {body}", { voice: annotation.voice ? ` · ${t(annotation.voice)}` : "", body: annotation.body })}</title>
        </g>)}
        {STAFF_Y.map(y => <line key={y} x1="8" x2={width - 8} y1={y} y2={y} className="trainer-notation-staff" />)}
        {visibleRegions?.map((region, index) => <g key={`${region.kind}-${index}`}>
          <rect x={xFor(region.start) - 9} y="24" width={Math.max(12, (region.end - region.start) * stepWidth)} height="128" rx="4" className="trainer-notation-rest-region" aria-hidden="true" />
          <text x={xFor(region.start) - 9 + Math.max(12, (region.end - region.start) * stepWidth) / 2} y="33" className="trainer-notation-region-label" aria-hidden="true">{t("Rest")}</text>
          <title>{region.label}</title>
        </g>)}
        {visibleGrid.map((mark, index) => <g key={`${mark.step}-${index}`}>
          {mark.label && <text x={xFor(mark.step)} y="158" className={`trainer-notation-count${mark.beat ? " trainer-notation-count-beat" : ""}`}>{mark.label}</text>}
          {!mark.label && <line x1={xFor(mark.step)} x2={xFor(mark.step)} y1="34" y2="110" className="trainer-notation-subdivision" />}
        </g>)}
        {frame.groupBoundaries?.filter(step => step > viewStartStep && step < viewEndStep).map(step => <line key={`group-boundary-${step}`} x1={xFor(step) - stepWidth / 2} x2={xFor(step) - stepWidth / 2} y1="27" y2="116" className="trainer-notation-group-boundary" aria-hidden="true" />)}
        {frame.tupletLabel && Array.from({ length: selectedBar === null ? frame.bars : 1 }, (_, bar) => {
          const barStart = viewStartStep + bar * frame.stepsPerBar;
          const groupSteps = Math.max(1, frame.tupletGroupSteps ?? frame.stepsPerBar);
          return Array.from({ length: Math.ceil(frame.stepsPerBar / groupSteps) }, (_, group) => {
            const start = barStart + group * groupSteps;
            const end = Math.min(viewEndStep, barStart + frame.stepsPerBar, start + groupSteps);
            const left = xFor(start) - 2, right = xFor(end - 1) + 12, y = 13;
            return <g key={`tuplet-${bar}-${group}`} className="trainer-notation-tuplet" aria-label={t("Tuplet grouping {label}", { label: frame.tupletLabel ?? "" })}>
              <path d={`M ${left} ${y + 5} v -4 H ${right} v 4`} />
              <text x={(left + right) / 2} y={y - 2}>{frame.tupletLabel}</text>
            </g>;
          });
        })}
        {Array.from({ length: selectedBar === null ? frame.bars : 1 }, (_, bar) => <line key={`bar-${bar}`} x1={xFor(viewStartStep + bar * frame.stepsPerBar) - 12} x2={xFor(viewStartStep + bar * frame.stepsPerBar) - 12} y1="28" y2="116" className="trainer-notation-bar" />)}
        {selectedBar !== null && <line x1={xFor(viewEndStep) - 12} x2={xFor(viewEndStep) - 12} y1="28" y2="116" className="trainer-notation-bar" />}
        {restMarks.map(mark => <text key={`rest-${mark.step}`} x={xFor(mark.step)} y="85" className="trainer-notation-rest-symbol"><title>{t("Rest on beat {beat}", { beat: mark.label ?? "" })}</title>{frame.meter.endsWith("/8") ? "𝄾" : "𝄽"}</text>)}
        {beams.map((beam, index) => {
          const offset = beam.down ? 4 : -4;
          return <g key={`beam-${index}`} className="trainer-notation-beam" aria-hidden="true">
            <line x1={beam.x1} x2={beam.x2} y1={beam.y1} y2={beam.y2} />
            {beam.flags > 1 && <line x1={beam.x1} x2={beam.x2} y1={beam.y1 + offset} y2={beam.y2 + offset} />}
          </g>;
        })}
        {frame.events.map((event, index) => {
          if (event.step < viewStartStep - 0.001 || event.step >= viewEndStep - 0.001) return null;
          const voice = displayVoiceForEvent(event), y = VOICE_Y[voice];
          const source = event.source ?? "reference";
          const offset = source === "target" ? -3 : source === "played" ? 3 : 0;
          const x = xFor(event.step) + 5 + offset;
          const stemX = y <= 72 ? x - 5 : x + 5;
          const stemEnd = y <= 72 ? y + 38 : y - 38;
          const velocity = event.velocity ?? event.velocityTarget;
          const className = `trainer-notation-event trainer-notation-${source}${velocity !== undefined && velocity < 45 ? " trainer-notation-ghost" : ""}${event.grace ? " trainer-notation-grace" : ""}${event.review ? ` trainer-notation-review-${event.review}` : ""}`;
          const articulationMark = event.articulation === "flam" ? "f" : event.articulation === "drag" ? "d" : event.articulation === "buzz" ? "z" : event.articulation === "closed-hat" ? "CH" : event.articulation === "open-hat" ? "O" : event.articulation === "pedal-hat" ? "P" : event.articulation === "foot-splash" ? "FS" : event.articulation === "ride" ? "R" : event.articulation === "rimshot" ? "RS" : event.articulation === "side-stick" ? "SS" : event.articulation === "crash" ? "C" : "";
          return <g key={`${source}-${event.step}-${event.instrument}-${index}`} className={className}>
            {showRhythmStems && <>
              <line x1={stemX} x2={stemX} y1={y} y2={stemEnd} className="trainer-notation-stem" />
              {Array.from({ length: beamedEvents.has(index) ? 0 : event.flagCount ?? frame.flagCount ?? 1 }, (_, flag) => <path key={`flag-${flag}`} d={y <= 72 ? `M ${stemX} ${stemEnd + flag * 5} q -11 2 -8 11` : `M ${stemX} ${stemEnd - flag * 5} q 11 -2 8 -11`} className="trainer-notation-flag" />)}
            </>}
            {voice === "hihat" || voice === "crash" ? <path d={`M ${x - (event.grace ? 4 : 6)} ${y - (event.grace ? 4 : 5)} L ${x + (event.grace ? 4 : 6)} ${y + (event.grace ? 4 : 5)} M ${x - (event.grace ? 4 : 6)} ${y + (event.grace ? 4 : 5)} L ${x + (event.grace ? 4 : 6)} ${y - (event.grace ? 4 : 5)}`} className="trainer-notation-cymbal" /> : <ellipse cx={x} cy={y} rx={event.grace ? 3.8 : velocity !== undefined && velocity < 45 ? 4.3 : 6} ry={event.grace ? 3.3 : 4.4} className="trainer-notation-drum" transform={`rotate(-20 ${x} ${y})`} />}
            {event.grace && <text x={x - 3} y={y - 14} className="trainer-notation-articulation">gr</text>}
            {event.accent && <text x={x - 4} y={y - 11} className="trainer-notation-accent">&gt;</text>}
            {event.tuplet && <text x={x - 4} y={y - 20} className="trainer-notation-articulation">{event.tuplet.actualNotes}</text>}
            {event.count && <text x={x + 8} y={y - 9} className="trainer-notation-feedback-count">×{event.count}</text>}
            {event.timingOffsetMs !== undefined && <text x={x + 8} y={Math.min(150, y + 15)} className="trainer-notation-timing-offset">{event.timingOffsetMs > 0 ? "+" : "−"}{Math.abs(event.timingOffsetMs)} ms</text>}
            {articulationMark && <text x={x + 8} y={y - 7} className="trainer-notation-articulation">{articulationMark}</text>}
            {event.sticking && <text x={x - 3} y={Math.min(148, y + 14)} className="trainer-notation-sticking">{event.sticking}</text>}
            <title>{describeEvent(event, t)} · {t("count {count}", { count: event.step + 1 })}{velocity === undefined ? "" : ` · ${t("velocity {velocity}", { velocity })}`}</title>
          </g>;
        })}
        {frame.barActions && Array.from({ length: selectedBar === null ? frame.bars : 1 }, (_, index) => {
          const bar = selectedBar === null ? index + 1 : selectedBar;
          const start = (bar - 1) * frame.stepsPerBar;
          const end = Math.min(frame.totalSteps, start + frame.stepsPerBar);
          const x = xFor(start) - 12, barWidth = Math.max(18, (end - start) * stepWidth);
          const selected = frame.barActions?.selectedBar === bar;
          return <g key={`loop-bar-${bar}`} className={`trainer-notation-loop-action${selected ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={t("Loop bar {bar}", { bar })} aria-pressed={selected} onClick={() => { setFocusBar(bar); frame.barActions!.onSelect(bar); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocusBar(bar); frame.barActions!.onSelect(bar); } }}>
            <rect x={x} y="28" width={barWidth} height="88" rx="4" />
            <title>{t("Select bar {bar} as the Trainer loop.", { bar })}</title>
          </g>;
        })}
        {frame.editor && visibleGrid.map(mark => {
          const enabled = frame.editor!.isEnabled(mark.step);
          const active = frame.editor!.isActive(mark.step);
          const voice = DISPLAY_VOICE(frame.editor!.instrument as SongInstrument);
          const y = VOICE_Y[voice];
          const x = xFor(mark.step);
          const label = frame.editor!.label?.(mark.step, active) ?? t("{action} {voice} on count {count}", { action: active ? t("Remove") : t("Add"), voice: t(VOICE_LABELS[voice]), count: mark.label ?? mark.step + 1 });
          return <rect key={`editor-${mark.step}`} x={x - stepWidth / 2} y={y - 13} width={stepWidth} height="26" rx="4" className={`trainer-notation-editor-target${active ? " is-active" : ""}${enabled ? "" : " is-disabled"}`} role="button" tabIndex={enabled ? 0 : -1} aria-label={label} aria-pressed={active} aria-disabled={!enabled} onClick={() => { if (enabled) frame.editor!.onToggle(mark.step); }} onKeyDown={event => { if (enabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); frame.editor!.onToggle(mark.step); } }} />;
        })}
        <text x="12" y="12" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.some(instrument => instrument === "crash" || instrument === "hihat") ? " trainer-notation-muted-voice" : ""}`}>{t("Crash / hi-hat")}</text>
        <text x="12" y="70" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.some(instrument => instrument === "snare" || instrument === "tom") ? " trainer-notation-muted-voice" : ""}`}>{middleVoiceLabel}</text>
        <text x="12" y="142" className={`trainer-notation-label${frame.allowedInstruments && !frame.allowedInstruments.includes("kick") ? " trainer-notation-muted-voice" : ""}`}>{t("Kick")}</text>
      </svg>
    </div>
    {playhead !== null && <p className="trainer-notation-live-step" aria-live="polite" aria-atomic="true">{currentReadout}</p>}
    {frame.annotations?.length ? <ul className="trainer-notation-annotation-list" aria-label={t("Teacher comments on this score")}>{frame.annotations.filter(annotation => annotation.step >= viewStartStep - 0.001 && annotation.step < viewEndStep - 0.001).map((annotation, index) => <li key={`teacher-note-${index}`}>{t("Bar {bar}", { bar: Math.floor(annotation.step / frame.stepsPerBar) + 1 })} · {annotation.voice ? `${t(annotation.voice)} · ` : ""}{annotation.body}</li>)}</ul> : null}
    <details className="trainer-notation-text"><summary>{t("Read notation as a bar-by-bar text score")}</summary><ol className="trainer-notation-transcript">{transcriptBars.map(bar => <li key={bar.number}>
      <h4>{t("Bar {bar}", { bar: bar.number })}</h4>
      <ol>{bar.marks.map((mark, index) => {
        const stepHits = eventAt(mark.step);
        return <li key={`${mark.step}-${index}`} className={playhead !== null && Math.floor(playhead) === Math.floor(mark.step) ? "is-active" : ""} aria-current={playhead !== null && Math.floor(playhead) === Math.floor(mark.step) ? "step" : undefined}>
          {t("Count {count}", { count: mark.label ?? Math.floor(mark.step) + 1 })}: {stepHits.length ? stepHits.map(event => describeEvent(event, t)).join("; ") : frame.showRests ? t("Rest") : frame.emptyCountLabel ?? t("rest")}
        </li>;
      })}</ol>
    </li>)}</ol></details>
    {frame.feedback?.length ? <div className="trainer-notation-feedback-legend" aria-label={t("Notation feedback legend")}><span className="trainer-notation-feedback-key matched">{t("Matched")}</span><span className="trainer-notation-feedback-key missed">{t("Missed")}</span><span className="trainer-notation-feedback-key early">{t("Early / late")}</span><span className="trainer-notation-feedback-key violation">{t("Extra")}</span></div> : null}
    <small>{t("Drum staff · × cymbal · oval drum note · > accent · f flam · d drag · z buzz roll · CH closed hi-hat · O open hi-hat · P pedal hi-hat · R ride · C crash · RS rimshot · SS side-stick. Beams group notes; beat counts and subdivisions appear below the staff.")}</small>
  </section>;
}

export function TrainerNotationView({ pattern, currentStep, meter: meterOverride, showRhythmStems = true, compact = false, editor, tupletLabel: tupletLabelOverride, grouping, feedback, barActions }: { pattern: PracticePattern; currentStep?: number; meter?: string; showRhythmStems?: boolean; compact?: boolean; editor?: { instrument: Instrument; onToggle: (step: number) => void; isActive: (step: number) => boolean; isEnabled: (step: number) => boolean; label?: (step: number, active: boolean) => string }; tupletLabel?: string; grouping?: number[]; feedback?: Array<{ instrument: Instrument; step: number; review: NonNullable<DrumNotationEvent["review"]>; count?: number }>; barActions?: { selectedBar?: number; onSelect: (bar: number) => void } }) {
  const { t } = useLocalization();
  const stepsPerBeat = pattern.subdivision / 4;
  const totalSteps = Math.max(1, Math.round(pattern.beats * stepsPerBeat));
  const meterLabel = meterOverride ?? ("meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : undefined);
  const meter = meterLabel?.match(/(\d+)\s*\/\s*(\d+)/) ?? null;
  const stepsPerBar = meter ? Number(meter[1]) * pattern.subdivision / Number(meter[2]) : totalSteps;
  const tupletLabel = tupletLabelOverride ?? pattern.tupletLabel;
  const tupletGroupSteps = pattern.tupletGroupSteps ?? (tupletLabel === "3" || tupletLabel === "5" ? stepsPerBeat
    : tupletLabel === "3:2" ? stepsPerBeat * 2
    : tupletLabel === "5:4" ? stepsPerBeat * 4
    : tupletLabel === "4:3" || tupletLabel === "5:3" ? stepsPerBar
    : undefined);
  const compoundMeter = meter && Number(meter[2]) === 8 && Number(meter[1]) % 3 === 0;
  const compoundPulseSteps = compoundMeter ? pattern.subdivision * 3 / 8 : stepsPerBeat;
  const groupStepSize = meter && Number(meter[2]) === 8 ? pattern.subdivision / 8 : stepsPerBeat;
  const groupCounts = grouping && meter ? grouping.reduce((sum, value) => sum + value, 0) === Number(meter[1]) ? grouping : undefined : undefined;
  const groupBoundaries = groupCounts ? Array.from({ length: Math.ceil(totalSteps / stepsPerBar) }, (_, bar) => {
    const start = bar * stepsPerBar;
    let cursor = start;
    return groupCounts.map((count, index) => { if (index > 0) cursor += count * groupStepSize; return Math.round(cursor); });
  }).flat() : undefined;
  const tupletNormalNotes = Number(tupletLabel?.match(/^\d+:(\d+)$/)?.[1]);
  const flagCount = tupletNormalNotes ? Math.max(0, Math.min(4, Math.ceil(Math.log2(tupletNormalNotes))))
    : pattern.subdivision === 4 ? 0 : pattern.subdivision <= 12 ? 1 : pattern.subdivision <= 32 ? 2 : 3;
  const countLabel = (step: number) => {
    const withinBar = step % stepsPerBar;
    if (compoundMeter) {
      const pulse = Math.floor(withinBar / compoundPulseSteps);
      const subdivision = withinBar % compoundPulseSteps;
      if (subdivision === 0) return String(pulse + 1);
      const labels = compoundPulseSteps <= 3 ? ["la", "li"] : ["e", "&", "a", "la", "li"];
      return labels[subdivision - 1] ?? String(subdivision + 1);
    }
    const beat = Math.floor(withinBar / stepsPerBeat) + 1;
    const subdivision = withinBar % stepsPerBeat;
    if (subdivision === 0) return String(beat);
    if (stepsPerBeat === 2) return "&";
    if (stepsPerBeat === 3) return ["trip", "let"][subdivision - 1] ?? "";
    if (stepsPerBeat === 4) return ["e", "&", "a"][subdivision - 1] ?? "";
    if (stepsPerBeat === 5) return ["ta", "ka", "di", "mi"][subdivision - 1] ?? "";
    return String(subdivision + 1);
  };
  const frame: DrumNotationFrame = {
    name: pattern.name,
    meter: meterLabel ?? (Number.isInteger(pattern.beats)
      ? `${pattern.beats > 4 && pattern.beats % 4 === 0 ? 4 : pattern.beats}/4`
      : `${Math.round(pattern.beats * 2)}/8`),
    bars: Math.max(1, Math.ceil(totalSteps / stepsPerBar)),
    stepsPerBar,
    totalSteps,
    stepsPerPulse: compoundMeter ? compoundPulseSteps : stepsPerBeat,
    flagCount,
    grid: Array.from({ length: totalSteps }, (_, step) => ({ step, label: countLabel(step), beat: step % (compoundMeter ? compoundPulseSteps : stepsPerBeat) === 0 })),
    events: [
      ...pattern.hits.map(hit => {
        const mark = feedback?.filter(item => item.review !== "violation" && item.instrument === hit.instrument && item.step === hit.step) ?? [];
        const primary = mark.find(item => item.review === "violation") ?? mark.find(item => item.review === "missed") ?? mark.find(item => item.review === "early" || item.review === "late") ?? mark.find(item => item.review === "matched");
        return { ...hit, step: hit.step, instrument: hit.instrument, source: "reference" as const, articulation: hit.midiArticulationTarget ?? hit.articulation, velocityTarget: hit.velocityTarget, flagCount: hit.flagCount ?? flagCount, ...(primary ? { review: primary.review, ...(primary.count ? { count: primary.count } : {}) } : {}) };
      }),
      ...(feedback ?? []).filter(item => item.review === "violation").map(item => ({ step: item.step, instrument: item.instrument, source: "played" as const, review: "violation" as const, ...(item.count ? { count: item.count } : {}), flagCount })),
    ],
    editor,
    tupletLabel,
    tupletGroupSteps,
    ...(groupBoundaries ? { groupBoundaries, groupingLabel: groupCounts!.join("+") } : {}),
    feedback,
    barActions,
    ...(currentStep === undefined ? {} : { autoFollow: true }),
    showRests: true,
    ...(currentStep === undefined ? {} : { playheadStep: currentStep }),
  };
  return <div className={compact ? "trainer-notation-compact" : undefined}><DrumStaffNotation frame={frame} showRhythmStems={showRhythmStems} /></div>;
}
