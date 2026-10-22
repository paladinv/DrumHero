"use client";
import { useMemo } from 'react';
import type { TrainerRound } from '@/lib/trainer';
import { needsTrainerRecovery, trainerSkillMap } from '@/lib/trainer-skill-map';
import { summarizeTrainerMilestones } from '@/lib/trainer-milestones';

export function TrainerGrowthPanel({ rounds, patternId, disabled, onWarmup, onRecover }: { rounds: TrainerRound[]; patternId: string; disabled: boolean; onWarmup: (skill: string) => void; onRecover: () => void }) {
  const skills = useMemo(() => trainerSkillMap(rounds), [rounds]);
  const milestones = useMemo(() => summarizeTrainerMilestones(rounds), [rounds]);
  const weakest = skills.filter(skill => skill.score !== null).sort((a, b) => a.score! - b.score!)[0];
  return <details className="trainer-growth"><summary>Skill map, milestones & warmups</summary><p>Practice indicators from your last 30 reliable scored rounds. Different patterns and inputs can affect these values; they are not mastery grades.</p><div className="trainer-skill-grid">{skills.map(skill => <div key={skill.id}><strong>{skill.label}</strong><span>{skill.score === null ? 'More scored hits needed' : `${skill.score}%`}</span>{skill.score !== null && <progress aria-label={skill.label} max={100} value={skill.score} />}</div>)}</div><section className="trainer-milestones" aria-label="Practice milestones"><h4>Practice milestones</h4><div>{milestones.map(item => <article key={item.id} className={item.earned ? 'earned' : ''}><strong>{item.earned ? '✓ ' : ''}{item.title}</strong><span>{item.description}</span><progress aria-label={`${item.title}: ${item.earned ? 'earned' : `${item.progress} of ${item.target}`}`} max={item.target} value={item.progress} /><small>{item.earned ? 'Earned' : `${item.progress} / ${item.target}`}</small></article>)}</div></section>{weakest ? <><p><strong>Suggested warmup: {weakest.label}.</strong> {weakest.cue}</p><button type="button" disabled={disabled} onClick={() => onWarmup(weakest.id)}>Set up this warmup</button></> : <p>Play scored rounds to get a targeted warmup. Accent contrast needs velocity input with both soft and accented targets.</p>}{needsTrainerRecovery(rounds, patternId) && <div role="status"><p>Two difficult rounds on this pattern. Try a slower, shorter round with one limb group.</p><button type="button" disabled={disabled} onClick={onRecover}>Apply recovery setup</button></div>}</details>;
}
