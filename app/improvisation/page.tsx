import type { Metadata } from 'next';
import { ImprovisationStudio } from '@/components/ImprovisationStudio';
import { LocalizedText } from '@/components/LocalizedText';
import { translateRequest } from '@/lib/request-locale';

export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest('Improvisation') }; }
export default function ImprovisationPage() {
  return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Improvisation" /></span><h1><LocalizedText text="Trade fours. Find your own voice." /></h1><p><LocalizedText text="Trade two-, four-, or eight-bar phrases with a virtual drummer. Explore musical styles, develop an idea, and listen back to your response." /></p></header><ImprovisationStudio /></main>;
}
