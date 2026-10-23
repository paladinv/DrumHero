import type { Metadata } from 'next';
import { SightReading } from '@/components/SightReading';
export const metadata: Metadata = { title: 'Sight reading' };
export default function SightReadingPage() {
  return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Read and play</span><h1>Sight reading</h1><p>Read a fresh drum phrase, prepare silently for ten seconds, then play it once. Reading results stay separate from rehearsed practice.</p></header><SightReading /></main>;
}
