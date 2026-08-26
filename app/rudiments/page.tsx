import type { Metadata } from "next";
import { PatternLibrary } from "@/components/PatternLibrary";
import { rudiments } from "@/lib/curriculum";
export const metadata:Metadata={title:"Rudiments"};
export default function RudimentsPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Control vocabulary</span><h1>Hands that move <span>with intent.</span></h1><p>Start slow, keep the notes even, and let rebound do the work. Every rudiment can launch directly into the timing trainer.</p></header><PatternLibrary items={rudiments} kind="rudiment"/></main>}

