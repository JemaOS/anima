// Video quality presets optimized for WebRTC
export interface VideoQualityPreset {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

// Device-based presets (auto-detection)
export const VIDEO_PRESETS: Record<string, VideoQualityPreset> = {
  // For mobile devices - Full HD baseline with adaptive quality
  mobile: {
    width: 1920,     // Full HD width
    height: 1080,    // Full HD height
    frameRate: 30,   // 30 fps for smoother video
    bitrate: 4000000, // 4 Mbps for Full HD quality
  },
  // For tablets - Full HD baseline with adaptive quality
  tablet: {
    width: 1920,     // Full HD width
    height: 1080,    // Full HD height
    frameRate: 30,
    bitrate: 4000000, // 4 Mbps for Full HD quality
  },
  // For desktop - Full HD baseline with adaptive quality
  desktop: {
    width: 1920,     // Full HD width
    height: 1080,    // Full HD height
    frameRate: 30,
    bitrate: 4000000, // 4 Mbps for Full HD quality
  },
};

// User-selectable quality presets
export type VideoQualityLevel = "auto" | "low" | "medium" | "high" | "ultra";

export const QUALITY_PRESETS: Record<
  Exclude<VideoQualityLevel, "auto">,
  VideoQualityPreset
> = {
  low: {
    width: 320,
    height: 240,
    frameRate: 30,
    bitrate: 150000, // 150 kbps
  },
  medium: {
    width: 640,
    height: 480,
    frameRate: 30,
    bitrate: 500000, // 500 kbps
  },
  high: {
    width: 1280,
    height: 720,
    frameRate: 30,
    bitrate: 1500000, // 1.5 Mbps
  },
  ultra: {
    width: 1920,
    height: 1080,
    frameRate: 60,
    bitrate: 4000000, // 4 Mbps for 1080p60
  },
};

// LocalStorage key for persisting video quality preference
export const VIDEO_QUALITY_STORAGE_KEY = "anima-video-quality";

// Cache pour le device type pour éviter les recalculs
let cachedDeviceType: "mobile" | "tablet" | "desktop" | null = null;
let cachedUserAgent = "";

// Get saved video quality from localStorage
export const getSavedVideoQuality = (): VideoQualityLevel => {
  if (typeof globalThis === "undefined") return "auto";
  const saved = localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
  if (saved && ["auto", "low", "medium", "high", "ultra"].includes(saved)) {
    return saved as VideoQualityLevel;
  }
  return "auto";
};

// Save video quality to localStorage
export const saveVideoQuality = (quality: VideoQualityLevel): void => {
  if (typeof globalThis === "undefined") return;
  localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, quality);
};

export const getDeviceType = (): "mobile" | "tablet" | "desktop" => {
  // Utiliser le cache si disponible et si le userAgent n'a pas changé
  const currentUA = navigator.userAgent;
  if (cachedDeviceType && cachedUserAgent === currentUA) {
    return cachedDeviceType;
  }

  const ua = currentUA;
  const isMobile =
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet =
    /iPad|Android(?!.*Mobile)/i.test(ua) ||
    (globalThis.innerWidth >= 768 &&
      globalThis.innerWidth < 1024 &&
      "ontouchstart" in globalThis);

  let result: "mobile" | "tablet" | "desktop";
  if (isTablet) {
    result = "tablet";
  } else if (isMobile) {
    result = "mobile";
  } else {
    result = "desktop";
  }

  // Mettre en cache
  cachedDeviceType = result;
  cachedUserAgent = currentUA;

  return result;
};

// Cache pour les contraintes vidéo
const constraintsCache = new Map<string, MediaTrackConstraints>();

export const getOptimalVideoConstraints = (
  facingMode: "user" | "environment" = "user",
  useExact: boolean = false,
  deviceId?: string,
  qualityOverride?: VideoQualityLevel
): MediaTrackConstraints => {
  // Créer une clé de cache unique
  const cacheKey = `${facingMode}-${useExact}-${deviceId || "default"}-${qualityOverride || "auto"}`;

  // Vérifier le cache
  const cached = constraintsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Determine which preset to use
  let preset: VideoQualityPreset;

  if (qualityOverride && qualityOverride !== "auto") {
    // Use user-selected quality preset
    preset = QUALITY_PRESETS[qualityOverride];
  } else {
    // Use device-based auto detection
    const deviceType = getDeviceType();
    preset = VIDEO_PRESETS[deviceType];
  }

  const result: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: {
      min: 320,
      ideal: preset.width,
      max: preset.width,
    },
    height: {
      min: 240,
      ideal: preset.height,
      max: preset.height,
    },
    frameRate: {
      min: 30,
      ideal: preset.frameRate,
      max: preset.frameRate,
    },
    facingMode: useExact ? { exact: facingMode } : facingMode,
    aspectRatio: { ideal: 16 / 9 },
  };

  // Mettre en cache
  constraintsCache.set(cacheKey, result);
  return result;
};

// Cache pour les contraintes audio
let cachedAudioConstraints: MediaTrackConstraints | null = null;

export const getOptimalAudioConstraints = (): MediaTrackConstraints => {
  if (cachedAudioConstraints) {
    return cachedAudioConstraints;
  }

  const result: MediaTrackConstraints = {
    // Enable audio processing for better quality
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    // Use mono for clearer voice transmission in P2P
    channelCount: 1,
    // Standard sample rate for WebRTC compatibility
    sampleRate: 48000,
    sampleSize: 16,
    // Latency optimization for real-time communication
    // @ts-expect-error - latency is supported in some browsers
    latency: 0.01,
  };

  cachedAudioConstraints = result;
  return result;
};

// Fonction utilitaire pour nettoyer un stream média
export const cleanupMediaStream = (stream: MediaStream | null): void => {
  if (!stream) return;

  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

// Fonction utilitaire pour vérifier si un stream est actif
export const isStreamActive = (stream: MediaStream | null): boolean => {
  if (!stream) return false;
  return stream.getTracks().some((track) => track.readyState === "live");
};

// Fonction pour obtenir les statistiques d'un stream vidéo
export const getVideoTrackStats = async (
  stream: MediaStream
): Promise<{
  width: number;
  height: number;
  frameRate: number;
}> => {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    return { width: 0, height: 0, frameRate: 0 };
  }

  const settings = videoTrack.getSettings();
  return {
    width: settings.width || 0,
    height: settings.height || 0,
    frameRate: settings.frameRate || 0,
  };
};
