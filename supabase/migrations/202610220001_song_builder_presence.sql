-- Private, short-lived Song Builder presence is visible only to members of a library.
create policy song_builder_presence_read
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and case
    when realtime.topic() ~ '^drum-library:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);

create policy song_builder_presence_write
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and case
    when realtime.topic() ~ '^drum-library:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.drum_library_role(split_part(realtime.topic(), ':', 2)::uuid) is not null
    else false
  end
);
