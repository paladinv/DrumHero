# Localization and accessibility release audit

Drum Hero supports 24 interface locales. Translation catalogs and `dir` switching are implemented, but catalog presence is not proof of translation quality or layout behavior. The Play-Along stem controls have reviewed web copy in English, Spanish, French, German, and Brazilian Portuguese; other locales intentionally fall back to English for these new strings. The native iOS Song Library controls have localized string-catalog entries for all supported locales. The bundled song titles and descriptions remain English originals.

## Manual review matrix

| Area | Review | Status |
| --- | --- | --- |
| Web navigation and page titles | Check route announcements, translated titles, language switching, and back/forward navigation | Not signed off |
| Trainer and timing dialogs | Check input setup, calibration, permission, error, and result copy in each supported locale | Not signed off |
| Song Library and Play-Along | Review search, forms, stem labels, source/rights notes, import errors, storage removal, and export confirmations | Not signed off |
| RTL layouts | Check Arabic, Hebrew, Persian, and Urdu for navigation order, form alignment, chart direction, and overflowing controls | Not signed off |
| Keyboard access | Complete every form and playback action without a pointer; verify visible focus and logical focus order | Not signed off |
| Screen readers | Check VoiceOver on iOS and Safari, TalkBack on Android Chrome, and a desktop screen reader; verify labels, live status, audio controls, and custom canvases | Not signed off |
| Text scaling and motion | Increase text size, use 200% zoom, enable reduced motion, and check mobile touch targets | Not signed off |
| WebView/native shell | Check the iOS Song Library at every supported size and locale, including landscape and Dynamic Type | Not signed off |

Record the app build, device, OS, browser or assistive technology, locale, reviewer, and any issue reference. A machine check for missing keys can supplement this review; do not mark a locale complete until a fluent reviewer has checked the actual interface.
