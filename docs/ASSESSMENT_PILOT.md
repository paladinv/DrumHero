# Initial assessment educator pilot

The assessment is a product starting-point estimate. Its thresholds and content have not been validated as standardized placement norms. Use this guide to gather educator review before making stronger placement claims.

## Proposed validation study protocol

This protocol is a plan for collecting evidence; it is not evidence that the assessment is already valid. Get ethics, school, and guardian approvals required by the study setting, use informed consent and learner assent, and collect no names in assessment exports. Keep the participant code in a separate, access-controlled key if a study needs follow-up.

1. **Freeze the assessment.** Record the app build, shared content revision, scoring rules, analysis plan, inclusion criteria, missing-data handling, and decision thresholds before confirmatory data collection. Use a fixed version for a study wave. Treat any later content or threshold change as a new version and do not pool those results as if they were identical.
2. **Review content and notation.** Ask 6–10 drum educators with varied teaching experience to independently rate each probe, question, answer, and recommendation for relevance, clarity, and level. Include educators familiar with accessible music instruction. Conduct think-aloud reviews with 8–12 learners across beginner and returning-player experience to find misunderstood instructions, notation, and distractors. Keep notation visible as the task prompt; record whether a learner followed the score or relied on verbal coaching. Revise ambiguous items before the next phase.
3. **Check feasibility and access.** Run a small supervised pilot (about 20–30 learners) across available keyboard, touch, and MIDI setups, including hands-only and single-voice paths where participants choose them. Observe completion, task skips, retries, input-check failures, interruptions, accommodation use, and screen-reader or larger-text barriers. Use these results to repair flow and instrumentation, not to tune thresholds against the same confirmatory sample.
4. **Compare against independent educator judgment.** In a separate sample, have a teacher assess pulse, subdivisions, coordination, and reading before seeing the app result. Where practical, use a second teacher for a subset and resolve disagreements using a documented rubric. Record input and adaptation strata separately; never infer physical limb independence from keyboard or touch. Calculate the sample size from the pre-registered precision or power goal. Aim for at least 100 learners overall as a feasibility target, but treat any small or underfilled input/adaptation subgroup as exploratory rather than validated.
5. **Measure alternate-form repeatability.** Invite a pre-specified subset of at least 30 learners to retake after 7–14 days with the same input, adaptation, timing setup, and comparable access options. Use the alternate patterns and compare tier placement, scores, match rates, timing, and reading-domain answers. Record intervening lessons or practice; exclude or analyze those learners separately if the goal is test–retest reliability without instruction.
6. **Evaluate the practice transfer check separately.** Capture the fresh-pattern baseline before the recommended practice. The app records the baseline and follow-up times, comparable scored Trainer rounds and estimated session minutes; learners can optionally report practice outside the app. Record which lesson was practiced and review the different pattern form afterward. Treat this as an exploratory within-learner change measure: without a control group or counterbalanced forms it cannot establish that the lesson caused improvement.
7. **Report uncertainty and revise only against pre-set rules.** For each skill and eligible subgroup, report the sample size, coverage, weighted agreement with educator tiers, agreement within one tier, recommendation fit, alternate-form consistency, missingness, and confidence intervals. Pre-register minimum acceptable agreement and reliability levels with educators before the confirmatory phase (for example, a weighted agreement coefficient of 0.70); report the estimate and interval even when the target is missed. Investigate disagreements and item-level patterns before changing scoring. Confirm a revision on a holdout or new sample. Do not describe a convenience sample, subgroup, or this five-minute tool as a norm or certification.

The app's optional educator estimate is collected before the learner begins and its anonymous review export includes item-level evidence and the selected accommodations. It supports this workflow but does not replace independent observation, consent, or a pre-registered analysis plan.

## Review workflow

1. Invite drum teachers to review the assessment with learners who represent the intended beginner and returning-player audiences. Obtain learner or guardian permission before collecting review evidence. Enable **Educator review** in setup and record independent estimates for pulse, subdivisions, reading, and coordination before the learner starts. Compare those estimates with the demonstrated tiers and recommended lesson afterward. Record input type and adaptation separately; keyboard and touch coordination does not establish physical limb independence.
2. Use **Download anonymous educator review** on web or **Share anonymous educator review** on iOS to export the task-level evidence. The JSON includes the assessment content version, stable question IDs (including conditional notation follow-ups), item prompts and answers, optional learner difficulty/input feedback, probe variants, hit match percentage, score, misses, extras, timing bias, timing spread, dynamics contrast, optional tempo range and close-result confirmations, timing correction/calibration state, demonstrated tiers, recommended lesson, and any teacher estimates and fit notes. It also includes the elapsed time between fresh-pattern checks, comparable scored Trainer round count, estimated in-app practice minutes and optional learner-reported outside practice minutes. If educators need a paper-first workflow, the export retains a blank comparison template when educator mode was not enabled. It excludes the learner name, result identifier, date, absolute transfer-check timestamps, and MIDI device ID. An optional teacher-assigned pilot code can link repeated exports; use a random code with no names or contact details. Sharing is initiated by the learner and stays under their control.
3. For repeatability, retake with the same input and adaptation. A failed tier uses its equivalent alternate pattern; compare tier placement and diagnostic evidence, and note whether device calibration changed.
4. Review listening and notation items for ambiguous wording, alternate defensible answers, and notation that is difficult to access with screen readers. Keep any revised question or probe in the versioned shared content and rerun the TypeScript and Swift fixtures.

