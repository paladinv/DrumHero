# Play-Along imported audio

Play-Along Studio can layer up to six local audio stems over its original synthesized accompaniment. The form defines section boundaries and per-section tempo; stems share a sync tempo and each has its own first-downbeat offset and volume. A stem can be muted with its volume control. Preview each stem once before starting the synchronized form so the browser can unlock its audio output.

Import limits are 60 MiB per audio file and 120 MiB for the complete Play-Along stem set. The global **Manage local audio storage** panel lists these files alongside Song Library and Trainer recordings, shows their byte sizes, and offers individual export and confirmed deletion. Removing the offline page download leaves imported audio alone.

For each stem, users can add a source and rights note. Drum Hero asks the user to confirm that they own or have permission to use imported audio, but it does not verify ownership, the license, or the notes. **Export rights note** creates a small JSON sidecar; **Export original** saves the audio file separately. Review both files before sharing them.

Imported audio and its notes remain in this browser's IndexedDB. They are not uploaded or included in the offline page cache. The current export produces separate audio and note files; a complete cross-device package that bundles a form and all stems is still future work.

## Release checks

- Import one and several stems, reload the page, and verify all names, offsets, volume levels, source notes, and rights notes remain.
- Align two stems with different leading silence, preview each, and check synchronization over a full form with section tempo changes and loop wraparound.
- Confirm the browser storage limit rejects files above the per-file or combined limit without leaving partial records.
- Export an original and its rights note, then verify the notes identify the matching filename and retain the source and permission text.
- Delete one stem from the mixer and multiple stems from **Manage local audio storage**; verify other stems, songs, and recordings remain available.
- Download the offline page cache, go offline, and confirm saved stems still play. Remove the page cache and confirm local audio remains.

These are release checks. They have not been run on every listed browser or physical device.
