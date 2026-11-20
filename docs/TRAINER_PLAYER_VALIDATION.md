# Trainer player validation guide

Use this checklist before describing scored timing or voice recognition as validated with real players. The Trainer's internal diagnostics help identify issues; they do not replace observations from drummers using their own equipment.

For the synchronized remote Trainer duet, both devices must sign in to the same reviewed cloud library. Apply `supabase/migrations/202611170001_trainer_duet_broadcast.sql` before connecting. The private room sends scored note events for local sample playback and never sends microphone audio or recordings. Use two separate devices and confirm the exported duet report contains only optional player labels and round summaries.

## Participants and session

- Include beginners and experienced players, plus at least one drum teacher or educator who can review whether the feedback is musically useful.
- Ask each participant to use a familiar groove and one groove-to-fill transition. Include a simple pattern and a more demanding one.
- Explain that scores are experimental feedback, not a measure of musical ability. Collect only the notes needed for the review; get explicit consent before recording audio, video, or identifiable performance data.
- Record the Trainer build, browser or app, operating system, input source, kit or microphone, room, pattern, tempo, and calibration settings so comparisons are reproducible.

## Device and scoring checks

- Run the built-in setup guide with keyboard, touch, MIDI, audio timing, and calibrated audio voices where those inputs are available.
- For each scored input, play three rounds at the same tempo and setup, then repeat after reconnecting or recalibrating. Note whether the score changes substantially despite a similar performance.
- For MIDI, verify each pad's voice and articulation, including hi-hat pedal and open/closed behavior when the kit reports it.
- For audio, check signal detection, clipping, background noise, latency correction, voice confidence, and guide bleed. Mark rounds with uncertain detection or clipping as unsuitable for score comparisons.
- Ask players whether early/late feedback matches what they hear and feel. Compare a small sample of hits with a teacher's review or a suitable reference recording; keep any recording local unless participants explicitly agree otherwise.
- Review false hits, missed hits, voice confusion, latency drift, and any pattern or tempo where the same player receives inconsistent guidance.
- Ask a drummer to practise from the staff score alone in a guided path, a focused voice drill, and a weak-bar/voice loop. Check that the active notes, rests, count labels, and playhead match the intended targets; compare the collapsed step-grid alternative only if the score is unclear.
- Include at least one MusicXML-imported measure. Have a drummer or teacher compare the mapped Trainer staff against the source score, check each instrument mapping and any warnings about rounded positions, tuplets, sticking, or unsupported notation, then record whether the score was clear. Pilot exports tag these observations as built-in, MusicXML, or custom scores.
- Print or save a practice card for an original pattern, a focused voice, and a looped bar. Confirm tempo, feel, focus label, sticking, rests, and the score itself match the active round.
- Run an unfamiliar-pattern transfer check after a player has practised its source pattern. Confirm that the selected target has no earlier scored attempt and record whether the player transferred the groove skill without relying on the source chart.
- Run a live Trainer call-and-response duet for at least two pairs. Confirm each device receives the matching pattern versions, clock sync completes, note-event playback is audible, turns alternate in order, only the assigned player is scored, handoffs are clear, and the downloaded report separates results without profile or device identifiers. Repeat once with a lost connection and confirm the session stops cleanly.
- For native iOS experimental microphone kit classification, record six calibration strikes for each voice in the same room and kit setup. Compare each accepted label with the known drum, count uncertain strikes, and confirm every experimental round stays out of personal bests and mastery progress. Do not use its scores as validated accuracy evidence.
- Review the recent-voice scorecard against known strikes for each drum. It reports the classifier's top-match signal, not verified instrument accuracy; record false classifications separately.
- Use the local content-review panel to submit separate teacher and player observations. Check that an attached performance demo has attribution and permission, remains local, and is marked as self-reported rather than independently verified.
- Submit pilot notes only after explicit participant consent. Confirm exports omit names, profile identifiers, device identifiers, and recordings; delete the local notes after the pilot's agreed retention period.
- Export the 30-day Trainer report and confirm that its pattern and voice summaries match the saved rounds, while clipped or uncertain audio stays excluded from comparable averages.

## Accessibility and usability

- Complete setup, start, pause, resume, reset, and weak-bar looping with keyboard only. Confirm visible focus and usable labels on every control.
- Check the page at 200% zoom and a narrow phone viewport. Confirm controls remain reachable without horizontal page scrolling and touch targets are comfortable to use.
- Use a screen reader to verify headings, setup status, input errors, round results, and session recap. Live status should announce meaningful changes without repeatedly reading the entire practice grid.
- Confirm readiness and errors are expressed in text as well as color, and that motion, count-in cues, and audio cues have a usable alternative.
- Ask participants with varied experience and access needs to identify confusing instructions, inaccessible actions, or feedback that distracts from playing.

## Review record

For each finding, record the device/setup, steps to reproduce, expected behavior, observed behavior, severity, and whether it affects practice, score reliability, or access. Fix and recheck high-impact issues before making claims about cross-device scoring accuracy. Agree on any numeric acceptance thresholds with educators and participants before using them as validation criteria.

## Pilot session record

Use one copy per participant. Assign a short participant code; do not record names, contact details, or audio unless the participant separately opts in. Keep notes about the performance and Trainer behavior, not judgments about the player's ability.

| Field | Record |
| --- | --- |
| Participant code and experience band |  |
| Date, Trainer build, locale |  |
| Device, OS, browser/app, input source |  |
| Kit or microphone, room, calibration status |  |
| Groove and fill patterns, meter, tempo |  |
| Rounds with similar performance / score range |  |
| Did early/late feedback match the player's feel? | Yes / No / Unsure · notes: |
| Were voice misses or false hits visible and recoverable? | Yes / No / Not applicable · notes: |
| Could the player complete setup, practice, replay, and recap without help? | Yes / No · where help was needed: |
| Did notation make the pattern and count easier to follow than the optional step grid? | Yes / No / Unsure · pattern and notes: |
| Did the weak-bar/voice loop isolate the expected bar and drum voice? | Yes / No / Not applicable · notes: |
| Did the multi-session report agree with the player's recent practice? | Yes / No / Not applicable · notes: |
| Did an unfamiliar-pattern transfer check show skill carryover? | Yes / No / Not applicable · source and target patterns: |
| Did call-and-response roles and score handoffs remain clear? | Yes / No / Not applicable · notes: |
| Did the printable score card match the active notation focus? | Yes / No / Not applicable · notes: |
| Did experimental iOS voice classification match the physical kit? | Yes / No / Not applicable · correct / uncertain / false counts: |
| Most useful coaching and most confusing instruction |  |
| Accessibility or localization issue and reproduction steps |  |
| Recording consent (if applicable) and retention choice |  |

Summarize findings across participants before changing score thresholds. Treat a small pilot as usability and consistency evidence; it is not proof that timing or voice recognition is accurate for every kit, room, or player.

After collecting exports from the opted-in local pilot form, combine their descriptive metrics with:

```sh
npm run trainer-pilot:summary -- ./pilot-export-1.json ./pilot-export-2.json
```

The summary groups observations by pattern, score source, and input, deduplicates note IDs, excludes clipped and uncertain rounds from mean scores, and omits free-text notes and exact dates. It accepts earlier version 1 exports and version 2 exports with explicit score-source tags. It does not declare a pass or fail. Agree on minimum participant counts and reliability thresholds with drummers and educators before using results to change scoring or describe a device as validated.
