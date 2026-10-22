# Drum Hero QA plan and traceability

## Quality objective

Prove that Drum Hero teaches and scores usable drum-practice flows in a real browser—not merely that TypeScript compiles. A release requires unit, production-build, browser acceptance, accessibility, responsive, visual, and targeted manual checks.

## Automated suites

| Suite | Automated coverage | Gate |
| --- | --- | --- |
| `tests/unit/scoring.test.ts` | Timing boundaries, timeline calculations, instrument matching, score, accuracy, extras, and combo | Unit |
| `tests/unit/curriculum.test.ts` | Unique IDs, tempo and hit bounds, lesson levels, and practice references | Unit |
| `tests/unit/progress.test.ts` | Defaults, corrupt data, settings bounds, session history, streaks, and recommendations | Unit |
| `tests/unit/trainer.test.ts` | Round timing and scoring, MIDI parsing, storage recovery, and audio silence rejection | Unit |
| `tests/unit/trainer-improvements.test.ts` | Progressive click gaps, dynamics targets and feedback, groove-fill return scoring | Unit |
| `tests/unit/song-library.test.ts` | Song validation, search, migration, merge, practice records, reviews, and tempo ramps | Unit |
| `tests/unit/locales.test.ts` | Locale matching, fallbacks, translations, RTL, spoken counts, and localized pattern data | Unit |
| `tests/unit/drum-animation.test.ts`, `tests/unit/drum-dimensions.test.ts`, `tests/unit/drum-hand-asset.test.ts` | Hit animation, model dimensions/contact points, and authored hand asset constraints | Unit |
| `tests/e2e/navigation.spec.ts` | Route headings, page errors, navigation links, and active-page state | Smoke and full functional matrix |
| `tests/e2e/learning.spec.ts` | Lesson filtering, guided completion, persistence, and practice handoff | Full functional matrix |
| `tests/e2e/practice.spec.ts` | Transport, settings, scored keyboard/pad input, result persistence, audio fallback, and corrupt progress recovery | Smoke and full functional matrix |
| `tests/e2e/trainer.spec.ts` | Self-rated and scored rounds, pause/reset, MIDI fallback, and mapped MIDI input | Smoke and full functional matrix |
| `tests/e2e/song-library.spec.ts` | Song creation, part editing, practice handoff, persistence, and backup merge | Full functional matrix |
| `tests/e2e/localization.spec.ts` | Device language, saved choice, translated content, live switching, RTL, and blocked storage | Full functional matrix |
| `tests/e2e/accessibility.spec.ts` | Serious/critical axe violations (excluding color contrast), desktop keyboard flow, and mobile menu/pad sizing | Full functional matrix |
| `tests/e2e/visual.spec.ts` | Dashboard, curriculum, practice idle/results, and mobile navigation screenshots | Chromium visual |

## Selecting and running tests

- `npm test -- tests/unit/<area>.test.ts` runs one unit file; `npm run test:unit:changed` runs unit tests affected by Git changes.
- `npm run test:e2e:<feature>` runs one functional feature in Chromium. The available feature names match the functional spec files.
- `npm run test:e2e:smoke` runs the nine route checks plus the practice result and trainer scoring flows in Chromium.
- `npm run test:e2e` discovers all functional specs across Chromium, WebKit, and mobile Chromium. Visual tests are tagged and run separately with `npm run test:visual`.
- `npm run test:e2e:failed` reruns the last functional run's failures. Use the same `PLAYWRIGHT_RUN_ID` as that run.
- Each Playwright run stores results and reports in `output/playwright/<run-id>/`. Concurrent runs need distinct `PLAYWRIGHT_RUN_ID` and `PLAYWRIGHT_PORT` values; set `PLAYWRIGHT_WORKERS` to cap workers per run. Build once before starting concurrent E2E agents.
- Pull request CI runs `npm run qa:fast`. A daily scheduled run and manual workflow dispatch run `npm run qa:full`; full visual checks run on macOS to match the checked-in Darwin snapshots.

## Browser and viewport matrix

| Target | Automated scope | Manual scope |
| --- | --- | --- |
| Chromium desktop, 1280×720 | Smoke and full functional, accessibility, visual | Chrome latest, audio and latency feel |
| WebKit desktop | Full functional | Safari latest, audio and fullscreen behavior |
| Mobile Chromium, iPhone 13 profile | Full functional, responsive navigation and touch controls | Physical iOS/Android touch ergonomics |
| Desktop at 200% zoom | Reflow checklist | Chrome and Safari |
| Reduced motion | All Playwright projects | Confirm no state depends on animation |

## Manual acceptance checklist

Record browser/OS/device, result, evidence path, and issue identifier for every failure.

### Audio and timing

- [ ] Start is the first action that creates audible output; loading a page remains silent.
- [ ] Count-in clicks are evenly spaced and target cues are distinguishable across all five voices.
- [ ] Mute immediately prevents later cues while playhead and scoring continue.
- [ ] 40, 80, 120, and 200 BPM remain stable over at least five loops each.
- [ ] Rapid alternating keyboard and touch inputs do not freeze, double-fire, or leave a pad stuck.
- [ ] Pause for ten seconds, resume, and confirm remaining cues keep their spacing.
- [ ] Switch away from the tab, return, reset, and start a clean session without a cue burst.
- [ ] Compare perceived input timing on Chrome and Safari; record hardware latency limitations.

