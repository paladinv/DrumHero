# Song Builder

Song Builder saves personal arrangements in the on-device Song Library. Use the Compose, Arrange, Rehearse, and Export workspaces to move between tasks.

## Composition

- The **First song guide** walks through creating a song, editing its grid, arranging sections, rehearsing, and exporting.
- Arrangement templates provide pop, verse/chorus, rock anthem, funk pocket, shuffle blues, twelve-bar blues, and AABA forms. Starters follow the song meter and seed each section with a matching editable groove when one is available.
- **Design a variation** provides density, complexity, and fill intensity controls. Generate and audition a preview, then insert an independent editable pattern. Source notes stay unchanged.
- The fill assistant offers meter-matched library fills, previews them between the surrounding patterns, and adapts a copied fill's density and ending to the next downbeat. One-measure fill, break, pickup, or crash transitions can also be appended at section boundaries; source patterns stay unchanged.
- Song Builder includes cowbell, shaker, tambourine, and up to eight custom lanes. Add or remove custom lanes per song, import a sample for each lane, set its mix, MIDI note, and staff position, and rename it; labels carry through the tab, accessible score, staff, and project backup.
- The percussion staff can edit notes as well as preview them. Enable staff editing, choose a voice, then click a measure at the desired time; the measure and grid-step controls provide keyboard-accessible editing.
- Reference cue lanes support chord symbols, lyric prompts, and band directions per measure. Cues repeat with their section and appear in playback, score annotations, and MIDI markers.
- Arrangement form ideas preview AABA, verse–chorus, and ABAC sequences before appending independent copies. Choose a straight, swing, or shuffle feel for the preview.
- Backing track matching offers pitch preservation and an arrangement beat-grid overlay. Tempo anchors still determine the timing map.
- Grid hits support accents, ghosts, velocity, sticking, flams, drags, buzz rolls, measured rolls, foot splashes, and cymbal chokes. Closed hi-hat strikes stop ringing open hats.
- The fill assistant ranks suggestions by bar length, note density, neighboring drum voices, and a crash on the next section's downbeat. It previews each suggestion in context before insertion.
- Saved recording takes can be auditioned as Take A and Take B. Choose a source pass for each captured measure to create a new comp take; both source takes remain unchanged.
- Grid zoom now also works in Touch focus, from compact cells to larger touch targets. While focus is outside an input, button, or grid cell, Space starts/pauses/resumes playback and period stops it. The playhead reports section, measure, and step to screen readers.
- The guided tasks walk through shaping a section transition and preparing a print-ready chart, opening each relevant Song Builder workspace as you go.

## Arrangement and rehearsal

The timeline offers zoom and collapsible clip lists. Select multiple clips in the section editor to copy, reorder, move between sections, or remove them. Removing a pattern explains how many linked clips it affects. **Undo history** can restore a prior arrangement; named versions and autosaves provide longer-term recovery.

Use **Edit clip repeat** to choose which pass to edit. Make any pass an independent variation while keeping the other repeats and source patterns intact. Arrangement-wide keyframes can shape overall or per-voice volume, pan, and velocity at measure boundaries; the curves continue across sections and repeats.

In Rehearse, set a measure range and enable Loop. Select a tempo increment, loops before each increase, and a target BPM. Playback shows the current tempo and loop. Save a **performance preset** to restore its tempo, mixer, playback options, count-in, loop range, and backing level later. Timing and velocity humanization are independent; **Preview feel before applying** auditions two measures with proposed swing and variation settings.

Mixer levels, panning, mute, solo, kit selection, notation layout, practice progression, and feel are remembered per song. Section automation can shape overall and cymbal volume, mute voices, and draw an independent volume curve for each voice. Backing audio follows the arrangement during playback, seeking, and looping. Its waveform lets you drag the first downbeat and tempo markers, or click to place the selected measure marker.

Saved kit presets can be auditioned A/B on the selected pattern without changing the active mix. Custom drum voices accept a primary sample plus an optional accent layer, selected at velocity 96 and above; the layer is included in project and device backups.

## Downloads and backups

- Import a MIDI arrangement through a preview that lets you rename the song, choose tracks, map each used pitch to a drum voice, and inspect tempo, meter, and note events. Imported tempo and meter changes take effect at the next measure boundary; time signatures outside the supported grid are rejected with an explanation. Export the full song or a section as PNG, PDF, MIDI, MusicXML, or WAV. MIDI can use one track per drum voice.
- Extract an individual drum voice; the notation preview follows the selected voice.
- WAV export can include a metronome and the aligned backing track. It supports arrangements up to eight minutes; longer arrangements can be exported in sections.
- **Aligned stems ZIP** exports the selected range as separate per-voice WAV files, with optional metronome and backing stems. The archive includes a MIDI tempo/meter map and readme. Stem archives support up to three minutes per export; choose a section for longer arrangements.
- **Complete project backup** embeds the song, selected custom drum samples, backing audio, recorded takes, saved recovery versions, and workspace settings. Import creates a new personal song and restores its local assets. Older project files remain supported.
- Project files are limited to 128 MB. Backing audio imports are limited to 60 MB, and selected custom drum samples to 24 MB combined. Export reports an error instead of silently omitting unavailable workspace data.

