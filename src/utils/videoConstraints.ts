// Video quality presets optimized for WebRTC
export interface VideoQualityPreset {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

// Device-based presets (auto-detection)
export const VIDEO_PRESETS: Record<string, VideoQualityPreset> = {
  // For mobile devices - balanced quality/performance
  mobile: {
    width: 640,
    height: 480,
    frameRate: 24,
    bitrate: 600000, // 600 kbps
  },
  // For tablets - higher quality
  tablet: {
    width: 960,
    height: 720,
    frameRate: 24,
    bitrate: 1000000, // 1 Mbps
  },
  // For desktop - best quality
  desktop: {
    width: 1280,
    height: 720,
    frameRate: 30,
    bitrate: 1500000, // 1.5 Mbps
  },
};

// User-selectable quality presets
export type VideoQualityLevel = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_PRESETS: Record<Exclude<VideoQualityLevel, 'auto'>, VideoQualityPreset> = {
  low: {
    width: 320,
    height: 240,
    frameRate: 15,
    bitrate: 150000, // 150 kbps
  },
  medium: {
    width: 640,
    height: 480,
    frameRate: 24,
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
export const VIDEO_QUALITY_STORAGE_KEY = 'anima-video-quality';

// Get saved video quality from localStorage
export const getSavedVideoQuality = (): VideoQualityLevel => {
  if (typeof window === 'undefined') return 'auto';
  const saved = localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
  if (saved && ['auto', 'low', 'medium', 'high', 'ultra'].includes(saved)) {
    return saved as VideoQualityLevel;
  }
  return 'auto';
};

// Save video quality to localStorage
export const saveVideoQuality = (quality: VideoQualityLevel): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, quality);
};

export const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  const ua = navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua) ||
    (window.innerWidth >= 768 && window.innerWidth < 1024 && 'ontouchstart' in window);
  
  if (isTablet) return 'tablet';
  if (isMobile) return 'mobile';
  return 'desktop';
};

export const getOptimalVideoConstraints = (
  facingMode: 'user' | 'environment' = 'user',
  useExact: boolean = false,
  deviceId?: string,
  qualityOverride?: VideoQualityLevel
): MediaTrackConstraints => {
  // Determine which preset to use
  let preset: VideoQualityPreset;
  
  if (qualityOverride && qualityOverride !== 'auto') {
    // Use user-selected quality preset
    preset = QUALITY_PRESETS[qualityOverride];
  } else {
    // Use device-based auto detection
    const deviceType = getDeviceType();
    preset = VIDEO_PRESETS[deviceType];
  }
  
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: {
      min: 320,
      ideal: preset.width,
      max: preset.width
    },
    height: {
      min: 240,
      ideal: preset.height,
      max: preset.height
    },
    frameRate: {
      min: 15,
      ideal: preset.frameRate,
      max: preset.frameRate
    },
    facingMode: useExact ? { exact: facingMode } : facingMode,
    aspectRatio: { ideal: 16/9 },
  };
};

export const getOptimalAudioConstraints = (): MediaTrackConstraints => {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
  };
};