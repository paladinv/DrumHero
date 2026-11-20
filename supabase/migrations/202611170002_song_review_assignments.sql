alter table public.drum_library_comments
  add column assignee_id uuid references auth.users(id) on delete set null,
  add column due_at timestamptz;

create index drum_library_comments_review_inbox
  on public.drum_library_comments(library_id, assignee_id, due_at)
  where parent_id is null;

drop policy if exists drum_library_comments_resolve on public.drum_library_comments;
create policy drum_library_comments_resolve on public.drum_library_comments
  for update to authenticated
  using (
    public.drum_library_role(library_id) is not null
    and (
      public.drum_library_role(library_id) in ('owner', 'editor')
      or author_id = (select auth.uid())
    )
  )
  with check (
    public.drum_library_role(library_id) is not null
    and (
      public.drum_library_role(library_id) in ('owner', 'editor')
      or author_id = (select auth.uid())
    )
  );

create or replace function public.guard_drum_library_comment_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if row(new.id, new.library_id, new.song_id, new.section_id, new.part_id, new.bar,
         new.body, new.author_id, new.author_label, new.arrangement_revision,
         new.created_at, new.parent_id)
     is distinct from
     row(old.id, old.library_id, old.song_id, old.section_id, old.part_id, old.bar,
         old.body, old.author_id, old.author_label, old.arrangement_revision,
         old.created_at, old.parent_id) then
    raise exception 'Only comment resolution and review assignment can be updated';
  end if;

  if (new.assignee_id is distinct from old.assignee_id or new.due_at is distinct from old.due_at)
     and (new.parent_id is not null or old.body not like 'DRUM_SONG_REVIEW_REQUEST_V1:%') then
    raise exception 'Only a root review request can receive an assignment or due date';
  end if;

  if new.assignee_id is not null and not exists (
    select 1
    from public.drum_libraries library
    where library.id = old.library_id
      and (
        library.owner_id = new.assignee_id
        or exists (
          select 1 from public.drum_library_members member
          where member.library_id = old.library_id and member.user_id = new.assignee_id
        )
      )
  ) then
    raise exception 'Review requests can only be assigned to a member of this shared library';
  end if;

  if (new.resolved_at is distinct from old.resolved_at or new.resolved_by is distinct from old.resolved_by)
     and coalesce(public.drum_library_role(old.library_id), '') not in ('owner', 'editor') then
    raise exception 'Only a snapshot owner or editor can resolve a review request';
  end if;
  if new.resolved_at is distinct from old.resolved_at and new.resolved_at is not null
     and new.resolved_by is distinct from (select auth.uid()) then
    raise exception 'Resolution actor must be the current user';
  end if;
  if new.resolved_by is not null and new.resolved_by is distinct from (select auth.uid()) then
    raise exception 'Resolution actor must be the current user';
  end if;
  return new;
end;
$$;

create or replace function public.validate_drum_library_comment_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.assignee_id is not null or new.due_at is not null)
     and (new.parent_id is not null or new.body not like 'DRUM_SONG_REVIEW_REQUEST_V1:%') then
    raise exception 'Only a root review request can receive an assignment or due date';
  end if;
  if new.assignee_id is not null and not exists (
    select 1
    from public.drum_libraries library
    where library.id = new.library_id
      and (
        library.owner_id = new.assignee_id
        or exists (
          select 1 from public.drum_library_members member
          where member.library_id = new.library_id and member.user_id = new.assignee_id
        )
      )
  ) then
    raise exception 'Review requests can only be assigned to a member of this shared library';
  end if;
  return new;
end;
$$;

create trigger drum_library_comment_assignment_guard
  before insert on public.drum_library_comments
  for each row execute function public.validate_drum_library_comment_assignment();

grant update (resolved_at, resolved_by, assignee_id, due_at)
  on public.drum_library_comments to authenticated;
