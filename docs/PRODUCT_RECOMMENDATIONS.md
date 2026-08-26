# Product recommendations

The MVP deliberately proves one loop: learn a concept, practice a bounded pattern, receive timing feedback, and retain progress locally. The following improvements extend that loop in priority order.

## 1. Calibrated e-drum and MIDI input

Add opt-in Web MIDI mapping for electronic kits, a device test screen, velocity-aware dynamics, and per-device latency calibration. Keep keyboard/touch available. This turns Drum Hero into a meaningful full-kit trainer without unreliable microphone voice classification.

## 2. Latency calibration and microphone onset mode

Offer a tap-to-calibrate round-trip offset before any scored session. A later microphone mode should detect onsets—not claim to identify every drum—and clearly label confidence, ambient-noise limits, and local-only processing.

## 3. Adaptive daily practice

Use recent timing categories, tempo, misses, and inactivity to propose a short warm-up, one weak-skill exercise, and one musical groove. Explain every recommendation and let learners override it.

## 4. Rich notation and phrase editor

Add accessible staff/grid views, sticking and limb annotations, dynamics, tuplets, and a pattern builder with deterministic JSON import/export. Text alternatives must remain available for screen readers.

## 5. Offline-first PWA

Cache the shell and curriculum, provide an explicit offline state, and queue local progress safely. Version content independently from learner data and test upgrades from every supported schema.

## 6. Teacher assignments and local profiles

Support named on-device profiles, bounded assignment files, due dates, notes, and privacy-safe report export. Do not introduce cloud identity until there is a real cross-device need.

## 7. Optional cloud sync

If requested by learners, add explicit authentication, encrypted transport, data export/deletion, conflict handling, and opt-in sync. Keep a fully usable local mode.

## 8. Expanded curriculum and musicianship

Add genre packs, brush technique, double-kick development, reading studies, song-form practice, play-along tracks with documented rights, improvisation prompts, and fatigue-aware recovery sessions. Validate material with working educators and players at different body sizes and ability levels.

