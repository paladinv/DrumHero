"use client";

import { useState } from "react";
import { useLocalization } from "./LocalizationProvider";
import {
  advanceTempoRamp,
  DRUM_REHEARSAL_RUBRICS,
  DRUM_RUBRIC_SCORE_LABELS,
  readiness,
  reviewSection,
  type ArrangementSnapshot,
  type DrumSong,
  type RehearsalRubricAssessment,
  type RubricScore,
  type SongLibraryState,
  type SongSection
} from "@/lib/song-library";

const uid = () => crypto.randomUUID();
const scoreOptions: RubricScore[] = [1, 2, 3, 4];
type SnapshotRestoreScope = { sectionId?: string; partId?: string; bar?: number };

export function SongRehearsal({ state, song, section, save, restore }: {
  state: SongLibraryState;
  song: DrumSong;
  section?: SongSection;
  save: (state: SongLibraryState) => void;
  restore: (snapshot: ArrangementSnapshot, scope?: SnapshotRestoreScope) => void;
}) {
  const { formatDate } = useLocalization();
  const [name, setName] = useState("");
  const [item, setItem] = useState("");
  const [target, setTarget] = useState(song.bpm + 20);
  const [roleName, setRoleName] = useState("");
  const [claimedBy, setClaimedBy] = useState("");
  const [selectedRubricId, setSelectedRubricId] = useState(DRUM_REHEARSAL_RUBRICS[0].id);
  const [rubricScores, setRubricScores] = useState<Record<string, RubricScore>>({});
  const [rubricNotes, setRubricNotes] = useState("");
  const [snapshotTargets, setSnapshotTargets] = useState<Record<string, SnapshotRestoreScope>>({});
  const status = readiness(state, song);
  const review = section && state.reviews.find((entry) => entry.songId === song.id && entry.sectionId === section.id);
  const rubric = DRUM_REHEARSAL_RUBRICS.find((entry) => entry.id === selectedRubricId) ?? DRUM_REHEARSAL_RUBRICS[0];
  const assessments = (state.rubricAssessments ?? [])
    .filter((assessment) => assessment.songId === song.id && assessment.sectionId === section?.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8);
  const songParts = song.sections.flatMap((section) => section.parts.map((part) => ({ section, part })));
  const canSaveAssessment = Boolean(section && rubric.criteria.every((criterion) => rubricScores[criterion.id] !== undefined));

  const saveAssessment = () => {
    if (!section || !canSaveAssessment) return;
    const assessment: RehearsalRubricAssessment = {
      id: uid(),
      songId: song.id,
      sectionId: section.id,
      templateId: rubric.id,
      templateLabel: rubric.label,
      createdAt: new Date().toISOString(),
      criteria: rubric.criteria.map((criterion) => ({ ...criterion, score: rubricScores[criterion.id]! })),
      notes: rubricNotes.trim().slice(0, 1000)
    };
    save({
      ...state,
      rubricAssessments: [assessment, ...(state.rubricAssessments ?? [])].slice(0, 1000)
    });
    setRubricScores({});
    setRubricNotes("");
  };

  return (
    <details>
      <summary>Reviews and rehearsal</summary>
      <p>
        <strong>Readiness:</strong> {status.mastery}% target-tempo part mastery · {status.ready ? "Ready" : "Needs practice"}
        {status.due ? " · review due" : ""}
      </p>
      <p>
        Ready means every playable part averages at least {status.targetMastery}% across its last three scored attempts near target tempo (98–105%), with no overdue review. Self ratings and older unscoped scores remain in history.
        {status.reasons.length ? ` Next: ${status.reasons[0]}.` : " All sections meet the target."}
      </p>

      {section && <>
        <h4>{section.name} review</h4>
        <p>{review ? `Next review ${formatDate(new Date(review.dueAt), true)}` : "No review scheduled."}</p>
        <div className="song-actions">
          {(["again", "hard", "good", "easy"] as const).map((result) => (
            <button type="button" key={result} onClick={() => save(reviewSection(state, song.id, section.id, result))}>
              {result}
            </button>
          ))}
        </div>

        <section className="rehearsal-rubric" aria-labelledby="rehearsal-rubric-title">
          <h4 id="rehearsal-rubric-title">Teacher rubric · {section.name}</h4>
          <p>Rate each area from 1 to 4. Evaluations are saved with this song section on this device.</p>
          <label>
            Rubric template
            <select value={rubric.id} onChange={(event) => {
              setSelectedRubricId(event.target.value);
              setRubricScores({});
            }}>
              {DRUM_REHEARSAL_RUBRICS.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
            </select>
          </label>
          <div className="rubric-criteria">
            {rubric.criteria.map((criterion) => (
              <fieldset className="rubric-criterion" key={criterion.id}>
                <legend>{criterion.label}</legend>
                <p>{criterion.prompt}</p>
                <div className="rubric-score-options">
                  {scoreOptions.map((score) => (
                    <label key={score}>
                      <input
                        type="radio"
                        name={`rubric-${rubric.id}-${criterion.id}`}
                        value={score}
                        checked={rubricScores[criterion.id] === score}
                        onChange={() => setRubricScores((current) => ({ ...current, [criterion.id]: score }))}
                      />
                      <span><strong>{score}</strong> · {DRUM_RUBRIC_SCORE_LABELS[score]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <label>
            Teacher notes
            <textarea value={rubricNotes} maxLength={1000} onChange={(event) => setRubricNotes(event.target.value)} placeholder="Add one concrete next step…" />
          </label>
          <button type="button" disabled={!canSaveAssessment} onClick={saveAssessment}>Save evaluation</button>

          {assessments.length > 0 && <div className="rubric-assessment-history">
            <h5>Recent evaluations</h5>
            {assessments.map((assessment) => {
              const average = assessment.criteria.reduce((sum, criterion) => sum + criterion.score, 0) / assessment.criteria.length;
              return (
                <details key={assessment.id}>
                  <summary>{assessment.templateLabel} · {average.toFixed(1)}/4 · {formatDate(new Date(assessment.createdAt))}</summary>
                  <ul>
                    {assessment.criteria.map((criterion) => (
                      <li key={criterion.id}>{criterion.label}: {criterion.score} · {DRUM_RUBRIC_SCORE_LABELS[criterion.score]}</li>
                    ))}
                  </ul>
                  {assessment.notes && <p>{assessment.notes}</p>}
                </details>
              );
            })}
          </div>}
        </section>

        <h4>Tempo ramp</h4>
        <label>Target BPM<input type="number" min="40" max="200" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
        <button type="button" onClick={() => {
          const startBpm = section.parts[0]?.bpm ?? song.bpm;
          save({ ...state, tempoRamps: [...state.tempoRamps, { id: uid(), songId: song.id, sectionId: section.id, startBpm, targetBpm: Math.max(startBpm, Math.min(200, target)), currentBpm: startBpm, stepBpm: 5, successfulPasses: 0 }] });
        }}>Start ramp</button>
        {state.tempoRamps.filter((ramp) => ramp.songId === song.id && ramp.sectionId === section.id).map((ramp) => (
          <p key={ramp.id}>
            {ramp.currentBpm} → {ramp.targetBpm} BPM · {ramp.successfulPasses} successful passes
            <button type="button" onClick={() => save(advanceTempoRamp(state, ramp.id, true))}>Pass</button>
            <button type="button" onClick={() => save(advanceTempoRamp(state, ramp.id, false))}>Retry slower</button>
          </p>
        ))}
      </>}

      <h4>Arrangement history and snapshots</h4>
      <p>Automatic revisions are saved after arrangement edits settle. Restore a whole snapshot or recover one section, part, or bar while keeping the rest of today’s arrangement.</p>
      <label>Snapshot label<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="button" onClick={() => {
        if (!name.trim()) return;
        save({ ...state, snapshots: [...state.snapshots, { id: uid(), songId: song.id, label: name.trim().slice(0, 80), bpm: song.bpm, meter: song.meter, referenceTempoMap: structuredClone(song.referenceTempoMap), arrangementAutomation: structuredClone(song.arrangementAutomation), voiceLabels: structuredClone(song.voiceLabels), sections: structuredClone(song.sections), createdAt: new Date().toISOString() }] });
        setName("");
      }}>Save snapshot</button>
      {state.snapshots.filter((snapshot) => snapshot.songId === song.id).map((snapshot) => {
        const savedSection = snapshotTargets[snapshot.id]?.sectionId ? snapshot.sections.find(item => item.id === snapshotTargets[snapshot.id].sectionId) : undefined;
        const restoreSection = savedSection ?? snapshot.sections[0];
        const restorePart = restoreSection?.parts.find(item => item.id === snapshotTargets[snapshot.id]?.partId) ?? restoreSection?.parts[0];
        const meter = restoreSection?.meter ?? snapshot.meter ?? song.meter;
        const meterNumerator = Number(meter.split("/")[0]);
        const barBeats = Number.isFinite(meterNumerator) && meterNumerator > 0 ? meterNumerator : 4;
        const barCount = restorePart ? Math.max(1, Math.min(128, Math.ceil(restorePart.beats / barBeats))) : 0;
        const target = snapshotTargets[snapshot.id] ?? {};
        return <details className="song-snapshot-restore" key={snapshot.id}>
          <summary>{snapshot.automatic ? "Automatic revision" : snapshot.label} · {formatDate(new Date(snapshot.createdAt))}</summary>
          <div className="song-actions"><button type="button" onClick={() => {
            if (window.confirm("Restore the full snapshot “" + snapshot.label + "”? Current tempo, meter, tempo map, and sections will be replaced.")) restore(structuredClone(snapshot));
          }}>Restore full snapshot</button><button type="button" onClick={() => save({ ...state, snapshots: state.snapshots.filter((entry) => entry.id !== snapshot.id) })}>Delete snapshot</button></div>
          {snapshot.sections.length > 0 ? <>
            <label>Section to recover<select value={restoreSection?.id ?? ""} onChange={event => setSnapshotTargets(current => ({ ...current, [snapshot.id]: { ...current[snapshot.id], sectionId: event.target.value, partId: undefined, bar: 1 } }))}>{snapshot.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {restoreSection && <button type="button" onClick={() => {
              if (window.confirm("Restore only “" + restoreSection.name + "” from this snapshot? Other sections and song metadata will stay as they are.")) restore(structuredClone(snapshot), { sectionId: restoreSection.id });
            }}>Restore this section</button>}
            {restoreSection?.parts.length ? <>
              <label>Part to recover<select value={restorePart?.id ?? ""} onChange={event => setSnapshotTargets(current => ({ ...current, [snapshot.id]: { ...current[snapshot.id], sectionId: restoreSection.id, partId: event.target.value, bar: 1 } }))}>{restoreSection.parts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {restorePart && <><button type="button" onClick={() => {
                if (window.confirm("Restore only the part “" + restorePart.name + "” in “" + restoreSection.name + "”? Other parts and sections will stay as they are.")) restore(structuredClone(snapshot), { sectionId: restoreSection.id, partId: restorePart.id });
              }}>Restore this part</button>{barCount > 1 && <><label>Bar to recover<select value={target.bar ?? 1} onChange={event => setSnapshotTargets(current => ({ ...current, [snapshot.id]: { ...current[snapshot.id], sectionId: restoreSection.id, partId: restorePart.id, bar: Number(event.target.value) } }))}>{Array.from({ length: barCount }, (_, index) => <option key={index + 1} value={index + 1}>Bar {index + 1}</option>)}</select></label><button type="button" onClick={() => {
                const bar = target.bar ?? 1;
                if (window.confirm("Restore bar " + bar + " of “" + restorePart.name + "” from this snapshot? Hits outside this bar will stay as they are.")) restore(structuredClone(snapshot), { sectionId: restoreSection.id, partId: restorePart.id, bar });
              }}>Restore selected bar</button></>}</>}
            </> : <p>This section has no drum parts to recover.</p>}
          </> : <p>This snapshot has no sections to recover.</p>}
        </details>;
      })}

      <h4>Checklists</h4>
      <button type="button" onClick={() => save({ ...state, checklists: [...state.checklists, { id: uid(), name: `${song.title} rehearsal`, items: [] }] })}>Create checklist</button>
      <label>New item<input value={item} onChange={(event) => setItem(event.target.value)} /></label>
      {state.checklists.map((list) => (
        <div key={list.id}>
          <strong>{list.name}</strong>
          <button type="button" onClick={() => {
            if (!item.trim()) return;
            save({ ...state, checklists: state.checklists.map((entry) => entry.id === list.id ? { ...entry, items: [...entry.items, { id: uid(), text: item.trim().slice(0, 120), done: false }] } : entry) });
            setItem("");
          }}>Add item</button>
          {list.items.map((entry) => (
            <label key={entry.id}>
              <input type="checkbox" checked={entry.done} onChange={() => save({ ...state, checklists: state.checklists.map((checklist) => checklist.id === list.id ? { ...checklist, items: checklist.items.map((checkItem) => checkItem.id === entry.id ? { ...checkItem, done: !checkItem.done } : checkItem) } : checklist) })} />
              {entry.text}
            </label>
          ))}
        </div>
      ))}

      <h4>Rehearsal roles</h4>
      <label>Responsibility<input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Count-ins and cues" /></label>
      <button type="button" onClick={() => {
        if (!roleName.trim()) return;
        save({ ...state, roles: [...state.roles, { id: uid(), name: roleName.trim().slice(0, 80), responsibility: roleName.trim().slice(0, 200) }] });
        setRoleName("");
      }}>Add role</button>
      <label>Your name<input value={claimedBy} onChange={(event) => setClaimedBy(event.target.value)} /></label>
      {state.roles.map((role) => {
        const assignment = role.assignments?.[song.id];
        const assignedIndex = songParts.findIndex(({ section: assignedSection, part: assignedPart }) => assignedSection.id === assignment?.sectionId && assignedPart.id === assignment?.partId);
        return <div className="song-role-assignment" key={role.id}>
          <p>{role.name} · {role.responsibility} · {role.claimedBy || "Unclaimed"}</p>
          <label>Drum part for this role
            <select value={assignedIndex < 0 ? "" : String(assignedIndex)} onChange={(event) => {
              const selected = event.target.value === "" ? undefined : songParts[Number(event.target.value)];
              save({ ...state, roles: state.roles.map((entry) => {
                if (entry.id !== role.id) return entry;
                const assignments = { ...entry.assignments };
                if (selected) assignments[song.id] = { sectionId: selected.section.id, partId: selected.part.id };
                else delete assignments[song.id];
                return { ...entry, assignments };
              }) });
            }}>
              <option value="">No assigned part</option>
              {songParts.map(({ section: assignedSection, part: assignedPart }, index) => <option key={`${assignedSection.id}:${assignedPart.id}`} value={index}>{assignedSection.name} / {assignedPart.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => save({ ...state, roles: state.roles.map((entry) => entry.id === role.id ? { ...entry, claimedBy: entry.claimedBy ? undefined : claimedBy.trim().slice(0, 80) || "Local player" } : entry) })}>
            {role.claimedBy ? "Release" : "Claim"}
          </button>
        </div>;
      })}
    </details>
  );
}
