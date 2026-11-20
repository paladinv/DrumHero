"use client";

import { useEffect, useMemo, useState } from "react";
import { readCustomSampleRecords, type CustomSampleLayer, type CustomSampleRecord } from "@/lib/song-builder-samples";
import { drumSampleUrl } from "@/lib/audio";
import type { SongInstrument } from "@/lib/types";

type Layer = CustomSampleLayer;
type Props = { voice: SongInstrument; sampleIndex: number; names: { primary?: string; soft?: string; accent?: string }; onSave: (layer: Layer, name: string, blob: Blob) => Promise<void> };

function sampleBlob(record: CustomSampleRecord | undefined, layer: Layer) {
  if (!record) return undefined;
  return layer === "primary" ? record.blob : layer === "soft" ? record.softBlob : record.accentBlob;
}

function sampleName(record: CustomSampleRecord | undefined, layer: Layer) {
  if (!record) return "";
  return layer === "primary" ? record.name : layer === "soft" ? record.softName ?? "Soft layer" : record.accentName ?? "Accent layer";
}

async function makeEditedWav(source: Blob, startSeconds: number, endSeconds: number, fadeInSeconds: number, fadeOutSeconds: number, normalize: boolean, targetDbfs: number) {
  const Audio = window.AudioContext;
  const context = new Audio();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    if (decoded.duration > 60) throw new Error("Samples must be 60 seconds or shorter to edit in the browser.");
    const start = Math.max(0, Math.min(decoded.length - 1, Math.floor(startSeconds * decoded.sampleRate)));
    const end = Math.max(start + 1, Math.min(decoded.length, Math.ceil(endSeconds * decoded.sampleRate)));
    const frames = end - start, channels = Math.min(2, decoded.numberOfChannels), bytes = frames * channels * 2;
    if (bytes + 44 > 12 * 1024 * 1024) throw new Error("This edit would exceed the 12 MB custom sample limit. Trim the sample further.");
    const output = Array.from({ length: channels }, (_, channel) => decoded.getChannelData(channel).slice(start, end));
    let peak = 0;
    for (const channel of output) for (const value of channel) peak = Math.max(peak, Math.abs(value));
    const gain = normalize && peak > 0 ? Math.pow(10, targetDbfs / 20) / peak : 1;
    const fadeIn = Math.max(0, Math.round(fadeInSeconds * decoded.sampleRate)), fadeOut = Math.max(0, Math.round(fadeOutSeconds * decoded.sampleRate));
    const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer);
    const write = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
    write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, decoded.sampleRate, true); view.setUint32(28, decoded.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, bytes, true);
    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      const fade = Math.min(fadeIn ? Math.min(1, frame / fadeIn) : 1, fadeOut ? Math.min(1, (frames - 1 - frame) / fadeOut) : 1);
      for (let channel = 0; channel < channels; channel += 1) {
        const value = Math.max(-1, Math.min(1, (output[channel]?.[frame] ?? 0) * gain * fade));
        view.setInt16(offset, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true); offset += 2;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  } finally { await context.close().catch(() => undefined); }
}

