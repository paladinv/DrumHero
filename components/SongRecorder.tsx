"use client";

import { createDrumAudio,type DrumAudio } from "@/lib/audio";
import { SongTakeTrim } from "./SongTakeTrim";
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
import { useLocalization } from "./LocalizationProvider";
import { SongTakeTimeline } from "./SongTakeTimeline";
import { SongRecordingPlayback } from "./SongRecordingPlayback";
import { SongRecordingAnalysisReview } from "./SongRecordingAnalysisReview";

export function SongRecorder({ songId, sectionId, bpm, part, recordings, onSave, onDelete, onUpdate }: {
  songId: string;
  sectionId?: string;
  bpm: number;
  part?: DrumPart;
  recordings: SongRecording[];
  onSave: (item: SongRecording) => void;
  onDelete: (id: string) => void;
  onUpdate?: (take:SongRecording)=>void;
}) {
  const { formatDate } = useLocalization();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startAt = useRef(0);
  const clock=useRef<{audio:DrumAudio|null;timer:number;token:number}>({audio:null,timer:0,token:0});
  const [processing,setProcessing]=useState(false);
  const [countIn,setCountIn]=useState(true),[guide,setGuide]=useState(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [comparisonSelection, setComparisonSelection] = useState({ key: "", referenceId: "", comparisonId: "" });
  const patternFingerprint = drumPartFingerprint(part);
  const selectionKey = `${songId}:${sectionId ?? ""}:${bpm}:${patternFingerprint ?? ""}`;
  const referenceId = comparisonSelection.key === selectionKey ? comparisonSelection.referenceId : "";
  const comparisonId = comparisonSelection.key === selectionKey ? comparisonSelection.comparisonId : "";
  const setReferenceId = (id: string) => setComparisonSelection((previous) => ({ key: selectionKey, referenceId: id, comparisonId: previous.key === selectionKey ? previous.comparisonId : "" }));
  const setComparisonId = (id: string) => setComparisonSelection((previous) => ({ key: selectionKey, referenceId: previous.key === selectionKey ? previous.referenceId : "", comparisonId: id }));

  useEffect(() => { mounted.current = true; const clockState=clock.current; return () => {
    mounted.current = false; clockState.token++; window.clearInterval(clockState.timer);clockState.audio?.close();
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
  }; }, []);

  const scopedRecordings = recordings.filter((take) =>
    take.songId === songId && (take.sectionId ?? "") === (sectionId ?? "")
  );
  const reference = scopedRecordings.find((take) => take.id === referenceId) ?? null;
  const comparedTake = scopedRecordings.find((take) => take.id === comparisonId) ?? null;
  const comparison = reference && comparedTake ? compareDrumRecordings(comparedTake, reference) : null;

  const start = async () => {
    setBusy(true);const token=++clock.current.token;
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || token!==clock.current.token) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      const chunks: BlobPart[] = [];
      recorder.current = new MediaRecorder(stream.current);
      recorder.current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.current.onstop = async () => {
        setProcessing(true);
        const durationMs = performance.now() - startAt.current; window.clearInterval(clock.current.timer);clock.current.audio?.close();clock.current.audio=null;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        try {
          const blob = new Blob(chunks, { type: recorder.current?.mimeType || "audio/webm" });
          const id = crypto.randomUUID();
          await saveTake(id, blob);
          const analysis = await analyzeTake(blob, bpm, part, countIn?{phaseSeconds:0}:{}).catch(() => ({ hitCount: 0, timingConsistency: null }));
          onSave({
            id,
            songId,
            sectionId,
            createdAt: new Date().toISOString(),
            durationMs,
            mimeType: blob.type,
            targetBpm: bpm,
            clockAligned: countIn,
            patternFingerprint: patternFingerprint ?? undefined,
            ...analysis
          });
          setMessage("Take saved on this device. Timing estimate is approximate.");
        } catch {
          setMessage("Could not save this recording.");
        }
        if(mounted.current){setBusy(false);setProcessing(false);}
      };
      clock.current.audio=createDrumAudio();await clock.current.audio?.ready;
      if(!mounted.current||token!==clock.current.token){input.getTracks().forEach(track=>track.stop());return;}
      const beatMs=60000/bpm,anchor=performance.now()+(countIn?4*beatMs:0);let lastCount=-1,cursor=0;const offsets=part?.hits.map(hit=>({time:hit.step*4/part.subdivision*beatMs,hit})).sort((a,b)=>a.time-b.time)??[];const loopMs=(part?.beats??4)*beatMs;
      const tick=()=>{if(!mounted.current||token!==clock.current.token)return;const now=performance.now();if(now<anchor){const count=4-Math.ceil((anchor-now)/beatMs);if(count!==lastCount){lastCount=count;clock.current.audio?.click(count===0);setMessage(`Recording count-in: ${count+1} / 4`);}return;}if(recorder.current?.state==='inactive'){startAt.current=now;recorder.current.start();setMessage('Recording locally with the practice clock…');}const elapsed=now-anchor;if(guide&&offsets.length){while(cursor<Math.ceil((elapsed+1)/loopMs+1)*offsets.length){const target=offsets[cursor%offsets.length],at=Math.floor(cursor/offsets.length)*loopMs+target.time;if(at>elapsed)break;if(elapsed-at<70)clock.current.audio?.hit(target.hit.instrument,target.hit.accent,target.hit.velocity);cursor++;}}};
      tick();clock.current.timer=window.setInterval(tick,10);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current&&token===clock.current.token) { setBusy(false); setMessage("Microphone permission or recording is unavailable."); }
    }
  };

  const stop = () => {window.clearInterval(clock.current.timer);clock.current.audio?.close();if(recorder.current?.state === "recording")recorder.current.stop();else{clock.current.token++;stream.current?.getTracks().forEach(track=>track.stop());setBusy(false);setMessage("Recording cancelled.");}};

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
      <label><input type="checkbox" disabled={busy} checked={countIn} onChange={event=>setCountIn(event.target.checked)}/> Four-count before recording</label><label><input type="checkbox" disabled={busy} checked={guide} onChange={event=>setGuide(event.target.checked)}/> Play section guide while recording (headphones recommended)</label><button type="button" disabled={processing} onClick={busy ? stop : start}>{processing?"Processing take…":busy ? "Stop recording" : "Record take"}</button>
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
          const canUseAsReference = compareDrumRecordings(take, take) !== null || !!(take.patternFingerprint && take.targetBpm && take.expectedTimes?.length);
          return (
            <article key={take.id} className="recording-entry">
              <strong>{formatDate(new Date(take.createdAt), true)}</strong>
              {isReference && <span> · Reference</span>}{take.trimmedFrom&&<span> · Trimmed copy</span>}{take.clockAligned&&<span> · Practice clock aligned</span>}
              <p>
                {Math.round(take.durationMs / 1000)}s · {take.hitCount} detected onsets · {take.timingConsistency === null
                  ? "Timing unavailable"
                  : `${take.timingConsistency}% expected-hit match · ${take.matchedHits ?? 0} matched, ${take.missedTargets ?? 0} missed, ${take.extraHits ?? 0} extra · ${take.meanOffsetMs ?? "—"} ms mean timing error · ${take.confidence ?? "low"} confidence`}
              </p>
              <SongTakeTrim take={take} onSave={onSave}/><SongRecordingPlayback take={take} onAlign={onUpdate?offset=>onUpdate({...take,alignmentOffsetMs:offset}):undefined} />
              <details className="recording-analysis">
                <summary>Detected onsets and analysis review</summary>
                <p>{take.confidence === "reviewed" ? "Manually reviewed: beat assignments and hit counts reflect your corrections." : take.confidence === "high" ? "High confidence is still an approximate onset match; the microphone cannot identify drum voices." : take.confidence === "medium" ? "Medium confidence: some transients may be missed or counted twice due to room sound, bleed, or dynamics." : "Low confidence: treat the automatic timing and hit counts as a rough estimate. Review each detected onset before using it as evidence."}</p>
                <ol>{(take.onsetTimes ?? []).map((time, index) => <li key={`${index}-${time}`}>{time.toFixed(2)}s</li>)}</ol>
                {onUpdate ? <SongRecordingAnalysisReview take={take} onUpdate={onUpdate}/> : <p>Manual review is unavailable in this view.</p>}
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
                    disabled={!candidateComparison && !(reference.patternFingerprint && reference.targetBpm && reference.expectedTimes?.length && take.onsetTimes?.length && take.patternFingerprint===reference.patternFingerprint && take.targetBpm===reference.targetBpm)}
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
        {comparedTake && reference && (
          <div className="recording-comparison-result" role="status">
            <strong>Reference comparison · {formatDate(new Date(reference.createdAt), true)}</strong>
            <p>{comparison?.summary??"Edited takes are compared on the retained reference timeline without carrying over original scores."}</p><SongTakeTimeline reference={reference} take={comparedTake}/>
            {comparison&&<>            <p>
              Match rate: {comparison.studentMatchRate}% vs {comparison.referenceMatchRate}% ·
              {" "}mean timing error: {comparison.studentMeanTimingErrorMs ?? "—"} ms vs {comparison.referenceMeanTimingErrorMs ?? "—"} ms ·
              {" "}extra hits per 100 targets: {comparison.studentExtraHitsPer100} vs {comparison.referenceExtraHitsPer100}
            </p>
            <small>Analysis confidence: {comparison.confidence}. Results are approximate and do not identify drum voices.</small>
</>}
          </div>
        )}
      </section>
    </details>
  );
}
