import type { Metadata } from "next";
import { RhythmEarTraining } from "@/components/RhythmEarTraining";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await translateRequest("Rhythm Ear Training") };
}

export default function EarTrainingPage() {
  return <main id="main-content" className="page">
    <header className="page-heading"><span className="eyebrow"><LocalizedText text="Rhythm ear training" /></span><h1><LocalizedText text="Hear the beat. Play it back." /></h1><p><LocalizedText text="Train rhythm memory with tap-back, input timing calibration, multi-voice rhythm building, target and answer playback, MIDI input, guided rhythm lessons, cross-rhythm and quintuplet practice, shareable challenge packs, and detailed progress diagnostics." /></p></header>
    <RhythmEarTraining />
  </main>;
}
