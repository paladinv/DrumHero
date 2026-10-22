-- Apply once in a Supabase project with email/password Auth enabled.
create table public.drum_libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and state ? 'version' and state ? 'songs' and state->>'version' = '1' and jsonb_typeof(state->'songs') = 'array' and octet_length(state::text) <= 4194304),
  updated_at timestamptz not null default now()
);
create table public.drum_library_members (
  library_id uuid not null references public.drum_libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','editor')),
  primary key (library_id, user_id)
);
create index drum_library_members_user on public.drum_library_members(user_id);
alter table public.drum_libraries enable row level security;
alter table public.drum_library_members enable row level security;

-- Definer helper avoids recursive RLS checks. It only reports this authenticated user's role.
create function public.drum_library_role(p_library_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when l.owner_id = (select auth.uid()) then 'owner'
    else (select m.role from public.drum_library_members m where m.library_id = l.id and m.user_id = (select auth.uid())) end
  from public.drum_libraries l where l.id = p_library_id;
$$;
revoke all on function public.drum_library_role(uuid) from public, anon;
grant execute on function public.drum_library_role(uuid) to authenticated;
create policy libraries_read on public.drum_libraries for select to authenticated using (public.drum_library_role(id) is not null);
create policy libraries_create on public.drum_libraries for insert to authenticated with check (owner_id = (select auth.uid()) and revision = 0);
create policy libraries_delete on public.drum_libraries for delete to authenticated using (owner_id = (select auth.uid()));
create policy members_read on public.drum_library_members for select to authenticated using (user_id = (select auth.uid()) or public.drum_library_role(library_id) = 'owner');
revoke all on public.drum_libraries, public.drum_library_members from anon;
revoke all on public.drum_libraries, public.drum_library_members from authenticated;
grant select, insert, delete on public.drum_libraries to authenticated;
grant select on public.drum_library_members to authenticated;

-- Atomic compare-and-swap: concurrent writers must review the new revision.
create function public.save_drum_library(p_library_id uuid, p_revision integer, p_state jsonb)
returns public.drum_libraries language plpgsql security definer set search_path = '' as $$
declare current_record public.drum_libraries;
begin
  select * into current_record from public.drum_libraries where id = p_library_id for update;
  if not found or public.drum_library_role(p_library_id) not in ('owner','editor') or public.drum_library_role(p_library_id) is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if current_record.revision <> p_revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  update public.drum_libraries set state = p_state, revision = revision + 1, updated_at = now() where id = p_library_id returning * into current_record;
  return current_record;
end;
$$;
revoke all on function public.save_drum_library(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_drum_library(uuid, integer, jsonb) to authenticated;

-- Invitations only grant access to an existing, confirmed account; only the owner can grant/revoke.
create function public.grant_drum_library_access(p_library_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if public.drum_library_role(p_library_id) is distinct from 'owner' then raise exception 'Owner permission required' using errcode = '42501'; end if;
  if p_role not in ('viewer','editor') then raise exception 'Invalid role'; end if;
  select id into recipient from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if recipient is null then raise exception 'The recipient must create and confirm an account first'; end if;
  if recipient = (select auth.uid()) then raise exception 'The owner already has access'; end if;
  insert into public.drum_library_members(library_id,user_id,email,role) values(p_library_id,recipient,lower(trim(p_email)),p_role)
  on conflict(library_id,user_id) do update set role = excluded.role;
end;
$$;
create function public.revoke_drum_library_access(p_library_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.drum_library_role(p_library_id) is distinct from 'owner' then raise exception 'Owner permission required' using errcode = '42501'; end if;
  delete from public.drum_library_members where library_id = p_library_id and user_id = p_user_id;
end;
$$;
revoke all on function public.grant_drum_library_access(uuid,text,text), public.revoke_drum_library_access(uuid,uuid) from public, anon;
grant execute on function public.grant_drum_library_access(uuid,text,text), public.revoke_drum_library_access(uuid,uuid) to authenticated;
