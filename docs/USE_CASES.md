# Drum Hero use cases

This catalogue is the product contract for the Drum Hero web MVP. “Learner” means any person using the browser app. All progress is local to the current browser origin.

## App shell and navigation

- **UC-01 — First launch:** The learner opens Drum Hero and sees the dashboard without creating an account or granting permission.
- **UC-02 — Primary navigation:** The learner can open Home, Learn, Practice, Rudiments, Grooves, Kit Guide, Progress, and About.
- **UC-03 — Recommended activity:** The dashboard recommends the earliest incomplete lesson and links to its relevant destination.
- **UC-04 — Tool discovery:** The dashboard explains the purpose of every primary tool before navigation.
- **UC-05 — Responsive navigation:** Desktop shows an inline menu; narrow screens provide an operable disclosure menu.
- **UC-06 — Direct links:** Every primary route and pattern query can be opened or refreshed directly.
- **UC-07 — Product identity:** Header, metadata, favicon, manifest, and footer identify Drum Hero consistently.

## Curriculum and lessons

- **UC-10 — Browse curriculum:** The learner sees twelve lessons in a defined beginner-to-advanced order.
- **UC-11 — Filter curriculum:** The learner filters lessons by All, Beginner, Intermediate, or Advanced without losing progress.
- **UC-12 — Understand outcomes:** Each lesson shows level, expected duration, summary, and concrete goals.
- **UC-13 — Complete lesson:** The learner marks an unfinished lesson complete and receives an immediate completed state.
- **UC-14 — Preserve completion:** Completed lessons survive page navigation and browser reload.
- **UC-15 — Prevent duplication:** Repeated completion attempts cannot duplicate an identifier or inflate progress.
- **UC-16 — Launch practice:** A lesson with a playable pattern opens Practice with the correct pattern selected.
- **UC-17 — Cover all levels:** The curriculum includes setup/notation/backbeat/fill, sixteenth control/paradiddles/syncopation/linear ideas, and independence/odd meter/dynamics/polyrhythm.

## Practice configuration and transport

- **UC-20 — Select pattern:** The learner chooses any bundled rudiment or groove and sees its title, level, subdivision, description, and target steps.
- **UC-21 — Set tempo:** The learner selects 40–200 BPM and sees the current numeric value.
- **UC-22 — Safe reconfiguration:** Changing pattern or tempo resets an active or completed session and cancels the previous scheduler.
- **UC-23 — User-initiated audio:** Audio context creation occurs only after the learner presses Start.
- **UC-24 — Count-in:** Start displays a four-beat count-in before the scoring window begins.
- **UC-25 — Visible playhead:** During playback the active subdivision is clearly visible and advances through the pattern.
- **UC-26 — Pattern cues:** Enabled sound produces a short recorded hi-hat count-in click and recorded target-drum cues from bundled samples.
- **UC-27 — Mute:** The learner disables sound without disabling visual playback or scoring.
- **UC-28 — Pause/resume:** The learner pauses and resumes without shifting the relationship between remaining targets.
- **UC-29 — Reset:** Reset returns to an idle, empty-score state and stops scheduled work.
- **UC-30 — Finish safely:** Playback stops after the final target, records exactly one result, and never exceeds pattern bounds.
- **UC-31 — Retry:** From results, the learner starts a clean new attempt of the same configuration.
- **UC-32 — Fullscreen:** Alt+F enters or exits fullscreen when the browser permits it; Escape uses native exit behavior.
- **UC-33 — Background recovery:** Pausing before a known interruption allows an explicit resume with preserved target spacing.

## Guided trainer

