import type { Metadata } from "next";
import { DrumTrainer } from "@/components/DrumTrainer";

export const metadata: Metadata = { title: "Trainer" };
export default async function TrainerPage({ searchParams }: { searchParams: Promise<{ pattern?: string }> }) {
  const params = await searchParams;
  return <main id="main-content" className="page trainer-page"><header className="page-heading"><span className="eyebrow">Guided practice</span><h1>Build the beat <span>one round at a time.</span></h1><p>Play ten focused repetitions. Rate an acoustic performance yourself, or score hits from keys, touch, a USB MIDI kit, or local audio input.</p></header><DrumTrainer initialPatternId={params.pattern} /></main>;
}
