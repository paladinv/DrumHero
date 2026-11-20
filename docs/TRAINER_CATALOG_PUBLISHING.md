# Trainer catalog publishing

Trainer includes two separate review paths. The local educator panel is useful for collecting observations on one device. Its self-entered roles and approvals do not publish content. The authenticated catalog workflow stores versioned drafts and review decisions in Supabase.

## Enable the catalog

1. Apply `supabase/migrations/202611170004_trainer_catalog_publishing.sql` to the project configured for Drum Hero.
2. Sign in to Drum Hero with each approved editorial account so its `auth.users` row exists.
3. As a trusted Supabase database administrator, add each approved account to `public.drum_trainer_editorial_members` with a `reviewer`, `editor`, or `admin` role. The client has no insert or update permission on this table.
4. Sign in with the same account in Drum Hero and open **Authenticated catalog publishing** in Trainer.

For example, the provisioning operation is an admin-only insert using the reviewed account UUID:

```sql
insert into public.drum_trainer_editorial_members (user_id, role)
values ('REVIEWED-AUTH-USER-UUID', 'reviewer')
on conflict (user_id) do update set role = excluded.role;
```

Do not put a service-role key in the browser or app. Keep editorial membership changes in a trusted admin workflow.

## Review and publish

- A member submits the score currently shown with source attribution, an optional source URL, and rights or licence details.
- The server fingerprints the normalized score JSON and stores each distinct score as a revision. Review decisions refer to that revision hash.
- A different authenticated reviewer can approve the revision or request changes. The submitter cannot review their own revision.
- An editor or admin can publish only after two distinct reviewers approve that exact revision. Database functions enforce the rule; disabling a button in the interface is not the security boundary.
- Published rows contain score content and its source/rights metadata. Drafts, revision history, and review notes remain limited to editorial members.

If the account has no assigned role, local reviews remain available and the cloud panel explains that an administrator must provision access. If the Supabase migration is not applied, publishing actions return a cloud configuration error and no local approval is promoted to a published entry.