- **UC-T01 — Round setup:** Choose a bundled rudiment, groove, or song part; set 4, 8, 10, or 16 repetitions and a one-, two-, or four-beat count-in.
- **UC-T01a — Tempo build:** In self-rated practice, optionally raise tempo by 2 BPM after Clean repetitions and lower it after Missed repetitions.
- **UC-T02 — Self rating:** Practice acoustic drums and rate each repetition Clean, Needs work, or Missed before advancing.
- **UC-T03 — Scored input:** Score continuous repetitions using keyboard, touch, USB MIDI, timing-only audio, or calibrated five-voice audio classification.
- **UC-T04 — Device setup:** Use per-device MIDI note maps and latency correction, view MIDI velocity, choose an audio input, and set its transient threshold.
- **UC-T05 — Input calibration:** Estimate latency by tapping with an eight-beat click, or collect five sample hits for each audio voice; keep uncertain voice hits unscored.
- **UC-T06 — Round control:** Pause, resume, reset, and complete without duplicating a result or advancing past the chosen repetition count.
- **UC-T07 — Progress:** Keep up to fifty local Trainer rounds; show accuracy trends, most-practised pattern, focus area, and an adaptive next-round recommendation.
- **UC-T08 — Setlist rehearsal:** Load an existing setlist and advance through each part in its selected song section, saving section scores as rounds finish.

## Playable inputs and scoring

- **UC-40 — Keyboard map:** Space/F/J/K/L trigger kick/snare/hi-hat/tom/crash while playing.
- **UC-41 — Touch map:** Five labeled pad buttons trigger the same instrument events while playing.
- **UC-42 — Idle protection:** Inputs outside active playback do not add scored hits.
- **UC-43 — Great rating:** A matching instrument within ±50 ms receives Great.
- **UC-44 — Good rating:** A matching instrument over 50 ms and within ±100 ms receives Good.
- **UC-45 — Miss rating:** An unmatched expected hit more than 100 ms late receives Miss.
- **UC-46 — Extra rating:** A played instrument without an available matching target within 100 ms receives Extra.
- **UC-47 — Match by instrument:** A temporally close hit cannot satisfy the target for a different kit voice.
- **UC-48 — Offset feedback:** Great and Good events show signed early/late milliseconds and instrument.
- **UC-49 — Combo:** Consecutive Great or Good hits build combo; Miss or Extra resets it.
- **UC-50 — Aggregate score:** Great contributes 100, Good 70, Miss 0, and each Extra deducts two points, floored at zero.
- **UC-51 — Accuracy:** Accuracy is the percentage of expected targets rated Great or Good, excluding Extras from the denominator.
- **UC-52 — Results:** The completed loop shows score, accuracy, Great/Good/Miss/Extra counts, and maximum combo.

## Rudiments, grooves, and kit guidance

- **UC-60 — Browse rudiments:** The learner sees level, tempo, sticking, description, and coaching for each rudiment.
- **UC-61 — Practice rudiment:** The learner opens Practice from a rudiment with that rudiment selected.
- **UC-62 — Browse grooves:** The learner sees style, level, subdivision, tempo, focus, and description for each groove.
- **UC-63 — Practice groove:** The learner opens Practice from a groove with that groove selected.
- **UC-64 — Representative breadth:** The 75-pattern groove library progresses from first pulses through rock, pop, disco, reggae, shuffle, jazz, funk, metal, Latin, compound and odd meters, and groove-to-fill transitions; rudiments include single/double strokes, paradiddle, and six-stroke roll.
- **UC-68 — Groove follow-along:** Search and filter grooves by level and style; inspect step-by-step voice/accent grids and open any groove in Trainer or Practice Pad.
- **UC-69 — Custom groove editor:** Create, accent, save, and delete eighth- or sixteenth-note grooves; saved patterns are available in Trainer and Practice Pad on the same browser.
- **UC-65 — Learn kit voices:** The Kit Guide explains the five playable voices and their mappings.
- **UC-66 — Ergonomic guidance:** The Kit Guide covers seat height, reach, rebound, and relaxed motion.
- **UC-67 — Hearing safety:** The Kit Guide explicitly recommends appropriate hearing protection and controlled volume.

## Progress, persistence, and privacy

