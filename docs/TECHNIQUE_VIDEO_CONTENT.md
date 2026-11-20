# Technique demonstration video content

The lesson demo now supports an optional self-hosted expert clip alongside the existing silent, step-through kit illustration. Keep the visual steps available as an accessible fallback. The player uses native controls, inline mobile playback, lazy loading, and one or more selectable WebVTT captions tracks.

No expert footage has been supplied yet, so no video appears in lessons. To publish a clip, record and review the demonstration with a drummer/educator, add the MP4 or WebM and its WebVTT captions under `public/technique-videos/`, then add a `techniqueDemoVideos` entry in `lib/technique-demo-videos.ts` keyed by the lesson ID:

```ts
"first-backbeat": {
  src: "/technique-videos/first-backbeat.mp4",
  mimeType: "video/mp4",
  poster: "/technique-videos/first-backbeat-poster.jpg",
  captionTracks: [
    { src: "/technique-videos/first-backbeat.en.vtt", language: "en", label: "English", isDefault: true },
  ],
  credit: "Demonstrated by Name, reviewed by Name",
}
```

Get written permission from performers and rights holders before publishing. Review the sticking, kit setup, camera angle, safety cues, and lesson notation with an experienced drummer. Captions must include spoken instruction and meaningful sound cues; provide translated caption files only after fluent review. Keep clips focused and compressed for mobile, and do not remove or replace the text and silent visual demonstration.
