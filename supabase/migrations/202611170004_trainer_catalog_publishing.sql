create table public.drum_trainer_editorial_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

create table public.drum_trainer_catalog_revisions (
  pattern_id text not null check (length(pattern_id) between 1 and 200),
  revision_hash text not null check (revision_hash ~ '^[a-f0-9]{32}$'),
  title text not null check (length(btrim(title)) between 1 and 200),
  pattern_json jsonb not null check (jsonb_typeof(pattern_json) = 'object'),
  source_attribution text not null check (length(btrim(source_attribution)) between 1 and 500),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  rights_license text not null check (length(btrim(rights_license)) between 1 and 500),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (pattern_id, revision_hash)
);

create table public.drum_trainer_catalog_drafts (
  pattern_id text primary key check (length(pattern_id) between 1 and 200),
  revision_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  submitted_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key (pattern_id, revision_hash)
    references public.drum_trainer_catalog_revisions(pattern_id, revision_hash) on delete cascade
);

create table public.drum_trainer_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  pattern_id text not null,
  revision_hash text not null,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'changes-requested')),
  notes text not null default '' check (length(notes) <= 1200),
  created_at timestamptz not null default now(),
  unique (pattern_id, revision_hash, reviewer_id),
  foreign key (pattern_id, revision_hash)
    references public.drum_trainer_catalog_revisions(pattern_id, revision_hash) on delete cascade
);

create table public.drum_trainer_catalog (
  pattern_id text primary key check (length(pattern_id) between 1 and 200),
  revision_hash text not null,
  title text not null,
  pattern_json jsonb not null,
  source_attribution text not null,
  source_url text,
  rights_license text not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  foreign key (pattern_id, revision_hash)
    references public.drum_trainer_catalog_revisions(pattern_id, revision_hash)
);

create index drum_trainer_editorial_reviews_revision
  on public.drum_trainer_editorial_reviews(pattern_id, revision_hash, decision);

alter table public.drum_trainer_editorial_members enable row level security;
alter table public.drum_trainer_catalog_revisions enable row level security;
alter table public.drum_trainer_catalog_drafts enable row level security;
alter table public.drum_trainer_editorial_reviews enable row level security;
alter table public.drum_trainer_catalog enable row level security;

create policy drum_trainer_editorial_members_read_self
  on public.drum_trainer_editorial_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy drum_trainer_catalog_read_published
  on public.drum_trainer_catalog for select to anon, authenticated
  using (true);

create or replace function public.drum_trainer_editorial_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.drum_trainer_editorial_members where user_id = (select auth.uid())
$$;

create policy drum_trainer_catalog_revisions_read_members
  on public.drum_trainer_catalog_revisions for select to authenticated
  using (public.drum_trainer_editorial_role() is not null);
create policy drum_trainer_catalog_drafts_read_members
  on public.drum_trainer_catalog_drafts for select to authenticated
  using (public.drum_trainer_editorial_role() is not null);
create policy drum_trainer_editorial_reviews_read_members
  on public.drum_trainer_editorial_reviews for select to authenticated
  using (public.drum_trainer_editorial_role() is not null);

revoke all on public.drum_trainer_editorial_members from anon, authenticated;
revoke all on public.drum_trainer_catalog_revisions from anon, authenticated;
revoke all on public.drum_trainer_catalog_drafts from anon, authenticated;
revoke all on public.drum_trainer_editorial_reviews from anon, authenticated;
revoke all on public.drum_trainer_catalog from anon, authenticated;
grant select on public.drum_trainer_editorial_members to authenticated;
grant select on public.drum_trainer_catalog_revisions to authenticated;
grant select on public.drum_trainer_catalog_drafts to authenticated;
grant select on public.drum_trainer_editorial_reviews to authenticated;
grant select on public.drum_trainer_catalog to anon, authenticated;
revoke all on function public.drum_trainer_editorial_role() from public;
grant execute on function public.drum_trainer_editorial_role() to authenticated;

