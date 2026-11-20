"use client";

import { IMPROVISATION_PATH, type ImprovisationWorkspace } from '@/lib/improvisation';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

export function ImprovisationLearning({ step, completed, disabled, canAdvance, onSelect, onDemo, onNext }: { step: number | null; completed: ImprovisationWorkspace['completedSteps']; disabled: boolean; canAdvance: boolean; onSelect: (step: number | null) => void; onDemo: () => void; onNext: () => void }) {
  const { t } = useLocalization();
  return <section className="card" aria-label={t('Improvisation learning path')}>
    <h2>{t('Build your musical vocabulary')}</h2><p>{t('Six short lessons practice pulse, space, motifs, endings, shifted accents, and free responses. Listen to an example before playing. Completion records participation; musical ideas are reviewed by you.')}</p>
    <label className={styles.rating}>{t('Learning step')}<select disabled={disabled} value={step ?? ''} onChange={event => onSelect(event.target.value === '' ? null : Number(event.target.value))}><option value="">{t('Explore freely')}</option>{IMPROVISATION_PATH.map((lesson, index) => <option value={index} key={lesson.id}>{index + 1}. {t(lesson.title)}{completed.includes(lesson.id) ? ` · ${t('Completed')}` : ''}</option>)}</select></label>
    {step !== null && <><p><strong>{t(IMPROVISATION_PATH[step].title)}</strong> · {t(IMPROVISATION_PATH[step].description)}</p><div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={onDemo}>{t('Show lesson example')}</button><button className="button-secondary" disabled={disabled || !canAdvance} onClick={onNext}>{t(step === IMPROVISATION_PATH.length - 1 ? 'Complete learning path' : 'Complete step and continue')}</button></div></>}
  </section>;
}
