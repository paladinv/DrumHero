"use client";
import { useEffect, useRef, useState } from "react";
import { paginateNotation, type NotationView } from "@/lib/song-builder-notation";
import { compactNotation, type CompactMeasure } from "@/lib/song-compact-notation";
import { buildSongTimeline } from "@/lib/song-practice";
import type { ArrangementBar } from "@/lib/song-builder";
import type { DrumSong } from "@/lib/song-library";

function countPosition(bar: ArrangementBar, beat: number) {
  const subdivision = bar.subdivision ?? 4;
  const stepsPerBeat = Math.max(1, subdivision / 4);
  const step = Math.max(0, Math.round(beat * stepsPerBeat));
  const beatNumber = Math.floor(step / stepsPerBeat) + 1;
  const substep = step % stepsPerBeat;
  const subdivisionWords: Record<number, string[]> = { 1: [""], 2: ["", "and"], 3: ["", "trip", "let"], 4: ["", "e", "and", "a"] };
  const word = subdivisionWords[stepsPerBeat]?.[substep] ?? "";
  return word ? `${beatNumber}-${word}` : String(beatNumber);
}

export function SongLibraryNotation({ song, sectionId, partId, activeBar, activeFraction = 0, barsOverride, onMeasure, reading = false }: { reading?: boolean; barsOverride?: ArrangementBar[]; song: DrumSong; sectionId?: string; partId?: string; activeBar?: number; activeFraction?: number; onMeasure?: (index: number, bar: ArrangementBar) => void }) {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const measures = useRef<CompactMeasure[]>([]);
  const [zoom, setZoom] = useState(100);
  const [follow, setFollow] = useState(true);
  const [view, setView] = useState<NotationView>("staff");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [highContrast, setHighContrast] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const bars = barsOverride ?? buildSongTimeline(song, { sectionId, partId }).bars;
  const pages = paginateNotation(bars);
  const shown = Math.max(0, Math.min(pages.length - 1, activeBar === undefined || !follow ? page : Math.floor(activeBar / 6)));
  const serialized = JSON.stringify(bars);
  const readablePage = pages[shown] ?? [];
  const spokenText = readablePage.map(bar => {
    const hits = bar.hits.length ? bar.hits.map(hit => `${song.voiceLabels?.[hit.instrument] ?? hit.instrument} on ${countPosition(bar, hit.beat)}${hit.accent ? ", accent" : ""}${hit.ghost ? ", ghost note" : ""}${hit.sticking ? `, ${hit.sticking} hand` : ""}`).join(". ") : "rest for the whole bar";
    return `Bar ${bar.number}, ${bar.sectionName}, ${bar.bpm} beats per minute. ${hits}.`;
  }).join(" ");

  useEffect(() => {
    if (!host.current) return;
    try {
      const result = compactNotation(song, JSON.parse(serialized), view, shown, activeBar === undefined ? undefined : { barIndex: activeBar, fraction: activeFraction });
      result.canvas.setAttribute("role", "img");
      result.canvas.setAttribute("aria-label", `${song.title} drum ${view} notation, page ${shown + 1}`);
      host.current.replaceChildren(result.canvas);
      measures.current = result.measures;
    } catch {
      const timer = setTimeout(() => setError("Notation is unavailable. Read the counted beat list below."), 0);
      return () => clearTimeout(timer);
    }
  }, [song, serialized, view, shown, activeBar, activeFraction]);

  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakPage = () => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Spoken counts are unavailable in this browser. Use the counted beat list below.");
      return;
    }
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(spokenText || "This page contains no bars.");
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setError("Spoken counts could not play in this browser."); };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return <section ref={root} className={`song-notation${highContrast ? " is-high-contrast" : ""}`} style={{ background: "var(--surface, #fff)" }}>
    {!reading && <h3>Notation and sticking</h3>}
    <div className="song-actions">
      <label>Notation zoom<select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[75, 100, 125, 150, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
      {activeBar !== undefined && <label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow playback</label>}
      <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast(value => !value)}>{highContrast ? "Standard notation contrast" : "High contrast notation"}</button>
      <button type="button" onClick={speakPage}>{speaking ? "Stop spoken counts" : "Hear counted beats on this page"}</button>
      <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setError("Fullscreen is unavailable. Use browser zoom for a larger view.")); else setError("Fullscreen is unavailable. Use browser zoom for a larger view."); }}>Fullscreen notation</button>
      <button type="button" aria-pressed={view === "staff"} onClick={() => setView("staff")}>Drum staff</button>
      <button type="button" aria-pressed={view === "tab"} onClick={() => setView("tab")}>Drum tab</button>
      {(activeBar === undefined || !follow) && !reading && <><button type="button" disabled={shown === 0} onClick={() => setPage(shown - 1)}>Previous notation page</button><button type="button" disabled={shown >= pages.length - 1} onClick={() => setPage(shown + 1)}>Next notation page</button></>}
    </div>
    {!reading && <p className="song-notation-scroll-hint">On small screens, scroll the sheet horizontally or use the counted beat list. Subdivision counts use 1-and, 1-trip-let, or 1-e-and-a.</p>}
    <div ref={host} className="song-notation-sheet" style={{ "--notation-zoom": zoom / 100 } as React.CSSProperties} onClick={event => {
      if (!onMeasure) return;
      const canvas = host.current?.querySelector("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * canvas.width, y = (event.clientY - rect.top) / rect.height * canvas.height;
      const measure = measures.current.find(item => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
      if (measure) onMeasure(measure.barIndex, bars[measure.barIndex]);
    }} />
    {onMeasure && <div className="song-actions">{pages[shown]?.map(bar => { const index = bars.indexOf(bar); return <button type="button" key={index} onClick={() => onMeasure(index, bar)}>Practice measure {index + 1}</button>; })}</div>}
    <p role="status">{error}</p>
    <details><summary>Read the counted beats as text</summary><ol>{readablePage.map((bar, index) => <li key={`${bar.sectionId}:${bar.index}:${index}`}><strong>Bar {bar.number} · {bar.sectionName} · {bar.bpm} BPM · {bar.subdivision} subdivision.</strong> {bar.hits.length ? bar.hits.map((hit, hitIndex) => <span key={`${hit.instrument}:${hit.step}:${hitIndex}`}>{song.voiceLabels?.[hit.instrument] ?? hit.instrument} on {countPosition(bar, hit.beat)}{hit.accent ? ", accent" : ""}{hit.ghost ? ", ghost note" : ""}{hit.sticking ? `, ${hit.sticking} hand` : ""}{hitIndex < bar.hits.length - 1 ? "; " : "."}</span>) : "Rest for the whole bar."}</li>)}</ol></details>
  </section>;
}
