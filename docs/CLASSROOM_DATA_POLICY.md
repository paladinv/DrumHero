# Classroom report data and controls

Classroom progress reports are explicit JSON file transfers. They are separate from teacher assignment-roster sync and learner progress sync. Imported reports stay in the receiving browser's local storage; the app does not upload report files to an account.

## What a learner report contains

- Learner display name and local profile ID
- Export time and a report ID
- Completed lesson IDs
- Up to 100 recent standard scored practice summaries: record ID, pattern ID, tempo, accuracy, practice date, and whether the round came from Practice Pad or Trainer

Reports omit hit-by-hit timing, recordings, audio, settings, email addresses, and account credentials. Import requires a matching named learner profile or imported learner sync identity so work is not merged into the default shared-device profile.

## Sharing and local controls

- The learner or guardian must check the permission box before export. Exporting clears that page's consent checkbox; consent must be given again for the next export.
- Review the report contents with the learner or guardian before sharing the file. Anyone who receives the file can read its included name and practice summaries.
- Remove imported reports for a learner from the classroom overview. Removing a report also removes assignment completion evidence that came only from that report; local practice evidence remains.
- Deleting a named learner profile removes its local progress, Trainer history, assignments, and imported reports from this browser after confirmation.
- Imported files cannot be recalled from another person's device. Removing a local copy does not erase files already exported or transferred elsewhere.
- Teacher assignment-roster sync contains assignments, not learner progress reports. Learner progress sync is a separate, explicit account feature.

Before introducing account-backed class groups, define who owns the group, how learners or guardians consent, how long reports are retained, how access is revoked, and how already downloaded copies are handled.

**Current product boundary:** classroom reports remain explicit file transfers, and report files are not included in account sync. Account-backed class groups should not be added until the owner, consent, retention, revocation, and purge decisions above are documented and reviewed with educators and learners or guardians.
