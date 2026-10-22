-- Curated song/collection snapshots use the same access controls as cloud libraries,
-- while remaining isolated from automatic whole-library sync.
alter table public.drum_libraries
  add column share_scope boolean not null default false;

-- Scoped snapshots are viewer-only. The snapshot owner remains able to update their
-- own record, while ordinary shared libraries retain editor permissions.
create or replace function public.save_drum_library(p_library_id uuid,p_revision integer,p_state jsonb,p_device_name text default null)
returns public.drum_libraries language plpgsql security definer set search_path='' as $$
declare current_record public.drum_libraries;
begin
 select * into current_record from public.drum_libraries where id=p_library_id for update;
 if not found or public.drum_library_role(p_library_id) is null or public.drum_library_role(p_library_id) not in ('owner','editor') then raise exception 'Permission denied' using errcode='42501'; end if;
 if current_record.share_scope and public.drum_library_role(p_library_id) <> 'owner' then raise exception 'Scoped shares are read-only' using errcode='42501'; end if;
 if current_record.revision<>p_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
 insert into public.drum_library_revisions(library_id,revision,state,created_at,actor_id,device_name)
 values(p_library_id,current_record.revision,current_record.state,current_record.updated_at,current_record.updated_by,current_record.device_name);
 update public.drum_libraries set state=p_state,revision=revision+1,updated_at=now(),updated_by=(select auth.uid()),device_name=left(p_device_name,80) where id=p_library_id returning * into current_record;
 delete from public.drum_library_revisions where library_id=p_library_id and revision<current_record.revision-20;
 return current_record;
end;
$$;
revoke all on function public.save_drum_library(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.save_drum_library(uuid,integer,jsonb,text) to authenticated;

create or replace function public.grant_drum_library_access(p_library_id uuid,p_email text,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid; scoped boolean;
begin
  if public.drum_library_role(p_library_id) is distinct from 'owner' then raise exception 'Owner permission required' using errcode = '42501'; end if;
  if p_role not in ('viewer','editor') then raise exception 'Invalid role'; end if;
  select l.share_scope into scoped from public.drum_libraries l where l.id=p_library_id;
  if scoped and p_role <> 'viewer' then raise exception 'Scoped shares only support viewer access'; end if;
  select id into recipient from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if recipient is null then raise exception 'The recipient must create and confirm an account first'; end if;
  if recipient = (select auth.uid()) then raise exception 'The owner already has access'; end if;
  insert into public.drum_library_members(library_id,user_id,email,role) values(p_library_id,recipient,lower(trim(p_email)),p_role)
  on conflict(library_id,user_id) do update set role = excluded.role;
end;
$$;
revoke all on function public.grant_drum_library_access(uuid,text,text) from public, anon;
grant execute on function public.grant_drum_library_access(uuid,text,text) to authenticated;
