-- Authenticated, opt-in classroom groups. Student-facing rows contain display names and task status only.
create extension if not exists pgcrypto with schema extensions;

create table public.drum_classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.drum_classroom_memberships (
  classroom_id uuid not null references public.drum_classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  consented_at timestamptz not null,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

create table public.drum_classroom_invites (
  classroom_id uuid primary key references public.drum_classrooms(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.drum_classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.drum_classrooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  activity text not null check (activity in ('/learn','/practice','/trainer','/rudiments','/grooves','/ear-training','/play-alongs','/song-library')),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  due_at date,
  created_at timestamptz not null default now()
);

create table public.drum_classroom_submissions (
  assignment_id uuid not null references public.drum_classroom_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  submitted_at timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

create index drum_classroom_memberships_user_idx on public.drum_classroom_memberships(user_id, classroom_id);
create index drum_classroom_assignments_class_idx on public.drum_classroom_assignments(classroom_id, created_at desc);
create index drum_classroom_submissions_user_idx on public.drum_classroom_submissions(user_id, submitted_at desc);

alter table public.drum_classrooms enable row level security;
alter table public.drum_classroom_memberships enable row level security;
alter table public.drum_classroom_invites enable row level security;
alter table public.drum_classroom_assignments enable row level security;
alter table public.drum_classroom_submissions enable row level security;

create function public.is_drum_classroom_owner(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.drum_classrooms c where c.id = p_classroom_id and c.owner_id = auth.uid() and c.archived_at is null) $$;

create function public.is_drum_classroom_member(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.drum_classroom_memberships m join public.drum_classrooms c on c.id = m.classroom_id where m.classroom_id = p_classroom_id and m.user_id = auth.uid() and c.archived_at is null) $$;

create policy drum_classrooms_read_members on public.drum_classrooms for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_drum_classroom_member(id));
create policy drum_classrooms_delete_owner on public.drum_classrooms for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy drum_classroom_memberships_read on public.drum_classroom_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_drum_classroom_owner(classroom_id));
create policy drum_classroom_memberships_leave on public.drum_classroom_memberships for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_drum_classroom_owner(classroom_id));

create policy drum_classroom_assignments_read on public.drum_classroom_assignments for select to authenticated
  using (public.is_drum_classroom_owner(classroom_id) or public.is_drum_classroom_member(classroom_id));
create policy drum_classroom_assignments_create on public.drum_classroom_assignments for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_drum_classroom_owner(classroom_id));
create policy drum_classroom_assignments_update on public.drum_classroom_assignments for update to authenticated
  using (public.is_drum_classroom_owner(classroom_id)) with check (public.is_drum_classroom_owner(classroom_id));
create policy drum_classroom_assignments_delete on public.drum_classroom_assignments for delete to authenticated
  using (public.is_drum_classroom_owner(classroom_id));

create policy drum_classroom_submissions_read on public.drum_classroom_submissions for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.drum_classroom_assignments a
    where a.id = assignment_id and public.is_drum_classroom_owner(a.classroom_id)
  ));
create policy drum_classroom_submissions_create on public.drum_classroom_submissions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.drum_classroom_assignments a
    where a.id = assignment_id and public.is_drum_classroom_member(a.classroom_id)
  ));
create policy drum_classroom_submissions_update on public.drum_classroom_submissions for update to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.drum_classroom_assignments a
    where a.id = assignment_id and public.is_drum_classroom_member(a.classroom_id)
  )) with check (user_id = (select auth.uid()) and exists (
    select 1 from public.drum_classroom_assignments a
    where a.id = assignment_id and public.is_drum_classroom_member(a.classroom_id)
  ));
create policy drum_classroom_submissions_delete on public.drum_classroom_submissions for delete to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.drum_classroom_assignments a
    where a.id = assignment_id and public.is_drum_classroom_owner(a.classroom_id)
  ));

create function public.cleanup_drum_classroom_submissions()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.drum_classroom_submissions s using public.drum_classroom_assignments a
    where a.id = s.assignment_id and a.classroom_id = old.classroom_id and s.user_id = old.user_id;
  return old;
end $$;
create trigger drum_classroom_membership_cleanup
  after delete on public.drum_classroom_memberships
  for each row execute function public.cleanup_drum_classroom_submissions();

revoke all on public.drum_classrooms, public.drum_classroom_memberships, public.drum_classroom_invites,
  public.drum_classroom_assignments, public.drum_classroom_submissions from anon;
revoke all on public.drum_classrooms, public.drum_classroom_memberships, public.drum_classroom_invites,
  public.drum_classroom_assignments, public.drum_classroom_submissions from authenticated;
