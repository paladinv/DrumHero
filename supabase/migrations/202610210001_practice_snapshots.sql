-- Optional private sync for learner progress and Trainer history.
-- Song arrangements continue using the separate Song Library tables.
create table public.drum_practice_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_profile_id text not null check (char_length(local_profile_id) between 1 and 80),
  learner_name text not null check (char_length(learner_name) between 1 and 60),
  revision integer not null default 1 check (revision >= 1),
  state jsonb not null check (jsonb_typeof(state) = 'object' and state ? 'progress' and state ? 'trainer' and octet_length(state::text) <= 4194304),
  device_name text not null default '' check (char_length(device_name) <= 80),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_profile_id)
);

create table public.drum_practice_snapshot_revisions (
  user_id uuid not null,
  local_profile_id text not null,
  revision integer not null check (revision >= 1),
  state jsonb not null,
  device_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, local_profile_id, revision),
  foreign key (user_id, local_profile_id) references public.drum_practice_snapshots(user_id, local_profile_id) on delete cascade
);

alter table public.drum_practice_snapshots enable row level security;
alter table public.drum_practice_snapshot_revisions enable row level security;
create policy practice_snapshots_read on public.drum_practice_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy practice_snapshots_delete on public.drum_practice_snapshots for delete to authenticated using (user_id = (select auth.uid()));
create policy practice_revisions_read on public.drum_practice_snapshot_revisions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.drum_practice_snapshots, public.drum_practice_snapshot_revisions from anon;
revoke all on public.drum_practice_snapshots, public.drum_practice_snapshot_revisions from authenticated;
grant select, delete on public.drum_practice_snapshots to authenticated;
grant select on public.drum_practice_snapshot_revisions to authenticated;

-- Compare-and-swap writes preserve the latest local revision under concurrent sync.
create function public.save_drum_practice_snapshot(
  p_local_profile_id text,
  p_expected_revision integer,
  p_learner_name text,
  p_state jsonb,
  p_device_name text
) returns public.drum_practice_snapshots
language plpgsql security definer set search_path = '' as $$
declare
  current_record public.drum_practice_snapshots;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_local_profile_id is null or char_length(p_local_profile_id) < 1 or char_length(p_local_profile_id) > 80 then raise exception 'Invalid learner profile'; end if;
  if p_learner_name is null or char_length(trim(p_learner_name)) < 1 or char_length(p_learner_name) > 60 then raise exception 'Invalid learner name'; end if;
  if p_device_name is null or char_length(p_device_name) > 80 then raise exception 'Invalid device label'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or not (p_state ? 'progress') or not (p_state ? 'trainer') or octet_length(p_state::text) > 4194304 then raise exception 'Invalid practice snapshot'; end if;

  select * into current_record from public.drum_practice_snapshots
    where user_id = current_user_id and local_profile_id = p_local_profile_id for update;
  if not found then
    if p_expected_revision <> 0 then raise exception 'Revision conflict' using errcode = '40001'; end if;
    insert into public.drum_practice_snapshots(user_id, local_profile_id, learner_name, revision, state, device_name)
      values(current_user_id, p_local_profile_id, trim(p_learner_name), 1, p_state, trim(p_device_name))
      on conflict (user_id, local_profile_id) do nothing returning * into current_record;
    if not found then raise exception 'Revision conflict' using errcode = '40001'; end if;
    return current_record;
  end if;

  if current_record.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  insert into public.drum_practice_snapshot_revisions(user_id, local_profile_id, revision, state, device_name)
    values(current_record.user_id, current_record.local_profile_id, current_record.revision, current_record.state, current_record.device_name)
    on conflict do nothing;
  update public.drum_practice_snapshots set
    learner_name = trim(p_learner_name), revision = revision + 1, state = p_state,
    device_name = trim(p_device_name), updated_at = now()
    where user_id = current_user_id and local_profile_id = p_local_profile_id
    returning * into current_record;
  delete from public.drum_practice_snapshot_revisions
    where user_id = current_user_id and local_profile_id = p_local_profile_id and revision not in (
      select revision from public.drum_practice_snapshot_revisions
      where user_id = current_user_id and local_profile_id = p_local_profile_id
      order by revision desc limit 20
    );
  return current_record;
end;
$$;

revoke all on function public.save_drum_practice_snapshot(text, integer, text, jsonb, text) from public, anon;
grant execute on function public.save_drum_practice_snapshot(text, integer, text, jsonb, text) to authenticated;
