# Improvisation and trading phrases

Open **Practice → Improvisation**, or follow the link from Trainer or Play-alongs. Trading alternates a virtual-drummer turn with a player turn; guided improvisation provides player phrases throughout. Choose two-, four-, or eight-bar turns in 4/4, 40–200 BPM, and one, two, four, or eight exchanges. Defaults preserve the original trading-fours setup: 80 BPM, four exchanges, free exploration, bass on, metronome at half volume, and a kick entry. Start and resume use a four-beat count-in.

**Open-ended session** repeats until you choose **Finish session**, which saves only completed player phrases. **Stop** cancels without saving. Incomplete responses are excluded from feedback and replay. To bound browser memory, capture pauses at 100,000 hits or 1,000 exchanges; finish completed phrases and start a new session.

## Listen, respond, and develop an idea

The four-step learning path moves through pulse, space, motifs, and resolution. Select a lesson, open its example, and choose **Play demonstration** before playing. After completing the configured lesson session, explicitly complete the step to save its participation checkpoint and continue. Checkpoints do not certify musical quality.

**Drummer and handoff options** selects beginner/intermediate/advanced vocabulary, sparse/balanced/busy note density, and a response exercise: copy the idea, answer with a variation, or contrast the phrase. Original reference phrases are deterministic, with changing fills, dynamics, ghost notes, and style-specific rhythms. Copy keeps the reference idea stable across exchanges. The virtual drummer does not strike during player turns.

Rock and funk use straight sixteenth-note timing targets. Shuffle, blues, and jazz use triplet timing targets, with swung drum phrases and corresponding bass patterns. Funk includes syncopated bass, blues moves through a generated chord-root form, and jazz uses walking bass tones. All accompaniment is synthesized locally; no imported or commercial tracks are required. Bass and click continue during player turns.

Choose free exploration, snare backbeats, kick/snare only, beat-four rests, motif development, a soft-to-loud build, a recurring rhythm across changing voices, or a deliberate resolution. Guided mode can cycle through the four basic constraints or the four expressive prompts, starting from the selected prompt. Expressive prompts have demonstrations and reflection questions; the app does not grade musical creativity or claim to recognize motif quality.

Choose any of the five core drums for the beat-1 entry, or no required entry. For kick/snare-only prompts—including a basic prompt cycle—use kick, snare, or no entry so the requirements do not contradict one another. The bar strip and final-bar preview show the upcoming handoff or prompt. Optional spoken cues use the browser's speech service; availability and voices depend on the browser. Visual cues remain available.

## Input and feedback

Keyboard uses Space/F/J/K/L for kick/snare/hi-hat/tom/crash. Touch selects the same pads. MIDI connection is explicit and uses Trainer's saved per-device note map and latency correction; velocity is retained for replay. Unsupported browsers can use keyboard, touch, or acoustic/unscored practice. No microphone is requested. Paused sessions allow an explicit input switch. Any use of unscored input makes the entire session unscored.

Scored feedback reports mean absolute timing distance from the selected straight or triplet grid, entry timing where required, and only the objective constraints of the selected prompt. Required notes use min(125 ms, quarter of a beat); backbeats are matched one-to-one. Latency is corrected before assigning a hit to a turn. Notes outside player turns are not captured as player evidence. Extra creative notes are welcome unless they violate a selected constraint. Silence has no timing evidence.

Recaps lead with a next action and offer **Repeat phrase**, optionally at 80% tempo. A focused retry preserves the original reference variation, style, entry rule, and selected phrase prompt. Timing details are expandable. Each phrase accepts an optional written reflection; a session can also have notes and a self-rating. Unscored acoustic practice provides completed phrase counts and self-reflection only.

## Replay, presets, and progress

After a scored session, choose a phrase and replay the reference, the response, or both at 50%, 75%, or 100% speed. Trading replays the original virtual-drummer phrase; guided sessions provide a demonstration of the selected prompt for comparison. Event markers show the two phrases. Playback uses synthesized drum samples and captured note timing/velocity, not microphone audio. Starting a session, navigating, backgrounding, or stopping replay cancels pending replay sounds.

Responses stay in page memory unless **Save this take** is explicitly selected. Save up to 12 named takes, with at most 10,000 hits per take and 50,000 hits across the shelf. Deleting a take removes its saved drum events. Session-summary deletion and saved-take deletion are separate controls.

Save up to 12 named practice presets. Load a preset or reopen settings from history, then start when ready. Progress compares sessions with the same scoring engine, input/calibration context, mode, style, phrase length, entry, prompt cycle, difficulty, density, and response exercise, within 5 BPM. Older scoring versions and unscored sessions remain separate. At least two matching scored sessions are needed for a trend; missing timing evidence stays missing.

## Local data and compatibility

All data uses the ordinary learner-profile suffix (`:profile:<id>` for non-default learners):

- `drum-hero:improvisation:v1`: latest 50 completed session summaries, settings, notes, reflections, and optional self-rating. New scoring has `engineVersion: 2`; existing v1 summaries migrate with their original four-bar, straight-rock, kick-entry defaults and remain outside the new trend comparisons.
- `drum-hero:improvisation-workspace:v1`: named presets and learning participation checkpoints.
- `drum-hero:improvisation-takes:v1`: only explicitly saved drum-event takes.

Full backup/restore includes all three namespaces without a backup-format change. Deleting a learner profile removes these namespaces for that learner. New copy uses the localization layer with English fallback where translations are unavailable. Improvisation remains separate from lesson completion, Trainer best scores, and pattern mastery. No microphone recording or audio upload is added.

Pausing freezes musical time and cancels pending drum, bass, and spoken cues; resume starts a new count-in. Backgrounding and selected MIDI-device loss pause practice. Audio interruption also pauses practice. Reconnect or explicitly switch input before resuming. Failed audio loading leaves setup available for retry.

## Verification

Run `npm test -- tests/unit/improvisation.test.ts`. After `npm run build`, run `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright test tests/e2e/improvisation.spec.ts --project=chromium --project=webkit --project=mobile-chromium`.

Before hardware sign-off:

- Connect a real MIDI kit, calibrate mapping/timing in Trainer, and verify five-voice routing, dynamics, and entry rules at 40, 80, and 200 BPM.
- Listen to rock, funk, shuffle, blues, and jazz accompaniment. Confirm straight/swung targets match the audible feel; validate handoffs at all three phrase lengths.
- Compare a reference and response at all replay speeds. Confirm stopped, paused, backgrounded, and navigated-away sessions leave no pending notes or speech.
- Disconnect MIDI mid-turn; reconnect or explicitly switch input. Check a phone, an external output, and an operating-system audio interruption.
- Ask an educator to review the generated style vocabulary, demonstrations, and feedback wording before treating the teaching content as validated.

Browser tests do not establish physical-device latency, audible playback quality, or educator validation.
