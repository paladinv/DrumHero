# Localization and accessibility release audit

Drum Hero supports 24 interface locales. Translation catalogs and `dir` switching are implemented, but catalog presence is not proof of translation quality or layout behavior. The Play-Along stem and package controls have reviewed web copy in English, Spanish, French, German, and Brazilian Portuguese. Starter-form strings now have translations in those same locales, pending fluent review; other locales intentionally fall back to English for these new strings. The guided-session, cross-mode progress, weekly-goal, Home review-queue, and learner-data-scope copy has draft Spanish, French, German, and Brazilian Portuguese values; those translations and layouts still need fluent review, and other supported locales use the English source. New native Song Library, backup, and Trainer input copy has draft values marked for review. Draft Spanish, French, German, and Brazilian Portuguese coverage now includes the guided Trainer entry, skill-path checkpoints, custom song-form controls, and score explanations; fluent review and accessibility checks remain open, and other supported locales use English fallback for this newer copy. The bundled song titles and descriptions remain English originals.

## Manual review matrix

| Area | Review | Status |
| --- | --- | --- |
| Web navigation and page titles | Check route announcements, translated titles, language switching, and back/forward navigation | Not signed off |
| Trainer and timing dialogs | Check input setup, calibration-confidence tiers, permission, error, and result copy in each supported locale; review guided entry actions, adaptive style-path tempo notes, skill focus filters, score reliability and next-step explanations, groove-to-fill controls, weak-bar replay, recap export, custom multi-bar form labels and dynamics, per-bar tables, song-form transition summaries, saved custom cue sequences, random / voice-drop / accent-shift cue announcements, the one-minute focused drill, recent audio-quality advice, synthesized backing controls, and groove-catalog filters | Not signed off |
| Guided session and progress map | Check timer pause/resume behavior, status announcements, goal controls, weekly date boundaries, and cross-mode evidence labels | Not signed off |
| Home review queue and next action | Confirm due song reviews, older lesson skills, and weak reliable Trainer patterns open the right activity; verify the recommendation updates when the active profile changes and the queue refreshes after returning from practice | Not signed off |
| Learner data scope | Switch profiles and confirm displayed progress counts change while shared songs, custom grooves, and audio remain visibly device-wide | Not signed off |
| Song Library and Play-Along | Review search, forms and starter arrangements, stem labels, source/rights notes, import errors, storage removal, and export confirmations | Not signed off |
| RTL layouts | Check Arabic, Hebrew, Persian, and Urdu for navigation order, form alignment, chart direction, and overflowing controls | Not signed off |
| Keyboard access | Complete every form and playback action without a pointer; verify visible focus and logical focus order | Not signed off |
| Screen readers | Check VoiceOver on iOS and Safari, TalkBack on Android Chrome, and a desktop screen reader; verify labels, live status, audio controls, and custom canvases | Not signed off |
| Text scaling and motion | Increase text size, use 200% zoom, enable reduced motion, and check mobile touch targets | Not signed off |
| WebView/native shell | Check iOS song creation, the five-voice pattern grid, song and progress backup import/export, MIDI and microphone setup, import errors, and Song Library at every supported size and locale, including landscape and Dynamic Type | Not signed off |

Record the app build, device, OS, browser or assistive technology, locale, reviewer, and any issue reference. A machine check for missing keys can supplement this review; do not mark a locale complete until a fluent reviewer has checked the actual interface.

Run `npm run locales:audit` to scan literal `t("…")` and `LocalizedText` keys in `app/` and `components/` against the generated catalogs and app-copy fallbacks. Use `npm run locales:audit -- --details` to inspect source-equal strings and `npm run locales:audit -- --json` to save a structured report. The scan skips dynamic translation expressions and cannot judge grammar, terminology, fit, screen-reader behavior, or layout. It is a coverage aid; human review remains required.
