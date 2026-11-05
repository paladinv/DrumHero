# Move learning work between web and iOS

Drum Hero uses explicit files for cross-platform transfer. Files are reviewed before import; progress transfers merge into the current learner profile and do not upload data.

## Learning progress and preferred tempo

On web, open **Progress → Back up or move your work → Move learning progress between web and iOS**. On iOS, open **Progress → Move learning progress between web and iOS**. Export a `drum-hero-progress-transfer-v1` JSON file on the source device, move it with Files, AirDrop, or another method you trust, then choose it on the destination device and review the counts before merging.

The transfer contains completed lesson IDs, up to 50 recent scored practice summaries, best scores, and preferred tempo. Web exports are capped at 50 summaries to match iOS. Web transfers also carry the active profile’s weekly goal and a saved guided session, with its timer paused at export. On web import, progress merges into the active learner profile, and the review lets you choose whether to replace that profile’s session and goal. iOS stores and displays these two optional fields, includes them when re-exporting, and can return them to web; the guided session itself resumes in the web app. Existing lesson completions and session history are kept; matching session IDs are updated. The destination retains at most 50 scored sessions. Web skips unknown lesson IDs and keeps unfamiliar pattern IDs as history labels so custom and older patterns are preserved. iOS imports only lesson and pattern IDs in its installed curriculum and reports skipped rows. Import changes the destination’s preferred tempo to the value in the reviewed file; web Practice and Trainer use that preference for subsequent sessions.

The transfer does not include recordings, microphone audio, MIDI or latency calibration, learner profiles, assessment answers, personal notes, Song Library attachments, or account credentials. It includes only completed lessons, scored practice summaries, and the optional guided-session and weekly-goal settings described above.

## Personal songs

For one personal song, export its Drum Hero song JSON from **Song Library** on either platform and import that file into the other platform’s Song Library. The shared format is `drum-hero-song-v1`.

To move several songs at once, use **Web–iOS transfer packs** on web or **Export all personal songs** on iOS. On web, choose individual songs or start from a collection, review the selected count, and prepare numbered packs split to stay under 200 songs and 32 MiB each. Download packs one at a time. If the selection includes unsupported iOS voices, map them to kick, snare, hi-hat, tom, or crash and preview remapped hits and same-step collisions before saving separate compatible song copies; source arrangements remain unchanged. The destination reviews each pack before saving: match by song ID first and then by normalized title and artist, and choose whether to add, replace, copy, or skip each match. iOS imports compatible songs from a mixed pack and lists songs it cannot read, including unsupported drum voices, so the rest can still be reviewed.

Song JSON and transfer packs contain arrangements, embedded song/section/part notes, and source attribution metadata. They do not include learner journals or annotations, practice history, goals, recorded takes, reference audio, or other attached files. Those remain local unless you include audio in a platform’s separate backup.

## Full backups and sync

Full backups are recovery files for the platform that created them. The web full backup can include browser settings, libraries, samples, and local audio. The iOS version 2 backup can include SwiftData progress and personal song projects, but no recordings. Do not use one platform’s full backup as the other platform’s restore file.

Web account sync is separate from these file transfers and does not currently sync native iOS progress. Keep a copy of important work before replacing or clearing local data. Transfer files contain private learning history; share them only with a destination you trust.

## Release checks

- Export a progress transfer from web and merge it on iOS; repeat from iOS to web.
- Confirm lesson completion, recognized scored sessions, best scores, and preferred tempo are present on the destination.
- Transfer an unfinished guided session and a weekly goal in both directions. Confirm the session arrives paused, the web destination can resume it, and the destination goal is only replaced after the import review is accepted.
- Import the same file twice and confirm it does not duplicate completed lessons or session IDs.
- Import a file with an unknown lesson or pattern ID and confirm the review reports skipped records while keeping existing data.
- Export a single song and a multi-song pack on each platform, then import them on the other; review matching choices, imported arrangements, and unsupported iOS voice warnings.
- Confirm full backups from one platform are rejected by the other platform’s full-backup importer without changing local data.

These checks are release procedures, not device sign-off. Record platform versions and observations in [device validation](DEVICE_VALIDATION.md).
