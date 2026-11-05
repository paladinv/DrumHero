"use client";

import type { TrainerMode, TrainerSource } from "@/lib/trainer";

export function TrainerInputSetupGuide({ mode, source, midiConnected, lastMidiNote, midiMapped, audioConnected, audioSignalSeen, audioClipping, audioVoiceReady, latencyCalibrated, disabled, onConnectMidi, onConnectAudio, onRunAudioSignalCheck, onCalibrateLatency, onOpenMidiMapping, onOpenAudioCalibration }: {
  mode: TrainerMode;
  source: TrainerSource;
  midiConnected: boolean;
  lastMidiNote: number | null;
  midiMapped: boolean;
  audioConnected: boolean;
  audioSignalSeen: boolean;
  audioClipping: boolean;
  audioVoiceReady: boolean;
  latencyCalibrated: boolean;
  disabled: boolean;
  onConnectMidi: () => void;
  onConnectAudio: () => void;
  onRunAudioSignalCheck: () => void;
  onCalibrateLatency: () => void;
  onOpenMidiMapping: () => void;
  onOpenAudioCalibration: () => void;
}) {
  const audioInput = source === "audio-timing" || source === "audio-voices";
  const signalReady = mode === "self" || source === "keyboard" || source === "touch"
    || (source === "midi" && midiConnected && lastMidiNote !== null && midiMapped)
    || (audioInput && audioConnected && audioSignalSeen && !audioClipping && (source !== "audio-voices" || audioVoiceReady));
  return <section className="trainer-input-setup-guide" aria-labelledby="trainer-input-guide-title">
    <div><span className="eyebrow">Before you play</span><h3 id="trainer-input-guide-title">Check your input in a few steps.</h3><p>This check guides setup; calibration is recommended for timing comparisons and never blocks practice.</p></div>
    {mode === "self" ? <p className="trainer-input-guide-ready" role="status">Ready for self-rated practice. No electronic kit or microphone is needed.</p> : <ol>
      <li className={signalReady ? "is-ready" : "needs-check"}><strong>Input signal</strong>
        {source === "keyboard" || source === "touch" ? <span>Ready · {source === "keyboard" ? "Use Space, F, J, K, and L during a round." : "The five touch pads are available during a round."}</span>
          : source === "midi" ? !midiConnected ? <><span>Connect your USB MIDI kit.</span><button type="button" className="button-secondary" disabled={disabled} onClick={onConnectMidi}>Connect MIDI</button></>
            : lastMidiNote === null ? <span>Connected · strike one pad to verify that a note reaches the Trainer.</span>
              : !midiMapped ? <><span>Received MIDI {lastMidiNote}, but that pad has no drum voice yet.</span><button type="button" className="button-secondary" disabled={disabled} onClick={onOpenMidiMapping}>Map this pad</button></>
                : <span>Ready · MIDI {lastMidiNote} is mapped to a Trainer drum voice.</span>
          : !audioConnected ? <><span>Connect a microphone or kit line out.</span><button type="button" className="button-secondary" disabled={disabled} onClick={onConnectAudio}>Connect audio input</button></>
            : audioClipping ? <span role="alert">Clipping detected · lower the input gain or move the microphone farther away.</span>
              : !audioSignalSeen ? <><span>Connected · strike one drum to confirm the signal.</span><button type="button" className="button-secondary" disabled={disabled} onClick={onRunAudioSignalCheck}>Run strike signal check</button></>
                : source === "audio-voices" && !audioVoiceReady ? <><span>Signal received · calibrate at least two drum voices, then check recognition confidence.</span><button type="button" className="button-secondary" disabled={disabled} onClick={onOpenAudioCalibration}>Open voice calibration</button></>
                  : <span>Ready · the audio signal is clear enough for this input mode.</span>}
      </li>
      <li className={latencyCalibrated ? "is-ready" : "needs-check"}><strong>Timing correction</strong><span>{latencyCalibrated ? "Calibrated for this input profile." : "Not calibrated yet · optional, but useful for measured timing."}</span>{!latencyCalibrated && <button type="button" className="button-secondary" disabled={disabled} onClick={onCalibrateLatency}>Calibrate timing</button>}</li>
    </ol>}
    <p className={signalReady ? "trainer-input-guide-ready" : "trainer-input-guide-status"} role="status">{signalReady ? "Input check passed. You can start practice." : "Finish the input-signal check above for more dependable scoring."}</p>
  </section>;
}