## Review notes to capture

- Learner experience level and teacher's independent starting-point estimate by skill.
- Input category, adaptation, selected audio route, and whether the device was calibrated.
- Whether directions and demonstrations were understood without coaching.
- Whether the displayed tier and lesson recommendation fit the teacher's estimate; note the evidence that supports a disagreement.
- Whether the alternate retry felt equivalent in difficulty and tested the same skill.
- Whether keeping each skill domain at a matched tempo removed speed as a confound; note any probe that still felt harder for a reason other than its target skill. Review the optional 60–90 BPM pulse range separately from tier placement.
- For the optional internal-pulse check, whether the learner maintained the beat after the click stopped and whether the timing-drift result matched the teacher's observation.
- Any accessibility issue, ambiguous question, or probe that measured the input device more than the learner.
- Whether the learner selected audio-only questions, and whether the result clearly marked notation as untested.
- Review the expanded listening and notation items by stable item ID. Note ambiguous distractors, repeated concepts, and any item where the answer depends on prior vocabulary rather than hearing or reading the rhythm.
- Check that visual question sets cover pulse, subdivisions, and coordination notation across the question bank; note domain coverage and unanswered items separately from incorrect answers.
- When a notation answer disagrees with the playing tier, check whether the added second item clarifies the difference. Note whether one-item areas are visibly marked as provisional.
- Try the screen-reader-first rhythm mode. Confirm the bar-by-bar text cue is usable without notation and that reading remains explicitly untested.
- Whether the one-hand-friendly single-voice path and larger-notation option made setup easier without implying coordination or reading skills that were not measured.
- Whether the four-bar notation was the learner's primary guide during playing and practice, and whether text instructions or demonstrations caused them to ignore or misread the score.
- Whether the slower demonstration, eight-beat count-in, larger pads, spoken cues, or haptic cues helped; record every enabled option because these may change comparability.
- Whether the setup voice-by-voice check caught mapping mistakes and the observed MIDI velocity range predicted dynamics availability.
- Whether spoken and haptic count-in options were usable and stayed synchronized enough to help.
- Whether the alternate-pattern confirmation clarified a close score without being mistaken for a placement tier.
- Whether the 60-second practice prescription was specific and useful at its suggested tempo.
- Whether optional easy/about-right/hard/input-trouble feedback helped explain a score without affecting placement or making learners feel blamed.
- Whether the confidence label, practice tip and optional fresh-pattern transfer check were understandable and useful without sounding like a formal diagnosis.
- Whether the comparable-history trend made improvement easy to interpret and correctly excluded assessments with a different input, adaptation, content revision or timing setup.
- Whether measurement-quality notes correctly identified incomplete coverage, weak input matching, cutoff-near results, retries, or a large timing correction.
- For each item that felt confusing, record the item ID, exact wording or notation, what the learner thought it meant, and a suggested revision. Record skipped items separately from incorrect answers.

## Device and accessibility validation checklist

Complete these checks on the release candidate and record the platform, browser or app version, operating system, device, result, and any issue. A simulator is useful for layout checks; MIDI latency and physical input checks need real hardware.

- [ ] Web keyboard-only: reach setup options, drum pads, quiz choices, skip, results, history, and retake in a sensible Tab order; Enter/Space activate controls; focus remains visible and there is no keyboard trap.
- [ ] Web touch and small screens: complete the flow at a narrow phone width and tablet width in portrait and landscape; notation, dialogs, and controls remain readable without clipped actions or unintended horizontal scrolling.
- [ ] Offline web: after downloading the app, open `/assessment` with the network disabled; setup, audio/count-in, quiz, saved results, and history remain available.
- [ ] Screen reader: use VoiceOver on iOS and a supported desktop screen reader on web; verify headings, form labels, progress/count-in announcements, notation descriptions, rhythm-first text cues, question choices, results, and validation messages are understandable and not repeated excessively.
- [ ] Display and motion access: increase text size, enable reduced motion, and try spoken/haptic count-in options; confirm content reflows, motion is not required, and cues do not obscure the visual count.
- [ ] iOS external keyboard and touch: complete setup, a playing task, quiz, result review, and retake using each available input; confirm accessible focus and labels.
- [ ] MIDI hardware: test at least one USB and one Bluetooth controller where supported; verify every requested voice against its preview, velocity changes, disconnect pause, reconnect/recheck, and timing after calibration.
- [ ] Interruption handling: background the app or tab during count-in and during a scored probe; confirm partial work is discarded and restart uses a fresh count-in.

