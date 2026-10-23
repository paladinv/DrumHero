import type { Metadata } from "next";
import { RhythmEarTraining } from "@/components/RhythmEarTraining";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await translateRequest("Rhythm Ear Training") };
}

export default function EarTrainingPage() {
  return <main id="main-content" className="page">
    <header className="page-heading"><span className="eyebrow"><LocalizedText text="Rhythm ear training" /></span><h1><LocalizedText text="Hear the beat. Play it back." /></h1><p><LocalizedText text="Build rhythm memory by tapping patterns back, matching rhythms, recognizing meter, and hearing straight, swing, and shuffle feels." /></p></header>
    <RhythmEarTraining />
  </main>;
}
