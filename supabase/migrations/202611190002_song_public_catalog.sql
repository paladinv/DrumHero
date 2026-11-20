-- Authenticated learners may submit a rights-attested arrangement. Only a separate,
-- explicitly provisioned reviewer can publish it to the public read surface.
create table public.drum_song_catalog_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

create table public.drum_song_catalog (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist text not null check (char_length(artist) between 1 and 120),
  attribution text not null check (char_length(attribution) between 1 and 500),
  license text not null check (char_length(license) between 1 and 500),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  state jsonb not null check (
    jsonb_typeof(state) = 'object'
    and state->>'format' = 'drum-hero-public-song-v1'
    and state->>'version' = '1'
    and jsonb_typeof(state->'song') = 'object'
    and octet_length(state::text) <= 1048576
  ),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  rights_attested_at timestamptz not null,
  moderation_note text,
  moderator_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  moderated_at timestamptz
);

create index drum_song_catalog_public_title on public.drum_song_catalog (lower(title), lower(artist)) where status = 'published';
create index drum_song_catalog_author on public.drum_song_catalog (author_id, created_at desc);
alter table public.drum_song_catalog_reviewers enable row level security;
alter table public.drum_song_catalog enable row level security;

create function public.drum_song_catalog_is_reviewer()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drum_song_catalog_reviewers reviewer
    where reviewer.user_id = (select auth.uid())
  );
$$;
revoke all on function public.drum_song_catalog_is_reviewer() from public;
grant execute on function public.drum_song_catalog_is_reviewer() to anon, authenticated;

create policy drum_song_catalog_reviewer_read_self
  on public.drum_song_catalog_reviewers for select to authenticated
  using (user_id = (select auth.uid()));

create policy drum_song_catalog_visible_rows
  on public.drum_song_catalog for select to anon, authenticated
  using (
    status = 'published'
    or author_id = (select auth.uid())
    or public.drum_song_catalog_is_reviewer()
  );

revoke all on public.drum_song_catalog_reviewers, public.drum_song_catalog from anon, authenticated;
grant select on public.drum_song_catalog_reviewers to authenticated;
grant select (id, author_id, title, artist, attribution, license, source_url, state, status, moderation_note, created_at)
  on public.drum_song_catalog to authenticated;

create view public.drum_song_catalog_public
with (security_barrier = true) as
  select id, title, artist, attribution, license, source_url, state, created_at
  from public.drum_song_catalog
  where status = 'published';
revoke all on public.drum_song_catalog_public from public;
grant select on public.drum_song_catalog_public to anon, authenticated;

