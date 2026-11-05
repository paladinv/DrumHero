alter table public.drum_library_comments
  add column parent_id uuid references public.drum_library_comments(id) on delete cascade,
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users(id) on delete set null,
  add constraint drum_library_comments_resolution_actor_check
    check (resolved_at is not null or resolved_by is null);

create index drum_library_comments_thread on public.drum_library_comments(library_id, parent_id, created_at);

drop policy if exists drum_library_comments_add on public.drum_library_comments;
create policy drum_library_comments_add on public.drum_library_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.drum_library_role(library_id) is not null
    and (
      (parent_id is null and exists (
        select 1
        from public.drum_libraries l
        where l.id = public.drum_library_comments.library_id
          and l.share_scope
          and l.revision = public.drum_library_comments.arrangement_revision
          and exists (
            select 1
            from jsonb_array_elements(l.state->'songs') as shared_song(value)
            where shared_song.value->>'id' = public.drum_library_comments.song_id
          )
      ))
      or (parent_id is not null and exists (
        select 1
        from public.drum_library_comments parent
        where parent.id = public.drum_library_comments.parent_id
          and parent.parent_id is null
          and parent.library_id = public.drum_library_comments.library_id
          and parent.song_id = public.drum_library_comments.song_id
          and parent.arrangement_revision = public.drum_library_comments.arrangement_revision
      ))
    )
  );

create policy drum_library_comments_resolve on public.drum_library_comments
  for update to authenticated
  using (public.drum_library_role(library_id) in ('owner', 'editor'))
  with check (public.drum_library_role(library_id) in ('owner', 'editor'));

create or replace function public.guard_drum_library_comment_resolution()
returns trigger
language plpgsql
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
    raise exception 'Only comment resolution can be updated';
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

create trigger drum_library_comment_resolution_guard
  before update on public.drum_library_comments
  for each row execute function public.guard_drum_library_comment_resolution();

grant update (resolved_at, resolved_by) on public.drum_library_comments to authenticated;
