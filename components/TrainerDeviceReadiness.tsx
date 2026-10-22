"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrainerRound } from "@/lib/trainer";
import { useLocalization } from "./LocalizationProvider";

type DeviceInfo = { browser: string; platform: string; secure: boolean; audio: boolean; midi: boolean; microphone: boolean };
type CalibrationTrial = { id: string; recordedAt: string; browser: string; platform: string; inputProfile: string; setup: string; output: string; correctionMs: number };
const TRIALS_KEY = "drum-hero:trainer-calibration-trials:v1";

function readTrials(raw: string | null): CalibrationTrial[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.slice(0, 50).flatMap((item): CalibrationTrial[] => {
      if (!item || typeof item !== "object") return [];
      const trial = item as Partial<CalibrationTrial>;
      if (typeof trial.id !== "string" || typeof trial.recordedAt !== "string" || !Number.isFinite(Date.parse(trial.recordedAt)) || typeof trial.browser !== "string" || typeof trial.platform !== "string" || typeof trial.inputProfile !== "string" || typeof trial.setup !== "string" || typeof trial.output !== "string" || !Number.isFinite(trial.correctionMs)) return [];
      return [{ id: trial.id.slice(0, 100), recordedAt: trial.recordedAt, browser: trial.browser.slice(0, 100), platform: trial.platform.slice(0, 100), inputProfile: trial.inputProfile.slice(0, 200), setup: trial.setup.slice(0, 120), output: trial.output.slice(0, 30), correctionMs: Math.max(-200, Math.min(200, Number(trial.correctionMs))) }];
    });
  } catch { return []; }
}

