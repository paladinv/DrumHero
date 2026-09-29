# Drum sample credits

The recorded drum samples in this directory come from **Virtuosity Drums** by Versilian Studios and Karoryfer Samples, performed by Austin McMahon. The samples are dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); a copy of the license is in `LICENSE-CC0.txt`.

- Original library and source mappings: <https://github.com/sfzinstruments/virtuosity_drums>
- Source revision: `9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`
- Compact sample packages: <https://crates.io/crates/ferrosintesis-samples-drumkit/0.2.0> and <https://crates.io/crates/ferrosintesis-samples-drumkit2/0.2.0>
- Source format: mono 44.1 kHz FLAC; packaged here as mono 44.1 kHz, 16-bit PCM WAV for browser playback.

Each voice has several medium-dynamic takes played in a rotating sequence:

| App file | Source file family | Takes |
| --- | --- | ---: |
| `kick-*.wav` | `kick_vl3` — snares-on kick, close mic | 4 |
| `snare-*.wav` | `snare_vl4` — centered snare | 3 |
| `hihat-*.wav` | `hhc_vl3` — closed hi-hat | 4 |
| `tom-*.wav` | `tomlo_vl3` — low/floor tom | 3 |
| `crash-*.wav` | `crash_vl2` — normal crash | 4 |

The sample packages' source manifests and processing details are documented in the two crate links above. The published samples were already trimmed and normalized; the WAVs here are decoded from those files without additional audio processing.
