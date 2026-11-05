"use client";

import { useMemo, useRef, useState } from "react";
import { compatibleFillPatterns, canUseFillPractice, isGroovePattern } from "@/lib/fill-practice";
import { createCustomGrooveId } from "@/lib/custom-grooves";
import { buildTrainerSongFormPattern, TRAINER_FORM_TEMPLATES, type TrainerFormSection, type TrainerFormTemplate } from "@/lib/trainer-song-form";
import type { PracticePattern } from "@/lib/types";
import { useLocalization } from "@/components/LocalizationProvider";

type EditableTrainerFormSection = TrainerFormSection & { localId: string };

export function TrainerSongFormBuilder({ patterns, disabled, onBuild }: {
  patterns: PracticePattern[];
  disabled: boolean;
  onBuild: (pattern: ReturnType<typeof buildTrainerSongFormPattern>) => void;
}) {
  const { t } = useLocalization();
  const grooves = useMemo(() => patterns.filter(canUseFillPractice), [patterns]);
  const fills = useMemo(() => patterns.filter(pattern => isGroovePattern(pattern) && pattern.style === "Fill study"), [patterns]);
  const [partAId, setPartAId] = useState("straight-pop");
  const [partBId, setPartBId] = useState("two-beat-rock");
  const [fillId, setFillId] = useState("");
  const [template, setTemplate] = useState<TrainerFormTemplate>("AABA");
  const [fillAfterSections, setFillAfterSections] = useState<number[]>([4]);
  const [customSections, setCustomSections] = useState<EditableTrainerFormSection[]>([
    { localId: "section-a-1", part: "A", bars: 4, repeats: 1, intensity: "normal" },
    { localId: "section-b-1", part: "B", bars: 4, repeats: 1, intensity: "strong" },
    { localId: "section-a-2", part: "A", bars: 4, repeats: 1, intensity: "normal" },
  ]);
  const nextSectionId = useRef(4);
  const [name, setName] = useState("");
  const partA = grooves.find(pattern => pattern.id === partAId) ?? grooves[0];
  const partBChoices = partA ? grooves.filter(pattern => pattern.subdivision === partA.subdivision && Math.max(pattern.tempoRange[0], partA.tempoRange[0]) <= Math.min(pattern.tempoRange[1], partA.tempoRange[1])) : [];
  const partB = partBChoices.find(pattern => pattern.id === partBId) ?? partBChoices[0];
  const fillChoices = partA && partB ? compatibleFillPatterns(partA, fills).filter(fill => compatibleFillPatterns(partB, [fill]).length > 0) : [];
  const fill = fillChoices.find(pattern => pattern.id === fillId) ?? null;
  const sectionCount = template === "Custom" ? customSections.length : template.length;
  const activeFillPositions = fillAfterSections.filter(position => position <= sectionCount);
  const customFormBars = customSections.reduce((sum, section) => sum + section.bars * section.repeats, 0) + (fill ? activeFillPositions.length : 0);
  const maximumFormBars = partA ? Math.floor(512 / (partA.beats * partA.subdivision / 4)) : 0;
  const customFormTooLong = template === "Custom" && customFormBars > maximumFormBars;
  const build = () => {
    if (!partA || !partB) return;
    onBuild(buildTrainerSongFormPattern({
      id: createCustomGrooveId(),
      template,
      partA,
      partB,
      fill,
      fillAfterSections: fill ? activeFillPositions : [],
      customSections: customSections.map(section => ({ part: section.part, bars: section.bars, repeats: section.repeats, intensity: section.intensity })),
      name,
    }));
  };

  return <section className="trainer-song-form-builder" aria-labelledby="trainer-song-form-heading">
    <h3 id="trainer-song-form-heading">{t("Build a song form")}</h3>
    <p>{t("Choose a familiar four-section form or create your own arrangement. Set section length, repeats, intensity, and optional fills, then practise the full form as one scored pattern.")}</p>
    <label>{t("Form name")}<input value={name} maxLength={60} disabled={disabled} placeholder={t("Optional name")} onChange={event => setName(event.target.value)} /></label>
    <label>{t("Form")}<select value={template} disabled={disabled} onChange={event => { const next = event.target.value as TrainerFormTemplate; setTemplate(next); if (next === "Custom") setFillAfterSections([customSections.length]); }}>{TRAINER_FORM_TEMPLATES.map(value => <option key={value} value={value}>{value === "Custom" ? t("Custom arrangement") : [...value].join("–")}</option>)}</select></label>
    {template === "Custom" && <div className="trainer-form-custom-sections" aria-label={t("Custom song form sections")}>
      {customSections.map((section, index) => <fieldset key={section.localId} disabled={disabled}>
        <legend>{t("Section {number} · {part}", { number: index + 1, part: section.part })}</legend>
        <label>{t("Groove")}<select aria-label={t("Section {number} groove", { number: index + 1 })} value={section.part} onChange={event => setCustomSections(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, part: event.target.value as "A" | "B" } : item))}><option value="A">{t("Part A · {name}", { name: partA?.name ?? t("Groove A") })}</option><option value="B">{t("Part B · {name}", { name: partB?.name ?? t("Groove B") })}</option></select></label>
        <div className="trainer-form-custom-controls">
          <label>{t("Bars")}<select aria-label={t("Section {number} bars", { number: index + 1 })} value={section.bars} onChange={event => setCustomSections(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, bars: Number(event.target.value) } : item))}>{[1, 2, 4, 8, 12, 16].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>{t("Repeats")}<select aria-label={t("Section {number} repeats", { number: index + 1 })} value={section.repeats} onChange={event => setCustomSections(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, repeats: Number(event.target.value) } : item))}>{[1, 2, 3, 4, 8].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>{t("Intensity")}<select aria-label={t("Section {number} intensity", { number: index + 1 })} value={section.intensity} onChange={event => setCustomSections(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, intensity: event.target.value as TrainerFormSection["intensity"] } : item))}><option value="soft">{t("Soft")}</option><option value="normal">{t("Normal")}</option><option value="strong">{t("Strong")}</option></select></label>
        </div>
        <button type="button" className="button-secondary" aria-label={t("Remove section {number}", { number: index + 1 })} disabled={disabled || customSections.length <= 2} onClick={() => {
          setCustomSections(current => current.filter((_, itemIndex) => itemIndex !== index));
          setFillAfterSections(current => current.flatMap(position => position === index + 1 ? [] : [position > index + 1 ? position - 1 : position]));
        }}>{t("Remove section")}</button>
      </fieldset>)}
      <button type="button" className="button-secondary" disabled={disabled || customSections.length >= 8} onClick={() => setCustomSections(current => [...current, { localId: `custom-section-${nextSectionId.current++}`, part: current.at(-1)?.part === "A" ? "B" : "A", bars: 4, repeats: 1, intensity: "normal" }])}>{t("Add section")}</button>
      <small>{t("Custom forms support up to eight sections. Each section can repeat up to eight times; total form length is capped to keep scoring and saved grooves responsive.")}</small>
      <p role="status">{t("Custom form length: {bars} bars", { bars: customFormBars })}{maximumFormBars ? `${t(" · maximum {maximum} bars at this subdivision", { maximum: maximumFormBars })}.` : "."}{customFormTooLong ? ` ${t("Shorten the form before building it.")}` : ""}</p>
    </div>}
    <div className="trainer-form-parts">
      <label>{t("Part A groove")}<select value={partA?.id ?? ""} disabled={disabled || !grooves.length} onChange={event => { setPartAId(event.target.value); setFillId(""); }}>{grooves.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
      <label>{t("Part B groove")}<select value={partB?.id ?? ""} disabled={disabled || !partBChoices.length} onChange={event => setPartBId(event.target.value)}>{partBChoices.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
    </div>
    <label>{t("Fill")}<select value={fill?.id ?? ""} disabled={disabled || !fillChoices.length} onChange={event => setFillId(event.target.value)}><option value="">{t("No fills")}</option>{fillChoices.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
    {fill && <fieldset disabled={disabled} className="trainer-form-fill-positions"><legend>{t("Add fill after section")}</legend>{(template === "Custom" ? customSections.map(section => section.part) : [...template]).map((letter, index) => <label key={index}><input type="checkbox" checked={fillAfterSections.includes(index + 1)} onChange={event => setFillAfterSections(current => event.target.checked ? [...new Set([...current, index + 1])].sort((a, b) => a - b) : current.filter(value => value !== index + 1))} />{template === "Custom" ? t("{number} · {letter} · {bars} bars", { number: index + 1, letter, bars: customSections[index].bars }) : `${index + 1} · ${letter}`}</label>)}</fieldset>}
    <button type="button" className="button-secondary" disabled={disabled || !partA || !partB || (template === "Custom" && (!customSections.length || customFormTooLong))} onClick={build}>{t("Build and add form to Trainer library")}</button>
  </section>;
}