create or replace function public.trainer_catalog_pattern_hash(p_pattern jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(jsonb_typeof(p_pattern), '') <> 'object' then
    raise exception 'A pattern object is required.' using errcode = '22023';
  end if;
  return md5(p_pattern::text);
end;
$$;
revoke all on function public.trainer_catalog_pattern_hash(jsonb) from public;
grant execute on function public.trainer_catalog_pattern_hash(jsonb) to authenticated;

create or replace function public.trainer_submit_catalog_draft(
  p_pattern_id text,
  p_title text,
  p_pattern jsonb,
  p_source_attribution text,
  p_source_url text,
  p_rights_license text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  computed_revision_hash text;
  existing public.drum_trainer_catalog_revisions%rowtype;
  affected_rows integer;
begin
  if current_user_id is null or public.drum_trainer_editorial_role() is null then
    raise exception 'An authenticated Trainer editorial account is required.' using errcode = '42501';
  end if;
  if length(coalesce(p_pattern_id, '')) not between 1 and 200
     or length(btrim(coalesce(p_title, ''))) not between 1 and 200
     or coalesce(jsonb_typeof(p_pattern), '') <> 'object'
     or length(btrim(coalesce(p_source_attribution, ''))) not between 1 and 500
     or (p_source_url is not null and p_source_url !~ '^https?://')
     or length(btrim(coalesce(p_rights_license, ''))) not between 1 and 500 then
    raise exception 'Pattern, source attribution, and rights metadata are required.' using errcode = '22023';
  end if;
  computed_revision_hash := md5(p_pattern::text);

  insert into public.drum_trainer_catalog_revisions(pattern_id, revision_hash, title, pattern_json, source_attribution, source_url, rights_license, submitted_by)
  values (p_pattern_id, computed_revision_hash, btrim(p_title), p_pattern, btrim(p_source_attribution), nullif(btrim(p_source_url), ''), btrim(p_rights_license), current_user_id)
  on conflict (pattern_id, revision_hash) do nothing;

  select * into existing from public.drum_trainer_catalog_revisions
  where pattern_id = p_pattern_id and revision_hash = computed_revision_hash;
  if existing.pattern_json <> p_pattern or existing.title <> btrim(p_title)
     or existing.source_attribution <> btrim(p_source_attribution)
     or existing.source_url is distinct from nullif(btrim(p_source_url), '')
     or existing.rights_license <> btrim(p_rights_license) then
    raise exception 'This revision hash already belongs to different content.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.drum_trainer_catalog_drafts d
    where d.pattern_id = p_pattern_id and d.submitted_by <> current_user_id
  ) and public.drum_trainer_editorial_role() not in ('editor', 'admin') then
    raise exception 'Only the draft author or an editor can replace this pattern draft.' using errcode = '42501';
  end if;

  insert into public.drum_trainer_catalog_drafts(pattern_id, revision_hash, status, submitted_by, updated_at)
  values (p_pattern_id, computed_revision_hash, 'draft', current_user_id, now())
  on conflict (pattern_id) do update set revision_hash = excluded.revision_hash, status = 'draft', submitted_by = current_user_id, updated_at = now()
    where public.drum_trainer_catalog_drafts.submitted_by = current_user_id
       or public.drum_trainer_editorial_role() in ('editor', 'admin');

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'Only the draft author or an editor can replace this pattern draft.' using errcode = '42501';
  end if;

  return jsonb_build_object('pattern_id', p_pattern_id, 'revision_hash', computed_revision_hash, 'status', 'draft');
end;
$$;

create or replace function public.trainer_record_catalog_review(
  p_pattern_id text,
  p_revision_hash text,
  p_decision text,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  submitted_user_id uuid;
begin
  if current_user_id is null or public.drum_trainer_editorial_role() is null then
    raise exception 'An authenticated Trainer editorial account is required.' using errcode = '42501';
  end if;
  if coalesce(p_decision, '') not in ('approved', 'changes-requested') or length(coalesce(p_notes, '')) > 1200 then
    raise exception 'Invalid review decision.' using errcode = '22023';
  end if;
  select submitted_by into submitted_user_id from public.drum_trainer_catalog_revisions
  where pattern_id = p_pattern_id and revision_hash = p_revision_hash;
  if submitted_user_id is null then raise exception 'Revision not found.' using errcode = 'P0002'; end if;
  if submitted_user_id = current_user_id then raise exception 'Authors cannot review their own revision.' using errcode = '42501'; end if;

  insert into public.drum_trainer_editorial_reviews(pattern_id, revision_hash, reviewer_id, decision, notes)
  values (p_pattern_id, p_revision_hash, current_user_id, p_decision, coalesce(p_notes, ''))
  on conflict (pattern_id, revision_hash, reviewer_id) do update
    set decision = excluded.decision, notes = excluded.notes, created_at = now();
end;
$$;

create or replace function public.trainer_publish_catalog_revision(p_pattern_id text, p_revision_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  revision public.drum_trainer_catalog_revisions%rowtype;
  approval_count integer;
begin
  if current_user_id is null or coalesce(public.drum_trainer_editorial_role(), '') not in ('editor', 'admin') then
    raise exception 'An authenticated Trainer editor is required to publish.' using errcode = '42501';
  end if;
  select * into revision from public.drum_trainer_catalog_revisions
  where pattern_id = p_pattern_id and revision_hash = p_revision_hash;
  if revision.pattern_id is null then raise exception 'Revision not found.' using errcode = 'P0002'; end if;

  select count(distinct reviewer_id) into approval_count from public.drum_trainer_editorial_reviews
  where pattern_id = p_pattern_id and revision_hash = p_revision_hash and decision = 'approved'
    and reviewer_id <> revision.submitted_by;
  if approval_count < 2 then raise exception 'Two independent approvals are required for this revision.' using errcode = '42501'; end if;

  insert into public.drum_trainer_catalog(pattern_id, revision_hash, title, pattern_json, source_attribution, source_url, rights_license, published_by, published_at)
  values (revision.pattern_id, revision.revision_hash, revision.title, revision.pattern_json, revision.source_attribution, revision.source_url, revision.rights_license, current_user_id, now())
  on conflict (pattern_id) do update set revision_hash = excluded.revision_hash, title = excluded.title,
    pattern_json = excluded.pattern_json, source_attribution = excluded.source_attribution,
    source_url = excluded.source_url, rights_license = excluded.rights_license,
    published_by = current_user_id, published_at = now();

  update public.drum_trainer_catalog_drafts set status = 'published', updated_at = now()
  where pattern_id = p_pattern_id and revision_hash = p_revision_hash;
  return jsonb_build_object('pattern_id', p_pattern_id, 'revision_hash', p_revision_hash, 'status', 'published', 'approval_count', approval_count);
end;
$$;

revoke all on function public.trainer_submit_catalog_draft(text, text, jsonb, text, text, text) from public;
revoke all on function public.trainer_record_catalog_review(text, text, text, text) from public;
revoke all on function public.trainer_publish_catalog_revision(text, text) from public;
grant execute on function public.trainer_submit_catalog_draft(text, text, jsonb, text, text, text) to authenticated;
grant execute on function public.trainer_record_catalog_review(text, text, text, text) to authenticated;
grant execute on function public.trainer_publish_catalog_revision(text, text) to authenticated;
