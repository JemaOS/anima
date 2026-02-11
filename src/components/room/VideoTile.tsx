// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  memo,
  useMemo,
} from "react";
import { Avatar, Icon } from "@/components/ui";
import { Participant, ConnectionQuality } from "@/types";

interface VideoTileProps {
  participant: Participant;
  isLocal?: boolean;
  isActive?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  size?: "small" | "medium" | "large";
}

// Helper to get connection quality color - memoized outside component
const getQualityColor = (quality?: ConnectionQuality): string => {
  switch (quality) {
    case "good":
      return "bg-green-500";
    case "medium":
      return "bg-yellow-500";
    case "poor":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
};

// Helper to get connection quality icon - memoized outside component
const getQualityBars = (quality?: ConnectionQuality): number => {
  switch (quality) {
    case "good":
      return 3;
    case "medium":
      return 2;
    case "poor":
      return 1;
    default:
      return 0;
  }
};

// Composant pour l'indicateur de qualité de connexion - séparé pour éviter les re-renders
const ConnectionQualityIndicator = memo(function ConnectionQualityIndicator({
  quality,
}: {
  quality?: ConnectionQuality;
}) {
  const bars = getQualityBars(quality);
  const colorClass = getQualityColor(quality);

  return (
    <div className="absolute top-2 left-2 z-20 flex items-end gap-0.5 bg-black/50 rounded px-1.5 py-1">
      {[1, 2, 3].map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-sm transition-all ${
            bar <= bars ? colorClass : "bg-gray-600"
          }`}
          style={{ height: `${bar * 4 + 2}px` }}
        />
      ))}
    </div>
  );
});

// Composant pour l'indicateur de parole - séparé pour éviter les re-renders fréquents
const SpeakingIndicator = memo(function SpeakingIndicator({
  audioLevel,
  size,
}: {
  audioLevel: number;
  size: "small" | "medium" | "large";
}) {
  const isSpeaking = audioLevel > 0.1;

  if (!isSpeaking) return null;

  return (
    <div
      className="absolute inset-0 border-2 border-green-500 rounded-lg pointer-events-none z-10 transition-opacity duration-150"
      style={{ opacity: Math.min(audioLevel * 3, 1) }}
    />
  );
});

// Composant pour l'indicateur audio avec niveau
const AudioIndicator = memo(function AudioIndicator({
  audioEnabled,
  audioLevel,
  size,
}: {
  audioEnabled: boolean;
  audioLevel: number;
  size: "small" | "medium" | "large";
}) {
  const isSpeaking = audioLevel > 0.1;

  if (!audioEnabled) {
    return (
      <span className="bg-danger-500/80 p-0.5 sm:p-1 rounded-full">
        <Icon name="mic-off" size={size === "small" ? 10 : 14} className="text-white" />
      </span>
    );
  }

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={`relative p-0.5 sm:p-1 rounded-full transition-all duration-150 ${
          isSpeaking ? "bg-green-500/90" : "bg-neutral-600/80"
        }`}
      >
        <Icon name="mic" size={size === "small" ? 10 : 14} className="text-white" />
        {isSpeaking && (
          <>
            <span
              className="absolute inset-0 rounded-full border border-green-400 animate-ping"
              style={{ animationDuration: "1s", opacity: Math.min(audioLevel * 2, 0.6) }}
            />
            <span
              className="absolute -inset-0.5 rounded-full border border-green-300 animate-ping"
              style={{
                animationDuration: "1.2s",
                animationDelay: "0.1s",
                opacity: Math.min(audioLevel * 1.5, 0.4),
              }}
            />
          </>
        )}
      </div>
      {isSpeaking && size !== "small" && (
        <div className="hidden sm:flex items-end gap-0.5 ml-1 h-3">
          {[0.15, 0.25, 0.35].map((threshold, i) => (
            <div
              key={i}
              className={`w-0.5 rounded-full transition-all duration-75 ${
                audioLevel > threshold ? "bg-green-400" : "bg-gray-500"
              }`}
              style={{
                height: `${(i + 1) * 4}px`,
                opacity: audioLevel > threshold ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Composant vidéo optimisé avec React.memo
export const VideoTile = memo(function VideoTile({
  participant,
  isLocal = false,
  isActive = false,
  isPinned = false,
  onPin,
  size = "medium",
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const streamIdRef = useRef<string | null>(null);

  // Track the video track ID to detect when it changes
  const [currentVideoTrackId, setCurrentVideoTrackId] = useState<string | null>(null);

  // Mémoriser les valeurs dérivées pour éviter les calculs répétés
  const hasVideo = useMemo(
    () => participant.videoEnabled && !!participant.stream,
    [participant.videoEnabled, participant.stream]
  );

  const isSpeaking = useMemo(
    () => (participant.audioLevel || 0) > 0.1,
    [participant.audioLevel]
  );

  // Handle stream binding with track change detection
  useEffect(() => {
    const video = videoRef.current;
    const currentStreamId = participant.stream?.id || null;
    const videoTrack = participant.stream?.getVideoTracks()[0];
    const videoTrackId = videoTrack?.id || null;

    if (!video || !participant.stream) {
      return;
    }

    // Store current stream ID for comparison
    streamIdRef.current = currentStreamId;

    // CRITICAL FIX: Detect video track changes and force re-attachment
    if (videoTrackId && videoTrackId !== currentVideoTrackId) {
      setCurrentVideoTrackId(videoTrackId);

      // Force re-attachment of stream to video element
      video.srcObject = null;
      const timeoutId = setTimeout(() => {
        if (video && participant.stream) {
          video.srcObject = participant.stream;
          video.play().catch(() => {});
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }

    // Always set srcObject to ensure it's attached
    video.srcObject = participant.stream;

    // CRITICAL FIX: For remote participants, ensure audio is NEVER muted
    if (!isLocal) {
      video.muted = false;
      video.volume = 1.0;

      // Force audio tracks to be enabled and unmuted
      participant.stream.getAudioTracks().forEach((track) => {
        track.enabled = true;

        // Listen for mute events from the track itself
        track.onmute = () => {
          console.warn("[VideoTile] Audio track muted:", track.id);
          // Try to re-enable
          track.enabled = true;
        };

        track.onunmute = () => {
          console.log("[VideoTile] Audio track unmuted:", track.id);
        };
      });

      // Also ensure video tracks are enabled
      participant.stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });

      // Ensure video plays with audio
      const playWithAudio = async () => {
        try {
          video.muted = false;
          await video.play();
          console.log("[VideoTile] Video playing with audio enabled");
        } catch (err) {
          console.error("[VideoTile] Failed to play video:", err);
        }
      };

      playWithAudio();
    }

    // Handle track changes - when tracks are added/removed from stream
    const handleTrackChange = (event: MediaStreamTrackEvent) => {
      if (video.srcObject !== participant.stream) {
        video.srcObject = participant.stream;
      }

      // If audio track was added, ensure it's enabled
      if (event.track?.kind === "audio" && !isLocal) {
        event.track.enabled = true;
        video.muted = false;
      }

      // If video track was added, ensure it's enabled
      if (event.track?.kind === "video" && !isLocal) {
        event.track.enabled = true;
      }

      // Force video to play after track change
      video.play().catch(() => {});
    };

    // Listen for track additions and removals
    participant.stream.addEventListener("addtrack", handleTrackChange);
    participant.stream.addEventListener("removetrack", handleTrackChange);

    // Robust play function - simpler approach
    const tryPlay = () => {
      if (!video || !participant.stream) return;

      // If already playing, we're done
      if (!video.paused) {
        setIsPlaying(true);
        return;
      }

      // Try to play
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay blocked or other error - will retry on interaction
      });
    };

    // Listen for video events to know when it's ready
    const handleCanPlay = () => {
      tryPlay();
    };

    const handlePlaying = () => {
      setIsPlaying(true);
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);

    // Initial play attempt after short delay
    const initialTimeout = setTimeout(tryPlay, 100);

    // For remote participants, monitor video track state periodically
    let monitorInterval: ReturnType<typeof setInterval> | null = null;
    if (!isLocal) {
      let lastVideoWidth = 0;
      let lastVideoHeight = 0;
      let noChangeCount = 0;

      monitorInterval = setInterval(() => {
        if (!video || !participant.stream) return;

        const currentWidth = video.videoWidth;
        const currentHeight = video.videoHeight;

        // Check if video dimensions changed (indicates frames are arriving)
        if (
          currentWidth === lastVideoWidth &&
          currentHeight === lastVideoHeight &&
          currentWidth === 0
        ) {
          noChangeCount++;
        } else {
          noChangeCount = 0;
        }

        lastVideoWidth = currentWidth;
        lastVideoHeight = currentHeight;
      }, 2000); // Réduit à 2s pour moins de charge
    }

    return () => {
      clearTimeout(initialTimeout);
      if (monitorInterval) clearInterval(monitorInterval);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      participant.stream?.removeEventListener("addtrack", handleTrackChange);
      participant.stream?.removeEventListener("removetrack", handleTrackChange);
    };
  }, [
    participant.stream,
    participant.id,
    isLocal,
    currentVideoTrackId,
    participant.videoEnabled,
  ]);

  // Handle video element errors - mémoïsé
  const handleVideoError = useCallback(() => {
    // Video error handled silently
  }, []);

  // Handle video loaded - mémoïsé
  const handleVideoLoaded = useCallback(() => {
    // Video loaded successfully
  }, []);

  // Handle can play - mémoïsé
  const handleCanPlay = useCallback(() => {
    videoRef.current?.play().catch((err) => {
      if (err.name !== "AbortError") {
        // Ignore abort errors
      }
    });
  }, []);

  // Mémoriser les classes CSS pour éviter les recalculs
  const containerClasses = useMemo(
    () =>
      `
        relative w-full h-full bg-neutral-800 rounded-lg overflow-hidden
        ${isActive ? "ring-2 ring-primary-500" : ""}
      `,
    [isActive]
  );

  const videoClasses = useMemo(
    () =>
      `w-full h-full object-contain bg-neutral-900 ${isLocal ? "transform -scale-x-100" : ""}`,
    [isLocal]
  );

  return (
    <div className={containerClasses}>
      {/* Active speaker indicator - green border when speaking */}
      <SpeakingIndicator audioLevel={participant.audioLevel || 0} size={size} />

      {/* Connection quality indicator */}
      {!isLocal && participant.connectionQuality && (
        <ConnectionQualityIndicator quality={participant.connectionQuality} />
      )}

      {/* Video stream or avatar */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={videoClasses}
          onError={handleVideoError}
          onLoadedData={handleVideoLoaded}
          onCanPlay={handleCanPlay}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar
            name={participant.name}
            id={participant.id}
            size={size === "small" ? "sm" : size === "medium" ? "md" : "xl"}
          />
        </div>
      )}

      {/* Hand raised indicator */}
      {participant.handRaised && (
        <div
          className={`absolute ${!isLocal && participant.connectionQuality ? "top-10" : "top-3"} left-3 bg-warning-500 p-1.5 rounded-full animate-pulse z-20`}
        >
          <Icon name="pan-tool" size={16} className="text-neutral-900" />
        </div>
      )}

      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute top-3 right-3 bg-primary-500 p-1.5 rounded-full">
          <Icon name="pin" size={16} className="text-white" />
        </div>
      )}

      {/* Screen sharing indicator */}
      {participant.screenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary-500/90 px-2 py-1 rounded-full flex items-center gap-1">
          <Icon name="screen-share" size={14} className="text-white" />
          <span className="text-white text-xs">Screen</span>
        </div>
      )}

      {/* Bottom overlay with name and mic status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 sm:p-2 md:p-3 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <AudioIndicator
              audioEnabled={participant.audioEnabled}
              audioLevel={participant.audioLevel || 0}
              size={size}
            />

            <span className="text-white text-[10px] sm:text-xs md:text-sm font-medium truncate max-w-[60px] sm:max-w-[100px] md:max-w-none">
              {participant.name} {isLocal && "(Vous)"}
            </span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1">
            {!participant.videoEnabled && (
              <span className="bg-neutral-600/80 p-0.5 sm:p-1 rounded-full">
                <Icon
                  name="videocam-off"
                  size={size === "small" ? 10 : 14}
                  className="text-white"
                />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pin button (on hover) */}
      {onPin && !isLocal && (
        <button
          onClick={onPin}
          className="absolute top-3 right-3 bg-neutral-900/60 p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity"
          aria-label={isPinned ? "Désépingler le participant" : "Épingler le participant"}
        >
          <Icon name="pin" size={16} className="text-white" />
        </button>
      )}
    </div>
  );
});

// Export nommé pour la rétrocompatibilité
export { VideoTile as default };
