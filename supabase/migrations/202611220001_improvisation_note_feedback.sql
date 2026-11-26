-- Add score-level anchors to summary-only improvisation teacher comments.
-- These fields identify a rhythmic location and drum voice; they do not store hit streams.
alter table public.drum_improvisation_feedback
  add column if not exists beat_index integer,
  add column if not exists subdivision_index integer,
  add column if not exists voice text;

alter table public.drum_improvisation_feedback
  add constraint drum_improvisation_feedback_beat_index_check
    check (beat_index is null or beat_index between 1 and 32),
  add constraint drum_improvisation_feedback_subdivision_index_check
    check (subdivision_index is null or subdivision_index between 1 and 4),
  add constraint drum_improvisation_feedback_voice_check
    check (voice is null or voice in ('kick', 'snare', 'hihat', 'tom', 'crash')),
  add constraint drum_improvisation_feedback_subdivision_needs_beat
    check (subdivision_index is null or (beat_index is not null and bar_index is not null)),
  add constraint drum_improvisation_feedback_beat_needs_bar
    check (beat_index is null or bar_index is not null);