Record one row per combination tested. Mark unsupported combinations as not applicable with a reason, rather than leaving the result ambiguous.

## Pilot feedback record

Use one record per learner. Avoid names and contact details in shared review notes.

```text
Content revision:
Input and device category:
Platform and app/browser version:
Operating system and version:
Device model and screen size:
MIDI controller model and connection (USB/Bluetooth), if applicable:
Adaptation:
Question format and learning goal:
Access options (rhythm-first, larger notation, slower demonstration, eight-beat count-in, larger pads, spoken cues, haptic cues):
Optional non-identifying pilot code (no names/contact details):
Teacher estimate by skill before seeing results (pulse, subdivisions, reading, coordination):
Assessment recommendation and confidence label:
Did the suggested lesson fit? Why or why not?
Were instructions, count-in and audio clear?
Retries: same skill and comparable difficulty? Details:
Borderline confirmation: original vs alternate score and timing:
Transfer check: useful evidence or confusing? Details:
Fresh-pattern pre-practice baseline (variant, score, matched %, timing error, local time):
Practice completed between checks (lesson, comparable Trainer rounds, estimated app minutes, outside-app minutes, elapsed time):
Fresh-pattern after-practice check (different variant, score, matched %, timing error, local time):
Reading coverage by area (pulse, subdivisions, coordination; correct/answered/available):
Tempo range: highest demonstrated speed and teacher observation:
Internal-pulse check: teacher observation versus measured drift:
Measurement-quality notes: accurate and understandable?
Accessibility or input calibration issues:
Accessibility setup checked (screen reader, large text, keyboard/switch access, reduced motion, count-in cues):
Which checks were completed and on which device:
Question/probe IDs needing review:
Suggested content changes:
```

When reviewing several learners, summarize alignment separately by skill, input category and adaptation. Track skipped tasks, retry rates, item-level answer patterns, calibration issues, and recommendation disagreements alongside any agreement percentage. Do not average unlike inputs or treat small convenience samples as validation.

Keep comparisons separate by input and adaptation. Do not combine adapted and full-kit results into one norm, or interpret the current cutoffs as population percentiles. Educator review and a suitably designed validation study are required before the assessment is described as a certified or standardized placement measure.

## Summarize a pilot batch

After the teacher has filled `educatorComparisonTemplate.teacherEstimatedLevel` and `recommendedLessonFits` in each review file, aggregate a batch locally. To include repeatability, attach the same non-identifying pilot code to each retake and list those exports in chronological order:

```sh
node scripts/summarize-assessment-pilot.mjs ./pilot/review-01.json ./pilot/review-02.json > ./pilot/summary.json
```

Teacher levels accept `needs foundation`, `developing`, or `independent` (or numeric tiers 1–3); leave unassessed estimates null. Domains with no attempted probe are exported as unassessed and excluded from comparison counts. For visual quizzes, the exported reading comparison maps the completed notation subset to three broad levels, and the summary also reports availability, answer coverage, and correctness by pulse, subdivisions, and coordination. Audio-only and rhythm-first answers remain unassessed for a reading tier. The summary reports exact and within-one-tier educator agreement, recommendation-fit counts, learner input-issue feedback, item answer patterns, paired baseline/follow-up matched and timing changes, practice duration and session summaries and—when pilot codes are present—adjacent retake tier/pass consistency, score changes, and timing-error changes. Rate estimates include sample counts and descriptive 95% Wilson intervals. Groups stay separated by content revision, input type, adaptation, and recorded access options. Codes are used only for pairing and are not printed; the script also omits source filenames and absolute transfer-check timestamps. Intervals describe sampling uncertainty and do not establish validity or placement norms. Small samples are descriptive only; inspect disagreements and item wording before changing thresholds or content.

The current content holds each domain at 72 BPM to separate tier complexity from speed. This is a design control, not evidence that 72 BPM is an ideal or universal assessment tempo. Teacher comparison data still needs to be collected across learners, input types, and adaptations before thresholds or placement claims are changed. No educator pilot data has been collected by this implementation work.
