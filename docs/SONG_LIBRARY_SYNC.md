# Optional Song Library accounts, sync, and sharing

The local Song Library works without an account. The optional account panel uses Supabase Auth and Postgres with row level security. No secret/service-role key is used in the browser.

## Connect a project

1. Create or choose a Supabase project and enable email/password authentication. Keep email confirmation enabled.
2. Apply `supabase/migrations/202610190001_song_libraries.sql`, `supabase/migrations/202610190002_song_library_history.sql`, `supabase/migrations/202610210001_practice_snapshots.sql`, `supabase/migrations/202610210002_teacher_rosters.sql`, `supabase/migrations/202610210003_scoped_song_shares.sql`, `supabase/migrations/202610220001_song_builder_presence.sql`, and `supabase/migrations/202610220002_shared_song_review_comments.sql` through the Supabase SQL editor or your normal migration workflow.
3. Add the variables from `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. Use the public publishable key, never a service-role or secret key.
4. Restart the app (and rebuild when deploying). Open Song Library → Backup and account sync → Connect account.
5. Create/confirm an account and sign in. Create a cloud library from this device or review an existing library before applying it locally.

This repository supplies the integration and migration. It does not provision or configure a hosted Supabase project automatically.

## Song Builder collaboration

Song Builder can publish short-lived presence for a reviewed cloud library. Editors on the same song see each other’s names and current section; this is a coordination cue, not an exclusive lock. Apply `202610220001_song_builder_presence.sql` after the song library migration and enable Realtime private channels in the Supabase project. Presence stops when a tab closes or loses its connection. The arrangement still uses the library’s normal revision checks, so simultaneous edits can require conflict review.

## Behavior

- Connecting a library uploads song arrangements, collections, custom grooves, notes, plans, custom learning paths, rubric assessments, and practice progress. Recording audio and recording metadata remain on the current device. Use the encrypted Song Library backup (up to 96 MiB of audio) or the full-device local backup to transfer audio.
- Changes save locally first. Once enabled, sync runs while the Song Library page remains open (including when the account drawer is closed), debounces local edits and sends them with the last reviewed revision. Local edits made offline remain available after refresh. Reopening the library page asks you to review the cloud library before resuming uploads. Changes made in other tools are included in that review.
- Concurrent updates are rejected atomically by the database. Review conflicting song fields and arrangement sections before merging, or explicitly choose the entire cloud/device version. Mixed resolution preserves both sides’ additions and uses the chosen version for changed fields and sections. Same-ID collection, queue, setlist, learning path, and custom groove conflicts can keep the device copy, cloud copy, or both as separate records. A merge retains planning records with matching IDs and combines distinct records. Song deletions should be represented by archiving, which syncs normally.
- Cancel, pause, sign out, or changing libraries stops future uploads. An already submitted request can finish; its revision will be detected on the next review.
- Owners can grant viewer/editor access to an existing confirmed account by email and revoke it. Viewers can read a cloud library but cannot update it. Editors can update its contents but cannot grant permissions. Database checks enforce access even if a client is modified.
- The selected-song share panel creates a separate viewer-only snapshot from individually selected songs and an optional collection. It strips song, section, part, and kit private notes, journals, annotations, progress, plans, recordings, and reference audio. The recipient must have an existing confirmed account; the owner can grant or revoke viewer access. Recipients can copy selected arrangements into their local library. Scoped snapshots are separated from the regular sync list, and the database rejects editor access and editor writes to them. Owners can update a snapshot as a new revision. A recipient who downloaded a copy can review public metadata, kit setup, and arrangement changes, then apply selected updates; their local notes, practice history, and recordings stay on the device.
- Permission revocation blocks subsequent database access. It cannot remove a copy someone previously downloaded to their device.
- Members of a selected-song snapshot can add comments anchored to a song, section, part, and optional bar. Comments record the snapshot revision they refer to and are separate from private notes and practice data. Authors and snapshot owners can delete comments. Existing installations must apply `202610220002_shared_song_review_comments.sql` for this panel.
- Revision history retains the previous 20 cloud versions, including the device label supplied by the editor. Owners/editors can review a historical version and recover it as a new revision; viewers can inspect history. Device labels are user-supplied, not verified device identities.
- The account panel shows pending edits and cloud revisions. When a connection fails, local data remains available; review the cloud snapshot before retrying.

MIDI exchange accepts Standard MIDI format 0 or 1 percussion tracks on channel 10. Imports use the initial tempo and meter, clamp tempo to Drum Hero’s 40–200 BPM range with the source value shown, quantize to sixteenth notes, read at most 20,000 hits per track, and cap the arrangement at 128 bars; skipped events are reported for review. Exports map supported voices to General MIDI drum notes, preserve arrangement tempo and meter changes, and can include the full song or one section up to 4,096 bars. Custom voices without a General MIDI mapping are omitted.

Song Library usability observations can be recorded in the local drummer review form. Reviews remain in this browser and are excluded from sync and backups until someone explicitly exports the review JSON file. Reference playback speed is saved with local library metadata; audio stays local.

## Verify a configured project

Use separate owner, editor, and viewer accounts. Verify that the editor can save but cannot grant access; the viewer cannot save through the API; an unrelated account cannot list/read a library; and revoking access blocks subsequent API calls. Open two editors at the same revision and confirm the second write produces a conflict. Disconnect the network, edit locally, reload, reconnect, and review/merge before resuming sync. Also verify signup email delivery in the configured project.

The Progress page also has separate, opt-in sync for the active learner's lesson completion, Practice Pad scores, Trainer rounds, and input calibration. It uses the same Supabase account but stores a private per-learner snapshot with revision checks and up to 20 recoverable versions. Review cloud data before choosing cloud, device, or merged data. To sync a named learner across browsers, export **learner sync identity** in the shared-device tools on Progress and import it on the other device; this small file carries only the profile ID and display name. Teacher assignments can separately sync as a private account roster with revision checks and 20 prior versions; review the cloud roster before explicitly loading it, which replaces the local assignment list. Recording audio, reference audio, and their metadata stay local and are excluded from Song Library sync and sharing. Delete a cloud practice snapshot from the Progress page; deletion removes its revision history while local data remains.

For a teacher who should not receive the learner's account credentials, the shared-device tools also support a learner/guardian-approved progress report file. It contains the learner's name and profile ID, completed lesson IDs, and up to 100 recent standard scored practice summaries (pattern, source, tempo, accuracy, and date), with no hit-level timing, settings, audio, or recordings. Export requires an explicit permission checkbox. Import the learner sync identity first so the report matches the correct local profile. Importing reports combines distinct practice records, updates the classroom overview, and can satisfy matching assignments. Remove reports per learner from the classroom overview; this also reopens assignments completed only from the removed report, while local or manually recorded completion remains. Reports and their evidence IDs are excluded from teacher roster uploads and stay on the receiving device unless separately exported. This is an explicit file transfer, separate from private account sync and teacher roster sync.

The repository's unit/browser checks cover local workflows, change signatures, and conflict selection. Live Auth, email delivery, database policies, and device-specific audio behavior require a configured Supabase project and physical devices.

For the isolated browser conflict check, build with test-only public values, then run the mocked service flow:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://drum-library-test.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key npm run build
PLAYWRIGHT_CLOUD_MOCK=1 npx playwright test tests/e2e/song-cloud.spec.ts
npm run build
```

