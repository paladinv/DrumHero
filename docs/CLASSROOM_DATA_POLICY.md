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
- Teacher assignment-roster sync contains assignments, not learner progress reports. Learner progress sync is a separate, explicit account feature; it can include that learner's ear-training history, review schedule, and personal challenge packs, but it never includes teacher report files.

## Account-backed classroom groups

The opt-in classroom workflow is in `components/TeacherClassroomGroups.tsx`; it requires an authenticated Supabase account and the migration `supabase/migrations/202611170005_classroom_groups.sql`. The migration must be applied to the deployed Supabase project before the account-backed controls work. A classroom is owned by the account that created it. Invite codes are random 64-bit values, stored as SHA-256 hashes, expire after 90 days, and are shown only when created or rotated. Rotating an invite revokes the previous code.

Class members share only the classroom name, assignment title/activity/instructions/due date, learner display name, and a completion timestamp with an optional note of up to 500 characters. The app does not send practice scores, lesson history, local learner-profile IDs, recordings, or audio through classroom tables. Learners explicitly confirm permission before joining; the database stores the confirmation time. This checkbox cannot establish a learner's age or verify parental/guardian permission.

Members can leave at any time. Teachers can remove members. Leaving or removal deletes that member's classroom submissions; deleting a classroom removes its members, assignments, invites, and submissions. A classroom is retained until its owner or a database administrator deletes it. Already copied invite codes, screenshots, or information outside the app cannot be recalled. Teachers and learners should use display names appropriate for their setting and avoid sensitive details in assignment notes.

The feature uses row-level security so classroom owners and members can read their classroom and assignments, members can read only their own membership row, owners can see member names and submissions, and learners can create or edit only their own submissions. Invite hashes are not readable by app accounts. Review this policy with educators and learners or guardians, and apply the migration before enabling account-backed groups in production.

File-based learner progress reports remain separate. They require explicit learner/guardian permission, stay local after import, and contain lesson and scored practice summaries. Imported reports can be removed locally, but exported files cannot be recalled from another device. Private per-learner progress sync also remains separate from classroom membership and submissions.