grant select, delete on public.drum_classrooms to authenticated;
grant select, delete on public.drum_classroom_memberships to authenticated;
grant select, insert, update, delete on public.drum_classroom_assignments to authenticated;
grant select, insert, update, delete on public.drum_classroom_submissions to authenticated;
revoke all on function public.is_drum_classroom_owner(uuid) from public, anon;
revoke all on function public.is_drum_classroom_member(uuid) from public, anon;
grant execute on function public.is_drum_classroom_owner(uuid) to authenticated;
grant execute on function public.is_drum_classroom_member(uuid) to authenticated;
revoke all on function public.cleanup_drum_classroom_submissions() from public, anon;

create function public.create_drum_classroom(p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_name text := btrim(coalesce(p_name, ''));
  room public.drum_classrooms;
  invite_code text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
begin
  if current_user_id is null then raise exception 'Sign in to create a classroom'; end if;
  if char_length(cleaned_name) not between 1 and 80 then raise exception 'Classroom name must be 1 to 80 characters'; end if;
  insert into public.drum_classrooms(owner_id, name) values (current_user_id, cleaned_name) returning * into room;
  insert into public.drum_classroom_invites(classroom_id, code_hash, expires_at)
    values (room.id, extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), now() + interval '90 days');
  return jsonb_build_object('id', room.id, 'name', room.name, 'invite_code', invite_code,
    'created_at', room.created_at, 'expires_at', now() + interval '90 days');
end $$;

create function public.rotate_drum_classroom_invite(p_classroom_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  invite_code text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
begin
  if owner_id is null or not public.is_drum_classroom_owner(p_classroom_id) then raise exception 'Only the classroom owner can rotate its invite'; end if;
  update public.drum_classroom_invites set revoked_at = now() where classroom_id = p_classroom_id and revoked_at is null;
  insert into public.drum_classroom_invites(classroom_id, code_hash, expires_at)
    values (p_classroom_id, extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), now() + interval '90 days')
    on conflict (classroom_id) do update set code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, revoked_at = null, created_at = now();
  return jsonb_build_object('invite_code', invite_code, 'expires_at', now() + interval '90 days');
end $$;

create function public.join_drum_classroom(p_join_code text, p_display_name text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  learner_id uuid := auth.uid();
  cleaned_code text := upper(regexp_replace(coalesce(p_join_code, ''), '[^A-Za-z0-9]', '', 'g'));
  cleaned_name text := btrim(coalesce(p_display_name, ''));
  classroom public.drum_classrooms;
begin
  if learner_id is null then raise exception 'Sign in to join a classroom'; end if;
  if p_consent is not true then raise exception 'Confirm that you have permission to join and share your class status'; end if;
  if char_length(cleaned_code) <> 16 or char_length(cleaned_name) not between 1 and 60 then raise exception 'Enter a valid invite code and display name'; end if;
  select c.* into classroom from public.drum_classroom_invites i join public.drum_classrooms c on c.id = i.classroom_id
    where i.code_hash = extensions.digest(convert_to(cleaned_code, 'UTF8'), 'sha256')
      and i.revoked_at is null and i.expires_at > now() and c.archived_at is null limit 1;
  if not found then raise exception 'This invite code is invalid, expired, or revoked'; end if;
  if classroom.owner_id = learner_id then raise exception 'The classroom owner cannot join as a learner'; end if;
  insert into public.drum_classroom_memberships(classroom_id, user_id, display_name, consented_at)
    values (classroom.id, learner_id, cleaned_name, now())
    on conflict (classroom_id, user_id) do update set display_name = excluded.display_name, consented_at = excluded.consented_at;
  return jsonb_build_object('id', classroom.id, 'name', classroom.name, 'owner_id', classroom.owner_id);
end $$;

create function public.remove_drum_classroom_member(p_classroom_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_drum_classroom_owner(p_classroom_id) then raise exception 'Only the classroom owner can remove a member'; end if;
  delete from public.drum_classroom_memberships where classroom_id = p_classroom_id and user_id = p_user_id;
end $$;

create function public.leave_drum_classroom(p_classroom_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to leave a classroom'; end if;
  delete from public.drum_classroom_memberships where classroom_id = p_classroom_id and user_id = auth.uid();
  if not found then raise exception 'You are not a member of this classroom'; end if;
end $$;

revoke all on function public.create_drum_classroom(text) from public, anon;
revoke all on function public.rotate_drum_classroom_invite(uuid) from public, anon;
revoke all on function public.join_drum_classroom(text, text, boolean) from public, anon;
revoke all on function public.remove_drum_classroom_member(uuid, uuid) from public, anon;
revoke all on function public.leave_drum_classroom(uuid) from public, anon;
grant execute on function public.create_drum_classroom(text) to authenticated;
grant execute on function public.rotate_drum_classroom_invite(uuid) to authenticated;
grant execute on function public.join_drum_classroom(text, text, boolean) to authenticated;
grant execute on function public.remove_drum_classroom_member(uuid, uuid) to authenticated;
grant execute on function public.leave_drum_classroom(uuid) to authenticated;
