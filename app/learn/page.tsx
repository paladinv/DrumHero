import type { Metadata } from "next";
import { LessonCatalogue } from "@/components/LessonCatalogue";
import { CurriculumSkillMap } from "@/components/CurriculumSkillMap";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Learn") }; }
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) { const params = await searchParams; return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Curated curriculum"/></span><h1><LocalizedText text="Learn with a clear path."/></h1><p><LocalizedText text="Twelve lessons connect technique to music. Work in order or jump to the skill that your playing needs today."/></p></header><CurriculumSkillMap/><LessonCatalogue initialLessonId={params.lesson}/></main> }
