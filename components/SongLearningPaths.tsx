"use client";
import { useMemo, useState } from "react";
import { songCatalogReviewStatus, songPartEvidenceFingerprint, type DrumSong, type SongLearningPath, type SongLearningPathStep, type SongLibraryState } from "@/lib/song-library";

type PathStep = Omit<SongLearningPathStep, "id"> & { id?: string };
type PathMetadata = { style: string; meter: string; skill: string; difficulty: "Beginner" | "Intermediate" | "Advanced"; prerequisitePathId?: string };
type BuiltInPath = PathMetadata & { id: string; title: string; summary: string; steps: PathStep[] };
const paths: BuiltInPath[] = [
  { id: "steady-pocket", title: "Build a steady pocket", summary: "Move from a basic backbeat to a busier groove while keeping the pulse even.", style: "Rock / pop", meter: "4/4", skill: "Backbeat and pulse", difficulty: "Beginner", steps: [
    { songId: "example-steady-road", sectionId: "verse", partId: "main", label: "Steady eighth-note backbeat", targetBpm: 82, minimumScore: 80, passes: 3 },
    { songId: "example-paper-lantern-parade", sectionId: "verse", partId: "main", label: "Add a clear crash entrance", targetBpm: 92, minimumScore: 80, passes: 3 },
    { songId: "example-pocket-garden", sectionId: "verse", partId: "main", label: "Keep time through syncopation", targetBpm: 104, minimumScore: 80, passes: 3 }
  ] },
  { id: "meters-and-feels", title: "Explore meters and feels", summary: "Practice a three beat bar, a shuffled triplet pulse, then a longer five beat cycle.", style: "Waltz / blues / odd meter", meter: "3/4 · 4/4 · 5/4", skill: "Counting and feel", difficulty: "Intermediate", steps: [
    { songId: "example-three-steps-home", sectionId: "verse", partId: "main", label: "Settle into 3/4", targetBpm: 78, minimumScore: 75, passes: 3 },
    { songId: "example-window-rain-shuffle", sectionId: "verse", partId: "main", label: "Keep the shuffle triplets even", targetBpm: 86, minimumScore: 75, passes: 3 },
    { songId: "example-copper-clock", sectionId: "verse", partId: "main", label: "Feel all five beats", targetBpm: 105, minimumScore: 75, passes: 3 }
  ] },
  { id: "kit-voices", title: "Get comfortable around the kit", summary: "Move the timekeeping voice, then add cymbal and rimshot colors.", style: "Rock / fusion", meter: "4/4 · 5/4", skill: "Cymbal and rimshot voices", difficulty: "Intermediate", prerequisitePathId: "steady-pocket", steps: [
    { songId: "example-steady-road", sectionId: "verse", partId: "main", label: "Establish the groove", targetBpm: 82, minimumScore: 80, passes: 3 },
    { songId: "example-night-shift-signals", sectionId: "verse", partId: "main", label: "Lead with ride and open hi-hat", targetBpm: 118, minimumScore: 75, passes: 3 },
    { songId: "example-copper-clock", sectionId: "verse", partId: "main", label: "Add a rimshot accent", targetBpm: 105, minimumScore: 75, passes: 3 }
  ] },
  { id: "funk-ghost-notes", title: "Funk pocket and ghost notes", summary: "Keep a solid backbeat while the kick syncopates and quiet snare notes fill the spaces.", style: "Funk", meter: "4/4", skill: "Syncopation and ghost notes", difficulty: "Intermediate", prerequisitePathId: "steady-pocket", steps: [
    { songId: "example-pocket-garden", sectionId: "verse", partId: "main", label: "Keep the backbeat steady under syncopated kick", targetBpm: 104, minimumScore: 78, passes: 3 },
    { songId: "example-porchlight-bossa", sectionId: "verse", partId: "main", label: "Place quiet notes between the main accents", targetBpm: 112, minimumScore: 75, passes: 3 }
  ] },
  { id: "shuffle-triplets", title: "Blues shuffle control", summary: "Make the triplet shuffle feel even, then keep the kick and snare balanced inside it.", style: "Blues", meter: "4/4", skill: "Shuffle and triplets", difficulty: "Intermediate", prerequisitePathId: "steady-pocket", steps: [
    { songId: "example-window-rain-shuffle", sectionId: "verse", partId: "main", label: "Even out the shuffle triplets", targetBpm: 86, minimumScore: 75, passes: 3 },
    { songId: "example-pocket-garden", sectionId: "verse", partId: "main", label: "Return to straight time without rushing", targetBpm: 104, minimumScore: 78, passes: 3 }
  ] },
  { id: "odd-meter-groups", title: "Odd-meter counting lab", summary: "Move from five even beats to a grouped seven-eighth phrase, then connect the phrase cleanly.", style: "Fusion", meter: "5/4 · 7/8", skill: "Odd-meter counting", difficulty: "Advanced", prerequisitePathId: "meters-and-feels", steps: [
    { songId: "example-copper-clock", sectionId: "verse", partId: "main", label: "Feel the five-beat cycle", targetBpm: 105, minimumScore: 72, passes: 3 },
    { songId: "example-seven-lanterns", sectionId: "verse", partId: "main", label: "Group seven eighth notes as 2 + 2 + 3", targetBpm: 98, minimumScore: 70, passes: 3 }
  ] },
  { id: "dynamic-control", title: "Dynamics and touch", summary: "Shape a wide backbeat, then contrast full strokes with controlled ghost notes.", style: "Rock / funk", meter: "4/4", skill: "Dynamics and touch", difficulty: "Beginner", steps: [
    { songId: "example-quiet-machines", sectionId: "verse", partId: "main", label: "Keep the half-time backbeat relaxed", targetBpm: 72, minimumScore: 78, passes: 3 },
    { songId: "example-pocket-garden", sectionId: "verse", partId: "main", label: "Separate ghost notes from the backbeat", targetBpm: 104, minimumScore: 75, passes: 3 }
  ] },
  { id: "shuffle-arrangement", title: "Shuffle groove to turnaround", summary: "Read the triplet groove, maintain its pulse through a short tom pickup, then land back on one.", style: "Blues", meter: "4/4", skill: "Triplet phrasing and transitions", difficulty: "Intermediate", prerequisitePathId: "shuffle-triplets", steps: [
    { songId: "example-tideglass-shuffle", sectionId: "verse", partId: "shuffle-groove", label: "Settle into the shuffle groove", targetBpm: 84, minimumScore: 78, passes: 3 },
    { songId: "example-tideglass-shuffle", sectionId: "turnaround", partId: "turnaround-fill", label: "Connect the tom turnaround to the next bar", targetBpm: 84, minimumScore: 75, passes: 3 }
  ] },
  { id: "arrangement-transitions", title: "Build a song arrangement", summary: "Keep the verse steady, then change cymbal and kick choices cleanly at a chorus entrance.", style: "Rock / pop", meter: "4/4", skill: "Section transitions", difficulty: "Beginner", prerequisitePathId: "steady-pocket", steps: [
    { songId: "example-paper-bridges", sectionId: "verse", partId: "verse-groove", label: "Play the verse backbeat evenly", targetBpm: 90, minimumScore: 80, passes: 3 },
    { songId: "example-paper-bridges", sectionId: "chorus", partId: "chorus-groove", label: "Land the chorus crash together with the groove", targetBpm: 90, minimumScore: 80, passes: 3 }
  ] },
  { id: "sixteenth-note-fills", title: "Syncopation into a fill", summary: "Coordinate sixteenth-note kick placements with the backbeat, then move the final beat around the toms.", style: "Rock", meter: "4/4", skill: "Sixteenth-note coordination and fills", difficulty: "Advanced", prerequisitePathId: "funk-ghost-notes", steps: [
    { songId: "example-northbound-switch", sectionId: "verse", partId: "switch-groove", label: "Keep ride time steady under syncopated kicks", targetBpm: 112, minimumScore: 72, passes: 3 },
    { songId: "example-northbound-switch", sectionId: "fill", partId: "switch-fill", label: "Finish the tom fill and land on the downbeat", targetBpm: 112, minimumScore: 70, passes: 3 }
  ] },
  { id: "four-bar-song-forms", title: "Hold the groove across a song form", summary: "Build stamina and clear transitions through four-bar verses, choruses, and a five-beat theme.", style: "Funk / pop / fusion", meter: "4/4 · 5/4", skill: "Long-form consistency and arrangement transitions", difficulty: "Intermediate", prerequisitePathId: "arrangement-transitions", steps: [
    { songId: "example-velvet-echoes", sectionId: "verse", partId: "verse-pocket", label: "Keep the pocket steady through four bars", targetBpm: 94, minimumScore: 78, passes: 3 },
    { songId: "example-velvet-echoes", sectionId: "chorus", partId: "chorus-lift", label: "Raise the dynamics at the chorus entrance", targetBpm: 94, minimumScore: 78, passes: 3 },
    { songId: "example-lantern-arcade", sectionId: "chorus", partId: "arcade-chorus", label: "Coordinate the open-hat pickups", targetBpm: 124, minimumScore: 75, passes: 3 },
    { songId: "example-copperline-run", sectionId: "head", partId: "five-beat-theme", label: "Keep time through four five-beat bars", targetBpm: 106, minimumScore: 70, passes: 3 }
  ] }
];
function passed(state: SongLibraryState, song: DrumSong | undefined, step: PathStep) {
  const part = song?.sections.find(section => section.id === step.sectionId)?.parts.find(candidate => candidate.id === step.partId);
  if (!song || !part) return 0;
  const attempts = state.progress.filter(progress => progress.songId === song.id && progress.sectionId === step.sectionId).flatMap(progress => progress.attempts ?? []);
  return attempts.filter(attempt => attempt.partId === part.id && attempt.completePart !== false && attempt.patternFingerprint === songPartEvidenceFingerprint(part) && attempt.score >= step.minimumScore && Math.abs(attempt.bpm - step.targetBpm) <= 2 && !["self", "unknown"].includes(attempt.inputMode)).length;
}
const makeStep = (step: PathStep): SongLearningPathStep => ({ ...step, id: crypto.randomUUID() });

