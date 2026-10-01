+# Drum Hero mobile use cases

This is the native mobile product contract. The iOS core release targets iOS/iPadOS 17+; later Android parity targets API 35+. Progress is local to each device. DHM identifiers are stable across platforms and are used in tests, defects, and recorded platform differences.

## iOS core release

| ID | Use case and expected behavior |
|---|---|
| DHM-001 | Launch offline with all lessons and bundled patterns available. Missing or invalid bundled content shows a useful recovery message. |
| DHM-002 | Navigate Home, Learn, Practice, Trainer, and Progress; persist selected tab, pattern, and tempo; returning to the app restores saved data but never restarts a running musical clock. |
| DHM-003 | See the next incomplete lesson and progress summary on Home; offer curriculum review when all lessons are complete. |
| DHM-004 | Use compact iPhone navigation and adaptive iPad layouts in portrait, landscape, and resized windows. |
| DHM-005 | Operate core flows with VoiceOver, hardware keyboard navigation, system text sizes, adequate contrast, visible focus, and non-color labels. |
| DHM-006 | Enable Reduce Motion while retaining understandable playhead, score, completion, and navigation state. |
| DHM-007 | Learn and use touch scoring without microphone, camera, MIDI, sign-in, or network permission prompts. |
| DHM-008 | On background, call, interruption, or route loss, stop output and pause. Require deliberate resume; never replay missed cues. |
| DHM-010 | Browse twelve lessons in curriculum order, grouped by beginner, intermediate, and advanced level. |
| DHM-011 | Filter lessons by level while retaining completion and checkpoint state. |
| DHM-012 | Read a lesson’s outcome, duration, goals, guided explanation, and ordered steps. |
| DHM-013 | Save a short personal checkpoint and restore it after navigating away or relaunching. |
| DHM-014 | Complete a lesson once and immediately see completion and updated progress. |
| DHM-015 | Repeat completion without duplicating records or inflating counts. |
| DHM-016 | View per-level and total lesson completion in Progress. |
| DHM-017 | Start a lesson’s linked playable pattern with the correct selection and context. |
| DHM-020 | Browse all bundled grooves and fills with level, meter, subdivision, tempo, and description. |
| DHM-021 | Search patterns by name/description and filter by level. |
| DHM-022 | Browse seven rudiments and inspect sticking, articulation cues, and coaching. |
| DHM-023 | Launch any groove, fill, or rudiment directly into Practice. |
| DHM-024 | Read the five kit voices and their web keyboard mappings. |
| DHM-025 | Read setup ergonomics, hearing protection, and stop-if-pain advice. |
| DHM-026 | Inspect targets, rests, voices, beat position, meter, and subdivision in a semantic grid. |
| DHM-027 | Operate large labeled touch pads for kick, snare, hi-hat, tom, and crash. |
| DHM-030 | Select a bundled pattern and a 40–200 BPM tempo; use its default initially. |
| DHM-031 | Change pattern or tempo before a round; cancel the old scheduler and begin cleanly. |
| DHM-032 | Start audio only after Start, play four count-in beats, then begin the pattern. |
| DHM-033 | Follow the subdivision playhead while target samples and count-in cues play. |
| DHM-034 | Mute sample output while visual timing and scoring continue. |
| DHM-035 | Pause a count-in or round and resume with target spacing preserved. |
| DHM-036 | Reset to idle, clear the score, stop audio, and retry the same configuration. |
| DHM-037 | Trigger any voice by touch; support concurrent touches when the device allows. |
| DHM-038 | Do not score input during idle, paused, count-in, or completed states. |
| DHM-039 | Finish once, resolve remaining targets as misses, show one result, and stay within phrase bounds. |
| DHM-040 | Match only an unmatched target for the same voice, choosing the closest eligible target within 100 ms. |
| DHM-041 | Rate ±50 ms as Great, over 50 through ±100 ms as Good, later unmatched targets as Miss, and unmatched taps as Extra. |
| DHM-042 | Show voice and signed timing offset; provide text feedback for misses and extras. |
| DHM-043 | Build combo on Great/Good, reset on Miss/Extra, and report maximum combo. |
| DHM-044 | Score Great=100, Good=70, Miss=0, Extra=−2; floor score at zero. Accuracy counts Great/Good over expected hits only. |
| DHM-050 | Configure a bundled Trainer pattern, self-rated or scored touch input, 4/8/10/16 repetitions, and a 1/2/4-beat count-in. |
| DHM-051 | In self-rated mode, rate each pass Clean, Needs work, or Missed before continuing; do not invent numeric accuracy. |
| DHM-052 | In scored mode, score the pattern over selected repetitions and save one recap. |
| DHM-053 | Pause/resume/reset safely; reset discards an unfinished round. |
| DHM-054 | Stop at the selected repetition count and save once; interrupted/reset rounds are not complete. |
| DHM-060 | See the earliest incomplete lesson and summary on Home. |
| DHM-061 | See level progress, session count, best score, and latest practice on Progress. |
| DHM-062 | Review recent scored sessions with pattern, tempo, date, score, accuracy, ratings, and combo. |
| DHM-063 | Preserve a pattern’s best score if a later score is lower. |
| DHM-064 | Persist lessons, checkpoints, preferences, sessions, and Trainer rounds locally; recover from invalid/interrupted storage. Keep at most 50 recent scored sessions and Trainer rounds. |
| DHM-070 | Pause safely when inactive and restore saved lesson/preferences on relaunch. |
| DHM-071 | Respond to audio interruption/route changes without stale cues; require explicit resume. |
| DHM-072 | Continue visual practice and scoring with a clear message if audio or samples fail. |
| DHM-073 | Complete 30 minutes of repeated practice without accumulated drift, cue backlog, duplicate result, or unbounded history. |

