"use client";

import { useState } from "react";
import type { NotationOptions } from "@/lib/song-builder-notation";
import { validateSongBuilderExports, type SongExportCheck } from "@/lib/song-builder-roundtrip";
import type { ArrangementBar } from "@/lib/song-builder";
import type { SongInstrument } from "@/lib/types";

export function SongBuilderRoundTripCheck({ bars, title, artist, noteMap, swing, separateTracks, notation }: { bars: ArrangementBar[]; title: string; artist: string; noteMap: Record<SongInstrument, number>; swing: number; separateTracks: boolean; notation: NotationOptions }) {
  const [checks, setChecks] = useState<SongExportCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setChecks(await validateSongBuilderExports(bars, title, artist, noteMap, swing, separateTracks, notation)); }
    finally { setBusy(false); }
  };
  return <details className="card song-builder-export-validation">
    <summary>Validate MIDI and MusicXML round trips</summary>
    <p>Re-imports generated files in the browser and checks note counts, time signatures, tempo positions, and MusicXML measure counts. This catches export mapping regressions before you share a file.</p>
    <button type="button" disabled={busy || !bars.length} onClick={()=>void run()}>{busy ? "Checking exports…" : "Run round-trip check"}</button>
    {checks.length > 0 && <ul aria-live="polite">{checks.map(check=><li key={check.format}>
      <strong>{check.format}: {check.passed ? "passed" : "review needed"}</strong>
      <span> · {check.importedNotes}/{check.expectedNotes} note events</span>
      {check.importedMeasures===null ? <span> · {check.expectedMeasures} arrangement measures; MIDI tempo and meter markers checked</span> : <span> · {check.importedMeasures}/{check.expectedMeasures} measures</span>}
      {check.issues.length>0&&<ul>{check.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
    </li>)}</ul>}
  </details>;
}
