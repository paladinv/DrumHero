# Improvisation and trading phrases

Open **Practice → Improvisation**, or follow the link from Trainer or Play-alongs. Trading alternates a virtual-drummer turn with a player turn; guided improvisation provides player phrases throughout; duet mode alternates two named players without a virtual drummer. Choose 3/4, 4/4, 5/4, 6/8, or 7/8, two-, four-, or eight-bar turns, 40–200 BPM, and one, two, four, or eight exchanges/turns. BPM follows a quarter-note pulse; eighth-note meters display each eighth as a beat. Defaults preserve the original trading-fours setup: 80 BPM, four exchanges, free exploration, bass on, metronome at half volume, and a kick entry. Start and resume count in for one bar in the selected meter.

**Open-ended session** repeats until you choose **Finish session**, which saves only completed player phrases. **Stop** cancels without saving. Incomplete responses are excluded from feedback and replay. To bound browser memory, capture pauses at 100,000 hits or 1,000 exchanges; finish completed phrases and start a new session.

## Listen, respond, and develop an idea

The four-step learning path moves through pulse, space, motifs, and resolution. Select a lesson, open its example, and choose **Play demonstration** before playing. After completing the configured lesson session, explicitly complete the step to save its participation checkpoint and continue. Checkpoints do not certify musical quality.

**Drummer and handoff options** selects beginner/intermediate/advanced vocabulary, sparse/balanced/busy note density, and a response exercise: copy the idea, answer with a variation, or contrast the phrase. Original reference phrases are deterministic, with changing fills, dynamics, ghost notes, and style-specific rhythms. Copy keeps the reference idea stable across exchanges. The virtual drummer does not strike during player turns.

Rock and funk use straight sixteenth-note timing targets. Shuffle, blues, and jazz use triplet timing targets when the style groove is selected. The groove builder offers style, straight, half-time, four-on-the-floor, and editable one-, two-, or four-bar kick/snare/hi-hat phrases. Longer patterns repeat to fill longer drummer turns. Save a setup preset to reuse a custom phrase. Generated grooves can use eighths, sixteenths, or triplets; the custom grid uses meter-aware sixteenth-note positions. Funk includes syncopated bass. Choose one chord, twelve-bar blues, pop I–V–vi–IV, or jazz ii–V–I–vi harmony, a key, and bass, chord, or combined synthesized accompaniment. Bass and click can continue during player turns, with optional sparse bass and metronome dropouts.

Choose free exploration, snare backbeats, kick/snare only, final-beat rests, motif development, a soft-to-loud build, a recurring rhythm across changing voices, or a deliberate resolution. Guided mode can cycle through the four basic constraints or the four expressive prompts, starting from the selected prompt. Trading challenges also include three-over-two and five-over-four cross-rhythm practice with one-to-one target matching. Expressive prompts have demonstrations and reflection questions; the app does not grade musical creativity or claim to recognize motif quality.

Choose any of the five core drums for the beat-1 entry, or no required entry. For kick/snare-only prompts—including a basic prompt cycle—use kick, snare, or no entry so the requirements do not contradict one another. Drum staff notation is the primary live guide: it shows the virtual drummer's phrase on partner turns, an open staff with your captured notes during player turns, and outlined or shaded guides for required entries, backbeats, challenges, and requested rests. The moving score cursor follows the session clock; swing and odd meters use meter-aware count positions. Optional spoken cues use the browser's speech service; availability and voices depend on the browser. Turn labels and accessible count text remain available.

Turn on **Adaptive virtual drummer** for trading sessions without a fixed call-and-response challenge. After two scored player turns, the next drummer phrase can move one density or difficulty step easier when timing or prompt requirements were missed, or one step harder after both turns meet them. It holds its level when there is not enough timing evidence, during unscored practice, or at the configured limit. The adjustment appears before the drummer phrase; the saved setup remains the player's chosen baseline. Saved takes retain the phrase settings so replay uses the same drummer phrases heard during the session.

## Input and feedback

Keyboard uses Space/F/J/K/L for kick/snare/hi-hat/tom/crash. Touch selects the same pads. MIDI connection is explicit and uses Trainer's saved per-device note map, articulation, and latency correction. Open/closed/pedal hats, foot splashes, ride, crash, and rimshot tags change playback and remain visible in review and MIDI export. Velocity is retained for replay; low-velocity hits can reveal ghost-note dynamics. In duet mode, each player can be assigned a different connected MIDI input; keyboard and touch sessions alternate the same shared controls. Unsupported browsers can use keyboard, touch, or acoustic/unscored practice. No microphone is requested. Paused sessions allow an explicit input switch. Any use of unscored input makes the entire session unscored.

Scored feedback reports mean absolute timing distance from the selected straight or triplet grid, entry timing where required, and only the objective constraints of the selected prompt. Required notes use min(125 ms, quarter of a beat); backbeats are matched one-to-one. Latency is corrected before assigning a hit to a turn. Notes outside player turns are not captured as player evidence. Extra creative notes are welcome unless they violate a selected constraint. Silence has no timing evidence.