- **UC-70 — Progress summary:** Progress displays lessons completed, session count, best score, and current streak.
- **UC-71 — Level progress:** Beginner, Intermediate, and Advanced each show completed count and percentage.
- **UC-72 — Session history:** A completed loop appears in recent sessions with pattern, BPM, accuracy, date, score, and combo.
- **UC-73 — Personal best:** The highest score per pattern is retained when later scores are lower.
- **UC-74 — Focus plan:** Queue a short practice plan from patterns with weaker recent results and patterns the learner has practiced less often.
- **UC-75 — Per-voice timing:** Scored Trainer recaps show average early or late timing and hit accuracy for each drum voice.
- **UC-76 — Velocity coaching:** MIDI recaps compare accented and unaccented note velocities with simple dynamics targets.
- **UC-77 — Audio setup:** Measure room noise, adjust the detection threshold, and view microphone input-level guidance before voice scoring.
- **UC-78 — Pattern history:** Review recent pattern accuracy, the highest tempo reached at strong accuracy, and average timing tendency.
- **UC-74 — History bound:** Only the 50 most recent sessions are retained.
- **UC-75 — Practice dates:** At most one practice-date entry is stored per calendar date.
- **UC-76 — Streak:** Consecutive practice dates ending today or yesterday form the current streak.
- **UC-77 — Versioned storage:** Persisted progress includes an explicit schema version.
- **UC-78 — Corruption recovery:** Invalid JSON or incompatible data falls back to safe defaults without preventing launch.
- **UC-79 — Settings bounds:** Restored preferred tempo is clamped to 40–200 BPM and sound defaults on unless explicitly disabled.
- **UC-80 — Local privacy:** No account, backend, upload, or analytics is used. Microphone/line-in permission is requested only when the learner connects Trainer audio input; recordings are not stored.

## Accessibility, compatibility, and failure handling

- **UC-90 — Keyboard navigation:** All interactive controls are reachable and operable with a keyboard and have visible focus.
- **UC-91 — Semantic structure:** Pages use landmarks, hierarchical headings, labels, buttons, links, and current-page navigation state.
- **UC-92 — Live status:** Count-in, last-hit feedback, and state changes are exposed without forcing focus.
- **UC-93 — Non-color cues:** Level, mode, timing rating, and completion are communicated with text as well as color.
- **UC-94 — Reduced motion:** The interface honors `prefers-reduced-motion` while retaining state clarity.
- **UC-95 — Zoom and reflow:** Essential content remains usable at narrow mobile widths and 200% desktop zoom.
- **UC-96 — Touch targets:** Primary mobile controls provide large, separated activation areas.
- **UC-97 — Audio unavailable:** Missing Web Audio produces a message and retains visual/scoring behavior.
- **UC-98 — Console health:** Primary routes and representative flows emit no uncaught page or console errors.
- **UC-99 — Supported browsers:** Current Chromium and WebKit desktop engines support primary flows; mobile Chromium viewport supports responsive flows.


## Song Library (initial web release)

- **UC-S01 — Local repertoire:** Browse two original examples and add personal songs with title, artist, difficulty, tempo, meter, tags, notes, source attribution, and authorization metadata.
- **UC-S02 — Drum arrangement:** Add sections and editable five-voice grid parts, with bounded beat count, subdivision, and tempo.
- **UC-S03 — Practice handoff:** Open a part in Practice Pad or Trainer and save completed section scores to the local library.
- **UC-S04 — Organize:** Search songs, mark favorites, archive, create collections, practice queues, and setlists.
- **UC-S05 — Import/export:** Review a Drum Hero song JSON before import; export songs and library backups.
- **UC-S06 — Rehearsal notes:** Add annotations, bookmarks, stage cues, references, journal entries, and schedules.
- **UC-S07 — Record:** With explicit microphone permission, save a local take, inspect detected onsets and approximate grid-match metrics, export audio, or delete the take.
- **UC-S08 — Find and order:** Filter by meter, tag, collection, favorite, or due review; sort by title, artist, recent practice, or review date. Reorder arrangement sections/parts and queue/setlist songs.
- **UC-S09 — Practice plan:** Assign a section to each queue/setlist entry, launch that section in Practice Pad, and edit scheduled practice dates.
- **UC-S10 — Arrange efficiently:** Copy a part into another section, place accents, record sticking and dynamics notes, and move section/part order.
- **UC-S11 — Understand readiness:** See the section mastery threshold, outstanding review, and the specific section to practice next; review recent section scores.

Section reviews, tempo ramps, readiness estimates, arrangement snapshots, checklists, local rehearsal roles, encrypted backup, and backup conflict review are available. Optional account sync and sharing permissions remain future work.
