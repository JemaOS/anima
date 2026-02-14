// Video style types and constants
export type VideoStyle =
  | "normal"
  | "contrast"
  | "bright"
  | "warm"
  | "cool"
  | "bw";

export const VIDEO_STYLES: Record<
  VideoStyle,
  { label: string; icon: string; filter: string }
> = {
  normal: {
    label: "Normal",
    icon: "contrast",
    filter: "none",
  },
  contrast: {
    label: "Contraste",
    icon: "exposure",
    filter: "contrast(1.2) saturate(1.1)",
  },
  bright: {
    label: "Lumineux",
    icon: "wb-sunny",
    filter: "brightness(1.15) contrast(1.05)",
  },
  warm: {
    label: "Chaud",
    icon: "local-fire-department",
    filter: "sepia(0.2) saturate(1.2) brightness(1.05)",
  },
  cool: {
    label: "Froid",
    icon: "ac-unit",
    filter: "saturate(0.9) hue-rotate(10deg) brightness(1.05)",
  },
  bw: {
    label: "Noir & Blanc",
    icon: "monochrome",
    filter: "grayscale(1) contrast(1.1)",
  },
};

// Storage key for video style persistence
const VIDEO_STYLE_STORAGE_KEY = "anima-video-style";

export const getSavedVideoStyle = (): VideoStyle => {
  try {
    const saved = localStorage.getItem(VIDEO_STYLE_STORAGE_KEY);
    if (saved && saved in VIDEO_STYLES) {
      return saved as VideoStyle;
    }
  } catch (e) {
    console.warn("Failed to read video style from localStorage:", e);
  }
  return "normal";
};

export const saveVideoStyle = (style: VideoStyle): void => {
  try {
    localStorage.setItem(VIDEO_STYLE_STORAGE_KEY, style);
  } catch (e) {
    console.warn("Failed to save video style to localStorage:", e);
  }
};