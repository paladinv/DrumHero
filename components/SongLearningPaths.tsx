"use client";
import { useMemo, useState } from "react";
import { songPartEvidenceFingerprint, type DrumSong, type SongLearningPath, type SongLearningPathStep, type SongLibraryState } from "@/lib/song-library";

type PathStep = Omit<SongLearningPathStep, "id"> & { id?: string };
type BuiltInPath = { id: string; title: string; summary: string; steps: PathStep[] };
const paths: BuiltInPath[] = [
  { id: "steady-pocket", title: "Build a steady pocket", summary: "Move from a basic backbeat to a busier groove while keeping the pulse even.", steps: [
    { songId: "example-steady-road", sectionId: "verse", partId: "main", label: "Steady eighth-note backbeat", targetBpm: 82, minimumScore: 80, passes: 3 },
    { songId: "example-paper-lantern-parade", sectionId: "verse", partId: "main", label: "Add a clear crash entrance", targetBpm: 92, minimumScore: 80, passes: 3 },
    { songId: "example-pocket-garden", sectionId: "verse", partId: "main", label: "Keep time through syncopation", targetBpm: 104, minimumScore: 80, passes: 3 }
  ] },
  { id: "meters-and-feels", title: "Explore meters and feels", summary: "Practice a three beat bar, a shuffled triplet pulse, then a longer five beat cycle.", steps: [
    { songId: "example-three-steps-home", sectionId: "verse", partId: "main", label: "Settle into 3/4", targetBpm: 78, minimumScore: 75, passes: 3 },
    { songId: "example-window-rain-shuffle", sectionId: "verse", partId: "main", label: "Keep the shuffle triplets even", targetBpm: 86, minimumScore: 75, passes: 3 },
    { songId: "example-copper-clock", sectionId: "verse", partId: "main", label: "Feel all five beats", targetBpm: 105, minimumScore: 75, passes: 3 }
  ] },
  { id: "kit-voices", title: "Get comfortable around the kit", summary: "Move the timekeeping voice, then add cymbal and rimshot colors.", steps: [
    { songId: "example-steady-road", sectionId: "verse", partId: "main", label: "Establish the groove", targetBpm: 82, minimumScore: 80, passes: 3 },
    { songId: "example-night-shift-signals", sectionId: "verse", partId: "main", label: "Lead with ride and open hi-hat", targetBpm: 118, minimumScore: 75, passes: 3 },
    { songId: "example-copper-clock", sectionId: "verse", partId: "main", label: "Add a rimshot accent", targetBpm: 105, minimumScore: 75, passes: 3 }
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
  const customPaths = state.learningPaths ?? [];
  const selectableSongs = useMemo(() => songs.filter(song => !song.archived), [songs]);
  const available = [...paths, ...customPaths];
  const active = available.find(path => path.id === activeId) ?? paths[0];
  const custom = customPaths.find(path => path.id === active.id);
  const steps = active.steps;
  const stepStates = steps.map(step => {
    const song = songs.find(candidate => candidate.id === step.songId);
    return { step, song, count: passed(state, song, step), section: song?.sections.find(item => item.id === step.sectionId), part: song?.sections.find(item => item.id === step.sectionId)?.parts.find(item => item.id === step.partId) };
  });
  const completed = stepStates.filter(item => item.count >= item.step.passes).length;
  const selectedSong = selectableSongs.find(song => song.id === stepSongId) ?? selectableSongs[0];
  const selectedSection = selectedSong?.sections.find(section => section.id === stepSectionId) ?? selectedSong?.sections[0];
  const selectedPart = selectedSection?.parts.find(part => part.id === stepPartId) ?? selectedSection?.parts[0];
  const createPath = () => {
    if (!title.trim()) return;
    const path: SongLearningPath = { id: crypto.randomUUID(), title: title.trim().slice(0, 100), summary: summary.trim().slice(0, 500), steps: [], createdAt: new Date().toISOString() };
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
    <p>Build an ordered practice sequence. Steps count complete, arrangement-matched scored passes at their target tempo.</p>
    <label>Learning path<select value={active.id} onChange={event => setActiveId(event.target.value)}>{available.map(path => <option key={path.id} value={path.id}>{path.title}{customPaths.some(item => item.id === path.id) ? " · custom" : ""}</option>)}</select></label>
    <p>{active.summary} · {completed}/{steps.length} steps complete</p>
    {custom && <div className="song-path-editor"><label>Path title<input maxLength={100} value={custom.title} onChange={event => updatePath({ title: event.target.value.slice(0, 100) })} /></label><label>Path description<textarea maxLength={500} value={custom.summary} onChange={event => updatePath({ summary: event.target.value.slice(0, 500) })} /></label></div>}
    {steps.length ? <ol>{stepStates.map(({ step, song, count, section, part }, index) => {
      const done = count >= step.passes, unlocked = index === 0 || stepStates[index - 1].count >= stepStates[index - 1].step.passes;
      const updateStep = (change: Partial<SongLearningPathStep>) => custom && updatePath({ steps: custom.steps.map(item => item.id === step.id ? { ...item, ...change } : item) });
      return <li key={step.id ?? step.songId} className={done ? "song-path-step is-complete" : "song-path-step"}>
        <div><strong>{index + 1}. {step.label}</strong><small>{song?.title ?? "Song unavailable"} · {step.targetBpm} BPM · {Math.min(count, step.passes)}/{step.passes} passes at {step.minimumScore}% or better</small></div>
        <div className="song-actions"><button type="button" disabled={!song || !section || !part || !unlocked} title={!unlocked ? "Complete the previous step to unlock this one." : undefined} onClick={() => onPractice(step.songId, step.sectionId, step.partId, step.targetBpm)}>{done ? "Review this step" : unlocked ? "Practice this step" : "Locked"}</button>{custom && <><details className="song-path-step-edit"><summary>Edit step</summary><label>Song<select value={song?.id ?? ""} onChange={event => { const nextSong = selectableSongs.find(item => item.id === event.target.value); const nextSection = nextSong?.sections[0]; const nextPart = nextSection?.parts[0]; if (nextSong && nextSection && nextPart) updateStep({ songId: nextSong.id, sectionId: nextSection.id, partId: nextPart.id }); }}><option value="" disabled>Choose a song</option>{selectableSongs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Section<select value={section?.id ?? ""} onChange={event => { const nextSection = song?.sections.find(item => item.id === event.target.value); const nextPart = nextSection?.parts[0]; if (nextSection && nextPart) updateStep({ sectionId: nextSection.id, partId: nextPart.id }); }}><option value="" disabled>Choose a section</option>{song?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Part<select value={part?.id ?? ""} onChange={event => updateStep({ partId: event.target.value })}><option value="" disabled>Choose a part</option>{section?.parts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Step label<input maxLength={120} value={step.label} onChange={event => updateStep({ label: event.target.value.slice(0, 120) })} /></label><label>Target BPM<input type="number" min={40} max={200} value={step.targetBpm} onChange={event => updateStep({ targetBpm: Math.max(40, Math.min(200, Number(event.target.value) || 40)) })} /></label><label>Minimum score<input type="number" min={1} max={100} value={step.minimumScore} onChange={event => updateStep({ minimumScore: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></label><label>Required passes<input type="number" min={1} max={20} value={step.passes} onChange={event => updateStep({ passes: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label></details><button type="button" aria-label={`Move step ${index + 1} earlier`} disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</button><button type="button" aria-label={`Move step ${index + 1} later`} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>↓</button><button type="button" onClick={() => updatePath({ steps: custom.steps.filter(item => item.id !== step.id) })}>Remove</button></>}</div>
      </li>;
    })}</ol> : <p>Add the first practice step to this path.</p>}
    {custom && <><details className="song-tool-panel"><summary>Add a practice step</summary><div className="song-form-row"><label>Song<select value={selectedSong?.id ?? ""} onChange={event => { setStepSongId(event.target.value); setStepSectionId(""); setStepPartId(""); }}><option value="">Choose a song</option>{selectableSongs.map(song => <option key={song.id} value={song.id}>{song.title}</option>)}</select></label><label>Section<select value={selectedSection?.id ?? ""} onChange={event => { setStepSectionId(event.target.value); setStepPartId(""); }}><option value="">Choose a section</option>{selectedSong?.sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>Part<select value={selectedPart?.id ?? ""} onChange={event => setStepPartId(event.target.value)}><option value="">Choose a part</option>{selectedSection?.parts.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label></div><label>Step label<input value={stepLabel} maxLength={120} onChange={event => setStepLabel(event.target.value)} placeholder="e.g. Keep the ride pulse even" /></label><div className="song-form-row"><label>Target BPM<input type="number" min={40} max={200} value={targetBpm} onChange={event => setTargetBpm(Number(event.target.value) || 80)} /></label><label>Minimum score<input type="number" min={1} max={100} value={minimumScore} onChange={event => setMinimumScore(Number(event.target.value) || 80)} /></label><label>Required passes<input type="number" min={1} max={20} value={requiredPasses} onChange={event => setRequiredPasses(Number(event.target.value) || 3)} /></label></div><button type="button" disabled={!selectedPart || custom.steps.length >= 100} onClick={addStep}>Add step</button></details><button type="button" onClick={() => { if (window.confirm(`Delete the learning path “${custom.title}”?`)) { save(current => ({ ...current, learningPaths: (current.learningPaths ?? []).filter(path => path.id !== custom.id) })); setActiveId(paths[0].id); } }}>Delete learning path</button></>}
    <details className="song-tool-panel"><summary>Create a custom learning path</summary><label>Path title<input maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Path description<textarea maxLength={500} value={summary} onChange={event => setSummary(event.target.value)} /></label><button type="button" disabled={!title.trim() || customPaths.length >= 100} onClick={createPath}>Create path</button></details>
    {steps.length > 0 && completed === steps.length && <p role="status"><strong>Path complete.</strong> Choose another path or revisit a step.</p>}
  </section>;
}
