-- Private live song edits are visible to library members. Only owners and
-- editors can publish arrangement changes; viewers may continue to observe.
create policy song_builder_broadcast_read
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and case
    when realtime.topic() ~ '^drum-library:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);

create policy song_builder_broadcast_write
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and case
    when realtime.topic() ~ '^drum-library:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) in ('owner','editor')
    else false
  end
);
