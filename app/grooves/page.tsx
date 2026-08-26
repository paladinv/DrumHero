import type { Metadata } from "next";
import { PatternLibrary } from "@/components/PatternLibrary";
import { grooves } from "@/lib/curriculum";
export const metadata:Metadata={title:"Grooves"};
export default function GroovesPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Musical time</span><h1>Find the space <span>between hits.</span></h1><p>Build a dependable backbeat, move the kick off the grid, and learn to feel an odd meter as a short musical phrase.</p></header><PatternLibrary items={grooves} kind="groove"/></main>}

