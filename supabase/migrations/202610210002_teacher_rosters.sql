-- Private assignment-roster sync for a teacher's own authenticated account.
create table public.drum_teacher_rosters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision >= 1),
  state jsonb not null check (case when jsonb_typeof(state) = 'array' then jsonb_array_length(state) <= 300 and octet_length(state::text) <= 1048576 else false end),
  device_name text not null default '' check (char_length(device_name) <= 80),
  updated_at timestamptz not null default now()
);

create table public.drum_teacher_roster_revisions (
  user_id uuid not null references public.drum_teacher_rosters(user_id) on delete cascade,
  revision integer not null check (revision >= 1),
  state jsonb not null check (case when jsonb_typeof(state) = 'array' then jsonb_array_length(state) <= 300 and octet_length(state::text) <= 1048576 else false end),
  device_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, revision)
);

alter table public.drum_teacher_rosters enable row level security;
alter table public.drum_teacher_roster_revisions enable row level security;
create policy teacher_rosters_read on public.drum_teacher_rosters for select to authenticated using (user_id = (select auth.uid()));
create policy teacher_rosters_delete on public.drum_teacher_rosters for delete to authenticated using (user_id = (select auth.uid()));
create policy teacher_roster_revisions_read on public.drum_teacher_roster_revisions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.drum_teacher_rosters, public.drum_teacher_roster_revisions from anon;
revoke all on public.drum_teacher_rosters, public.drum_teacher_roster_revisions from authenticated;
grant select, delete on public.drum_teacher_rosters to authenticated;
grant select on public.drum_teacher_roster_revisions to authenticated;

create function public.save_drum_teacher_roster(
  p_expected_revision integer,
  p_state jsonb,
  p_device_name text
) returns public.drum_teacher_rosters
language plpgsql security definer set search_path = '' as $$
declare
  current_record public.drum_teacher_rosters;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_device_name is null or char_length(p_device_name) > 80 then raise exception 'Invalid device label'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'array' then raise exception 'Invalid assignment roster'; end if;
  if jsonb_array_length(p_state) > 300 or octet_length(p_state::text) > 1048576 then raise exception 'Invalid assignment roster'; end if;

  select * into current_record from public.drum_teacher_rosters where user_id = current_user_id for update;
  if not found then
    if p_expected_revision <> 0 then raise exception 'Revision conflict' using errcode = '40001'; end if;
    insert into public.drum_teacher_rosters(user_id, revision, state, device_name)
      values(current_user_id, 1, p_state, trim(p_device_name))
      on conflict (user_id) do nothing returning * into current_record;
    if not found then raise exception 'Revision conflict' using errcode = '40001'; end if;
    return current_record;
  end if;

  if current_record.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  insert into public.drum_teacher_roster_revisions(user_id, revision, state, device_name)
    values(current_user_id, current_record.revision, current_record.state, current_record.device_name)
    on conflict do nothing;
  update public.drum_teacher_rosters set
    revision = revision + 1, state = p_state, device_name = trim(p_device_name), updated_at = now()
    where user_id = current_user_id returning * into current_record;
  delete from public.drum_teacher_roster_revisions
    where user_id = current_user_id and revision not in (
      select revision from public.drum_teacher_roster_revisions
      where user_id = current_user_id order by revision desc limit 20
    );
  return current_record;
end;
$$;

revoke all on function public.save_drum_teacher_roster(integer, jsonb, text) from public, anon;
grant execute on function public.save_drum_teacher_roster(integer, jsonb, text) to authenticated;
