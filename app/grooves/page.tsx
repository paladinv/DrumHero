import type { Metadata } from "next";
import { PatternLibrary } from "@/components/PatternLibrary";
import { grooves } from "@/lib/curriculum";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Grooves") }; }
export default function GroovesPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Groove and fill follow-along library"/></span><h1><LocalizedText text="Find the space between hits."/></h1><p><LocalizedText text="Explore grooves from first backbeats to rock, disco, reggae, shuffle, jazz, funk, and odd meter. Add groove-to-fill transitions or build your own patterns."/></p></header><PatternLibrary items={grooves} kind="groove"/></main>}