The test intercepts that endpoint locally. It verifies pending offline edits, revision conflicts, explicit merge review, retrying the reviewed revision, and excluding recording metadata from uploads. The last build restores the installation's normal configuration. Do not deploy the mock-account build.

References: [Supabase React Auth setup](https://supabase.com/docs/guides/getting-started/tutorials/with-react), [row level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth state events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

## Revision history migration

Existing installations must apply `202610190002_song_library_history.sql` after the initial migration. Each successful revision update keeps its previous state, timestamp, and editor-supplied device label. The database retains the previous 20 revisions per library. Opening history never restores automatically: review a revision, then apply it to create a new cloud revision using the latest expected revision. A concurrent write still produces a conflict. Viewers can read history but cannot save recovered data to the shared library.

## Offline interface

The production build generates `public/song-offline-assets.json`. The explicit offline download stores the main learning and practice page shells, static code, fonts, app manifest, built-in drum sounds, and 3D kit models in a service-worker cache. The Offline panel compares the saved asset version with the current build, estimates site storage, and flags low remaining quota. Song, recording, and learner data continue using localStorage/IndexedDB. The worker never caches account, database, or permission requests. Offline internal links reload the cached page shell so they do not depend on an online Server Component request. A failed update removes its incomplete cache while keeping the last completed download available. Removing the offline download does not remove songs or recordings. Refresh the download after a deployment; browsers may evict cached resources, so export backups for important material.

The WebKit offline browser check stops an isolated local origin rather than using Playwright's broken offline emulation for service-worker navigations ([upstream issue](https://github.com/microsoft/playwright/issues/42775)). Chromium also passed a direct offline-emulation refresh check during development.