Recaps lead with a next action and offer **Repeat phrase**, optionally at 80% tempo. A focused retry preserves the original reference variation, style, entry rule, and selected phrase prompt. Timing details are expandable. Each phrase accepts an optional written reflection; a session can also have notes and a self-rating. Unscored acoustic practice provides completed phrase counts and self-reflection only.

## Replay, presets, and progress

After a scored session, choose a phrase and replay the reference, the response, or both at 50%, 75%, or 100% speed. The notation playheads follow the sounds. Trading replays the exact virtual-drummer response shaped by the previous player phrase; guided sessions provide a demonstration of the selected prompt for comparison. Timing review overlays targets, misses, early/late hits, and prompt violations on a score. When MIDI velocities are present, it also displays average/range, a velocity lane, articulation tags, and each event's velocity to help inspect accents and ghost notes. Export an optional take as a General MIDI percussion file; it contains synthesized drum-note events, not microphone audio. Starting a session, navigating, backgrounding, or stopping replay cancels pending replay sounds.

Responses stay in page memory unless **Save this take** is explicitly selected. Save up to 12 named takes, with at most 10,000 hits per take and 50,000 hits across the shelf. Deleting a take removes its saved drum events. Session-summary deletion and saved-take deletion are separate controls.

From a scored recap, choose **Export shareable response pack** to bundle its written notes and reflections, objective summary, practice assignment, drum-event take, and General MIDI file. Review the pack contents before sharing because it includes any written notes. Import a pack to inspect its recap, replay its take, or download its MIDI file; imported material stays in page memory and is not added to local history unless you explicitly save the take.

Save up to 12 named practice presets and 12 multi-step practice playlists. Build a tempo ladder from the current setup, increase its BPM by a chosen amount per step, and use **Continue to playlist step** after each completed session. Export a playlist as a JSON file to share with another device or teacher, then import it into that learner profile; playlist files contain setup instructions, not student history. Load a preset or reopen settings from history, then start when ready. Progress compares sessions with the same scoring engine, input/calibration context, meter, groove, style, phrase length, entry, prompt cycle, difficulty, density, and response exercise, within 5 BPM. Matching sessions also show timing and backbeat coverage charts; the table remains available for exact values and blank evidence is left blank. Older scoring versions and unscored sessions remain separate. At least two matching scored sessions are needed for a trend; missing timing evidence stays missing.

## Local data and compatibility

All data uses the ordinary learner-profile suffix (`:profile:<id>` for non-default learners):

- `drum-hero:improvisation:v1`: latest 50 completed session summaries, settings, notes, reflections, and optional self-rating. New scoring has `engineVersion: 2`; existing v1 summaries migrate with their original four-bar, straight-rock, kick-entry defaults and remain outside the new trend comparisons.
- `drum-hero:improvisation-workspace:v1`: named presets, learning participation checkpoints, and practice playlists/teacher assignments.
- `drum-hero:improvisation-takes:v1`: only explicitly saved drum-event takes, including per-phrase drummer settings when adaptive practice was active.

Full backup/restore includes all three namespaces without a backup-format change. Deleting a learner profile removes these namespaces for that learner. New copy uses the localization layer with English fallback where translations are unavailable. Improvisation remains separate from lesson completion, Trainer best scores, and pattern mastery. No microphone recording or audio upload is added.

Pausing freezes musical time and cancels pending drum, bass, and spoken cues; resume starts a new count-in. Backgrounding and selected MIDI-device loss pause practice. Audio interruption also pauses practice. Reconnect or explicitly switch input before resuming. Failed audio loading leaves setup available for retry.

## Verification

Run `npm test -- tests/unit/improvisation.test.ts tests/unit/improvisation-tools.test.ts`. After `npm run build`, run `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright test tests/e2e/improvisation.spec.ts --project=chromium --project=webkit --project=mobile-chromium`.

Before hardware sign-off:

- Connect a real MIDI kit, calibrate mapping/timing in Trainer, and verify five-voice routing, dynamics, and entry rules at 40, 80, and 200 BPM.
- Listen to rock, funk, shuffle, blues, and jazz accompaniment. Confirm straight/swung targets match the audible feel; validate handoffs at all three phrase lengths.
- Compare a reference and response at all replay speeds. Confirm stopped, paused, backgrounded, and navigated-away sessions leave no pending notes or speech.
- Disconnect MIDI mid-turn; reconnect or explicitly switch input. Check a phone, an external output, and an operating-system audio interruption.
- Ask an educator to review the generated style vocabulary, demonstrations, and feedback wording before treating the teaching content as validated.

Browser tests do not establish physical-device latency, audible playback quality, or educator validation.


## Rhythm challenges and motif development

Open **Challenges and accompaniment** to choose a call-and-response task. Challenges automatically select trading mode, free exploration, and no required entry to keep the directions consistent. They use an original, deterministic kick/snare motif in the selected straight or swung feel:

