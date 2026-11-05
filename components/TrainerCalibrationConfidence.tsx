"use client";

import type { TrainerSource } from "@/lib/trainer";

export function TrainerCalibrationConfidence({ source, confidence, calibratedVoices, overlappingTemplates, uncertainDetections }: {
  source: TrainerSource;
  confidence: number | null;
  calibratedVoices: number;
  overlappingTemplates: boolean;
  uncertainDetections: number;
}) {
  if (source === "audio-timing") return <div className="trainer-confidence-status is-neutral" role="status">
    <strong>Timing-only input</strong>
    <span>Voice similarity is diagnostic here; drum-voice classification is not part of this score.</span>
  </div>;

  const status = calibratedVoices < 2
    ? { className: "is-caution", title: "Calibration needed", message: "Calibrate at least two drum voices before comparing voice scores." }
    : overlappingTemplates
      ? { className: "is-caution", title: "Recalibrate similar voices", message: "Some voice samples overlap. Recalibrate those drums separately with a clear pause between strikes." }
      : confidence === null
        ? { className: "is-neutral", title: "Waiting for a strike", message: "The latest voice match will appear after you strike the kit." }
        : uncertainDetections > 0
          ? { className: "is-caution", title: "Some strikes are uncertain", message: `${uncertainDetections} uncertain detection${uncertainDetections === 1 ? " was" : "s were"} left unscored in this round. Recheck the input before comparing results.` }
          : confidence >= 0.92
            ? { className: "is-ready", title: "Strong latest match", message: "This strike matched a calibrated voice clearly. Similarity is a signal-quality estimate, not a validated probability." }
            : confidence >= 0.88
              ? { className: "is-ready", title: "Usable latest match", message: "The latest match meets the Trainer's current recognition threshold. Keep reviewing uncertain strikes." }
              : { className: "is-caution", title: "Low latest match", message: "This strike is below the Trainer's current recognition threshold. Recalibrate the voice or improve the input signal." };

  return <div className={`trainer-confidence-status ${status.className}`} role="status">
    <strong>{status.title}{confidence === null ? "" : ` · ${Math.round(confidence * 100)}% latest similarity`}</strong>
    <span>{status.message}</span>
  </div>;
}
