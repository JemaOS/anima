// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect } from 'react';
import { VideoTile } from './VideoTile';
import { Participant } from '@/types';

interface VideoGridProps {
  participants: Map<string, Participant>;
  localParticipant?: Participant;
  pinnedId?: string | null;
  onPinParticipant?: (id: string | null) => void;
  videoFilter?: string;
}

// Custom hook to detect screen size
function useScreenSize() {
  const [screenSize, setScreenSize] = useState<'xs' | 'sm' | 'md' | 'lg'>('md');
  
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Consider both width and height for mobile detection
      // 4-inch phones: ~320px width
      // 5-inch phones: ~360px width
      // 6-inch phones: ~400px width
      // 8-inch tablets: ~600px width
      if (width < 380 || (width < 500 && height < 700)) {
        setScreenSize('xs'); // Very small phones (4-5 inches)
      } else if (width < 640) {
        setScreenSize('sm'); // Small phones (5-6 inches)
      } else if (width < 900) {
        setScreenSize('md'); // Large phones / small tablets (6-8 inches)
      } else {
        setScreenSize('lg'); // Tablets and desktops
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  return screenSize;
}

export function VideoGrid({
  participants,
  localParticipant,
  pinnedId,
  onPinParticipant,
  videoFilter = 'none',
}: VideoGridProps) {
  const screenSize = useScreenSize();
  
  const allParticipants = localParticipant
    ? [localParticipant, ...Array.from(participants.values())]
    : Array.from(participants.values());

  const count = allParticipants.length;
  
  // DIAGNOSTIC: Log participants being rendered
  console.log('[VideoGrid] Rendering participants:', {
    localParticipantId: localParticipant?.id,
    localParticipantName: localParticipant?.name,
    localHasStream: !!localParticipant?.stream,
    remoteParticipantsCount: participants.size,
    remoteParticipants: Array.from(participants.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      hasStream: !!p.stream,
      videoEnabled: p.videoEnabled,
      audioEnabled: p.audioEnabled,
      streamId: p.stream?.id,
      videoTracks: p.stream?.getVideoTracks().length || 0,
      audioTracks: p.stream?.getAudioTracks().length || 0,
    })),
    totalCount: count
  });

  // Determine grid layout based on participant count AND screen size
  const getGridLayout = () => {
    // For very small screens (4-5 inch phones)
    if (screenSize === 'xs') {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 1, rows: 2 }; // Stack vertically
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 2, rows: 3 };
      return { cols: 2, rows: 4 };
    }
    
    // For small screens (5-6 inch phones)
    if (screenSize === 'sm') {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 1, rows: 2 }; // Stack vertically for better visibility
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 2, rows: 3 };
      return { cols: 2, rows: 4 };
    }
    
    // For medium screens (6-8 inch phones/tablets)
    if (screenSize === 'md') {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 2, rows: 1 }; // Side by side is OK on larger screens
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 3, rows: 2 };
      return { cols: 3, rows: 3 };
    }
    
    // For large screens (tablets and desktops)
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 4, rows: 2 };
  };

  // Determine tile size based on participant count and screen size
  const getTileSize = (): 'small' | 'medium' | 'large' => {
    if (count === 1) return 'large';
    if (screenSize === 'xs' || screenSize === 'sm') {
      if (count === 2) return 'medium';
      return 'small';
    }
    if (count === 2) return 'large';
    if (count <= 4) return 'medium';
    return 'small';
  };

  // If a participant is pinned, show spotlight mode
  if (pinnedId) {
    const pinned = allParticipants.find(p => p.id === pinnedId);
    const others = allParticipants.filter(p => p.id !== pinnedId);

    if (pinned) {
      return (
        <div className="h-full flex flex-col gap-2 p-2 sm:p-3 overflow-hidden" style={{ filter: videoFilter }}>
          {/* Main participant - takes most of the space */}
          <div className="flex-1 min-h-0">
            <VideoTile
              participant={pinned}
              isLocal={localParticipant?.id === pinned.id}
              isPinned
              size="large"
              onPin={() => onPinParticipant?.(null)}
            />
          </div>

          {/* Thumbnail strip at bottom for other participants */}
          {others.length > 0 && (
            <div className="flex gap-2 overflow-x-auto shrink-0 h-20 sm:h-24 md:h-28">
              {others.map((p) => (
                <div
                  key={p.id}
                  className="shrink-0 h-full aspect-video"
                >
                  <VideoTile
                    participant={p}
                    isLocal={localParticipant?.id === p.id}
                    size="small"
                    onPin={() => onPinParticipant?.(p.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  const layout = getGridLayout();
  
  // Calculate optimal grid template based on layout
  const getGridStyle = () => {
    const { cols, rows } = layout;
    
    // Calculate the number of actual rows needed
    const actualRows = Math.ceil(count / cols);
    
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${actualRows}, 1fr)`,
      gap: screenSize === 'xs' ? '4px' : screenSize === 'sm' ? '6px' : '8px',
      height: '100%',
      width: '100%',
    };
  };

  // For 2 participants on small screens, use a special layout
  if (count === 2 && (screenSize === 'xs' || screenSize === 'sm')) {
    return (
      <div className="h-full w-full p-1 sm:p-2 overflow-hidden flex flex-col gap-1 sm:gap-2" style={{ filter: videoFilter }}>
        {allParticipants.map((participant, index) => (
          <div
            key={participant.id}
            className="flex-1 min-h-0 w-full"
          >
            <VideoTile
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size={getTileSize()}
              onPin={() => onPinParticipant?.(participant.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  // For 3-4 participants on very small screens, use optimized 2x2 grid
  if (count >= 3 && count <= 4 && screenSize === 'xs') {
    return (
      <div className="h-full w-full p-1 overflow-hidden" style={{ filter: videoFilter }}>
        <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full w-full">
          {allParticipants.map((participant, index) => (
            <div
              key={participant.id}
              className="w-full h-full min-h-0 min-w-0"
            >
              <VideoTile
                participant={participant}
                isLocal={index === 0 && !!localParticipant}
                size="small"
                onPin={() => onPinParticipant?.(participant.id)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-1 sm:p-2 md:p-3 overflow-hidden" style={{ filter: videoFilter }}>
      <div style={getGridStyle()}>
        {allParticipants.map((participant, index) => (
          <div
            key={participant.id}
            className="w-full h-full min-h-0 min-w-0 overflow-hidden"
          >
            <VideoTile
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size={getTileSize()}
              onPin={() => onPinParticipant?.(participant.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
