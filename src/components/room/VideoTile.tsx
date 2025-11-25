import React, { useRef, useEffect, useCallback } from 'react';
import { Avatar, Icon } from '@/components/ui';
import { Participant, ConnectionQuality } from '@/types';

interface VideoTileProps {
  participant: Participant;
  isLocal?: boolean;
  isActive?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  size?: 'small' | 'medium' | 'large';
}

// Helper to get connection quality color
const getQualityColor = (quality?: ConnectionQuality): string => {
  switch (quality) {
    case 'good': return 'bg-green-500';
    case 'medium': return 'bg-yellow-500';
    case 'poor': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

// Helper to get connection quality icon
const getQualityBars = (quality?: ConnectionQuality): number => {
  switch (quality) {
    case 'good': return 3;
    case 'medium': return 2;
    case 'poor': return 1;
    default: return 0;
  }
};

export function VideoTile({
  participant,
  isLocal = false,
  isActive = false,
  isPinned = false,
  onPin,
  size = 'medium',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle stream binding with track change detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !participant.stream) return;

    console.log(`[VideoTile] 🎬 Setting up stream for ${participant.name}`, {
      isLocal,
      audioTracks: participant.stream.getAudioTracks().length,
      videoTracks: participant.stream.getVideoTracks().length,
      audioTrackDetails: participant.stream.getAudioTracks().map(t => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })),
      videoTrackDetails: participant.stream.getVideoTracks().map(t => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      }))
    });

    // Force update even if stream reference is same
    if (video.srcObject !== participant.stream) {
      console.log(`[VideoTile] 📺 Setting srcObject for ${participant.name}`);
      video.srcObject = participant.stream;
    }

    // Ensure audio is not muted for remote participants
    if (!isLocal) {
      console.log(`[VideoTile] 🔊 Configuring audio for remote participant ${participant.name}`, {
        currentMuted: video.muted,
        currentVolume: video.volume
      });
      video.muted = false;
      video.volume = 1.0;
      
      // Ensure audio tracks are enabled
      participant.stream.getAudioTracks().forEach(track => {
        console.log(`[VideoTile] 🎤 Audio track for ${participant.name}:`, {
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
        if (!track.enabled) {
          console.log(`[VideoTile] ✅ Enabling audio track for ${participant.name}`);
          track.enabled = true;
        }
      });
      
      // Also ensure video tracks are enabled
      participant.stream.getVideoTracks().forEach(track => {
        console.log(`[VideoTile] 📹 Video track for ${participant.name}:`, {
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
        if (!track.enabled) {
          console.log(`[VideoTile] ✅ Enabling video track for ${participant.name}`);
          track.enabled = true;
        }
      });
    }

    // Handle track changes - when tracks are added/removed from stream
    const handleTrackChange = (event: MediaStreamTrackEvent) => {
      console.log(`[VideoTile] 🔄 Track ${event.type} for ${participant.name}:`, {
        kind: event.track?.kind,
        id: event.track?.id,
        enabled: event.track?.enabled,
        muted: event.track?.muted
      });
      
      if (video.srcObject !== participant.stream) {
        video.srcObject = participant.stream;
      }
      
      // If audio track was added, ensure it's enabled
      if (event.track?.kind === 'audio' && !isLocal) {
        event.track.enabled = true;
        video.muted = false;
        console.log(`[VideoTile] 🔊 Audio track added and enabled for ${participant.name}`);
      }
      
      // If video track was added, ensure it's enabled
      if (event.track?.kind === 'video' && !isLocal) {
        event.track.enabled = true;
        console.log(`[VideoTile] 📹 Video track added and enabled for ${participant.name}`);
      }
      
      // Force video to play after track change
      video.play().catch(err => {
        console.log(`[VideoTile] ⚠️ Play after track change failed for ${participant.name}:`, err.name);
      });
    };

    // Listen for track additions and removals
    participant.stream.addEventListener('addtrack', handleTrackChange);
    participant.stream.addEventListener('removetrack', handleTrackChange);

    // Also handle track ended events on individual tracks
    const tracks = participant.stream.getTracks();
    const handleTrackEnded = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] ❌ Track ended for ${participant.name}:`, track.kind);
    };
    
    const handleTrackMute = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] 🔇 Track muted for ${participant.name}:`, track.kind, track.muted);
    };
    
    const handleTrackUnmute = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] 🔊 Track unmuted for ${participant.name}:`, track.kind);
    };
    
    tracks.forEach(track => {
      track.addEventListener('ended', handleTrackEnded);
      track.addEventListener('mute', handleTrackMute);
      track.addEventListener('unmute', handleTrackUnmute);
    });

    // Ensure video plays
    const playVideo = async () => {
      try {
        await video.play();
        console.log(`[VideoTile] ▶️ Video playing for ${participant.name}`, {
          paused: video.paused,
          muted: video.muted,
          volume: video.volume,
          readyState: video.readyState
        });
      } catch (err: any) {
        console.log(`[VideoTile] ⚠️ Initial play failed for ${participant.name}:`, err.name, err.message);
        
        // If autoplay was blocked, try playing on user interaction
        if (err.name === 'NotAllowedError') {
          console.log(`[VideoTile] 👆 Waiting for user interaction to play for ${participant.name}`);
          const playOnInteraction = () => {
            video.play().then(() => {
              console.log(`[VideoTile] ▶️ Video playing after interaction for ${participant.name}`);
            }).catch(() => {});
            document.removeEventListener('click', playOnInteraction);
            document.removeEventListener('touchstart', playOnInteraction);
          };
          document.addEventListener('click', playOnInteraction, { once: true });
          document.addEventListener('touchstart', playOnInteraction, { once: true });
        }
      }
    };
    
    playVideo();

    return () => {
      participant.stream?.removeEventListener('addtrack', handleTrackChange);
      participant.stream?.removeEventListener('removetrack', handleTrackChange);
      tracks.forEach(track => {
        track.removeEventListener('ended', handleTrackEnded);
        track.removeEventListener('mute', handleTrackMute);
        track.removeEventListener('unmute', handleTrackUnmute);
      });
    };
  }, [participant.stream, participant.id, participant.name, isLocal]);

  // Handle video element errors
  const handleVideoError = useCallback((_e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    // Video error handled silently
  }, []);

  // Handle video loaded
  const handleVideoLoaded = useCallback(() => {
    // Video loaded successfully
  }, []);

  // Determine if participant is speaking (audio level > threshold)
  const isSpeaking = (participant.audioLevel || 0) > 0.1;

  return (
    <div
      className={`
        relative w-full h-full bg-neutral-800 rounded-lg overflow-hidden
        ${isActive ? 'ring-2 ring-primary-500' : ''}
      `}
    >
      {/* Active speaker indicator - green border when speaking */}
      {isSpeaking && !isLocal && (
        <div
          className="absolute inset-0 border-2 border-green-500 rounded-lg pointer-events-none z-10 transition-opacity duration-150"
          style={{ opacity: Math.min((participant.audioLevel || 0) * 3, 1) }}
        />
      )}

      {/* Connection quality indicator */}
      {!isLocal && participant.connectionQuality && (
        <div className="absolute top-2 left-2 z-20 flex items-end gap-0.5 bg-black/50 rounded px-1.5 py-1">
          {[1, 2, 3].map((bar) => (
            <div
              key={bar}
              className={`w-1 rounded-sm transition-all ${
                bar <= getQualityBars(participant.connectionQuality)
                  ? getQualityColor(participant.connectionQuality)
                  : 'bg-gray-600'
              }`}
              style={{ height: `${bar * 4 + 2}px` }}
            />
          ))}
        </div>
      )}

      {/* Video stream or avatar */}
      {participant.videoEnabled && participant.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-contain bg-neutral-900 ${isLocal ? 'transform -scale-x-100' : ''}`}
          onError={handleVideoError}
          onLoadedData={handleVideoLoaded}
          onCanPlay={() => {
            // Ensure video plays when ready
            videoRef.current?.play().catch(() => {});
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={participant.name} id={participant.id} size={size === 'small' ? 'sm' : size === 'medium' ? 'md' : 'xl'} />
        </div>
      )}

      {/* Hand raised indicator - adjusted position to not overlap with quality indicator */}
      {participant.handRaised && (
        <div className={`absolute ${!isLocal && participant.connectionQuality ? 'top-10' : 'top-3'} left-3 bg-warning-500 p-1.5 rounded-full animate-pulse z-20`}>
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
            {/* Audio level indicator bar - hidden on very small tiles */}
            {!isLocal && participant.audioEnabled && size !== 'small' && (
              <div className="w-1 h-3 sm:h-4 bg-gray-600 rounded-full overflow-hidden hidden sm:block">
                <div
                  className="w-full bg-green-500 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.min((participant.audioLevel || 0) * 100, 100)}%`,
                    transform: 'translateY(100%)',
                    marginTop: `-${Math.min((participant.audioLevel || 0) * 100, 100)}%`
                  }}
                />
              </div>
            )}
            <span className="text-white text-[10px] sm:text-xs md:text-sm font-medium truncate max-w-[60px] sm:max-w-[100px] md:max-w-none">
              {participant.name} {isLocal && '(Vous)'}
            </span>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-1">
            {!participant.audioEnabled && (
              <span className="bg-danger-500/80 p-0.5 sm:p-1 rounded-full">
                <Icon name="mic-off" size={10} className="text-white sm:hidden" />
                <Icon name="mic-off" size={14} className="text-white hidden sm:block" />
              </span>
            )}
            {!participant.videoEnabled && (
              <span className="bg-neutral-600/80 p-0.5 sm:p-1 rounded-full">
                <Icon name="videocam-off" size={10} className="text-white sm:hidden" />
                <Icon name="videocam-off" size={14} className="text-white hidden sm:block" />
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
          aria-label={isPinned ? 'Désépingler le participant' : 'Épingler le participant'}
        >
          <Icon name="pin" size={16} className="text-white" />
        </button>
      )}
    </div>
  );
}
