import type { Metadata } from "next";
import { LessonCatalogue } from "@/components/LessonCatalogue";
export const metadata:Metadata={title:"Learn"};
export default function LearnPage(){return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Curated curriculum</span><h1>Learn with a <span>clear path.</span></h1><p>Twelve lessons connect technique to music. Work in order or jump to the skill that your playing needs today.</p></header><LessonCatalogue/></main>}

