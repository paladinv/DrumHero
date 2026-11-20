"use client";
import { useMemo, useState } from "react";
import { suggestPartSticking } from "@/lib/song-library-tools";
import type { DrumPart } from "@/lib/song-library";

export function SongStickingAssistant({ part, onApply }: { part: DrumPart; onApply: (part: DrumPart) => void }) {
  const [leadHand, setLeadHand] = useState<"R" | "L">("R");
  const suggestion = useMemo(() => suggestPartSticking(part, leadHand), [part, leadHand]);
  const hands = suggestion.hits.reduce((counts, hit) => { if (hit.sticking) counts[hit.sticking] += 1; return counts; }, { R: 0, L: 0 });
  if (!part.hits.length) return null;
  return <section className="song-sticking-assistant" aria-label="Sticking suggestions">
    <h4>Sticking suggestions</h4>
    <p>Alternates playable hand hits, gives simultaneous cymbal and snare hits different hands where possible, and leaves kick hits unassigned. Treat the result as a draft; verify it against your technique and edit individual hits in the score or grid.</p>
    <div className="song-form-row"><label>Lead hand<select value={leadHand} onChange={event => setLeadHand(event.target.value as "R" | "L")}><option value="R">Right hand</option><option value="L">Left hand</option></select></label><p>Suggested assignments: {hands.R} right · {hands.L} left.</p></div>
    <button type="button" className="button-secondary" onClick={() => onApply(suggestion)}>Apply suggestion to this part</button>
  </section>;
}
