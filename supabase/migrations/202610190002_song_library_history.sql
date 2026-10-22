-- Recoverable revisions retain the last 20 saved library versions. Audio is never uploaded by the client.
alter table public.drum_libraries add column updated_by uuid references auth.users(id) on delete set null;
alter table public.drum_libraries add column device_name text check(char_length(device_name) <= 80);
create table public.drum_library_revisions (
 library_id uuid not null references public.drum_libraries(id) on delete cascade,
 revision integer not null,
 state jsonb not null,
 created_at timestamptz not null,
 actor_id uuid references auth.users(id) on delete set null,
 device_name text,
 primary key(library_id,revision)
);
alter table public.drum_library_revisions enable row level security;
revoke all on public.drum_library_revisions from anon,authenticated;
grant select on public.drum_library_revisions to authenticated;
create policy revisions_read on public.drum_library_revisions for select to authenticated using(public.drum_library_role(library_id) is not null);
drop function public.save_drum_library(uuid,integer,jsonb);
create function public.save_drum_library(p_library_id uuid,p_revision integer,p_state jsonb,p_device_name text default null)
returns public.drum_libraries language plpgsql security definer set search_path='' as $$
declare current_record public.drum_libraries;
begin
 select * into current_record from public.drum_libraries where id=p_library_id for update;
 if not found or public.drum_library_role(p_library_id) is null or public.drum_library_role(p_library_id) not in ('owner','editor') then raise exception 'Permission denied' using errcode='42501'; end if;
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