function exportTrials(trials: CalibrationTrial[]) {
  const shareableTrials = trials.map((trial) => ({ ...trial, inputProfile: trial.inputProfile.split(":", 1)[0] || "unknown" }));
  const blob = new Blob([JSON.stringify({ format: "drum-hero-device-validation-v1", trials: shareableTrials }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drum-hero-device-validation.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function identifyBrowser(ua: string, ios: boolean) {
  const candidates: Array<[RegExp, string]> = [
    [/CriOS\/([\d.]+)/i, "Chrome on iOS"], [/FxiOS\/([\d.]+)/i, "Firefox on iOS"], [/EdgiOS\/([\d.]+)/i, "Edge on iOS"],
    [/EdgA?\/([\d.]+)/i, "Microsoft Edge"], [/Chrome\/([\d.]+)/i, "Chrome"], [/Firefox\/([\d.]+)/i, "Firefox"],
    [/Version\/([\d.]+).*Safari/i, ios ? "Safari on iOS" : "Safari"],
  ];
  for (const [pattern, name] of candidates) {
    const version = ua.match(pattern)?.[1];
    if (version) return `${name} ${version}`;
  }
  return "Other browser";
}

function identifyPlatform(ua: string, ios: boolean) {
  if (ios) { const version = ua.match(/OS ([\d_]+)/i)?.[1]?.replaceAll("_", "."); return `iOS / iPadOS${version ? ` ${version}` : ""}`; }
  const candidates: Array<[RegExp, string]> = [[/Android ([\d.]+)/i, "Android"], [/Mac OS X ([\d_]+)/i, "macOS"], [/Windows NT ([\d.]+)/i, "Windows"], [/Linux/i, "Linux"]];
  for (const [pattern, name] of candidates) { const version = ua.match(pattern)?.[1]?.replaceAll("_", "."); if (version || pattern.test(ua)) return `${name}${version ? ` ${version}` : ""}`; }
  return "Unknown platform";
}

export function TrainerDeviceReadiness({ profileKey, latencyMs, rounds, disabled, onCalibrate }: { profileKey: string; latencyMs: number; rounds: TrainerRound[]; disabled: boolean; onCalibrate: () => void }) {
  const { t, formatNumber } = useLocalization();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [trials, setTrials] = useState<CalibrationTrial[]>([]);
  const [setup, setSetup] = useState("");
  const [output, setOutput] = useState("wired");
  const [trialMessage, setTrialMessage] = useState("");
  const [trialsReviewed, setTrialsReviewed] = useState(false);
  const [diagnosticsConsent, setDiagnosticsConsent] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState("");
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const browser = identifyBrowser(ua, ios);
    const platform = identifyPlatform(ua, ios);
    setDevice({ browser, platform, secure: window.isSecureContext, audio: typeof window.AudioContext === "function", midi: typeof navigator.requestMIDIAccess === "function", microphone: Boolean(navigator.mediaDevices?.getUserMedia) });
    setTrials(readTrials(localStorage.getItem(TRIALS_KEY)));
  }, []);
  const stats = useMemo(() => {
    const matching = rounds.filter((round) => round.mode === "scored" && round.result && (round.inputProfile ?? round.source) === profileKey)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 10);
    const reliable = matching.filter((round) => !round.inputClipped && !round.uncertainDetections);
    const offsets = reliable.flatMap((round) => (round.hits ?? []).flatMap((hit) => hit.offsetMs === null || hit.rating === "extra" ? [] : [Math.abs(hit.offsetMs)]));
    const inputRoutes: Record<string, number> = {};
    for (const round of matching) {
      const source = typeof round.source === "string" ? round.source : "unknown";
      const route = source.startsWith("audio-") ? "audio" : source;
      inputRoutes[route] = (inputRoutes[route] ?? 0) + 1;
    }
    return {
      rounds: reliable.length,
      totalRounds: matching.length,
      meanDistance: offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null,
      hits: offsets.length,
      inputRoutes,
      uncertainRounds: matching.filter((round) => Boolean(round.inputClipped || round.uncertainDetections)).length
    };
  }, [profileKey, rounds]);
  const comparableTrials = trials.filter((trial) => trial.inputProfile === profileKey && trial.setup.trim().toLowerCase() === setup.trim().toLowerCase() && trial.output === output && (!device || (trial.browser === device.browser && trial.platform === device.platform))).slice(0, 3);
  const spread = comparableTrials.length === 3 ? Math.max(...comparableTrials.map((trial) => trial.correctionMs)) - Math.min(...comparableTrials.map((trial) => trial.correctionMs)) : null;

  const saveTrial = () => {
    if (!device) return;
    const next = [{ id: crypto.randomUUID(), recordedAt: new Date().toISOString(), browser: device.browser, platform: device.platform, inputProfile: profileKey, setup: setup.trim().slice(0, 120), output, correctionMs: latencyMs }, ...trials].slice(0, 50);
    try { localStorage.setItem(TRIALS_KEY, JSON.stringify(next)); setTrials(next); setTrialsReviewed(false); setTrialMessage("Calibration trial saved on this device. Run the calibration again before recording another trial."); }
    catch { setTrialMessage("Could not save this trial. Export or free browser storage, then retry."); }
  };

  const clearTrials = () => {
    if (!trials.length || !window.confirm("Delete all saved calibration trials from this device? This cannot be undone.")) return;
    try { localStorage.removeItem(TRIALS_KEY); setTrials([]); setTrialsReviewed(false); setTrialMessage("Saved calibration trials were deleted from this device."); }
    catch { setTrialMessage("Could not delete the saved trials. Check browser storage and retry."); }
  };

  const exportDiagnostics = () => {
    if (!diagnosticsConsent || !device) return;
    const report = {
      format: "drum-hero-timing-diagnostics-v1",
      exportedAt: new Date().toISOString(),
      deviceCapabilities: device,
      timingSummary: {
        latencyCorrectionMs: Math.max(-200, Math.min(200, Math.round(latencyMs))),
        recentScoredRounds: stats.totalRounds,
        reliableRounds: stats.rounds,
        roundsWithUncertainInput: stats.uncertainRounds,
        timedHits: stats.hits,
        meanAbsoluteTimingDistanceMs: stats.meanDistance,
        inputRoutes: stats.inputRoutes
      }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `drum-hero-timing-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDiagnosticMessage(t("Diagnostics file exported. Share it only with someone helping you troubleshoot."));
  };

  return <details className="trainer-device-readiness">
    <summary>Device timing and compatibility</summary>
    {device ? <><p>{device.browser} · {device.platform} · input profile <strong>{profileKey}</strong></p><p>Secure context: {device.secure ? "yes" : "no"} · Web Audio: {device.audio ? "available" : "unavailable"} · microphone: {device.microphone ? "available" : "unavailable"} · Web MIDI: {device.midi ? "available" : "unavailable"}</p></> : <p>Reading this browser’s audio and input capabilities…</p>}
    <p>Saved latency correction: <strong>{latencyMs > 0 ? "+" : ""}{latencyMs} ms</strong>. {stats.rounds ? `${stats.rounds} recent clean rounds on this profile · ${stats.hits} timed hits · ${stats.meanDistance === null ? "no scored offsets" : `${stats.meanDistance} ms mean absolute offset`}.` : "Complete a scored round on this profile to summarize its recent timing."}</p>
    <p>Calibration estimates this input on this device; it is not a universal hardware measurement. Recalibrate after changing the kit, browser, or audio route. Bluetooth audio may add delay that the browser cannot identify.</p>
    {!device?.secure && device && <p role="status">This page is not in a secure browser context. Microphone and MIDI access may be restricted.</p>}
    <button type="button" className="button-secondary" disabled={disabled || !device?.audio} onClick={onCalibrate}>Run input latency calibration</button>
    <section className="trainer-diagnostics-export" aria-labelledby="trainer-diagnostics-heading">
      <h3 id="trainer-diagnostics-heading">{t("Export timing diagnostics")}</h3>
      <p>{t("Diagnostics stay on this device until you choose to export the file.")}</p>
      <div className="trainer-diagnostics-preview">
        <strong>{t("Device capabilities")}</strong>
        {device && <span>{[device.audio && "Web Audio", device.midi && "Web MIDI", device.microphone && "Microphone"].filter(Boolean).join(" · ") || "No timing input APIs detected"} · {device.browser} · {device.platform}</span>}
        <span>{t("Recent clean rounds")}: {formatNumber(stats.rounds)} · {t("Timed hits")}: {formatNumber(stats.hits)} · {t("Mean timing distance")}: {stats.meanDistance === null ? "—" : `${formatNumber(stats.meanDistance)} ms`}</span>
        {!stats.rounds && <span>{t("No clean scored rounds on this input profile yet.")}</span>}
      </div>
      <label className="trainer-diagnostics-consent"><input type="checkbox" checked={diagnosticsConsent} onChange={(event) => setDiagnosticsConsent(event.currentTarget.checked)} /><span>{t("I agree to export the device capabilities and aggregate timing summary shown below. No audio, device IDs, hit-by-hit data, or personal notes are included.")}</span></label>
      <button type="button" className="button-secondary" disabled={!device || !diagnosticsConsent} onClick={exportDiagnostics}>{t("Export diagnostic summary")}</button>
      <p className="trainer-diagnostics-status" role="status">{diagnosticMessage}</p>
    </section>
    <details className="trainer-validation-log"><summary>Record repeatability trials</summary><p>For a hardware check, keep the same kit, input profile, browser, and output route. Calibrate, save a trial, and repeat three times; export the log if you want to compare devices with an educator. Trials and setup labels stay on this device until exported or deleted.</p><label>Device and input setup<input maxLength={120} value={setup} onChange={(event) => setSetup(event.target.value)} placeholder="e.g. iPad + USB MIDI module" /></label><label>Audio output<select value={output} onChange={(event) => setOutput(event.target.value)}><option value="wired">Wired headphones / speakers</option><option value="bluetooth">Bluetooth audio</option><option value="built-in">Built-in speakers</option><option value="other">Other output</option></select></label><p>{comparableTrials.length} of 3 matching trials saved{spread !== null ? ` · correction spread ${spread} ms (${comparableTrials.map((trial) => `${trial.correctionMs} ms`).join(", ")})` : " · save three trials to calculate spread"}.</p>{trials.length > 0 && <><ul>{trials.map((trial) => <li key={trial.id}>{new Date(trial.recordedAt).toLocaleString()} · {trial.setup || trial.inputProfile} · {trial.browser} / {trial.platform} · {trial.output} · {trial.correctionMs > 0 ? "+" : ""}{trial.correctionMs} ms</li>)}</ul><label><input type="checkbox" checked={trialsReviewed} onChange={(event) => setTrialsReviewed(event.currentTarget.checked)} />{t("I reviewed this device-validation log and choose to export it. It includes setup labels, browser/platform versions, input routes and corrections; individual MIDI device IDs are removed.")}</label></>}<div className="song-actions"><button type="button" onClick={saveTrial} disabled={!device || !setup.trim()}>Save current calibration as a trial</button><button type="button" onClick={() => exportTrials(trials)} disabled={!trials.length || !trialsReviewed}>Export device-validation log</button><button type="button" className="button-secondary" onClick={clearTrials} disabled={!trials.length}>Delete local trials</button></div><p role="status">{trialMessage} Log entries stay local until you export them.</p></details>
  </details>;
}
