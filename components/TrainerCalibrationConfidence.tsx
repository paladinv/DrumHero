"use client";

import type { TrainerSource } from "@/lib/trainer";
import type { Instrument } from "@/lib/types";
import { useLocalization } from "@/components/LocalizationProvider";

export type AudioVoiceObservation = { instrument: Instrument | null; similarity: number; recognized: boolean; profileKey: string };
const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

export function TrainerCalibrationConfidence({ source, confidence, calibratedVoices, overlappingTemplates, uncertainDetections }: {
  source: TrainerSource;
  confidence: number | null;
  calibratedVoices: number;
  overlappingTemplates: boolean;
  uncertainDetections: number;
}) {
  const { t } = useLocalization();
  if (source === "audio-timing") return <div className="trainer-confidence-status is-neutral" role="status">
    <strong>{t("Timing-only input")}</strong>
    <span>{t("Voice similarity is diagnostic here; drum-voice classification is not part of this score.")}</span>
  </div>;

  const status = calibratedVoices < 2
    ? { className: "is-caution", title: t("Calibration needed"), message: t("Calibrate at least two drum voices before comparing voice scores.") }
    : overlappingTemplates
      ? { className: "is-caution", title: t("Recalibrate similar voices"), message: t("Some voice samples overlap. Recalibrate those drums separately with a clear pause between strikes.") }
      : confidence === null
        ? { className: "is-neutral", title: t("Waiting for a strike"), message: t("The latest voice match will appear after you strike the kit.") }
        : uncertainDetections > 0
          ? { className: "is-caution", title: t("Some strikes are uncertain"), message: t("{count} uncertain detections were left unscored in this round. Recheck the input before comparing results.", { count: uncertainDetections }) }
          : confidence >= 0.92
            ? { className: "is-ready", title: t("Strong latest match"), message: t("This strike matched a calibrated voice clearly. Similarity is a signal-quality estimate, not a validated probability.") }
            : confidence >= 0.88
              ? { className: "is-ready", title: t("Usable latest match"), message: t("The latest match meets the Trainer's current recognition threshold. Keep reviewing uncertain strikes.") }
              : { className: "is-caution", title: t("Low latest match"), message: t("This strike is below the Trainer's current recognition threshold. Recalibrate the voice or improve the input signal.") };

  return <div className={`trainer-confidence-status ${status.className}`} role="status">
    <strong>{status.title}{confidence === null ? "" : ` · ${Math.round(confidence * 100)}% ${t("latest similarity")}`}</strong>
    <span>{status.message}</span>
  </div>;
}

export function TrainerVoiceDetectionScorecard({ observations }: { observations: AudioVoiceObservation[] }) {
  const { t } = useLocalization();
  return <section className="trainer-voice-detection-scorecard" aria-label={t("Recent voice detection confidence")}>
    <h4>{t("Recent voice signal by drum")}</h4>
    <p>{t("Shows recent top-match similarity for detections assigned to each drum. A clear match is not proof that the physical drum was identified correctly.")}</p>
    <ul>{VOICES.map(voice => {
      const recent = observations.filter(item => item.instrument === voice).slice(-10);
      const average = recent.length ? recent.reduce((sum, item) => sum + item.similarity, 0) / recent.length : null;
      const clear = recent.filter(item => item.recognized).length;
      return <li key={voice}>
        <strong>{t(voice)}</strong>
        {average === null ? <span>{t("No recent detections")}</span> : <>
          <progress max={100} value={Math.round(average * 100)} aria-label={t("{voice}: average top-match similarity {percent}% over {count} recent detections", { voice: t(voice), percent: Math.round(average * 100), count: recent.length })} />
          <span>{t("{percent}% average similarity · {clear}/{count} clear classifications", { percent: Math.round(average * 100), clear, count: recent.length })}</span>
        </>}
      </li>;
    })}</ul>
  </section>;
}