## Later iOS and Android parity

| ID | Deferred use case |
|---|---|
| DHM-100 | Create, accent, edit, save, select, and delete custom eighth/sixteenth-note grooves. |
| DHM-101 | Focus a loop on a selected beat or bar range. |
| DHM-102 | Practice groove-to-fill transitions with selected sticking and lead hand. |
| DHM-103 | Choose straight/swung/laid-back feel, sparse click, and hands/feet focus. |
| DHM-104 | Build routines with per-pattern tempo/repetitions and accuracy/timing gates; exchange setups. |
| DHM-105 | Use progressive tempo ladders and adaptive review from local weaknesses. |
| DHM-106 | View per-voice accuracy/timing, accent velocity, waveform overlays, and weak-spot drills. |
| DHM-110 | Connect keyboard/external controller, map inputs, and handle disconnect. |
| DHM-111 | Discover MIDI devices, configure note maps and latency correction. |
| DHM-112 | Inspect MIDI velocity and compare accented/unaccented targets. |
| DHM-113 | Calibrate timing against a click and retain per-device settings. |
| DHM-114 | Request microphone only when connecting audio; calibrate noise and samples; leave uncertain classification unscored. |
| DHM-120 | Create and organize songs, sections, parts, notes, and rehearsal metadata. |
| DHM-121 | Search/filter/favorite/archive/collect/queue/setlist songs and reorder entries. |
| DHM-122 | Launch a song section into practice and record section scores/readiness. |
| DHM-123 | Edit parts, accents, sticking, dynamics, arrangements, copies, and snapshots. |
| DHM-124 | Create and edit Song Builder projects, samples, mixes, templates, and arrangements. |
| DHM-125 | Validate supported Drum Hero/MIDI/project imports; reject malformed files atomically. |
| DHM-126 | Export notation, MIDI, MusicXML, PDF/image, WAV, song, and library formats. |
| DHM-130 | Record a deliberately started local take; inspect, play, export, and delete it and its metadata. |
| DHM-131 | Handle denied permission, interruption, storage failure, and incomplete recording. |
| DHM-140 | Convert existing web backups and exchange data with a restore/import preview. |
| DHM-141 | Encrypt/decrypt supported library backups; wrong passwords and invalid payloads preserve current data. |
| DHM-142 | Round-trip versioned files among web/iOS/Android with explicit unsupported/future-field handling. |
| DHM-150 | Explore interactive 3D kit with correct hit mapping and semantic fallback. |
| DHM-151 | Animate hits with reduced-motion handling and bounded device performance. |
| DHM-152 | Implement the same cases on Android 15/API 35+ with native Compose and accessibility. |
| DHM-153 | Share content identifiers and behavior/file fixtures across web/iOS/Android; record deviations by DHM ID. |