- **Echo the rhythm** asks for the reference drums and rhythm.
- **Keep the opening, change the ending** matches only the opening bars; the last bar is yours.
- **Move the rhythm to another drum** matches the same rhythm on the selected answer drum.
- **Develop one motif over four exchanges** moves through echoing, changing the drum, changing the ending, and a free closing phrase. Its four-exchange default can be adjusted. Focused retries retain the original development stage.
- **Three over two** and **five over four** add cross-rhythm targets against the metronome pulse.

Challenge targets use one-to-one matching within min(125 ms, one-quarter beat). Additional creative notes are allowed. A free closing phrase has no required challenge notes; reflection reviews its musical effect. Silence never provides timing evidence. Challenges add their own matched/required counts and reflection questions; there is no creativity score.

In replay, open **Visual timing review**. The event lanes include the appropriate straight or triplet grid. The review lists missed required entries, backbeats, or challenge notes and shows signed early/late offsets for captured hits, along with rest/voice violations. Select a different replay phrase to examine or listen to it. The table shows at most 128 hits, while replay retains the complete phrase. Review is temporary unless the take is explicitly saved.

## Optional support, intentions, and suggestions

The metronome can play every bar, alternate one audible and one silent bar, or cycle through a full-volume bar, a quiet bar, and two silent bars. Its pattern stays anchored to the session clock across turns and pauses. A fresh resume count-in uses the configured full click volume. Zero click volume remains silent.

Choose bass roots from one chord, a twelve-bar blues form, pop I–V–vi–IV, or jazz ii–V–I–VI, or follow the selected style. These are synthesized bass outlines, not recorded chord tracks. Bass volume is independent of the metronome. **Sparse bass during player turns** reduces the bass to bar downbeats while the player develops an idea.

An optional **Practice intention** (up to 200 characters) travels with the setup and session summary. The recap displays it beside reflections and notes so players can judge their own musical intention.

**Try this next** appears only after repeated timing, rest, or backbeat difficulty in at least two comparable scored sessions. It uses the latest three matching sessions, explains the reason, and changes nothing until **Apply practice suggestion** is chosen. Comparisons include the challenge/development stage, metronome support and level, bass settings, and progression, as well as the existing input and musical settings. Missing timing evidence is never treated as success or failure for timing suggestions.

## Sound check and performance view

Before starting, open **Pre-session sound and input check** and choose **Start sound check**. Test the five sounds, then use the selected keyboard, touch, or connected MIDI input. Received hits display their drum, MIDI velocity when available, and the saved input-latency correction. Unmapped MIDI notes identify the note number and direct the player to Trainer mapping. Choose **Calibrate input timing** to follow eight clicks and save a median timing correction to the selected learner's keyboard, touch, or MIDI device profile; at least four matched taps are required. Calibration stores only the correction and tap spread, never the tap stream. The sound check previews sounds without creating practice hits or session summaries. Ending a check or calibration, changing inputs, starting practice, backgrounding, disconnecting MIDI, or leaving the page cancels its audio.

The setup page includes quick starts for a first trade, a steady backbeat, and two-voice guided ideas. **Preview this setup** displays and plays a phrase generated for the selected meter, groove, tempo, and phrase length. **Live score reveal** shows the virtual drummer's full phrase, one bar ahead, or only as it is heard; player improvisation remains an open staff. The shared score uses drum noteheads, stems and flags for straight, swung, and triplet placements. On narrow screens it reduces the step spacing to keep a bar readable; use **Following playhead** to resume automatic score scrolling after browsing.

**Performance view** hides setup, history, teaching panels, page introduction, and footer while keeping turn announcements, bar/beat position, intention, task, pads, and large transport controls. **Exit performance view** or Escape restores the full view. Completion and cancellation also return to the full view. This is a page presentation mode; it does not require browser fullscreen permission.

## Practice playlists and teacher assignments

Open **Practice playlists** on the improvisation page. Create a tempo ladder from the current setup or use the playlist builder to name a finite session, name its step, and select **Append current setup**. Repeat for up to eight steps; draft steps can be moved up or removed. Save up to 12 playlists on each learner profile. After completing a step, select **Continue to playlist step** to load the next setup.

Learners explicitly load a step and start when ready. A fully completed session with that exact saved setup records participation against the step. Changing the setup, a focused retry, or cancelling does not earn step completion. Acoustic sessions can record unscored participation. Teachers can review associated session summaries, advice, intentions, ratings, notes, and phrase reflections under each step. These records follow the latest-50-session history limit; deleting a summary removes that evidence. Deleting a playlist leaves its ordinary history summaries available.

Playlists and results are local to the learner profile and included in full backup/restore. Export/import moves one playlist file between devices without including learner progress. These files are separate from the existing cloud roster and shared progress-report formats; improvisation results are not sent through those services.

Additional manual checks: listen through metronome dropout cycles and re-entry after pause; confirm each progression and the separate bass level; use a real MIDI kit in sound check at soft and loud velocities; verify a multi-step teacher sequence and performance view on a tablet beside the kit.
