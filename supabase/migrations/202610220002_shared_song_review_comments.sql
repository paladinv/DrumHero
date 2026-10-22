create table public.drum_library_comments (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.drum_libraries(id) on delete cascade,
  song_id text not null check (char_length(song_id) between 1 and 100),
  section_id text check (section_id is null or char_length(section_id) <= 100),
  part_id text check (part_id is null or char_length(part_id) <= 100),
  bar integer check (bar is null or bar between 1 and 20000),
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_label text not null check (char_length(author_label) between 1 and 80),
  arrangement_revision integer not null check (arrangement_revision >= 0),
  created_at timestamptz not null default now()
);

create index drum_library_comments_order on public.drum_library_comments(library_id, created_at);
alter table public.drum_library_comments enable row level security;

create policy drum_library_comments_read on public.drum_library_comments
  for select to authenticated
  using (public.drum_library_role(library_id) is not null);
create policy drum_library_comments_add on public.drum_library_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.drum_library_role(library_id) is not null
    and exists (
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
    )
  );
create policy drum_library_comments_remove on public.drum_library_comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.drum_library_role(library_id) = 'owner');

revoke all on public.drum_library_comments from public, anon;
grant select, insert, delete on public.drum_library_comments to authenticated;
