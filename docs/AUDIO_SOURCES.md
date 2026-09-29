# Recorded audio sources

`lib/audio.ts` uses recorded performances for the five drum voices (`kick`, `snare`, `hihat`, `tom`, `crash`). The metronome/count-in uses a short excerpt of the recorded closed hi-hat. No synthesized sounds are used for kit playback.

## Recommended kit: Virtuosity Drums

- [Official library page](https://versilian-studios.com/virtuosity-drums/)
- [Source files and CC0 license](https://github.com/sfzinstruments/virtuosity_drums)
- Recorded by Austin McMahon on an acoustic kit in a live venue, with sticks. The library lists kick, snare, toms, hi-hats, and crash cymbals, plus alternate playing styles and microphone mixes. Its creators publish it under CC0.
- The full library is large: the publisher lists 1.1 GB of installed samples, so bundling all of it in this web app would make the initial download too heavy.
- A smaller, already-trimmed selection from the same source is available as [ferrosintesis-samples-drumkit](https://docs.rs/crate/ferrosintesis-samples-drumkit/0.2.0) and [ferrosintesis-samples-drumkit2](https://docs.rs/crate/ferrosintesis-samples-drumkit2/0.2.0). They retain velocity layers and round-robin takes, with the crash bank in the companion package. Their provenance files document the Virtuosity source and CC0 1.0 license.

The app bundles 18 of those hits as WAVs in [`public/audio/drums`](../public/audio/drums). They total about 1.8 MB. Each voice has three or four medium-dynamic variations; the player rotates through them so repeated hits vary. Audio is decoded and cached after Start. The count-in waits for decoding, and failed drum samples stay silent instead of being replaced with generated drum tones. The metronome uses the closed hi-hat recordings.

App mapping:

| Drum Hero voice | Recorded articulation |
| --- | --- |
| `kick` | Acoustic kick, snares on |
| `snare` | Snare center hit |
| `hihat` | Closed hi-hat |
| `tom` | Low or floor tom center hit |
| `crash` | Normal crash |

The source credit, file mapping, and CC0 license copy are kept beside the bundled WAVs in `public/audio/drums/ATTRIBUTION.md` and `public/audio/drums/LICENSE-CC0.txt`. The files are self-hosted, so normal playback makes no request to a sample site.

## Other usable sources

| Source | Coverage and license | Fit |
| --- | --- | --- |
| [FreePats MuldjordKit](https://freepats.zenvoid.org/Percussion/acoustic-drum-kit.html) | Recorded acoustic kit: kicks, snare, hi-hat, toms, crashes, rides, and china. CC BY 4.0; the page offers a 157 MiB FLAC archive or 223 MiB WAV archive, both with velocity layers and randomized sounds. | Broad, natural coverage, but larger than necessary for a browser app and requires attribution. |
| [ccMixter Drum Kit Samples](https://ccmixter.org/files/CarbonMonoxideMusic/23425) | Eleven WAV files in a small archive, marked CC0. Includes kick, hats, toms, crash, and ride. Two files are only named `Sample 1` and `Sample 2`; confirm what they are by listening before treating either as the snare. | Compact fallback, but filenames don't establish complete coverage. |
| [Judd Madden drum samples](https://juddmadden.com/drum-samples.html) | 118 natural stereo WAV recordings from an acoustic kit, including kick, snare, hats, toms, and cymbals; 62 MB download. The author says they can be used for anything, but does not identify a standard license on the page. | Good-sounding candidate, but use only after retaining the author's permission statement with the assets. |

## Attribution and packaging

For any future sample additions, keep the source, license, and attribution beside the bundled files. CC0 does not require attribution, but provenance makes later maintenance easier. For the FreePats kit, include the required author credit and the CC BY 4.0 link.

Avoid hotlinking sample files from these project or community sites at runtime. Bundle only the small set of approved WAVs with Drum Hero so playback doesn't depend on a third-party server and users aren't sent to a sample host each time they practice.
