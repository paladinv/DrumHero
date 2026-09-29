"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DrumKitEngine, DrumKitSnapshot, DrumKitView } from "@/lib/drum-engine";
import type { HandSide } from "@/lib/drum-animation";
import type { Instrument } from "@/lib/types";

export type DrumKitCanvasHandle = {
  hit(instrument: Instrument, hand?: HandSide, velocity?: number): void;
  advance(ms: number): void;
  snapshot(): DrumKitSnapshot | null;
};

type DrumKitCanvasProps = {
  className?: string;
  interactive?: boolean;
  label?: string;
  compact?: boolean;
  view?: DrumKitView;
};

/** Lazy client-only Three.js mount. The engine is never imported during SSR. */
export const DrumKitCanvas = forwardRef<DrumKitCanvasHandle, DrumKitCanvasProps>(function DrumKitCanvas(
  { className = "", interactive = true, label = "Interactive 3D drum kit", compact = false, view },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DrumKitEngine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  useImperativeHandle(ref, () => ({
    hit: (instrument, hand, velocity) => engineRef.current?.hit(instrument, hand, velocity),
    advance: (ms) => engineRef.current?.advance(ms),
    snapshot: () => engineRef.current?.snapshot() ?? null,
  }), []);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void Promise.all([import("three"), import("@/lib/drum-engine")]).then(([three, module]) => {
      if (cancelled || !hostRef.current) return;
      try {
        const engine = module.createDrumKitEngine(three, hostRef.current, { reducedMotion, interactive, view: view ?? (compact ? "player" : "showcase"), pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) });
        engineRef.current = engine;
        engine.element.setAttribute("aria-label", label);
        engine.element.tabIndex = interactive ? 0 : -1;
        if (!interactive) engine.element.style.pointerEvents = "none";
        setStatus("ready");
      } catch {
        setStatus("fallback");
      }
    }).catch(() => { if (!cancelled) setStatus("fallback"); });
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [compact, interactive, label, view]);

  return <div className={`drum-kit-canvas ${compact ? "drum-kit-canvas-compact-sized" : ""} ${className}`} ref={hostRef} data-engine-status={status} aria-label={label}>
    {status !== "ready" ? <div className="drum-kit-fallback" role="img" aria-label={`${label}. ${status === "loading" ? "Loading visual kit." : "3D visuals unavailable; use the five voice controls."}`}>
      <span className="drum-kit-fallback-title">Drum kit engine</span>
      <span className="drum-kit-fallback-copy">{status === "loading" ? "Loading 3D kit…" : "3D visuals unavailable. The playable controls remain available."}</span>
    </div> : null}
    {interactive ? <span className="drum-kit-instructions">Click a drum or focus this kit and press Space (kick), F (snare), J (hi-hat), K (tom), or L (crash).</span> : null}
  </div>;
});
