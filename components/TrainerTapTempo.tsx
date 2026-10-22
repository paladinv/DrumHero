"use client";

import { useRef, useState } from "react";
import { estimateTrainerTempo } from "@/lib/trainer-tempo";

export function TrainerTapTempo({ min, max, disabled, onApply }: { min: number; max: number; disabled: boolean; onApply: (bpm: number) => void }) {
  const tapsRef = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const tap = () => {
    const now = performance.now();
    if (now - (tapsRef.current.at(-1) ?? 0) > 2500) tapsRef.current = [];
    tapsRef.current = [...tapsRef.current, now].slice(-9);
    setTapCount(tapsRef.current.length);
    setBpm(estimateTrainerTempo(tapsRef.current));
  };
  const supportedBpm = bpm === null ? null : Math.max(min, Math.min(max, bpm));
  return <div className="trainer-tap-tempo">
    <button type="button" className="button-secondary" disabled={disabled} onClick={tap}>Tap tempo</button>
    <span role="status">{bpm === null ? "Tap at least three steady beats." : bpm === supportedBpm ? `Detected ${bpm} BPM.` : `${bpm} BPM detected · nearest supported tempo is ${supportedBpm} BPM.`}</span>
    <button type="button" className="button-secondary" disabled={disabled || supportedBpm === null} onClick={() => { if (supportedBpm !== null) onApply(supportedBpm); }}>Use {supportedBpm ?? "tapped"} BPM</button>
    <button type="button" className="button-secondary" disabled={disabled || tapCount === 0} onClick={() => { tapsRef.current = []; setTapCount(0); setBpm(null); }}>Clear taps</button>
  </div>;
}
