import type { Metadata } from "next";
import { DrumTrainer } from "@/components/DrumTrainer";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Trainer") }; }

export default async function TrainerPage({ searchParams }: { searchParams: Promise<{ pattern?: string }> }) {
  const params = await searchParams;
  return <main id="main-content" className="page trainer-page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Trainer"/></span><h1><LocalizedText text="Build consistency one round at a time"/></h1><p><LocalizedText text="Play ten focused repetitions. Rate an acoustic performance yourself, or score hits from keys, touch, a USB MIDI kit, or local audio input."/></p></header><DrumTrainer initialPatternId={params.pattern} /></main>;
}
