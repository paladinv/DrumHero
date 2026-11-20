-- Synchronized Trainer duet rooms are temporary and visible only to members
-- of the shared library in the room topic. Hit audio is never transmitted.
create policy trainer_duet_room_read
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and case
    when realtime.topic() ~ '^drum-trainer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);

create policy trainer_duet_room_write
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and case
    when realtime.topic() ~ '^drum-trainer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);
