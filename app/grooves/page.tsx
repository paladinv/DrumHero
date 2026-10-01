import type { Metadata } from "next";
import { PatternLibrary } from "@/components/PatternLibrary";
import { grooves } from "@/lib/curriculum";
export const metadata:Metadata={title:"Grooves"};
export default function GroovesPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Groove and fill follow-along library</span><h1>Find the space <span>between hits.</span></h1><p>Explore {grooves.length} patterns from first backbeats to rock, disco, reggae, shuffle, jazz, funk, metal, Afrobeat, and odd-meter grooves, plus beginner-to-advanced fill studies. Add groove-to-fill transitions or build and save your own eighth- and sixteenth-note patterns.</p></header><PatternLibrary items={grooves} kind="groove"/></main>}
