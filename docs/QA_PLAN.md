# Drum Hero QA plan and traceability

## Quality objective

Prove that Drum Hero teaches and scores usable drum-practice flows in a real browser—not merely that TypeScript compiles. A release requires unit, production-build, browser acceptance, accessibility, responsive, visual, and targeted manual checks.

## Automated suites

| Suite | Coverage | Use cases | Severity |
| --- | --- | --- | --- |
| `tests/unit/scoring.test.ts` | Timing boundaries, scheduler math, instrument matching, score/accuracy/combo | UC-43–52 | Critical |
| `tests/unit/curriculum.test.ts` | Unique IDs, tempo bounds, hit bounds, lesson levels and references | UC-10, 17, 20, 64 | High |
| `tests/unit/progress.test.ts` | Defaults, corruption, bounds, session history, bests, dates, streak, recommendation | UC-03, 14–15, 70–79 | Critical |
| `tests/e2e/navigation.spec.ts` | Route content, direct links, menu, console health | UC-01–07, 98–99 | Critical |
| `tests/e2e/learning.spec.ts` | Filtering, completion, persistence, pattern handoff | UC-10–16, 70–71 | High |
| `tests/e2e/practice.spec.ts` | Start/count-in, sample loading, recorded pad/keyboard cues, pause/resume/reset, configuration, result recording | UC-20–31, 40–52, 72–74, 97 | Critical |
| `tests/e2e/accessibility.spec.ts` | axe scan, keyboard menu, landmarks, status, reduced motion, mobile controls | UC-90–96 | High |
| `tests/e2e/visual.spec.ts` | Stable dashboard, curriculum, practice, results, and mobile menu snapshots | UC-05, 07, 25, 52, 95–96 | Medium |

## Browser and viewport matrix

| Target | Automated scope | Manual scope |
| --- | --- | --- |
| Chromium desktop, 1280×720 | Full functional, accessibility, visual | Chrome latest, audio and latency feel |
| WebKit desktop | Full functional except Chromium-only screenshots | Safari latest, audio and fullscreen behavior |
| Mobile Chromium, iPhone 13 profile | Responsive navigation and touch controls | Physical iOS/Android touch ergonomics |
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

Release only when lint, typecheck, unit tests, production build, Chromium/WebKit functional tests, accessibility scan, and approved visual snapshots pass. Critical manual failures block release; high failures require explicit triage; medium visual differences require baseline review rather than automatic acceptance.