create function public.submit_drum_song_catalog(
  p_title text,
  p_artist text,
  p_attribution text,
  p_license text,
  p_source_url text,
  p_state jsonb,
  p_rights_attested boolean
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare submission_id uuid;
  safe_song jsonb;
  safe_state jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to submit an arrangement.' using errcode = '42501';
  end if;
  if p_rights_attested is distinct from true then
    raise exception 'A rights attestation is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_artist, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_attribution, ''))) not between 1 and 500
     or char_length(btrim(coalesce(p_license, ''))) not between 1 and 500
     or (p_source_url is not null and (char_length(p_source_url) > 2000 or p_source_url !~ '^https?://'))
     or coalesce(jsonb_typeof(p_state), '') <> 'object'
     or p_state->>'format' <> 'drum-hero-public-song-v1'
     or p_state->>'version' <> '1'
     or coalesce(jsonb_typeof(p_state->'song'), '') <> 'object'
     or coalesce(jsonb_typeof(p_state->'song'->'sections'), '') <> 'array'
     or jsonb_array_length(p_state->'song'->'sections') not between 1 and 64
     or octet_length(p_state::text) > 1048576 then
    raise exception 'The title, attribution, license, and validated song are required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_state->'song'->'sections') section(value)
    where coalesce(jsonb_typeof(section.value), '') <> 'object'
       or coalesce(jsonb_typeof(section.value->'parts'), '') <> 'array'
       or exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(section.value->'parts') = 'array' then section.value->'parts' else '[]'::jsonb end) part(value)
         where coalesce(jsonb_typeof(part.value), '') <> 'object'
       )
  ) then
    raise exception 'Each song section must contain a valid parts array.' using errcode = '22023';
  end if;

  -- Sanitize again in the database so direct RPC callers cannot publish personal
  -- notes, review metadata, source permissions, original MusicXML, or kit profile IDs.
  safe_song := (p_state->'song') - 'notes' - 'rightsReview' - 'catalogReview' - 'sharedOrigin';
  safe_song := jsonb_set(safe_song, '{source}', jsonb_build_object(
    'url', nullif(btrim(p_source_url), ''), 'title', btrim(p_attribution),
    'attribution', btrim(p_attribution), 'authorization', ''
  ), true);
  if jsonb_typeof(safe_song->'musicXmlSource') = 'object' then
    safe_song := jsonb_set(safe_song, '{musicXmlSource}', (safe_song->'musicXmlSource') - 'originalXml', true);
  else
    safe_song := safe_song - 'musicXmlSource';
  end if;
  if jsonb_typeof(safe_song->'kitSetup') = 'object' then
    safe_song := jsonb_set(safe_song, '{kitSetup}', (safe_song->'kitSetup' - 'notes' - 'profileId') || jsonb_build_object('notes', ''), true);
  else
    safe_song := safe_song - 'kitSetup';
  end if;
  safe_song := jsonb_set(safe_song, '{sections}', (
    select coalesce(jsonb_agg(
      (section.value - 'notes' - 'rehearsalCues' - 'reviewComments') || jsonb_build_object(
        'parts', coalesce((
          select jsonb_agg(part.value - 'notes' order by part.ordinality)
          from jsonb_array_elements(section.value->'parts') with ordinality as part(value, ordinality)
        ), '[]'::jsonb)
      ) order by section.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(safe_song->'sections') with ordinality as section(value, ordinality)
  ), true);
  safe_state := jsonb_build_object('format', 'drum-hero-public-song-v1', 'version', 1, 'song', safe_song);
  if octet_length(safe_state::text) > 1048576 then
    raise exception 'The sanitized catalog arrangement exceeds the 1 MB limit.' using errcode = '22023';
  end if;

  insert into public.drum_song_catalog(author_id, title, artist, attribution, license, source_url, state, rights_attested_at)
  values ((select auth.uid()), btrim(p_title), btrim(p_artist), btrim(p_attribution), btrim(p_license), nullif(btrim(p_source_url), ''), safe_state, now())
  returning id into submission_id;
  return submission_id;
end;
$$;
revoke all on function public.submit_drum_song_catalog(text,text,text,text,text,jsonb,boolean) from public, anon;
grant execute on function public.submit_drum_song_catalog(text,text,text,text,text,jsonb,boolean) to authenticated;

create function public.review_drum_song_catalog_submission(p_submission_id uuid, p_status text, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare submission public.drum_song_catalog%rowtype;
begin
  if (select auth.uid()) is null or not public.drum_song_catalog_is_reviewer() then
    raise exception 'An assigned catalog reviewer account is required.' using errcode = '42501';
  end if;
  if p_status not in ('published', 'rejected') or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'Choose publish or return, with a review note of at most 1000 characters.' using errcode = '22023';
  end if;
  select * into submission from public.drum_song_catalog where id = p_submission_id for update;
  if not found or submission.status <> 'pending' then
    raise exception 'This submission is no longer awaiting review.' using errcode = '40001';
  end if;
  if submission.author_id = (select auth.uid()) then
    raise exception 'Reviewers cannot moderate their own submissions.' using errcode = '42501';
  end if;
  update public.drum_song_catalog
  set status = p_status, moderation_note = nullif(btrim(p_note), ''), moderator_id = (select auth.uid()), moderated_at = now()
  where id = p_submission_id;
end;
$$;
revoke all on function public.review_drum_song_catalog_submission(uuid,text,text) from public, anon;
grant execute on function public.review_drum_song_catalog_submission(uuid,text,text) to authenticated;

comment on table public.drum_song_catalog_reviewers is 'Provision reviewer accounts by an administrator; users cannot add themselves.';
comment on table public.drum_song_catalog is 'User-submitted drum arrangements visible publicly only after independent review.';
