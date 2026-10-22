# Drum Hero model assets

The v62 engine keeps the procedural kit as an offline/loading fallback and uses
the following authored assets when the local files are available. The files are
bundled under `public/models/drums/` for this app only; they are not exposed as
separate downloads or redistributed independently.

## v60 loaded-kit playing-surface alignment

The imported snare, floor-tom, and cymbal stands remain vertical. Only the
hi-hat and cymbal/bell subassemblies receive a small player-facing pitch around
their hubs; the previous whole-root tilt leaned each stand mast and tripod with
the playing surface. No model geometry, material count, draw count, or animated
frame work was added. Existing calibrated contacts, sticks, and hit/rebound
poses remain unchanged.

The v62 hand presentation keeps the Blender-baked palm mesh and adds the
existing four slim finger paths plus opposing thumb as a static grip overlay.
Those paths are now placed over the distal palm and share the stick's exact
local frame; the previous camera-facing correction could rotate them away from
the shaft, while their old placement ended at mid-palm. Finger tips are spaced
along the shaft axis and held just over its camera-facing tangent so the
five-finger grip remains legible at compact size. The geometry is cached and
never deformed per frame. The overlay is 300 triangles per hand and remains
inside the established Player/Showcase limits.

## Blender-authored anatomical player hands (v59)

- Runtime asset: `public/models/drums/hands/blender-cc0-matched-grip-arm-v7.glb`
- Preparation source: `scripts/author-drum-hand-assets.py`
- Original licensed source: `assets/Hands Rigged/Hands + armature.blend`
- Source license record: `assets/Hands Rigged/92895 - LICENSE.html`
- Provenance: the bundled “Hands + armature” rigged anatomical hand source.
  The source license page and accompanying provenance identify it as CC0 1.0;
  the original Blender file is kept intact and is never overwritten by export.
- The offline Blender script derives the stick axis from the posed middle-finger
  chain, flexes all four finger chains around their local palmward axis, and
  rebases the baked mesh at the proximal wrist heel. This keeps the shaft
  through the finger/thumb grip rather than at the fingertips. It fits the
  source hand to 86 × 190 × 42 mm references and extends it into a
  continuous rounded bare forearm that widens toward the elbow and splays
  outward from the stick into the player's lower corners. Blender exports the
  hand and forearm as separate static meshes so the engine can keep the
  wrist/stick grip calibrated while aiming the forearm toward the player's
  lower outer corner. The arm is only transformed as a rigid mesh during hits;
  there is no skeleton or per-frame deformation. The combined asset contains
  2,176 triangles per hand/arm pair. Three.js mirrors the authored hand for the
  other side.
- The runtime meshes contain no skeleton, textures, or animation. They replace
  the previous static grip plus procedural forearm/sleeve pieces, leaving the
  existing hand-root hit/rebound motion, calibrated contact points, fallback,
  and public engine API intact. All posing and reduction happen offline; no
  geometry is built or deformed per frame.

## Legacy anatomical hand (v49)

- Runtime asset: `public/models/drums/hands/posable-right-cc0-grip.glb`
- Original licensed source: `assets/posable-right-cc0-source.glb`
- Preparation script: `scripts/prepare-drum-hand-asset.mjs`
- Source page: https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f
- Provenance: Innerscene, “Posable anatomical right hand,” built from the
  MakeHuman/MPFB anatomical base and rig.
- License: CC0 1.0 Universal. The source page identifies public-domain use,
  modification, redistribution, and commercial use; the library terms are at
  https://www.innerscene.com/tools/library/terms.
- The source has a 16-bone hand rig, one skin material, and no texture maps. Its
  listed overall dimensions are 136.8 × 185.6 × 73.9 mm; the source mesh is
  12,728 triangles. The authored grip is baked and reduced offline to 1,418
  triangles and 711 vertices per hand.

The legacy preparation script poses the finger joints around the existing 5A,
normalizes the wrist to the grip origin, maps the authored finger axis to the
engine's stick axis, and bakes skin deformation before reduction. The runtime
loads one small static mesh, mirrors it for the left hand, and keeps the existing
hand-root hit/rebound transforms and calibrated contact points. The attached
forearm and sleeve remained cached static geometry; there was no runtime rig,
simplification, or per-frame hand-mesh work. If the hand asset is unavailable,
the existing procedural grip stays as the fallback.