export function SongBuilderSampleEditor({ voice, sampleIndex, names, onSave }: Props) {
  const [layer, setLayer] = useState<Layer>("primary");
  const [record, setRecord] = useState<CustomSampleRecord>();
  const [builtInBlob, setBuiltInBlob] = useState<Blob>();
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [normalize, setNormalize] = useState(false);
  const [targetDbfs, setTargetDbfs] = useState(-1);
  const [edited, setEdited] = useState<Blob>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeLayer: Layer = sampleIndex >= 0 ? "primary" : layer;
  const source = sampleIndex >= 0 ? builtInBlob : sampleBlob(record, activeLayer);
  const sourceUrl = useMemo(() => source ? URL.createObjectURL(source) : "", [source]);
  const editedUrl = useMemo(() => edited ? URL.createObjectURL(edited) : "", [edited]);
  useEffect(() => { return () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }; }, [sourceUrl]);
  useEffect(() => { return () => { if (editedUrl) URL.revokeObjectURL(editedUrl); }; }, [editedUrl]);
  useEffect(() => {
    let active = true;
    if (sampleIndex < 0) void readCustomSampleRecords().then(records => { if (active) setRecord(records.find(item => item.instrument === voice)); }).catch(() => { if (active) setRecord(undefined); });
    else {
      if (activeLayer === "primary") void fetch(drumSampleUrl(voice, sampleIndex)).then(response=>{if(!response.ok)throw new Error("Built-in sample unavailable.");return response.blob();}).then(blob=>{if(active)setBuiltInBlob(blob);}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:"Could not load this built-in sample.");});
    }
    return () => { active = false; };
  }, [voice, sampleIndex, activeLayer, names.primary, names.soft, names.accent]);
  const label = sampleIndex >= 0 ? `Built-in sample ${sampleIndex + 1}` : sampleName(record, activeLayer) || names[activeLayer];

  const renderEdit = async () => {
    if (!source || duration <= 0) return;
    setBusy(true); setMessage("Preparing an edited preview…");
    try {
      const blob = await makeEditedWav(source, start, Math.max(start + 0.001, end), fadeIn, fadeOut, normalize, targetDbfs);
      setEdited(blob); setMessage("Preview ready. The stored sample has not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not edit this sample."); }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!source || duration <= 0) return;
    setBusy(true); setMessage("Saving edited sample…");
    try {
      const blob = edited ?? await makeEditedWav(source, start, Math.max(start + 0.001, end), fadeIn, fadeOut, normalize, targetDbfs);
      await onSave(activeLayer, label || `${voice}-${activeLayer}-edited.wav`, blob);
      setEdited(blob); setMessage("Edited sample saved. The original editing settings stay available for another pass.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this sample edit."); }
    finally { setBusy(false); }
  };

  return <details className="song-builder-sample-editor"><summary>Edit custom sample · {label || "choose a sample"}</summary>
    <p>Trim silence or tails, add short fades, normalize the peak, and preview before saving. Each edited layer stays on this device.</p>
    <div className="song-builder-tool-fields"><label>Velocity layer<select value={activeLayer} onChange={event=>{setLayer(event.target.value as Layer);setDuration(0);setStart(0);setEnd(0);setFadeIn(0);setFadeOut(0);setEdited(undefined);setMessage("");}}><option value="primary">{sampleIndex>=0?"Built-in primary sample":"Primary · velocity 48–95"}</option><option value="soft" disabled={sampleIndex>=0||!names.primary}>Soft · below 48</option><option value="accent" disabled={sampleIndex>=0||!names.primary}>Accent · 96+</option></select></label></div>
    {source ? <>
      {sampleIndex>=0&&names.primary&&<p>This voice already has a saved custom sample. Saving this built-in edit replaces that custom sample for the voice.</p>}
      <audio src={editedUrl || sourceUrl} controls preload="metadata" aria-label={`${voice} ${activeLayer} sample preview`} onLoadedMetadata={event=>{const value=event.currentTarget.duration;if(Number.isFinite(value)){setDuration(value);setStart(current=>Math.min(current,value));setEnd(current=>current>0?Math.min(current,value):value);}}}/>
      <div className="song-builder-tool-fields">
        <label>Trim start · {start.toFixed(3)} s<input type="range" min={0} max={duration || 1} step={0.001} value={Math.min(start,duration||0)} onChange={event=>{const value=Number(event.target.value);setStart(value);if(value>=end)setEnd(duration);setEdited(undefined);}}/></label>
        <label>Trim end · {end.toFixed(3)} s<input type="range" min={Math.min(start+0.001,duration||1)} max={duration || 1} step={0.001} value={Math.max(start+0.001,Math.min(end||duration,duration||1))} onChange={event=>{setEnd(Number(event.target.value));setEdited(undefined);}}/></label>
        <label>Fade in · {fadeIn.toFixed(2)} s<input type="range" min={0} max={Math.min(2,Math.max(0,duration/2))} step={0.01} value={fadeIn} onChange={event=>{setFadeIn(Number(event.target.value));setEdited(undefined);}}/></label>
        <label>Fade out · {fadeOut.toFixed(2)} s<input type="range" min={0} max={Math.min(2,Math.max(0,duration/2))} step={0.01} value={fadeOut} onChange={event=>{setFadeOut(Number(event.target.value));setEdited(undefined);}}/></label>
        <label><input type="checkbox" checked={normalize} onChange={event=>{setNormalize(event.target.checked);setEdited(undefined);}}/>Peak normalize</label>
        {normalize&&<label>Target · {targetDbfs.toFixed(1)} dBFS<input type="range" min={-12} max={-0.1} step={0.1} value={targetDbfs} onChange={event=>{setTargetDbfs(Number(event.target.value));setEdited(undefined);}}/></label>}
      </div>
      <div className="song-builder-actions"><button type="button" disabled={busy||!duration} onClick={()=>void renderEdit()}>{busy?"Working…":"Preview edit"}</button><button type="button" disabled={busy||!duration} onClick={()=>void saveEdit()}>{sampleIndex>=0?"Save as custom sample":"Save edited layer"}</button><button type="button" disabled={!edited||busy} onClick={()=>setEdited(undefined)}>Discard preview</button></div>
    </> : <p>Import a custom sample for this voice and layer to use the editor.</p>}
    <p role="status">{message}</p>
  </details>;
}
