import type { Metadata } from "next";
import { PatternLibrary } from "@/components/PatternLibrary";
import { rudiments } from "@/lib/curriculum";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Rudiments") }; }
export default function RudimentsPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Control vocabulary"/></span><h1><LocalizedText text="Hands that move with intent."/></h1><p><LocalizedText text="Start slowly, keep the notes even, and let the stick rebound. Each rudiment can open directly in the timing trainer."/></p></header><PatternLibrary items={rudiments} kind="rudiment"/></main>}