The legacy idle wrists remained on opposite sides of their snare/tom surfaces. The
sticks cross inward toward their targets rather than pulling both hands together
above the center of the kit or pointing directly along the camera axis.

## Drum Kit Shell Set

- Asset: `public/models/drums/drum-kit-shell-set.glb`
- Source page: https://3dassets.dev/assets/live-music-venue-and-festival-stage-drum-kit-shell-set-a2d5fafe
- Direct model URL: https://cdn.3dassets.dev/assets/33918/v1/model.glb
- Provenance: 3DAssets.dev, “Drum Kit Shell Set (Live Music Venue and Festival Stage)”
- License: CC0 1.0 Universal (public-domain dedication). The source page states
  commercial use, modification, redistribution, and no attribution requirement
  are permitted. The source reports 10,172 triangles, five materials, metre
  units, +Y up, and the audience/player side toward +Z.

## FUZE holding hands (bundled provenance; not mounted in v41)

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

The assets remain in the repository with this provenance record, but v41 did
not fetch or mount them. Each source is a single static 694-vertex holding mesh
with neither forearm geometry nor independently poseable fingers. At the compact
player size that mesh reads as a detached mitten and cannot maintain an
anatomically meaningful stick grip while a hand animates to a hit target.

The v59 CC0 Blender-authored meshes supersede the temporary procedural hand in
the loaded component-kit path. The procedural hand remains available as the
asset-loading fallback; the FUZE meshes are retained only as bundled source
assets with the terms above.

The v33 calibration records separate centre-contact points for the procedural
fallback and the component assembly in `lib/drum-dimensions.ts`; their authored
shell/cymbal transforms differ, so a single shared coordinate table would make
one of the two kits show floating stick hits.

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

For v40, a successful component load keeps the existing low-contrast floor
mesh but sizes and centres it from the measured component-kit bounds. The
procedural rug and baked kick-contact accent are fallback-only and are hidden
for the loaded assembly. This removes two visual draws rather than adding scene
geometry or frame-time work, while retaining a physical ground beneath the
component stand and floor-tom feet.

For v42, the cloned CC0 crash stand is used as the right-side 20 in ride only
after a documented 460 mm-to-508 mm scale conversion. It is moved 640 mm
behind the floor tom, yawed and pitched so its bow does not cover the tom head,
and its brass material uses a restrained warm emissive contribution to remain
visible under the compact studio light. The existing cached kick pedal/beater
and showcase throne are retained in the loaded scene and added to the one-time
safe-fit bounds; these are not per-frame additions. The five-finger hand rig
keeps disconnected finger paths but batches them by its two existing materials,
which preserves gaps while recovering four calls across two hands. In v44 the
loaded showcase restores the throne as a grounded compact stool: a 0.66 m seat,
post joined to its underside, and one cached instanced tripod. Its root is 154
mm behind the measured component-kit rear envelope and it participates in the
one-time safe-fit bounds; the loaded kick pedal/beater remains visible.

Direct model/source records: [bass/toms GLB](https://cdn.3dassets.dev/assets/33793/v1/model.glb)
([source](https://3dassets.dev/assets/music-recording-studio-and-instruments-drum-kick-with--51472592)),
[snare GLB](https://cdn.3dassets.dev/assets/33794/v1/model.glb)
([source](https://3dassets.dev/assets/music-recording-studio-and-instruments-drum-snare-on-s-d42d8c13)),
[floor tom GLB](https://cdn.3dassets.dev/assets/33792/v1/model.glb),
[hi-hat GLB](https://cdn.3dassets.dev/assets/33795/v1/model.glb)
([source](https://3dassets.dev/assets/hi-hat-stand-ecb6728d)), and
[crash GLB](https://cdn.3dassets.dev/assets/33791/v1/model.glb)
([source](https://3dassets.dev/assets/cymbal-on-stand-3937c651)).
