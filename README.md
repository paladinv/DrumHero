# Drum Hero

Drum Hero is a focused drum-learning studio for the browser. It combines a curated beginner-to-advanced curriculum with a playable timing trainer, rudiments, grooves, kit guidance, and private local progress.

## Highlights

- Twelve guided lessons across beginner, intermediate, and advanced levels
- Five-voice keyboard and touch kit: Kick (`Space`), Snare (`F`), Hi-hat (`J`), Tom (`K`), Crash (`L`)
- Four-count, 40–200 BPM playback, pause/resume/reset, and visible subdivision playhead
- Deterministic Great/Good/Miss/Extra scoring with early/late offsets and combo tracking
- Synthesized Web Audio cues; no downloaded or licensed samples
- Versioned browser-local progress with no login, upload, microphone, backend, or analytics
- Responsive, reduced-motion-aware interface with keyboard and screen-reader support
- Vitest unit coverage plus Playwright functional, accessibility, responsive, and visual QA

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:visual
npm run qa
```

Playwright expects its Chromium and WebKit browsers to be installed. Run `npx playwright install chromium webkit` if needed. All generated browser artifacts are kept under `output/playwright/`.

## Product contract

- [Use cases](docs/USE_CASES.md)
- [QA plan and traceability](docs/QA_PLAN.md)
- [Product recommendations](docs/PRODUCT_RECOMMENDATIONS.md)

## Scoring

- **Great:** within 50 ms of the expected hit
- **Good:** within 100 ms
- **Miss:** more than 100 ms late or never played
- **Extra:** no matching target within 100 ms

The score averages 100 points for Great and 70 for Good across expected hits, then deducts two points per extra hit. Hardware, browser, display, and audio latency can influence perceived timing.

## Privacy and safety

Drum Hero stores settings, lesson completion, and up to 50 recent sessions in `localStorage`. It does not request microphone access or send data anywhere. Acoustic drums can damage hearing; use suitable hearing protection and stop if playing causes pain or numbness.

