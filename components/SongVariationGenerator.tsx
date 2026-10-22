"use client";
import { useMemo, useState } from "react";
import { generateGrooveVariation, type GrooveVariationStyle } from "@/lib/song-library-tools";
import type { DrumPart } from "@/lib/song-library";

const styles: Array<{ id: GrooveVariationStyle; title: string; detail: string }> = [
  { id: "half-time-backbeat", title: "Half-time backbeat", detail: "Move the snare backbeat toward the middle of the measure and keep other hits." },
  { id: "double-time-cymbals", title: "Double-time cymbal pulse", detail: "Add offbeat cymbal strokes while preserving the existing groove." },
  { id: "ending-fill", title: "Ending fill", detail: "Add an alternating snare and tom roll across the final beat." },
];
export function SongVariationGenerator({ part, disabled = false, onCreate }: { part: DrumPart; disabled?: boolean; onCreate: (variation: DrumPart) => void }) {
  const [style, setStyle] = useState<GrooveVariationStyle>("half-time-backbeat");
  const [message, setMessage] = useState("");
  const variation = useMemo(() => generateGrooveVariation(part, style, "preview-variation"), [part, style]);
  const description = styles.find(item => item.id === style)?.detail;
  return <section className="song-tool-panel song-variation-generator"><h3>Build a practice variation</h3><p>Make a separate, editable drill from this part. The source part stays unchanged, and variations do not add stage-readiness requirements.</p><label>Variation<select value={style} onChange={event => { setStyle(event.target.value as GrooveVariationStyle); setMessage(""); }}>{styles.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><p>{description} Preview: {part.hits.length} hits → {variation.hits.length} hits · {variation.subdivision} subdivision.</p><button type="button" disabled={disabled || !part.hits.length} onClick={() => { try { const saved = generateGrooveVariation(part, style); onCreate(saved); setMessage(`Added ${saved.name} as a practice-only part variation.`); } catch { setMessage("Could not add this variation. Unlock the arrangement and try again."); } }}>{disabled ? "Unlock to create variation" : "Add practice variation"}</button><p role="status">{message}</p></section>;
}
