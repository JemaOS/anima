// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useRef, useEffect, useCallback, useState } from 'react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const streamIdRef = useRef<string | null>(null);

  // Track the video track ID to detect when it changes
  const [currentVideoTrackId, setCurrentVideoTrackId] = useState<string | null>(null);
  
  // Handle stream binding with track change detection
  useEffect(() => {
    const video = videoRef.current;
    const currentStreamId = participant.stream?.id || null;
    const videoTrack = participant.stream?.getVideoTracks()[0];
    const videoTrackId = videoTrack?.id || null;
    
    // Debug logging - use string concatenation for better visibility in console
    const streamInfo = participant.stream ? {
      streamId: participant.stream.id,
      audioTracks: participant.stream.getAudioTracks().length,
      videoTracks: participant.stream.getVideoTracks().length,
      audioEnabled: participant.stream.getAudioTracks().map(t => t.enabled),
      videoEnabled: participant.stream.getVideoTracks().map(t => t.enabled),
      audioMuted: participant.stream.getAudioTracks().map(t => t.muted),
      videoMuted: participant.stream.getVideoTracks().map(t => t.muted),
      audioReadyState: participant.stream.getAudioTracks().map(t => t.readyState),
      videoReadyState: participant.stream.getVideoTracks().map(t => t.readyState),
    } : null;
    
    console.log(`[VideoTile] ${participant.name} (${isLocal ? 'LOCAL' : 'REMOTE'}): hasStream=${!!participant.stream}, videoEnabled=${participant.videoEnabled}, videoTrackId=${videoTrackId}, streamInfo=`, streamInfo);
    
    if (!video || !participant.stream) {
      console.log(`[VideoTile] ${participant.name}: Early return - hasVideo=${!!video}, hasStream=${!!participant.stream}`);
      return;
    }
    
    // Store current stream ID for comparison
    streamIdRef.current = currentStreamId;
    
    // CRITICAL FIX: Detect video track changes and force re-attachment
    if (videoTrackId && videoTrackId !== currentVideoTrackId) {
      console.log(`[VideoTile] ${participant.name}: 🔄 VIDEO TRACK CHANGED!`, {
        oldTrackId: currentVideoTrackId,
        newTrackId: videoTrackId,
        trackEnabled: videoTrack?.enabled,
        trackMuted: videoTrack?.muted,
        trackReadyState: videoTrack?.readyState
      });
      setCurrentVideoTrackId(videoTrackId);
      
      // Force re-attachment of stream to video element
      video.srcObject = null;
      setTimeout(() => {
        if (video && participant.stream) {
          video.srcObject = participant.stream;
          video.play().catch(e => console.log(`[VideoTile] ${participant.name}: Play after track change error: ${e.message}`));
        }
      }, 50);
    }
    
    // Log video element state
    console.log(`[VideoTile] ${participant.name}: Attaching stream to video element`, {
      currentSrcObject: video.srcObject ? 'exists' : 'null',
      videoMuted: video.muted,
      videoVolume: video.volume,
      videoPaused: video.paused,
      videoReadyState: video.readyState
    });

    // Always set srcObject to ensure it's attached
    video.srcObject = participant.stream;

    // Ensure audio is not muted for remote participants
    if (!isLocal) {
      video.muted = false;
      video.volume = 1.0;
      
      // Ensure audio tracks are enabled
      participant.stream.getAudioTracks().forEach(track => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });
      
      // Also ensure video tracks are enabled
      participant.stream.getVideoTracks().forEach(track => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });
    }

    // Handle track changes - when tracks are added/removed from stream
    const handleTrackChange = (event: MediaStreamTrackEvent) => {
      if (video.srcObject !== participant.stream) {
        video.srcObject = participant.stream;
      }
      
      // If audio track was added, ensure it's enabled
      if (event.track?.kind === 'audio' && !isLocal) {
        event.track.enabled = true;
        video.muted = false;
      }
      
      // If video track was added, ensure it's enabled
      if (event.track?.kind === 'video' && !isLocal) {
        event.track.enabled = true;
      }
      
      // Force video to play after track change
      video.play().catch(() => {});
    };

    // Listen for track additions and removals
    participant.stream.addEventListener('addtrack', handleTrackChange);
    participant.stream.addEventListener('removetrack', handleTrackChange);

    // Also handle track ended events on individual tracks
    const tracks = participant.stream.getTracks();
    const handleTrackEnded = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] ${participant.name}: 🔴 Track ENDED`, {
        trackKind: track.kind,
        trackId: track.id,
        trackLabel: track.label
      });
    };
    const handleTrackMute = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] ${participant.name}: 🔇 Track MUTED (no data flowing)`, {
        trackKind: track.kind,
        trackId: track.id,
        trackEnabled: track.enabled,
        trackReadyState: track.readyState
      });
      // If video track is muted, this means no video data is being received
      if (track.kind === 'video') {
        console.log(`[VideoTile] ${participant.name}: ⚠️ VIDEO TRACK MUTED - This is why video is not showing!`);
      }
    };
    const handleTrackUnmute = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log(`[VideoTile] ${participant.name}: 🔊 Track UNMUTED (data now flowing)`, {
        trackKind: track.kind,
        trackId: track.id,
        trackEnabled: track.enabled,
        trackReadyState: track.readyState
      });
      // If video track unmutes, try to play video
      if (track.kind === 'video' && video) {
        console.log(`[VideoTile] ${participant.name}: ✅ Video track unmuted, attempting to play`);
        
        // Force re-assignment of srcObject to kickstart video if needed
        if (video.srcObject === participant.stream) {
           video.srcObject = null;
           setTimeout(() => {
             if (video) {
               video.srcObject = participant.stream;
               video.play().catch((e) => console.log(`[VideoTile] Play retry error: ${e.message}`));
             }
           }, 50);
        } else {
           video.play().catch((e) => console.log(`[VideoTile] Play error: ${e.message}`));
        }
      }
    };
    
    tracks.forEach(track => {
      track.addEventListener('ended', handleTrackEnded);
      track.addEventListener('mute', handleTrackMute);
      track.addEventListener('unmute', handleTrackUnmute);
      
      // DIAGNOSTIC: Log initial muted state of each track
      console.log(`[VideoTile] ${participant.name}: Track initial state`, {
        trackKind: track.kind,
        trackId: track.id,
        trackEnabled: track.enabled,
        trackMuted: track.muted,
        trackReadyState: track.readyState
      });
      
      // If video track is already muted, log a warning
      if (track.kind === 'video' && track.muted) {
        console.log(`[VideoTile] ${participant.name}: ⚠️ VIDEO TRACK IS ALREADY MUTED ON ATTACH - no video data will show!`);
      }
    });

    // Robust play function - simpler approach
    const tryPlay = () => {
      if (!video || !participant.stream) return;
      
      // Get track details
      const videoTrack = participant.stream.getVideoTracks()[0];
      const audioTrack = participant.stream.getAudioTracks()[0];
      
      // Log detailed state
      console.log(`[VideoTile] ${participant.name}: tryPlay - video state:`, {
        paused: video.paused,
        readyState: video.readyState,
        networkState: video.networkState,
        currentTime: video.currentTime,
        srcObject: video.srcObject ? 'set' : 'null',
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        // Track details
        videoTrack: videoTrack ? {
          id: videoTrack.id,
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          readyState: videoTrack.readyState,
          label: videoTrack.label,
          // @ts-ignore - getSettings may not be available
          settings: videoTrack.getSettings ? videoTrack.getSettings() : 'N/A'
        } : 'NO VIDEO TRACK',
        audioTrack: audioTrack ? {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState
        } : 'NO AUDIO TRACK'
      });
      
      // If already playing, we're done
      if (!video.paused) {
        console.log(`[VideoTile] ${participant.name}: ✅ Video is playing!`);
        setIsPlaying(true);
        return;
      }
      
      // Try to play
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log(`[VideoTile] ${participant.name}: ✅ Video playing successfully!`);
          setIsPlaying(true);
        }).catch((err) => {
          console.log(`[VideoTile] ${participant.name}: Play error: ${err.name} - ${err.message}`);
          if (err.name === 'NotAllowedError') {
            // Autoplay blocked - need user interaction
            console.log(`[VideoTile] ${participant.name}: Autoplay blocked, click anywhere to play`);
          }
        });
      }
    };
    
    // Listen for video events to know when it's ready
    const handleCanPlay = () => {
      console.log(`[VideoTile] ${participant.name}: canplay event fired`);
      tryPlay();
    };
    
    const handleLoadedMetadata = () => {
      console.log(`[VideoTile] ${participant.name}: loadedmetadata event fired`, {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration
      });
    };
    
    const handlePlaying = () => {
      console.log(`[VideoTile] ${participant.name}: playing event fired`);
      setIsPlaying(true);
    };
    
    const handleWaiting = () => {
      console.log(`[VideoTile] ${participant.name}: waiting event fired (buffering)`);
    };
    
    const handleStalled = () => {
      console.log(`[VideoTile] ${participant.name}: stalled event fired`);
    };
    
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    
    // Initial play attempt after short delay
    const initialTimeout = setTimeout(tryPlay, 100);
    
    // Also try again after a longer delay in case stream needs time
    const retryTimeout = setTimeout(tryPlay, 500);
    
    // For remote participants, monitor video track state periodically
    let monitorInterval: ReturnType<typeof setInterval> | null = null;
    if (!isLocal) {
      let lastVideoWidth = 0;
      let lastVideoHeight = 0;
      let noChangeCount = 0;
      
      monitorInterval = setInterval(() => {
        if (!video || !participant.stream) return;
        
        const videoTrack = participant.stream.getVideoTracks()[0];
        const currentWidth = video.videoWidth;
        const currentHeight = video.videoHeight;
        
        // Check if video dimensions changed (indicates frames are arriving)
        if (currentWidth === lastVideoWidth && currentHeight === lastVideoHeight && currentWidth === 0) {
          noChangeCount++;
          if (noChangeCount === 5) { // After 5 seconds of no video
            console.log(`[VideoTile] ${participant.name}: ⚠️ NO VIDEO DATA after 5s`, {
              videoWidth: currentWidth,
              videoHeight: currentHeight,
              readyState: video.readyState,
              networkState: video.networkState,
              videoTrackState: videoTrack ? {
                enabled: videoTrack.enabled,
                muted: videoTrack.muted,
                readyState: videoTrack.readyState
              } : 'NO TRACK'
            });
          }
        } else {
          noChangeCount = 0;
          if (currentWidth > 0 && currentHeight > 0) {
            console.log(`[VideoTile] ${participant.name}: ✅ Video data flowing`, {
              videoWidth: currentWidth,
              videoHeight: currentHeight
            });
          }
        }
        
        lastVideoWidth = currentWidth;
        lastVideoHeight = currentHeight;
      }, 1000);
    }

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(retryTimeout);
      if (monitorInterval) clearInterval(monitorInterval);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
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
            videoRef.current?.play().catch((err) => {
              if (err.name !== 'AbortError') {
                console.log(`[VideoTile] ${participant.name}: onCanPlay play failed: ${err.message}`);
              }
            });
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
            {/* Audio activity indicator - animated mic icon like Google Meet */}
            {participant.audioEnabled && (
              <div className="relative flex items-center justify-center">
                {/* Mic icon with animated rings when speaking */}
                <div className={`relative p-0.5 sm:p-1 rounded-full transition-all duration-150 ${
                  isSpeaking ? 'bg-green-500/90' : 'bg-neutral-600/80'
                }`}>
                  <Icon name="mic" size={10} className="text-white sm:hidden" />
                  <Icon name="mic" size={14} className="text-white hidden sm:block" />
                  
                  {/* Animated sound waves when speaking */}
                  {isSpeaking && (
                    <>
                      {/* Inner ring */}
                      <span
                        className="absolute inset-0 rounded-full border border-green-400 animate-ping"
                        style={{
                          animationDuration: '1s',
                          opacity: Math.min((participant.audioLevel || 0) * 2, 0.6)
                        }}
                      />
                      {/* Outer ring */}
                      <span
                        className="absolute -inset-0.5 rounded-full border border-green-300 animate-ping"
                        style={{
                          animationDuration: '1.2s',
                          animationDelay: '0.1s',
                          opacity: Math.min((participant.audioLevel || 0) * 1.5, 0.4)
                        }}
                      />
                    </>
                  )}
                </div>
                
                {/* Audio level bars (Google Meet style) - only on larger screens */}
                {isSpeaking && size !== 'small' && (
                  <div className="hidden sm:flex items-end gap-0.5 ml-1 h-3">
                    {[0.15, 0.25, 0.35].map((threshold, i) => (
                      <div
                        key={i}
                        className={`w-0.5 rounded-full transition-all duration-75 ${
                          (participant.audioLevel || 0) > threshold ? 'bg-green-400' : 'bg-gray-500'
                        }`}
                        style={{
                          height: `${(i + 1) * 4}px`,
                          opacity: (participant.audioLevel || 0) > threshold ? 1 : 0.4
                        }}
                      />
                    ))}
                  </div>
                )}
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
