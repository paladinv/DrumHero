-- Teacher comments attach to summary-only improvisation submissions.
-- No note streams, microphone audio, or device metadata are stored.
create unique index drum_improvisation_submissions_id_assignment
  on public.drum_improvisation_submissions(id, assignment_id);

create table public.drum_improvisation_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.drum_improvisation_submissions(id) on delete cascade,
  assignment_id uuid not null references public.drum_improvisation_assignments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  phrase_index integer check (phrase_index is null or phrase_index between 1 and 1000),
  bar_index integer check (bar_index is null or bar_index between 1 and 32),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint drum_improvisation_feedback_submission_assignment
    foreign key (submission_id, assignment_id)
    references public.drum_improvisation_submissions(id, assignment_id)
    on delete cascade
);

create index drum_improvisation_feedback_submission
  on public.drum_improvisation_feedback(submission_id, created_at);

alter table public.drum_improvisation_feedback enable row level security;

create policy drum_improvisation_feedback_read
  on public.drum_improvisation_feedback for select to authenticated
  using (
    exists (
      select 1 from public.drum_improvisation_submissions submission
      where submission.id = submission_id and submission.learner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.drum_improvisation_submissions submission
      join public.drum_improvisation_assignments assignment on assignment.id = submission.assignment_id
      where submission.id = submission_id
        and assignment.id = drum_improvisation_feedback.assignment_id
        and public.drum_library_role(assignment.library_id) in ('owner', 'editor')
    )
  );

create policy drum_improvisation_feedback_create
  on public.drum_improvisation_feedback for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.drum_improvisation_submissions submission
      join public.drum_improvisation_assignments assignment on assignment.id = submission.assignment_id
      where submission.id = submission_id
        and assignment.id = drum_improvisation_feedback.assignment_id
        and public.drum_library_role(assignment.library_id) in ('owner', 'editor')
    )
  );

create policy drum_improvisation_feedback_delete
  on public.drum_improvisation_feedback for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.drum_improvisation_assignments assignment
      where assignment.id = drum_improvisation_feedback.assignment_id
        and public.drum_library_role(assignment.library_id) in ('owner', 'editor')
    )
  );

revoke all on public.drum_improvisation_feedback from anon, authenticated;
grant select, insert, delete on public.drum_improvisation_feedback to authenticated;
