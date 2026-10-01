"use client";

import { useRef, useState } from "react";
import { createLocalBackup, parseLocalBackup, restoreLocalBackup } from "@/lib/local-backup";

type Backup = ReturnType<typeof parseLocalBackup>;

export function DataBackupPanel() {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const exportBackup = async () => {
    setBusy(true);
    setMessage("Preparing your backup…");
    try {
      const data = await createLocalBackup();
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `drum-hero-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup downloaded. Keep it somewhere safe; it contains your private local practice data and audio.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the backup.");
    } finally { setBusy(false); }
  };

  const chooseBackup = async (file?: File) => {
    setBackup(null);
    setFileName("");
    setMessage("");
    if (!file) return;
    if (file.size > 128 * 1024 * 1024) {
      setMessage("This file is larger than the 128 MB restore limit.");
      return;
    }
    try {
      const parsed = parseLocalBackup(await file.text());
      setBackup(parsed);
      setFileName(file.name);
      setMessage(`Ready to restore ${Object.keys(parsed.localStorage).length} local data groups, including ${parsed.songRecordings.length} song recordings and ${parsed.customSamples.length} custom audio samples.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this backup.");
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  };

  const restore = async () => {
    if (!backup || !window.confirm("Restore this backup? It will replace the Drum Hero data currently stored in this browser.")) return;
    setBusy(true);
    setMessage("Restoring your backup…");
    try {
      await restoreLocalBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restore this backup.");
      setBusy(false);
    }
  };

  return <section className="data-backup card" aria-labelledby="data-backup-heading">
    <div><span className="eyebrow">Your data</span><h2 id="data-backup-heading">Back up or move your work</h2><p>Save lessons, practice history, Trainer settings, custom grooves, songs, local samples, and saved song takes in one file. The downloaded file is not password-protected, so store and share it carefully.</p></div>
    <div className="data-backup-actions">
      <button type="button" className="button" onClick={() => void exportBackup()} disabled={busy}>{busy ? "Working…" : "Download full backup"}</button>
      <div className="data-backup-restore">
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero backup file" onChange={(event) => void chooseBackup(event.currentTarget.files?.[0])} />
        <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>Choose backup to restore</button>
        {backup && <button type="button" className="button" onClick={() => void restore()} disabled={busy}>Restore {fileName}</button>}
      </div>
    </div>
    <p className="data-backup-message" role="status">{message || "Restore replaces the Drum Hero data in this browser. Export a backup first if you want to keep both copies."}</p>
  </section>;
}
