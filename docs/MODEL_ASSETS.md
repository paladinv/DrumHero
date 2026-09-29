# Drum Hero model assets

The v27 engine keeps the procedural kit as an offline/loading fallback and uses
the following authored assets when the local files are available. The files are
bundled under `public/models/drums/` for this app only; they are not exposed as
separate downloads or redistributed independently.

## Drum Kit Shell Set

- Asset: `public/models/drums/drum-kit-shell-set.glb`
- Source page: https://3dassets.dev/assets/live-music-venue-and-festival-stage-drum-kit-shell-set-a2d5fafe
- Direct model URL: https://cdn.3dassets.dev/assets/33918/v1/model.glb
- Provenance: 3DAssets.dev, “Drum Kit Shell Set (Live Music Venue and Festival Stage)”
- License: CC0 1.0 Universal (public-domain dedication). The source page states
  commercial use, modification, redistribution, and no attribution requirement
  are permitted. The source reports 10,172 triangles, five materials, metre
  units, +Y up, and the audience/player side toward +Z.

## FUZE holding hands

- Assets: `public/models/drums/hands/left-hold.glb` and
  `public/models/drums/hands/right-hold.glb`
- Source page: https://teamfuze.itch.io/hands-3d-pack
- Provenance: FUZE Technologies, “3D Hands pack”; the files are the smooth,
  basic-texture left/right holding-pose GLBs from the free/name-your-own-price
  archive. The models include the authored opposed-thumb holding pose and their
  embedded skin albedo/normal textures.
- Authored scene meshes: `L_Smooth_Hold` and `R_Smooth_Hold`. Their measured
  wrist-to-fingertip bounds run along local X; v31 maps that axis to the
  engine's local +Y 5A shaft, then presents the dorsal curled side toward the
  seated camera. The 5A therefore crosses the authored thumb/index web rather
  than being shown beside a palm.
- License: The source page permits use in commercial, private, and educational
  projects and modification, states that no credit is due (credit appreciated),
  and prohibits redistribution outside the project/app scope. Drum Hero keeps
  the files bundled only inside this application in accordance with those terms.

The engine loads these files lazily with Three.js `GLTFLoader`, disposes their
geometry/material/texture resources on teardown, and retains the procedural
geometry when a fetch or parse fails (including offline use).

## v29 studio component kit

The primary v29/v30 assembly uses the smaller component models from the CC0
3DAssets.dev “Music Recording Studio and Instruments” pack. They are local,
metre-scale GLBs (+Y up, player side +Z), with no remote runtime dependency:

- `public/models/drums/components/bass-toms.glb` — source asset 33793,
  5,888 triangles, bass drum with two mounted toms.
- `public/models/drums/components/snare-stand.glb` — source asset 33794,
  approximately 2.7k triangles, snare and stand.
- `public/models/drums/components/floor-tom.glb` — source asset 33792,
  approximately 2.4k triangles.
- `public/models/drums/components/hihat-stand.glb` — source asset 33795,
  approximately 1.4k triangles.
- `public/models/drums/components/crash-stand.glb` — source asset 33791,
  908 triangles; v29 instances this compact crash/stand for the right-side
  ride position as well.

Pack page: https://3dassets.dev/packs/music-recording-studio-and-instruments
The individual source pages identify these models as CC0 1.0 Universal, permit
commercial use/modification/redistribution, and require no attribution. Drum
Hero retints their runtime materials for a sober studio presentation without
modifying the source files. The earlier shell-set GLB remains bundled as a
recoverable asset but is no longer the primary loaded kit.

The `bass-toms.glb` scene deliberately reacts only as the kick assembly. Its
authored root groups the kick and both rack toms into one rigid, non-semantic
object, so moving it on a tom hit would also move the kick. The engine retains
the exact tom stick contact/rebound and the independently authored floor-tom
response instead of guessing at an unsafe submesh split.

Direct model/source records: [bass/toms GLB](https://cdn.3dassets.dev/assets/33793/v1/model.glb)
([source](https://3dassets.dev/assets/music-recording-studio-and-instruments-drum-kick-with--51472592)),
[snare GLB](https://cdn.3dassets.dev/assets/33794/v1/model.glb)
([source](https://3dassets.dev/assets/music-recording-studio-and-instruments-drum-snare-on-s-d42d8c13)),
[floor tom GLB](https://cdn.3dassets.dev/assets/33792/v1/model.glb),
[hi-hat GLB](https://cdn.3dassets.dev/assets/33795/v1/model.glb)
([source](https://3dassets.dev/assets/hi-hat-stand-ecb6728d)), and
[crash GLB](https://cdn.3dassets.dev/assets/33791/v1/model.glb)
([source](https://3dassets.dev/assets/cymbal-on-stand-3937c651)).
