-- Add Sight Reading as a classroom assignment activity without changing learner data.
alter table public.drum_classroom_assignments
  drop constraint if exists drum_classroom_assignments_activity_check;

alter table public.drum_classroom_assignments
  add constraint drum_classroom_assignments_activity_check
  check (activity in (
    '/learn', '/practice', '/trainer', '/rudiments', '/grooves',
    '/ear-training', '/play-alongs', '/song-library', '/sight-reading'
  ));
