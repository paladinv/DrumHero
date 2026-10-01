# Product recommendations

The first roadmap is stale: MIDI mapping and per-device latency calibration, local audio input, a song phrase editor, guided Trainer paths, and audio dynamics calibration are already in the app. This list reflects the current product and separates shipped work from the next larger investments.

## Current product baseline

- Guided lesson notes, saved practice checkpoints, and links into the relevant kit or practice tool.
- An editable 12-minute practice plan that uses recent Trainer results and due song-section reviews.
- A first-session path for keyboard/touch and electronic-kit users, with related tools grouped in navigation.
- Full local backup and restore for browser settings and progress, songs, custom grooves, custom drum samples, and recorded song takes.
- A generated bass pulse for 4/4 Practice Pad patterns, alongside Trainer swing, laid-back timing, limb focus, and sparse metronome options.

## Next priorities

1. **Offline-first PWA:** Cache the app shell and learning material, show when content is available offline, and version app assets independently from learner data. Test upgrades while preserving local progress.
2. **Teacher assignments and local profiles:** Support bounded assignment files, due dates, feedback, and report export for more than one learner on a shared device. Keep profiles local by default.
3. **Full ensemble play-alongs:** Add original or licensed tracks with documented rights, adjustable mix, and options to remove the click or selected instruments. Keep the generated bass pulse as a lightweight practice option.
4. **Expanded musicianship:** Add brush technique, double-kick development, reading studies, improvisation prompts, and fatigue-aware recovery sessions. Validate instruction with working educators and players with different body sizes and abilities.
5. **Optional cloud sync:** Add only when learners need cross-device continuity. Include explicit opt-in, authenticated transport, conflict review, export and deletion, and a fully usable local mode.

## Product constraints

- Progress and private practice recordings remain local unless a learner explicitly exports them.
- Audio input stays on-device. Timing-only scoring remains available when voice classification is uncertain.
- Any play-along material must have documented rights and clear attribution.
