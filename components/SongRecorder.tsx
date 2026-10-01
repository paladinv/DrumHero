"use client";

import { useEffect, useRef, useState } from "react";
import type { DrumPart } from "@/lib/song-library";
import {
  analyzeTake,
  compareDrumRecordings,
  deleteTake,
  drumPartFingerprint,
  loadTake,
  saveTake,
  type SongRecording
} from "@/lib/song-recording";

export function SongRecorder({ songId, sectionId, bpm, part, recordings, onSave, onDelete }: {
  songId: string;
  sectionId?: string;
  bpm: number;
  part?: DrumPart;
  recordings: SongRecording[];
  onSave: (item: SongRecording) => void;
  onDelete: (id: string) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startAt = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [comparisonSelection, setComparisonSelection] = useState({ key: "", referenceId: "", comparisonId: "" });
  const patternFingerprint = drumPartFingerprint(part);
  const selectionKey = `${songId}:${sectionId ?? ""}:${bpm}:${patternFingerprint ?? ""}`;
  const referenceId = comparisonSelection.key === selectionKey ? comparisonSelection.referenceId : "";
  const comparisonId = comparisonSelection.key === selectionKey ? comparisonSelection.comparisonId : "";
  const setReferenceId = (id: string) => setComparisonSelection((previous) => ({ key: selectionKey, referenceId: id, comparisonId: previous.key === selectionKey ? previous.comparisonId : "" }));
  const setComparisonId = (id: string) => setComparisonSelection((previous) => ({ key: selectionKey, referenceId: previous.key === selectionKey ? previous.referenceId : "", comparisonId: id }));

  useEffect(() => () => {
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const scopedRecordings = recordings.filter((take) =>
    take.songId === songId && (take.sectionId ?? "") === (sectionId ?? "")
  );
  const reference = scopedRecordings.find((take) => take.id === referenceId) ?? null;
  const comparedTake = scopedRecordings.find((take) => take.id === comparisonId) ?? null;
  const comparison = reference && comparedTake ? compareDrumRecordings(comparedTake, reference) : null;

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      recorder.current = new MediaRecorder(stream.current);
      recorder.current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.current.onstop = async () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        try {
          const blob = new Blob(chunks, { type: recorder.current?.mimeType || "audio/webm" });
          const id = crypto.randomUUID();
          await saveTake(id, blob);
          const analysis = await analyzeTake(blob, bpm, part).catch(() => ({ hitCount: 0, timingConsistency: null }));
          onSave({
            id,
            songId,
            sectionId,
            createdAt: new Date().toISOString(),
            durationMs: Date.now() - startAt.current,
            mimeType: blob.type,
            targetBpm: bpm,
            patternFingerprint: patternFingerprint ?? undefined,
            ...analysis
          });
          setMessage("Take saved on this device. Timing estimate is approximate.");
        } catch {
          setMessage("Could not save this recording.");
        }
        setBusy(false);
      };
      startAt.current = Date.now();
      recorder.current.start();
      setBusy(true);
      setMessage("Recording locally…");
    } catch {
      setMessage("Microphone permission or recording is unavailable.");
    }
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  const exportTake = async (id: string) => {
    try {
      const blob = await loadTake(id);
      if (!blob) {
        setMessage("Take not found on this device.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      anchor.download = `drum-hero-take-${id}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Could not export this recording.");
    }
  };

  const removeTake = async (id: string) => {
    try {
      await deleteTake(id);
      if (referenceId === id) setReferenceId("");
      if (comparisonId === id) setComparisonId("");
      onDelete(id);
    } catch {
      setMessage("Could not delete this recording.");
    }
  };

  return (
    <details>
      <summary>Local recordings</summary>
      <p>
        Record with microphone permission. Audio remains on this device; export only when you choose.
        Onsets are matched against this section’s grid after searching for the best start offset.
        The microphone cannot identify drum voices, and room sound can affect detection, so treat
        the low/medium confidence score as a rough guide.
      </p>
      <button type="button" onClick={busy ? stop : start}>{busy ? "Stop recording" : "Record take"}</button>
      <p role="status">{message}</p>

      <section className="recording-comparison-tools" aria-label="Compare local recordings">
        <h4>Compare with a reference take</h4>
        <p>
          Set one saved take as the reference, then compare another analyzed take from the same
          section, drum pattern, and tempo. Comparisons stay on this device. Older takes without
          saved pattern and tempo details, or takes without timing analysis, can still be played or
          exported, but cannot be compared.
        </p>
        {scopedRecordings.map((take) => {
          const isReference = take.id === referenceId;
          const candidateComparison = reference ? compareDrumRecordings(take, reference) : null;
          const canUseAsReference = compareDrumRecordings(take, take) !== null;
          return (
            <article key={take.id} className="recording-entry">
              <strong>{new Date(take.createdAt).toLocaleString()}</strong>
              {isReference && <span> · Reference</span>}
              <p>
                {Math.round(take.durationMs / 1000)}s · {take.hitCount} detected onsets · {take.timingConsistency === null
                  ? "Timing unavailable"
                  : `${take.timingConsistency}% expected-hit match · ${take.matchedHits ?? 0} matched, ${take.missedTargets ?? 0} missed, ${take.extraHits ?? 0} extra · ${take.meanOffsetMs ?? "—"} ms mean timing error · ${take.confidence ?? "low"} confidence`}
              </p>
              <details className="recording-analysis">
                <summary>Detected onsets</summary>
                <ol>{(take.onsetTimes ?? []).map((time, index) => <li key={`${index}-${time}`}>{time.toFixed(2)}s</li>)}</ol>
              </details>
              <div className="song-actions">
                <button
                  type="button"
                  aria-pressed={isReference}
                  disabled={!canUseAsReference}
                  title={canUseAsReference ? undefined : "Record this pattern again to compare its timing."}
                  onClick={() => {
                    setReferenceId(isReference ? "" : take.id);
                    setComparisonId("");
                  }}
                >
                  {isReference ? "Clear reference" : "Use as reference"}
                </button>
                {reference && !isReference && (
                  <button
                    type="button"
                    aria-pressed={comparisonId === take.id}
                    disabled={!candidateComparison}
                    title={candidateComparison ? undefined : "This take does not match the reference pattern and tempo."}
                    onClick={() => setComparisonId(comparisonId === take.id ? "" : take.id)}
                  >
                    {comparisonId === take.id ? "Clear comparison" : "Compare with reference"}
                  </button>
                )}
                <button type="button" onClick={() => void exportTake(take.id)}>Export audio</button>
                <button type="button" onClick={() => void removeTake(take.id)}>Delete</button>
              </div>
            </article>
          );
        })}
        {comparison && comparedTake && reference && (
          <div className="recording-comparison-result" role="status">
            <strong>Reference comparison · {new Date(reference.createdAt).toLocaleString()}</strong>
            <p>{comparison.summary}</p>
            <p>
              Match rate: {comparison.studentMatchRate}% vs {comparison.referenceMatchRate}% ·
              {" "}mean timing error: {comparison.studentMeanTimingErrorMs ?? "—"} ms vs {comparison.referenceMeanTimingErrorMs ?? "—"} ms ·
              {" "}extra hits per 100 targets: {comparison.studentExtraHitsPer100} vs {comparison.referenceExtraHitsPer100}
            </p>
            <small>Analysis confidence: {comparison.confidence}. Results are approximate and do not identify drum voices.</small>
          </div>
        )}
      </section>
    </details>
  );
}
