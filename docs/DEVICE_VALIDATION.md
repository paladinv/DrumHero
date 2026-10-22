# Trainer device validation

Drum Hero records a latency correction per Trainer input profile and provides an in-app compatibility summary. Browser feature detection and eight-beat calibration describe the current device; neither one certifies that a device has stable timing. The Trainer's **Record repeatability trials** panel can save three corrections for the same input profile, setup label, browser/platform version, and output route, then report their spread. Exporting creates a local JSON log after a review checkbox; entries are not uploaded. Individual MIDI device IDs are removed from the exported log. The setup label is user-entered and can contain identifying details, so review it before sharing. The comparison is a practical aid, not a calibrated laboratory measurement.

## Device matrix

| Platform | Browser | Input path | Check |
| --- | --- | --- | --- |
| iPhone / iPad | Safari | Touch pads | Permission-free scoring, calibration repeatability, screen rotation |
| iPhone / iPad | Safari | Microphone or line input | Permission, noise floor, clipping, five-voice calibration, uncertain hits |
| Android phone / tablet | Chrome | Touch pads and microphone | Permission, audio start after a gesture, calibration repeatability |
| macOS | Safari and Chrome | Keyboard, USB MIDI, audio input | Per-device profile separation, disconnect/reconnect, calibration persistence |
| Windows | Chrome and Edge | Keyboard, USB MIDI, audio input | MIDI note mapping, latency correction, background-tab recovery |
| Lower-powered mobile device | Default browser | Touch and local audio | Frame responsiveness during a round, audio continuity, battery/thermal behavior |

## Repeatable comparison procedure

1. Record the device model, OS version, browser version, input path, output path, and whether a wired or Bluetooth device is involved. Enter a short setup label in the Trainer trial panel.
2. Run the eight-beat calibration three times without changing the setup. After each calibration, save a trial, then note or export the reported correction spread.
3. Play the same 16-bar groove at one fixed tempo for three rounds. Keep the same input profile and do not compare microphone rounds with MIDI or touch rounds.
4. Repeat after reconnecting the input and after returning from a backgrounded tab. Confirm that saved profiles remain available and that a fresh calibration can replace them.
5. For microphone scoring, repeat in a quiet room and a normal practice room. Review noise, clipping, uncertain detections, and per-voice calibration before interpreting score changes.
6. Repeat with Bluetooth audio only as a separate output configuration. Do not treat its result as comparable to wired audio.

This checklist is a release-validation plan. It does not claim that every listed physical device has been tested. Keep recordings and calibration results local unless a participant explicitly chooses to share them.

Record a release sign-off only after a person has run the matrix on the physical device. Include device model, OS and browser versions, input and output route, setup label, trial spread, observations, and reviewer. The app's diagnostics and repeatability log are local aids; a clean browser-capability check is not a hardware sign-off.

| Date | Device / OS | Browser / version | Input / output | Trial spread | Observations / result | Reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| Not yet run | — | — | — | — | This repository contains the procedure, not a physical-device sign-off | — |
