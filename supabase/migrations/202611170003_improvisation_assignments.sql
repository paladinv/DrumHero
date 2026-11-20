-- Shared improvisation plans and optional, summary-only learner submissions.
-- Raw hits, audio, device details, and calibration data are not stored here.
create table public.drum_improvisation_assignments (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.drum_libraries(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  assignment jsonb not null check (jsonb_typeof(assignment) = 'object' and octet_length(assignment::text) <= 1048576),
  created_at timestamptz not null default now()
);

create index drum_improvisation_assignments_library
  on public.drum_improvisation_assignments(library_id, created_at desc);

create table public.drum_improvisation_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.drum_improvisation_assignments(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  learner_label text not null check (char_length(learner_label) between 1 and 48),
  summary jsonb not null check (jsonb_typeof(summary) = 'object' and summary->>'version' = '1' and octet_length(summary::text) <= 32768),
  created_at timestamptz not null default now()
);

create index drum_improvisation_submissions_assignment
  on public.drum_improvisation_submissions(assignment_id, created_at desc);

alter table public.drum_improvisation_assignments enable row level security;
alter table public.drum_improvisation_submissions enable row level security;

create policy drum_improvisation_assignments_read
  on public.drum_improvisation_assignments for select to authenticated
  using (public.drum_library_role(library_id) is not null);

create policy drum_improvisation_assignments_publish
  on public.drum_improvisation_assignments for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and public.drum_library_role(library_id) in ('owner', 'editor')
  );

create policy drum_improvisation_assignments_delete
  on public.drum_improvisation_assignments for delete to authenticated
  using (public.drum_library_role(library_id) in ('owner', 'editor'));

create policy drum_improvisation_submissions_read
  on public.drum_improvisation_submissions for select to authenticated
  using (
    learner_id = (select auth.uid())
    or exists (
      select 1 from public.drum_improvisation_assignments assignment
      where assignment.id = assignment_id
        and public.drum_library_role(assignment.library_id) in ('owner', 'editor')
    )
  );

create policy drum_improvisation_submissions_create
  on public.drum_improvisation_submissions for insert to authenticated
  with check (
    learner_id = (select auth.uid())
    and exists (
      select 1 from public.drum_improvisation_assignments assignment
      where assignment.id = assignment_id
        and public.drum_library_role(assignment.library_id) is not null
    )
  );

create policy drum_improvisation_submissions_delete
  on public.drum_improvisation_submissions for delete to authenticated
  using (
    learner_id = (select auth.uid())
    or exists (
      select 1 from public.drum_improvisation_assignments assignment
      where assignment.id = assignment_id
        and public.drum_library_role(assignment.library_id) in ('owner', 'editor')
    )
  );

revoke all on public.drum_improvisation_assignments, public.drum_improvisation_submissions from anon;
revoke all on public.drum_improvisation_assignments, public.drum_improvisation_submissions from authenticated;
grant select, insert, delete on public.drum_improvisation_assignments to authenticated;
grant select, insert, delete on public.drum_improvisation_submissions to authenticated;