Everything remains local to the browser unless the user downloads or otherwise shares a file.

## Timeline, reuse, and preparation tools

- Drum playback schedules samples 120 ms ahead using the audio clock. Pause, stop, and seek cancel queued sources; short loops queue the next pass before the boundary.
- Drag the timeline start/end handles or use their arrow keys to select loop boundaries at sixteenth-measure precision. Numeric controls are in Rehearse. Boundaries are zero-based and the end is exclusive.
- Reference-track tempo anchors map measure starts to seconds from the backing track's first downbeat. Two or more anchors set interval tempos; the first and last intervals extend beyond their anchors. Supported mapped tempos are 40–200 BPM.
- Linked variations inherit a base groove within a section while retaining local added, changed, and removed notes. Detach, reset local changes, or explicitly promote a variation to the base. Changing a variation's grid detaches it. Updates that exceed the 256-note pattern limit are rejected.
- Copy an arrangement, a section, or selected clips to the local arrangement clipboard; switch songs and paste independent copies. Clip selections paste as a new section. Pattern links and repeat groups are remapped within copied material.
- Variation generation and phrase transforms show note-change previews. Playability hints identify excessive simultaneous hand strikes and conflicting hat states; dismissed exceptions are saved with the pattern. Alternating sticking can be suggested.
- Pattern filters cover meter, duration in source beats, subdivision, difficulty, drum voices, favorites, and recent insertions.
- Export preparation previews every page, supports Letter/A4 and portrait/landscape, and identifies crowded measures and long labels. Captions abbreviate to fit; MusicXML retains full annotations.
- Local storage inventory reports backing audio, takes, recovery sizes, and the shared browser quota estimate. Individual assets can be removed after confirmation. Backup reminders use the last completed project download.
- Beginner mode shows kick, snare, hi-hat, tom, and crash lanes with essential controls. Existing notes on other voices remain in the arrangement. Switch back with Show advanced tools.
- Live MIDI recording supports mapped drum voices and per-hit velocity. **Calibrate MIDI timing** estimates a correction from eight audible clicks and saves it with the song's builder settings; the manual latency field remains available for fine adjustments.
- Recorded takes can be previewed at a chosen quantization strength and velocity scale before applying them. Applying a take leaves the take itself available until it is deleted.
- Backing-track analysis estimates a steady BPM and first transient, then offers approximate kick, snare, and hi-hat suggestions for the selected pattern. The analysis runs locally and only considers the first three minutes; review and edit suggested notes because mixed audio can be misclassified.
- **Versions and recovery** can compare the current song with a saved snapshot by note changes and render both as A/B audio using the current kit settings.
- **Arrangement flow check** flags long silent runs, large hit-density changes between sections, and sharp tempo jumps for review. These prompts are advisory; intentional breaks and contrasts are valid.
- Song-specific practice presets retain their section, part, measure range, tempo, count-in, repetitions, and tempo ladder. Generic practice presets start from the whole song; performance presets restore the rehearsal range and playback setup saved with them.
- The cloud sync panel can show which members of a reviewed shared library are currently in the song and which section they selected. Presence is temporary and does not lock editing; simultaneous arrangement changes still use cloud revision conflict review. Editors can press **Sync now** to upload immediately; the panel shows whether reviewed device edits are pending.
- The arrangement timeline summarizes section duration, tempo ramps, meter changes, and per-voice hit density. Setlist performance can auto-play each entry with its configured count-in, while honoring any break that needs a manual ready action.
- Song Library sorting includes tempo, song duration, and recently edited order alongside tags, meter, saved searches, collections, and practice/review sorting.


## Reusable composition and sharing tools

Song Builder supports personal arrangement templates saved on the device, with independent copies inserted into later songs. Pattern sources can be previewed after fitting them to the selected section meter; the preview preserves the source groove and can be auditioned before insertion. Section and clip playback feel controls can override song-level swing and humanization.

The arrangement workspace includes bar-range A/B comparison and optional style-aware flow prompts for pop/rock, funk/hip-hop, jazz/blues, and metal/punk forms. These checks are advisory. Export presets save the notation view, page layout, scope, and PNG/PDF format. **Copy playback link** creates a read-only view with a synced notation cursor and built-in drum playback. The arrangement travels in the URL fragment; private notes, lyric cues, backing audio, and custom samples are excluded. Non-lyric rehearsal cues are retained.
