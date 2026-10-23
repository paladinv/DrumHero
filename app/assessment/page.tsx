import type { Metadata } from 'next';
import { InitialAssessment } from '@/components/InitialAssessment';
import { LocalizedText } from '@/components/LocalizedText';
import { translateRequest } from '@/lib/request-locale';
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest('Initial skill assessment') }; }
export default function AssessmentPage() {
  return <main id="main-content" className="page"><header className="page-heading"><h1><LocalizedText text="Initial skill assessment" /></h1><p><LocalizedText text="Find a starting point with a short playing, listening, and reading assessment. Allow about five minutes, plus setup and retries." /></p></header><InitialAssessment /></main>;
}
