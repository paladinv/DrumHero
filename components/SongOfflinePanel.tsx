"use client";

import { verifyOfflineCache } from "@/lib/song-offline-check";
import { useEffect, useState } from "react";

type OfflineStatus = { name: string; version: string; savedAt: string; count: number; bytes?: number; routes?: string[] };
type Verification = { checked: number; missing: string[]; corrupt: string[]; bytes: number; verifiedAt: string };
type AssetManifest = { version?: string; totalBytes?: number; routes?: string[] };
type SiteStorageEstimate = { usage?: number; quota?: number };

export function SongOfflinePanel() {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [estimatedBytes, setEstimatedBytes] = useState(0);
  const [routes, setRoutes] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState("");
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [message, setMessage] = useState("Download the app pages and built-in sounds for offline practice.");
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState("");
  const [storageEstimate, setStorageEstimate] = useState<SiteStorageEstimate | null>(null);
  const [online, setOnline] = useState(true);

  const request = async (type: "status" | "download" | "remove" | "verify") => {
    if (!("serviceWorker" in navigator)) throw new Error("Offline downloads are unavailable in this browser.");
    const registration = navigator.onLine
      ? await navigator.serviceWorker.register("/song-library-sw.js", { scope: "/" })
      : await navigator.serviceWorker.getRegistration("/");
    if (!registration) throw new Error("Download the app pages while online first.");
    if (navigator.onLine) {
      await registration.update();
      const updating = registration.installing ?? registration.waiting;
      if (updating && updating.state !== "activated") await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Offline worker update timed out. Reload and retry.")), 15000);
        const change = () => {
          if (updating.state === "activated") { clearTimeout(timeout); updating.removeEventListener("statechange", change); resolve(); }
          else if (updating.state === "redundant") { clearTimeout(timeout); updating.removeEventListener("statechange", change); reject(new Error("Offline worker update was interrupted.")); }
        };
        updating.addEventListener("statechange", change); change();
      });
    }
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error("Offline worker is not ready. Try again.");
    return new Promise<OfflineStatus | null>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => { channel.port1.close(); reject(new Error("Offline preparation timed out. Reconnect and retry.")); }, 180000);
      channel.port1.onmessage = (event) => {
        const value = event.data;
        if (value.verification) { clearTimeout(timeout); setVerification(value.verification); setMessage(value.verification.missing.length || value.verification.corrupt.length ? "Some offline resources need repair. Update the download while online." : "Offline integrity verified for the saved app pages and assets."); channel.port1.close(); resolve(status); }
        else if (value.error) { clearTimeout(timeout); channel.port1.close(); reject(new Error(value.error)); }
        else if (value.status || value.removed || type === "status") { clearTimeout(timeout); channel.port1.close(); resolve(value.status ?? null); }
        else if (value.total) setMessage(`Downloading ${value.done} of ${value.total} resources…`);
      };
      worker.postMessage({ type }, [channel.port2]);
    });
  };

  useEffect(() => {
    let live = true;
    setOnline(navigator.onLine);
    const refreshBuild = () => {
      if (!navigator.onLine) return;
      void fetch("/song-offline-assets.json", { cache: "no-store" }).then((response) => response.json() as Promise<AssetManifest>).then((manifest) => { if (live) { setCurrentVersion(manifest.version ?? ""); setEstimatedBytes(manifest.totalBytes ?? 0); setRoutes(manifest.routes ?? []); } }).catch(() => {});
    };
    const refreshStorage = () => {
      void navigator.storage?.estimate().then((estimate) => {
        if (!live || estimate.usage === undefined) return;
        const free = estimate.quota !== undefined ? Math.max(0, estimate.quota - estimate.usage) : undefined;
        setStorageEstimate({ usage: estimate.usage, quota: estimate.quota });
        setStorage(`${(estimate.usage / 1048576).toFixed(1)} MB used by this site${estimate.quota ? ` of ${(estimate.quota / 1048576).toFixed(0)} MB available${free !== undefined ? ` · ${(free / 1048576).toFixed(1)} MB remaining` : ""}` : ""}.`);
      }).catch(() => {});
    };
    refreshBuild();
    refreshStorage();
    const onOnline = () => { setOnline(true); refreshBuild(); refreshStorage(); };
    const onOffline = () => setOnline(false);
    const onVisibility = () => { if (document.visibilityState === "visible") { refreshBuild(); refreshStorage(); } };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    void (typeof caches === "undefined" ? Promise.resolve(null) : caches.open("drum-hero-song-offline-meta")).then((cache) => cache?.match("/song-offline-status")).then((response) => response?.json()).catch(() => null).then((saved) => {
      if (!live) return;
      setStatus(saved ?? null);
    });
    return () => { live = false; window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const updateStorage = async () => {
    const estimate = await navigator.storage?.estimate().catch(() => undefined);
    if (estimate?.usage !== undefined) { const free = estimate.quota !== undefined ? Math.max(0, estimate.quota - estimate.usage) : undefined; setStorageEstimate({ usage: estimate.usage, quota: estimate.quota }); setStorage(`${(estimate.usage / 1048576).toFixed(1)} MB used by this site${estimate.quota ? ` of ${(estimate.quota / 1048576).toFixed(0)} MB available${free !== undefined ? ` · ${(free / 1048576).toFixed(1)} MB remaining` : ""}` : ""}.`); }
  };

  const act = async (type: "download" | "remove" | "verify") => {
    setBusy(true);
    setMessage(type === "download" ? "Preparing offline app pages…" : type === "remove" ? "Removing offline app pages…" : "Checking downloaded resources…");
    try {
      if (type === "verify") {
        const checked = await verifyOfflineCache(); setVerification(checked);
        setMessage(checked.missing.length || checked.corrupt.length ? "Some offline resources need repair. Update the download while online." : "Offline integrity verified for the saved app pages and assets.");
      } else {
        const saved = await request(type); setStatus(saved); await updateStorage();
        setMessage(type === "remove" ? "Offline app pages removed. Your songs, backing audio, and recordings are unchanged." : "Ready for offline practice. Reopen any downloaded page while offline.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Offline action failed."); }
    finally { setBusy(false); }
  };

  const freeBytes = storageEstimate?.quota !== undefined && storageEstimate.usage !== undefined
    ? Math.max(0, storageEstimate.quota - storageEstimate.usage)
    : undefined;
  const stagedUpdateEstimate = estimatedBytes * 1.15 + 1_048_576;

  return <details className="song-tool-panel app-offline-panel">
    <summary>Offline app download and storage</summary>
    <p>{status ? `Downloaded ${new Date(status.savedAt).toLocaleString()} · ${status.count} resources · build ${status.version}` : "No offline app download saved yet."}</p>
    {status && currentVersion && currentVersion !== status.version && <p className="offline-update-notice" role="status">A newer app build is available. Update the offline download while online to use it without a connection.</p>}
    {status && currentVersion && currentVersion === status.version && <p>Offline download matches the current app build.</p>}
    {!online && <p>Offline now. Saved pages and sounds remain available; reconnect before downloading an update.</p>}
    <p>{storage}</p>
    <p>{status ? `Saved download: ${((status.bytes ?? estimatedBytes) / 1048576).toFixed(1)} MB including ${status.routes?.length ?? routes.length} page shells.` : `Estimated download: ${(estimatedBytes / 1048576).toFixed(1)} MB of static assets plus ${routes.length} page shells.`}</p>
    {status && online && freeBytes !== undefined && estimatedBytes > 0 && freeBytes < stagedUpdateEstimate && <p className="offline-update-notice">The browser reports {(freeBytes / 1048576).toFixed(1)} MB free. An update needs room for a second complete copy while it downloads (rough estimate: {(stagedUpdateEstimate / 1048576).toFixed(1)} MB). You can still try; an incomplete update is removed and the saved copy is kept.</p>}
    {verification && <p>{verification.checked} resources checked · {verification.missing.length} missing · {verification.corrupt.length} corrupt · {(verification.bytes / 1048576).toFixed(1)} MB verified at {new Date(verification.verifiedAt).toLocaleString()}</p>}
    <p>Offline pages include Home, Learn, Practice Pad, guided sessions, Trainer, Rudiments, Grooves, Kit Guide, Song Library, Song Builder, Progress, About, and Play-alongs. Built-in drum sounds and 3D kit models are included. Cloud sync needs a connection; local progress, saved songs, and imported backing audio stay on this device. Removing this download does not remove that local audio.</p>
    <div className="song-actions"><button type="button" disabled={busy || !status} onClick={() => void act("verify")}>Verify offline readiness</button><button type="button" disabled={busy || !online} onClick={() => void act("download")}>{status ? "Update offline download" : "Download app for offline use"}</button><button type="button" disabled={busy || !status} onClick={() => void act("remove")}>Remove offline download</button><button type="button" onClick={() => void navigator.storage?.persist().then((granted) => setMessage(granted ? "Persistent storage granted. Keep a backup for device loss." : "Browser manages storage retention. Export a backup for important work.")).catch(() => setMessage("Storage persistence is unavailable."))}>Keep storage on this device</button></div>
    <p role="status">{message}</p>
  </details>;
}