export function SongLearningPaths({ state, songs, save, onPractice }: { state: SongLibraryState; songs: DrumSong[]; save: (value: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void; onPractice: (songId: string, sectionId: string, partId: string, bpm: number) => void }) {
  const [activeId, setActiveId] = useState(paths[0].id);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [stepSongId, setStepSongId] = useState("");
  const [stepSectionId, setStepSectionId] = useState("");
  const [stepPartId, setStepPartId] = useState("");
  const [stepLabel, setStepLabel] = useState("");
  const [targetBpm, setTargetBpm] = useState(80);
  const [minimumScore, setMinimumScore] = useState(80);
  const [requiredPasses, setRequiredPasses] = useState(3);
  const [filterStyle, setFilterStyle] = useState("All");
  const [filterMeter, setFilterMeter] = useState("All");
  const [filterSkill, setFilterSkill] = useState("All");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [pathStyle, setPathStyle] = useState("Rock / pop");
  const [pathMeter, setPathMeter] = useState("4/4");
  const [pathSkill, setPathSkill] = useState("Backbeat and pulse");
  const [pathDifficulty, setPathDifficulty] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [pathPrerequisite, setPathPrerequisite] = useState("");
  const [pathMessage, setPathMessage] = useState("");
  const customPaths = state.learningPaths ?? [];
  const selectableSongs = useMemo(() => songs.filter(song => !song.archived), [songs]);
  const available = [...paths, ...customPaths] as Array<BuiltInPath | SongLearningPath>;
  const dependsOn = (pathId: string, targetId: string) => {
    const visited = new Set<string>(); let current = available.find(path => path.id === pathId);
    while (current && !visited.has(current.id)) { if (current.id === targetId) return true; visited.add(current.id); current = current.prerequisitePathId ? available.find(path => path.id === current!.prerequisitePathId) : undefined; }
    return false;
  };
  const active = available.find(path => path.id === activeId) ?? paths[0];
  const custom = customPaths.find(path => path.id === active.id);
  const taxonomyValues = (key: "style" | "meter" | "skill" | "difficulty") => [...new Set(available.map(path => path[key]).filter((value): value is string => Boolean(value)))].sort();
  const visiblePaths = available.filter(path => (filterStyle === "All" || path.style === filterStyle) && (filterMeter === "All" || path.meter?.includes(filterMeter)) && (filterSkill === "All" || path.skill === filterSkill) && (filterDifficulty === "All" || path.difficulty === filterDifficulty));
  const pathOptions = visiblePaths.some(path => path.id === active.id) ? visiblePaths : [active, ...visiblePaths];
  const steps = active.steps;
  const stepStates = steps.map(step => {
    const song = songs.find(candidate => candidate.id === step.songId);
    return { step, song, count: passed(state, song, step), section: song?.sections.find(item => item.id === step.sectionId), part: song?.sections.find(item => item.id === step.sectionId)?.parts.find(item => item.id === step.partId) };
  });
  const completed = stepStates.filter(item => item.count >= item.step.passes).length;
  const pathOriginalSongs = [...new Map(stepStates.filter(item => item.song?.bundled).map(item => [item.song!.id, item.song!] as const)).values()];
  const reviewedPathSongs = pathOriginalSongs.filter(song => songCatalogReviewStatus(song) === "current").length;
  const pathIsComplete = (path: BuiltInPath | SongLearningPath) => path.steps.length > 0 && path.steps.every(step => passed(state, songs.find(song => song.id === step.songId), step) >= step.passes);
  const completedPathIds = new Set(available.filter(pathIsComplete).map(path => path.id));
  const prerequisite = active.prerequisitePathId ? available.find(path => path.id === active.prerequisitePathId) : undefined;
  const prerequisiteMet = !active.prerequisitePathId || !prerequisite || completedPathIds.has(active.prerequisitePathId);
  const selectedSong = selectableSongs.find(song => song.id === stepSongId) ?? selectableSongs[0];
  const selectedSection = selectedSong?.sections.find(section => section.id === stepSectionId) ?? selectedSong?.sections[0];
  const selectedPart = selectedSection?.parts.find(part => part.id === stepPartId) ?? selectedSection?.parts[0];
  const createPath = () => {
    if (!title.trim()) return;
    const path: SongLearningPath = { id: crypto.randomUUID(), title: title.trim().slice(0, 100), summary: summary.trim().slice(0, 500), style: pathStyle.trim().slice(0, 60), meter: pathMeter.trim().slice(0, 30), skill: pathSkill.trim().slice(0, 80), difficulty: pathDifficulty, prerequisitePathId: pathPrerequisite || undefined, steps: [], createdAt: new Date().toISOString() };
    save(current => ({ ...current, learningPaths: [...(current.learningPaths ?? []), path].slice(-100) }));
    setActiveId(path.id); setTitle(""); setSummary("");
  };
  const addStep = () => {
    if (!custom || !selectedSong || !selectedSection || !selectedPart) return;
    const step = makeStep({ songId: selectedSong.id, sectionId: selectedSection.id, partId: selectedPart.id, label: stepLabel.trim().slice(0, 120) || `${selectedSection.name} · ${selectedPart.name}`, targetBpm: Math.max(40, Math.min(200, targetBpm)), minimumScore: Math.max(1, Math.min(100, minimumScore)), passes: Math.max(1, Math.min(20, requiredPasses)) });
    save(current => ({ ...current, learningPaths: (current.learningPaths ?? []).map(path => path.id === custom.id ? { ...path, steps: [...path.steps, step].slice(0, 100) } : path) }));
    setStepLabel("");
  };
  const updatePath = (change: Partial<SongLearningPath>) => custom && save(current => ({ ...current, learningPaths: (current.learningPaths ?? []).map(path => path.id === custom.id ? { ...path, ...change } : path) }));
  const moveStep = (index: number, delta: number) => {
    if (!custom) return;
    const next = [...custom.steps], to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    updatePath({ steps: next });
  };
  return <section className="song-tool-panel song-learning-paths">
    <h3>Guided song paths</h3>
    <p>Start with curated progressions built from Drum Hero original songs, then filter by style, meter, drumming skill, and difficulty. Custom paths can use your own songs. Later steps unlock after the earlier scored passes are complete.</p>
    <p>{paths.length} built-in paths · {customPaths.length} custom paths · {songs.filter(song => song.bundled).length} original example songs</p>
    <div className="song-form-row song-path-filters"><label>Style<select value={filterStyle} onChange={event => setFilterStyle(event.target.value)}><option>All</option>{taxonomyValues("style").map(value => <option key={value}>{value}</option>)}</select></label><label>Meter<select value={filterMeter} onChange={event => setFilterMeter(event.target.value)}><option>All</option>{[...new Set(available.flatMap(path => (path.meter ?? "").split(" · ").filter(Boolean)))].sort().map(value => <option key={value}>{value}</option>)}</select></label><label>Skill<select value={filterSkill} onChange={event => setFilterSkill(event.target.value)}><option>All</option>{taxonomyValues("skill").map(value => <option key={value}>{value}</option>)}</select></label><label>Difficulty<select value={filterDifficulty} onChange={event => setFilterDifficulty(event.target.value)}><option>All</option>{taxonomyValues("difficulty").map(value => <option key={value}>{value}</option>)}</select></label></div>
    <label>Learning path<select value={active.id} onChange={event => setActiveId(event.target.value)}>{pathOptions.map(path => <option key={path.id} value={path.id}>{path.title}{customPaths.some(item => item.id === path.id) ? " · custom" : ""}</option>)}</select></label>
    <p>{active.summary} · {completed}/{steps.length} steps complete</p>
    {!custom && pathOriginalSongs.length > 0 && <p role="status">Catalog review for this path: {reviewedPathSongs}/{pathOriginalSongs.length} referenced original songs have a current human review. Review entries become stale after score edits; reviewer qualifications are not verified.</p>}
    <p className="song-path-taxonomy"><strong>{active.style ?? "Mixed style"}</strong> · {active.meter ?? "Mixed meter"} · {active.skill ?? "Custom skills"} · {active.difficulty ?? "Mixed difficulty"}{active.prerequisitePathId ? ` · Prerequisite: ${prerequisite?.title ?? "another path"}` : " · No prerequisite"}</p>
    {prerequisite && !prerequisiteMet && <p role="status">Complete “{prerequisite.title}” first to unlock this path. {prerequisite.steps.filter(step => passed(state, songs.find(song => song.id === step.songId), step) >= step.passes).length}/{prerequisite.steps.length} prerequisite steps complete.</p>}
    {active.prerequisitePathId && !prerequisite && <p role="status">This path references a prerequisite that was deleted. Edit the path to remove or replace it.</p>}
    {custom && <div className="song-path-editor"><label>Path title<input maxLength={100} value={custom.title} onChange={event => updatePath({ title: event.target.value.slice(0, 100) })} /></label><label>Path description<textarea maxLength={500} value={custom.summary} onChange={event => updatePath({ summary: event.target.value.slice(0, 500) })} /></label><div className="song-form-row"><label>Style<input maxLength={60} value={custom.style ?? ""} onChange={event => updatePath({ style: event.target.value.slice(0, 60) })} /></label><label>Meter<input maxLength={30} value={custom.meter ?? ""} onChange={event => updatePath({ meter: event.target.value.slice(0, 30) })} /></label><label>Skill focus<input maxLength={80} value={custom.skill ?? ""} onChange={event => updatePath({ skill: event.target.value.slice(0, 80) })} /></label><label>Difficulty<select value={custom.difficulty ?? "Beginner"} onChange={event => updatePath({ difficulty: event.target.value as SongLearningPath["difficulty"] })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Prerequisite path<select value={custom.prerequisitePathId ?? ""} onChange={event => { const next = event.target.value; if (next && dependsOn(next, custom.id)) { setPathMessage("That prerequisite would create a learning-path cycle. Choose a path that does not depend on this one."); return; } setPathMessage(""); updatePath({ prerequisitePathId: next || undefined }); }}><option value="">None</option>{available.filter(path => path.id !== custom.id && !dependsOn(path.id, custom.id)).map(path => <option key={path.id} value={path.id}>{path.title}</option>)}</select></label></div>{pathMessage&&<p role="status">{pathMessage}</p>}</div>}
    {steps.length ? <ol>{stepStates.map(({ step, song, count, section, part }, index) => {
      const done = count >= step.passes, unlocked = prerequisiteMet && (index === 0 || stepStates[index - 1].count >= stepStates[index - 1].step.passes);
      const updateStep = (change: Partial<SongLearningPathStep>) => custom && updatePath({ steps: custom.steps.map(item => item.id === step.id ? { ...item, ...change } : item) });
      return <li key={step.id ?? step.songId} className={done ? "song-path-step is-complete" : "song-path-step"}>
        <div><strong>{index + 1}. {step.label}</strong><small>{song?.title ?? "Song unavailable"} · {step.targetBpm} BPM · {Math.min(count, step.passes)}/{step.passes} passes at {step.minimumScore}% or better</small></div>
        <div className="song-actions"><button type="button" disabled={!song || !section || !part || !unlocked} title={!unlocked ? "Complete the previous step to unlock this one." : undefined} onClick={() => onPractice(step.songId, step.sectionId, step.partId, step.targetBpm)}>{done ? "Review this step" : unlocked ? "Practice this step" : "Locked"}</button>{custom && <><details className="song-path-step-edit"><summary>Edit step</summary><label>Song<select value={song?.id ?? ""} onChange={event => { const nextSong = selectableSongs.find(item => item.id === event.target.value); const nextSection = nextSong?.sections[0]; const nextPart = nextSection?.parts[0]; if (nextSong && nextSection && nextPart) updateStep({ songId: nextSong.id, sectionId: nextSection.id, partId: nextPart.id }); }}><option value="" disabled>Choose a song</option>{selectableSongs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Section<select value={section?.id ?? ""} onChange={event => { const nextSection = song?.sections.find(item => item.id === event.target.value); const nextPart = nextSection?.parts[0]; if (nextSection && nextPart) updateStep({ sectionId: nextSection.id, partId: nextPart.id }); }}><option value="" disabled>Choose a section</option>{song?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Part<select value={part?.id ?? ""} onChange={event => updateStep({ partId: event.target.value })}><option value="" disabled>Choose a part</option>{section?.parts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Step label<input maxLength={120} value={step.label} onChange={event => updateStep({ label: event.target.value.slice(0, 120) })} /></label><label>Target BPM<input type="number" min={40} max={200} value={step.targetBpm} onChange={event => updateStep({ targetBpm: Math.max(40, Math.min(200, Number(event.target.value) || 40)) })} /></label><label>Minimum score<input type="number" min={1} max={100} value={step.minimumScore} onChange={event => updateStep({ minimumScore: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></label><label>Required passes<input type="number" min={1} max={20} value={step.passes} onChange={event => updateStep({ passes: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label></details><button type="button" aria-label={`Move step ${index + 1} earlier`} disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</button><button type="button" aria-label={`Move step ${index + 1} later`} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>↓</button><button type="button" onClick={() => updatePath({ steps: custom.steps.filter(item => item.id !== step.id) })}>Remove</button></>}</div>
      </li>;
    })}</ol> : <p>Add the first practice step to this path.</p>}
    {custom && <><details className="song-tool-panel"><summary>Add a practice step</summary><div className="song-form-row"><label>Song<select value={selectedSong?.id ?? ""} onChange={event => { setStepSongId(event.target.value); setStepSectionId(""); setStepPartId(""); }}><option value="">Choose a song</option>{selectableSongs.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label><label>Section<select value={selectedSection?.id ?? ""} onChange={event => { setStepSectionId(event.target.value); setStepPartId(""); }}><option value="">Choose a section</option>{selectedSong?.sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>Part<select value={selectedPart?.id ?? ""} onChange={event => setStepPartId(event.target.value)}><option value="">Choose a part</option>{selectedSection?.parts.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label></div><label>Step label<input value={stepLabel} maxLength={120} onChange={event => setStepLabel(event.target.value)} placeholder="e.g. Keep the ride pulse even" /></label><div className="song-form-row"><label>Target BPM<input type="number" min={40} max={200} value={targetBpm} onChange={event => setTargetBpm(Number(event.target.value) || 80)} /></label><label>Minimum score<input type="number" min={1} max={100} value={minimumScore} onChange={event => setMinimumScore(Number(event.target.value) || 80)} /></label><label>Required passes<input type="number" min={1} max={20} value={requiredPasses} onChange={event => setRequiredPasses(Number(event.target.value) || 3)} /></label></div><button type="button" disabled={!selectedPart || custom.steps.length >= 100} onClick={addStep}>Add step</button></details><button type="button" onClick={() => { if (window.confirm(`Delete the learning path “${custom.title}”?`)) { save(current => ({ ...current, learningPaths: (current.learningPaths ?? []).filter(path => path.id !== custom.id) })); setActiveId(paths[0].id); } }}>Delete learning path</button></>}
    <details className="song-tool-panel"><summary>Create a custom learning path</summary><label>Path title<input maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Path description<textarea maxLength={500} value={summary} onChange={event => setSummary(event.target.value)} /></label><div className="song-form-row"><label>Style<input maxLength={60} value={pathStyle} onChange={event => setPathStyle(event.target.value)} /></label><label>Meter<input maxLength={30} value={pathMeter} onChange={event => setPathMeter(event.target.value)} /></label><label>Skill focus<input maxLength={80} value={pathSkill} onChange={event => setPathSkill(event.target.value)} /></label><label>Difficulty<select value={pathDifficulty} onChange={event => setPathDifficulty(event.target.value as "Beginner" | "Intermediate" | "Advanced")}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Prerequisite path<select value={pathPrerequisite} onChange={event => setPathPrerequisite(event.target.value)}><option value="">None</option>{available.map(path => <option key={path.id} value={path.id}>{path.title}</option>)}</select></label></div><button type="button" disabled={!title.trim() || customPaths.length >= 100} onClick={createPath}>Create path</button></details>
    {steps.length > 0 && completed === steps.length && <p role="status"><strong>Path complete.</strong> Choose another path or revisit a step.</p>}
  </section>;
}