### Trainer complete practice flow

- [ ] For keyboard, touch, MIDI, audio timing, and calibrated audio voices, start a round, pause during count-in and playing, resume, reset, and start again.
- [ ] On a fresh browser profile, use the beginner setup guide and start its short self-rated round; hide the guide and confirm the choice persists after reload.
- [ ] Change patterns between rounds and confirm the selected pattern, active targets, and score use the new pattern.
- [ ] Run Listen → Copy → Play alone and Feet → Hands → Together; confirm the stage label, highlighted targets, and upcoming stage change at each pass.
- [ ] Check microphone signal, latency correction, voice recognition, and guide bleed; repeat the guide bleed check with speakers and headphones.
- [ ] Practice flam and drag patterns at slow and fast tempos; compare grace-stroke spacing with the displayed tempo target.
- [ ] Play a groove, fill, and final return; confirm the landing is scored on the last pass and appears in the recap and recording markers.
- [ ] Check groove-plus-fill feedback for pre-fill groove, fill, first groove bar after the fill, and beat-one landing accuracy separately.
- [ ] Use the progressive metronome for at least five one-bar rounds; confirm two bars click, two bars are silent, and the click resumes while the count-in stays audible.
- [ ] Play a scored round with several repetitions and confirm the drift chart distinguishes gradual rushing or dragging from steady timing.
- [ ] Record a take, save it, reload a saved reference, and compare matching takes with aligned playback; confirm mismatched settings show why sync is unavailable.
- [ ] In recording review, select and loop a bar range; confirm bar and beat markers align with the saved tempo and meter and playback stops or loops at the range boundary.
- [ ] Change tempo/input/feel/click preferences, reload, and confirm them and the advanced section state are restored.
- [ ] Slow down, repeat the current bar, and return from a bar loop to the full phrase while a round is active.
- [ ] Save a routine as new, update it, undo a library change, export/import the whole routine library, and verify archived routines restore.
- [ ] Export/import a Trainer setup, then complete a round and confirm recordings and round history remain usable.
- [ ] Review progress exclusions and attempt counts against rounds with matching and differing input profiles, tempos, feels, and drill modes.
- [ ] Compare straight pulse, offbeat, backbeat, and fill timing in a scored groove-plus-fill round; confirm misses and average offsets land in the correct zone.
- [ ] Cycle through controlled kick-pickup, displaced-backbeat, and hi-hat-space variations; confirm the target grid changes and progress comparisons stay separated by variation.
- [ ] Filter compatible fills by sticking, orchestration, length, and difficulty; verify the displayed selection is the fill used in the round.
- [ ] Save two MIDI kit maps for one device, switch between them, and check that hi-hat pedal, open/closed hat, ride, and crash tags appear in the recap.
- [ ] Connect a MIDI kit and verify the input check identifies mapped and unmapped notes as pads are struck.
- [ ] Try accent/ghost, crescendo, and even-volume exercises with MIDI velocity and calibrated audio; confirm each target is visible and measured feedback is shown.
- [ ] Create similar audio templates, inspect the closest-match pair, recalibrate the suggested voice, and confirm recognition feedback changes.
- [ ] Set a pattern goal, complete passes at and below its BPM/accuracy thresholds, and confirm progress advances or resets correctly after reload.
- [ ] Start a retention remix after practicing multiple grooves and fills; verify it picks lower-confidence material and uses a reachable recent tempo.
- [ ] Add notes to a groove and a saved take, reload the Trainer, and confirm both notes remain attached to the right item.
- [ ] Browse style families from beginner through advanced patterns and confirm choosing a groove updates the active Trainer selection.

### Responsive and touch

- [ ] Use a physical phone in portrait and landscape; every pad is reachable and labeled.
- [ ] Open and close the mobile menu, navigate, and confirm it closes after selection.
- [ ] Verify no horizontal page scroll at 320, 375, 768, 1024, and 1440 CSS pixels.
- [ ] At 200% desktop zoom, transport, pattern selection, score, and every pad remain available.

### Accessibility

- [ ] Complete Home → Learn → Practice → Results using keyboard only.
- [ ] Confirm focus is visible against light and dark surfaces and never hidden behind sticky header.
- [ ] With VoiceOver, verify logo/brand, primary navigation, pattern selector, tempo, timeline, transport, pads, live rating, and result summary.
- [ ] Confirm count-in and hit results announce without repeatedly interrupting other content.
- [ ] Use grayscale/high-contrast inspection and confirm text communicates level, mode, rating, and completion.
- [ ] Enable reduced motion and verify all state transitions remain understandable.

### Persistence, privacy, and endurance

- [ ] Complete lessons at every level, reload, and confirm exact completion state.
- [ ] Finish multiple scores for one pattern and confirm only the highest personal best remains.
- [ ] Complete more than 50 scripted sessions and verify only the latest 50 remain.
- [ ] Corrupt the storage value, reload, and verify safe empty progress with no uncaught error.
- [ ] Inspect browser network and permissions: no analytics, API upload, microphone, camera, MIDI, or account traffic.
- [ ] Practice continuously for 30 minutes and check scheduler stability, memory growth, audio artifacts, and UI responsiveness.

## Release gate

Release only when `npm run qa:full` passes and approved visual snapshots are current. Critical manual failures block release; high failures require explicit triage; medium visual differences require baseline review rather than automatic acceptance.
