export type TechniqueDemoVideo = {
  src: string;
  mimeType: "video/mp4" | "video/webm";
  poster?: string;
  captionTracks: Array<{ src: string; language: string; label: string; isDefault?: boolean }>;
  credit: string;
};

// Add a reviewed, captioned local clip here by lesson ID. The existing SVG
// demonstration remains available when a lesson has no expert footage.
export const techniqueDemoVideos: Partial<Record<string, TechniqueDemoVideo>> = {};
