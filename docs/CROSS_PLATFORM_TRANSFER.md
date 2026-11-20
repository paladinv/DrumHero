# Cross-platform transfer and sync

Drum Hero provides a portable learning archive, optional account sync, and a separate coach-review exchange. Each path has a different purpose and includes a review step before imported data is applied.

## Learning archive

Web, native iOS, and Android use the JSON format `drum-hero-learning-archive-v1`. Web, iOS, and Android continue to accept the legacy `drum-hero-progress-transfer-v1` progress-only file. The maximum file size is 32 MB.

The archive can contain:

- Completed lesson IDs and completion dates
- Up to 50 scored Practice Pad sessions, best scores, and preferred tempo
- Up to 50 Trainer round summaries, with optional detailed per-hit timing (up to 600 hits per round), plus the personal routine, saved cue sequences, and coach feedback text
- Up to 100 optional ear-training results
- A paused guided session and the active profile's weekly goal
- Up to 200 personal Song Library songs
- Up to 100 custom grooves

Web lets learners include or omit ear-training history and detailed Trainer timing, and choose whether those fields are merged on import. iOS preserves imported ear-training results and per-hit timing for re-export while importing the Trainer summaries it supports. Android merges its lesson and Practice Pad records and retains the optional ear-training, Trainer, song, groove, guided-session, and weekly-goal fields for a later web or iOS export; it does not interpret those Android-unsupported records. Matching session and Trainer round IDs are updated; matching song and groove IDs keep the copy already on the destination. A supplied routine replaces the personal routine, cue sequences merge by ID, preferred tempo is applied, and the optional guided session and weekly goal replace their destination copies only when included in the archive. Unknown lesson or pattern IDs are skipped with a review summary. iOS also names and skips personal songs it cannot decode or play with its supported voices; it preserves custom-groove JSON fields while loading playable patterns into the native Trainer and Practice screen.

The archive contains no audio recordings, reference tracks, samples, device calibration, or account credentials. Full recovery backups remain platform-specific. Use the platform backup on the Progress page to preserve platform-local data.

## Optional account sync

The web and iOS Progress screens can sync the same learner profile through the existing Supabase practice snapshot table. Separately, iOS Song Library can explicitly append compatible songs to or import missing songs from an editable web library; see [Song Library account exchange](SONG_LIBRARY_SYNC.md#ios-song-library-account-exchange). The learner must sign in with the same account and use the same profile code. Sync is manual: review the cloud revision, then merge it locally or merge local and cloud progress and upload that result with revision conflict protection. Trainer summaries, the personal routine, saved cue sequences, and coach feedback text now merge across platforms. Device profiles, MIDI maps, latency calibration, per-hit timing, and audio remain local; older snapshots are sanitized when loaded and are not re-uploaded in that form.

On iOS, set `DRUM_HERO_SUPABASE_URL` and `DRUM_HERO_SUPABASE_PUBLISHABLE_KEY` in the Xcode build environment and apply migration `202610210001_practice_snapshots.sql`. The key is the public Supabase publishable key; authorization is enforced by the signed-in user and database policies. Create the account through the web sign-in flow if needed.

The native iOS sync uploads lesson completions, Practice Pad sessions, Trainer round summaries, best scores, preferred tempo, and the portable Trainer assets described above. It does not upload local audio, hit timing, or device calibration. Use the learning archive when you want to move the same portable data by file instead of through the signed-in snapshot. Account sync is not a substitute for a learning archive or local recovery backup.

## Trainer catalog publishing

The authenticated editorial catalog uses `supabase/migrations/202611170004_trainer_catalog_publishing.sql`. It keeps submitted revisions and reviews private to signed-in editorial members, exposes only published catalog rows, requires source attribution and rights metadata, blocks authors from reviewing their own revision, and requires two independent approvals plus an editor or admin publish action. Assign `reviewer`, `editor`, or `admin` membership directly through a trusted Supabase admin session; the app has no self-service role assignment. See `docs/TRAINER_CATALOG_PUBLISHING.md` before enabling the workflow.

## Coach take review

From a saved web Trainer take, choose **Export for coach**. That file includes the selected recording and timing markers, so it leaves the device only when the learner shares it. A coach opens the file locally, adds timestamped comments, and exports a feedback JSON without audio. The learner imports the response to attach the comments to the matching saved take and can jump the recording to each note. No account upload is involved.

## Local reminders and Android

iOS practice reminders are repeating local notifications. Their schedule stays on the device and does not include practice history or profile data.

The Android Compose app reuses shared lessons, grooves, notation cues, and drum sounds for offline Learn and score-led Practice. It stores lesson and practice history in SQLite, supports reviewed archive import/export, and accepts General MIDI USB/Bluetooth drum input with per-port timing calibration. Account sync, microphone scoring, reminders, Song Library workflows, and full feature parity remain planned. Physical MIDI validation is still required.
