"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_NOTATION_OPTIONS, notationStaffPosition, paginateNotation, type NotationOptions, type NotationView } from "@/lib/song-builder-notation";
import { compactFocusedNotation, compactNotation, type CompactMeasure } from "@/lib/song-compact-notation";
import { buildSongTimeline } from "@/lib/song-practice";
import { DEFAULT_SONG_BUILDER_SETTINGS, readSongBuilderSettings, writeSongBuilderSettings } from "@/lib/song-builder-settings";
import { readSongNotationProfiles, writeSongNotationProfiles, type SongNotationProfile } from "@/lib/song-notation-profiles";
import { learnerProfileIdFromBrowser } from "@/lib/learner-profiles";
import type { ArrangementBar } from "@/lib/song-builder";
import type { AttemptEventTiming, AttemptExtraTiming, DrumSong } from "@/lib/song-library";
import { SONG_INSTRUMENTS, type SongInstrument } from "@/lib/types";
import { VOICE_LABEL } from "@/lib/song-builder";

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

export function SongLibraryNotation({ song, sectionId, partId, activeBar, activeFraction = 0, barsOverride, onMeasure, editable = false, onEditHit, onReviewHit, reviewEvents, reviewExtras, reading = false, showControls = true }: { reading?: boolean; showControls?: boolean; editable?: boolean; barsOverride?: ArrangementBar[]; song: DrumSong; sectionId?: string; partId?: string; activeBar?: number; activeFraction?: number; onMeasure?: (index: number, bar: ArrangementBar) => void; onEditHit?: (barIndex: number, beat: number, instrument: SongInstrument, action: "toggle" | "accent" | "sticking") => void; onReviewHit?: (bar: number, beat: number, instrument: SongInstrument, offsetMs?: number | null) => void; reviewEvents?: AttemptEventTiming[]; reviewExtras?: AttemptExtraTiming[] }) {
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
  const [notationOptions, setNotationOptions] = useState<NotationOptions>(DEFAULT_SONG_BUILDER_SETTINGS.notation ?? DEFAULT_NOTATION_OPTIONS);
  const [scoreEdit, setScoreEdit] = useState(false);
  const [editVoice, setEditVoice] = useState<SongInstrument>("kick");
  const [editAction, setEditAction] = useState<"toggle" | "accent" | "sticking">("toggle");
  const [editStep, setEditStep] = useState(0);
  const [focusMeasure, setFocusMeasure] = useState(0);
  const [fitToWidth, setFitToWidth] = useState(false);
  const [sheetWidth, setSheetWidth] = useState(0);
  const [notationProfiles, setNotationProfiles] = useState<SongNotationProfile[]>([]);
  const [activeLearnerId, setActiveLearnerId] = useState("default");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const bars = barsOverride ?? buildSongTimeline(song, { sectionId, partId }).bars;
  const pages = paginateNotation(bars, notationOptions);
  const activePage = activeBar === undefined ? -1 : pages.findIndex(items => items.includes(bars[activeBar]));
  const shown = Math.max(0, Math.min(pages.length - 1, activeBar === undefined || !follow || activePage < 0 ? page : activePage));
  const focusedBarIndex = activeBar !== undefined && follow ? activeBar : Math.max(0, Math.min(bars.length - 1, focusMeasure));
  const currentBar = bars[focusedBarIndex];
  const focusedView = fitToWidth && bars.length > 0;
  const currentBars = focusedView ? (currentBar ? [currentBar] : []) : pages[shown] ?? [];
  const currentStepCount = currentBar ? Math.max(1, Math.round(currentBar.beats * currentBar.subdivision / 4)) : 1;
  const profileOptions = notationProfiles.filter(profile => profile.learnerId === activeLearnerId);
  const selectedProfile = profileOptions.find(profile => profile.id === selectedProfileId);
  const currentKitId = song.kitSetup?.profileId ?? "";
  const serialized = JSON.stringify(bars);
  const readablePage = currentBars;
  const spokenText = readablePage.map(bar => {
    const hits = bar.hits.length ? bar.hits.map(hit => `${song.voiceLabels?.[hit.instrument] ?? hit.instrument} on ${countPosition(bar, hit.beat)}${hit.accent ? ", accent" : ""}${hit.ghost ? ", ghost note" : ""}${hit.sticking ? `, ${hit.sticking} hand` : ""}`).join(". ") : "rest for the whole bar";
    return `Bar ${bar.number}, ${bar.sectionName}, ${bar.bpm} beats per minute. ${hits}.`;
  }).join(" ");

  useEffect(() => {
    setNotationOptions(readSongBuilderSettings().notation ?? DEFAULT_SONG_BUILDER_SETTINGS.notation);
    setNotationProfiles(readSongNotationProfiles());
    setActiveLearnerId(learnerProfileIdFromBrowser());
    setFitToWidth(window.matchMedia?.("(max-width: 640px)").matches ?? false);
  }, []);

  useEffect(() => {
    if (!host.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setSheetWidth(Math.floor(width));
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateLearner = () => { setActiveLearnerId(learnerProfileIdFromBrowser()); setSelectedProfileId(""); };
    window.addEventListener("drum-hero:learner-profile-change", updateLearner);
    return () => window.removeEventListener("drum-hero:learner-profile-change", updateLearner);
  }, []);

  const updateNotation = (patch: Partial<NotationOptions>) => {
    const next = { ...notationOptions, ...patch, staffPositions: { ...notationOptions.staffPositions, ...patch.staffPositions } };
    setNotationOptions(next);
    const settings = readSongBuilderSettings();
    writeSongBuilderSettings({ ...settings, notation: next });
  };

  const saveNotationProfile = () => {
    const defaultName = currentKitId ? `${song.title} · kit layout` : `${song.title} · notation`;
    const name = window.prompt("Name this notation profile", defaultName);
    if (!name?.trim()) return;
    const profile: SongNotationProfile = { id: crypto.randomUUID(), name: name.trim().slice(0, 80), learnerId: activeLearnerId, kitProfileId: currentKitId || undefined, notation: notationOptions, updatedAt: new Date().toISOString() };
    const next = [...notationProfiles, profile].slice(-100);
    if (!writeSongNotationProfiles(next)) { setProfileMessage("Browser storage could not save this notation profile."); return; }
    setNotationProfiles(next); setSelectedProfileId(profile.id); setProfileMessage("Notation profile saved on this device for the active learner.");
  };

  const applyNotationProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profileOptions.find(item => item.id === profileId);
    if (profile) { updateNotation(profile.notation); setProfileMessage(`${profile.name} applied.`); }
    else setProfileMessage("");
  };

  const deleteNotationProfile = () => {
    if (!selectedProfile || !window.confirm(`Delete the notation profile “${selectedProfile.name}”?`)) return;
    const next = notationProfiles.filter(item => item.id !== selectedProfile.id);
    if (!writeSongNotationProfiles(next)) { setProfileMessage("Browser storage could not delete this notation profile."); return; }
    setNotationProfiles(next); setSelectedProfileId(""); setProfileMessage("Notation profile deleted.");
  };

  useEffect(() => {
    if (!host.current) return;
    try {
      const result = focusedView
        ? compactFocusedNotation(song, JSON.parse(serialized), focusedBarIndex, sheetWidth, view, notationOptions, activeBar === focusedBarIndex ? { barIndex: focusedBarIndex, fraction: activeFraction } : undefined, { events: reviewEvents, extras: reviewExtras })
        : compactNotation(song, JSON.parse(serialized), view, shown, activeBar === undefined ? undefined : { barIndex: activeBar, fraction: activeFraction }, notationOptions, { events: reviewEvents, extras: reviewExtras });
      result.canvas.setAttribute("role", "img");
      result.canvas.setAttribute("aria-label", focusedView ? `${song.title}, ${view === "staff" ? "drum staff" : "drum tab"}, ${currentBar?.sectionName ?? "section"}, measure ${currentBar?.number ?? focusedBarIndex + 1}${scoreEdit ? ". Use the measure and beat controls below to edit with a keyboard or screen reader." : ""}` : `${song.title} drum ${view} notation, page ${shown + 1}`);
      host.current.replaceChildren(result.canvas);
      measures.current = result.measures;
    } catch {
      const timer = setTimeout(() => setError("Notation is unavailable. Read the counted beat list below."), 0);
      return () => clearTimeout(timer);
    }
  }, [song, serialized, view, shown, activeBar, activeFraction, notationOptions, reviewEvents, reviewExtras, focusedView, focusedBarIndex, sheetWidth, scoreEdit, currentBar]);

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

  const printScore = () => {
    const source = host.current?.querySelector("canvas");
    if (!source) { setError("The score is still drawing. Try printing again in a moment."); return; }
    const printRoot = document.createElement("main");
    printRoot.className = "song-score-print-root";
    const title = document.createElement("h1"); title.textContent = song.title;
    const subtitle = document.createElement("p");
    subtitle.textContent = song.artist + " · " + song.bpm + " BPM · " + song.meter + (sectionId ? " · " + (song.sections.find(section => section.id === sectionId)?.name ?? "Section") : "") + " · " + (view === "staff" ? "Drum staff" : "Drum tab");
    printRoot.append(title, subtitle);
    try {
      const printedPages = pages.length ? pages : [bars];
      printedPages.forEach((pageBars, pageIndex) => {
        const page = document.createElement("section"); page.className = "song-score-print-page";
        const pageTitle = document.createElement("h2"); pageTitle.textContent = "Page " + (pageIndex + 1);
        const rendered = compactNotation(song, bars, view, pageIndex, undefined, notationOptions, { events: reviewEvents, extras: reviewExtras });
        page.append(pageTitle, rendered.canvas);
        const list = document.createElement("ol");
        pageBars.forEach(bar => {
          const row = document.createElement("li");
          const hits = bar.hits.length ? bar.hits.map(hit => (song.voiceLabels?.[hit.instrument] ?? hit.instrument) + " on " + countPosition(bar, hit.beat) + (hit.accent ? ", accent" : "") + (hit.ghost ? ", ghost note" : "") + (hit.sticking ? ", " + hit.sticking + " hand" : "")).join("; ") : "rest for the whole bar";
          row.textContent = "Bar " + bar.number + " · " + bar.sectionName + " · " + bar.bpm + " BPM · " + hits + ".";
          list.append(row);
        });
        page.append(list); printRoot.append(page);
      });
    } catch { setError("Could not prepare the printable score. Try changing notation view or reload the arrangement."); return; }
    document.body.append(printRoot);
    document.body.classList.add("song-score-printing");
    const cleanup = () => { printRoot.remove(); document.body.classList.remove("song-score-printing"); };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => window.print(), 50);
  };

  return <section ref={root} className={`song-notation${highContrast ? " is-high-contrast" : ""}`} style={{ background: "var(--surface, #fff)" }}>
    {!reading && <h3>Notation and sticking</h3>}
    {showControls && <div className="song-actions">
      <label>Notation zoom<select disabled={focusedView} value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[75, 100, 125, 150, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
      {activeBar !== undefined && <label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow playback</label>}
      <label><input type="checkbox" checked={fitToWidth} onChange={event => { const next=event.target.checked; if(next){const first=pages[shown]?.[0]??bars[0];if(first)setFocusMeasure(Math.max(0,bars.indexOf(first)));}else if(bars[focusedBarIndex]){const nextPage=pages.findIndex(items=>items.includes(bars[focusedBarIndex]));if(nextPage>=0)setPage(nextPage);} setFitToWidth(next); }} /> Fit one measure to screen</label>
      <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast(value => !value)}>{highContrast ? "Standard notation contrast" : "High contrast notation"}</button>
      <button type="button" onClick={speakPage}>{speaking ? "Stop spoken counts" : focusedView ? "Hear counted beats in this measure" : "Hear counted beats on this page"}</button>
      <button type="button" onClick={printScore}>{reviewEvents?.length ? "Print annotated score or save as PDF" : "Print this score or save as PDF"}</button>
      <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setError("Fullscreen is unavailable. Use browser zoom for a larger view.")); else setError("Fullscreen is unavailable. Use browser zoom for a larger view."); }}>Fullscreen notation</button>
      <button type="button" aria-pressed={view === "staff"} onClick={() => setView("staff")}>Drum staff</button>
      <button type="button" aria-pressed={view === "tab"} onClick={() => setView("tab")}>Drum tab</button>
      {editable && <button type="button" aria-pressed={scoreEdit} onClick={() => { setScoreEdit(value => !value); if (!scoreEdit) setView("staff"); }}>{scoreEdit ? "Finish score editing" : "Edit notes on score"}</button>}
      {focusedView && <><button type="button" disabled={focusedBarIndex<=0} onClick={()=>{setFollow(false);setFocusMeasure(Math.max(0,focusedBarIndex-1));}}>Previous measure</button><span aria-live="polite">Measure {focusedBarIndex+1} of {bars.length}</span><button type="button" disabled={focusedBarIndex>=bars.length-1} onClick={()=>{setFollow(false);setFocusMeasure(Math.min(bars.length-1,focusedBarIndex+1));}}>Next measure</button></>}
      {!focusedView && (activeBar === undefined || !follow) && !reading && <><button type="button" disabled={shown === 0} onClick={() => setPage(shown - 1)}>Previous notation page</button><button type="button" disabled={shown >= pages.length - 1} onClick={() => setPage(shown + 1)}>Next notation page</button></>}
    </div>}
    {scoreEdit && <div className="song-form-row song-score-edit-tools"><label>Drum voice<select value={editVoice} onChange={event => setEditVoice(event.target.value as SongInstrument)}>{SONG_INSTRUMENTS.map(voice => <option key={voice} value={voice}>{song.voiceLabels?.[voice] || VOICE_LABEL[voice]}</option>)}</select></label><label>Score edit<select value={editAction} onChange={event => setEditAction(event.target.value as typeof editAction)}><option value="toggle">Add or remove hit</option><option value="accent">Toggle accent</option><option value="sticking">Cycle sticking</option></select></label><label>Measure<select value={focusedBarIndex} onChange={event=>{setFollow(false);setFocusMeasure(Number(event.target.value));setEditStep(0);}}>{bars.map((bar,index)=><option key={`${bar.sectionId}:${bar.index}:${index}`} value={index}>Measure {bar.number} · {bar.sectionName}</option>)}</select></label><label>Beat<select value={Math.min(editStep,currentStepCount-1)} onChange={event=>setEditStep(Number(event.target.value))}>{currentBar?Array.from({length:currentStepCount},(_,step)=><option key={step} value={step}>Beat {countPosition(currentBar,step*4/currentBar.subdivision)}</option>):<option value={0}>No measure available</option>}</select></label><button type="button" disabled={!currentBar||!onEditHit} onClick={()=>currentBar&&onEditHit?.(focusedBarIndex,Math.min(editStep,currentStepCount-1)*4/currentBar.subdivision,editVoice,editAction)}>Apply edit to selected beat</button><p>Click a beat on the score or use these measure, beat, voice, and action controls with a keyboard or screen reader.</p></div>}
    {!reading && <details className="song-notation-preferences"><summary>Score layout and kit mapping</summary><div className="song-form-row"><label>Measures per line<select value={notationOptions.barsPerLine ?? 2} onChange={event => updateNotation({ barsPerLine: Number(event.target.value) as 1 | 2 | 3 | 4 })}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Page size<select value={notationOptions.paperSize ?? "letter"} onChange={event => updateNotation({ paperSize: event.target.value as "letter" | "a4" })}><option value="letter">Letter</option><option value="a4">A4</option></select></label><label>Page orientation<select value={notationOptions.orientation ?? "landscape"} onChange={event => updateNotation({ orientation: event.target.value as "portrait" | "landscape" })}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label>Cymbal noteheads<select value={notationOptions.cymbalNoteheads} onChange={event => updateNotation({ cymbalNoteheads: event.target.value as "cross" | "diamond" })}><option value="cross">Cross</option><option value="diamond">Diamond</option></select></label><label><input type="checkbox" checked={notationOptions.showSticking} onChange={event => updateNotation({ showSticking: event.target.checked })} /> Show R/L sticking</label></div><details><summary>Set drum voice positions on the staff</summary><div className="song-form-row">{SONG_INSTRUMENTS.map(voice => <label key={voice}>{song.voiceLabels?.[voice] || VOICE_LABEL[voice]}<select aria-label={`${song.voiceLabels?.[voice] || VOICE_LABEL[voice]} staff position`} value={notationOptions.staffPositions?.[voice] ?? 0} onChange={event => updateNotation({ staffPositions: { [voice]: Number(event.target.value) } })}>{Array.from({ length: 17 }, (_, index) => index - 8).map(position => <option key={position} value={position}>{position === 0 ? "Center" : `${Math.abs(position)} half spaces ${position < 0 ? "above" : "below"}`}</option>)}</select></label>)}</div><button type="button" onClick={() => updateNotation({ staffPositions: { ...DEFAULT_SONG_BUILDER_SETTINGS.notation.staffPositions } })}>Reset standard drum layout</button></details><section className="song-notation-profile-tools"><h4>Saved notation profiles</h4><p>Profiles stay on this device and belong to the active learner. Save a profile for the current kit, or select another saved kit layout.</p><div className="song-form-row"><label>Profile<select value={selectedProfileId} onChange={event=>applyNotationProfile(event.target.value)}><option value="">Choose a profile</option>{profileOptions.map(profile=><option key={profile.id} value={profile.id}>{profile.name}{profile.kitProfileId?` · kit ${profile.kitProfileId}`:" · any kit"}</option>)}</select></label><button type="button" onClick={saveNotationProfile}>Save current layout as profile</button><button type="button" disabled={!selectedProfile} onClick={deleteNotationProfile}>Delete selected profile</button></div><p role="status">{profileMessage}</p></section><small>These notation preferences are saved on this device and also apply in Song Builder.</small></details>}
    {!reading && <p className="song-notation-scroll-hint">Fit one measure to screen on narrow displays; standard pages remain horizontally scrollable. Subdivision counts use 1-and, 1-trip-let, or 1-e-and-a.</p>}
    <div ref={host} className={`song-notation-sheet${scoreEdit ? " is-score-editing" : ""}${focusedView ? " is-focused-score" : ""}`} style={{ "--notation-zoom": zoom / 100 } as React.CSSProperties} onClick={event => {
      if ((!onMeasure && !(scoreEdit && onEditHit)) || !host.current) return;
      const canvas = host.current?.querySelector("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * canvas.width, y = (event.clientY - rect.top) / rect.height * canvas.height;
      if (scoreEdit && onEditHit && view === "staff") {
        const measure = measures.current.find(item => {const start=item.hitStart??item.x+18,hitWidth=item.hitWidth??item.width-38;return x >= start && x < start+hitWidth && y >= item.y + 30 && y < item.y + item.height;});
        const bar = measure ? bars[measure.barIndex] : undefined;
        if (measure && bar) {
          const stepCount = Math.max(1, bar.beats * bar.subdivision / 4);
          const start=measure.hitStart??measure.x+18,hitWidth=measure.hitWidth??measure.width-38;
          const step = Math.max(0, Math.min(stepCount - 1, Math.round((x - start) / Math.max(1, hitWidth) * stepCount)));
          setFollow(false);setFocusMeasure(measure.barIndex);setEditStep(step);
          onEditHit(measure.barIndex, step * 4 / bar.subdivision, editVoice, editAction);
        }
        return;
      }
      const measure = measures.current.find(item => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
      if(measure&&onReviewHit&&view==="staff"&&(reviewEvents?.length||reviewExtras?.length)){
        const bar=bars[measure.barIndex],start=measure.hitStart??measure.x+18,hitWidth=measure.hitWidth??measure.width-38;
        if(bar&&x>=start&&x<=start+hitWidth){
          const beat=Math.max(0,Math.min(bar.beats,(x-start)/Math.max(1,hitWidth)*bar.beats));
          const candidates=[...(reviewEvents??[]).filter(item=>item.bar===measure.barIndex+1).map(item=>({beat:item.beat,instrument:item.instrument,offsetMs:item.offsetMs,extra:false})),...(reviewExtras??[]).filter(item=>item.bar===measure.barIndex+1).map(item=>({beat:item.beat,instrument:item.instrument,offsetMs:undefined,extra:true}))];
          const scoreHeight=pages[shown]?.length?Math.max(150,measure.height-32):measure.height,scale=focusedView?Math.max(1,Math.min(2,window.devicePixelRatio||1)):Math.max(.65,Math.min(1.25,(scoreHeight-25)/190));
          const nearest=candidates.map(candidate=>{
            const expectedX=start+candidate.beat/Math.max(.001,bar.beats)*hitWidth;
            const expectedY=focusedView?measure.y+108*scale+notationStaffPosition(candidate.instrument,notationOptions)*5*scale-(candidate.extra?13*scale:0):measure.y+32+98*scale-2.5+notationStaffPosition(candidate.instrument,notationOptions)*5*scale-(candidate.extra?13*scale:0);
            return {...candidate,distance:Math.hypot(x-expectedX,(y-expectedY)*1.4)};
          }).sort((a,b)=>a.distance-b.distance)[0];
          if(nearest){onReviewHit(measure.barIndex+1,nearest.beat,nearest.instrument,nearest.offsetMs);return;}
        }
      }
      if (measure && onMeasure) onMeasure(measure.barIndex, bars[measure.barIndex]);
    }} />
    {onMeasure && <div className="song-actions">{currentBars.map(bar => { const index = bars.indexOf(bar); return <button type="button" key={index} onClick={() => onMeasure(index, bar)}>Practice measure {bar.number}</button>; })}</div>}
    <p role="status">{error}</p>
    <details><summary>Read the counted beats as text</summary><ol>{readablePage.map((bar, index) => <li key={`${bar.sectionId}:${bar.index}:${index}`}><strong>Bar {bar.number} · {bar.sectionName} · {bar.bpm} BPM · {bar.subdivision} subdivision.</strong> {bar.hits.length ? bar.hits.map((hit, hitIndex) => <span key={`${hit.instrument}:${hit.step}:${hitIndex}`}>{song.voiceLabels?.[hit.instrument] ?? hit.instrument} on {countPosition(bar, hit.beat)}{hit.accent ? ", accent" : ""}{hit.ghost ? ", ghost note" : ""}{hit.sticking ? `, ${hit.sticking} hand` : ""}{hitIndex < bar.hits.length - 1 ? "; " : "."}</span>) : "Rest for the whole bar."}</li>)}</ol></details>
  </section>;
}
