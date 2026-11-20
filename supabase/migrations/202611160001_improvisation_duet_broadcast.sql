-- Private remote improvisation rooms are scoped to members of an existing shared library.
-- Room UUIDs are invite secrets; no player hits or audio are persisted by this policy.
create policy improvisation_duet_room_read
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and case
    when realtime.topic() ~ '^drum-improv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);

create policy improvisation_duet_room_write
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and case
    when realtime.topic() ~ '^drum-improv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);
