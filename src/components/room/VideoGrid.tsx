// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useMemo, memo, useCallback } from "react";
import { VideoTile } from "./VideoTile";
import { Participant } from "@/types";
import { useScreenSize } from "@/hooks/useScreenSize";
import {
  calculateGridLayout,
  calculateTileSize,
  calculateGridStyle,
} from "@/utils/layoutHelpers";

interface VideoGridProps {
  participants: Map<string, Participant>;
  localParticipant?: Participant;
  pinnedId?: string | null;
  onPinParticipant?: (id: string | null) => void;
  videoFilter?: string;
  facingMode?: "user" | "environment";
}

// Composant pour la grille de vignettes en mode spotlight - mémoïsé
const ThumbnailStrip = memo(function ThumbnailStrip({
  others,
  localParticipant,
  onPinParticipant,
  facingMode,
}: {
  others: Participant[];
  localParticipant?: Participant;
  onPinParticipant?: (id: string | null) => void;
  facingMode?: "user" | "environment";
}) {
  const handlePin = useCallback(
    (id: string) => () => {
      onPinParticipant?.(id);
    },
    [onPinParticipant],
  );

  return (
    <div className="flex gap-3 overflow-x-auto shrink-0 h-20 sm:h-24 md:h-28">
      {others.map((p) => (
        <div
          key={p.id}
          className="shrink-0 h-full aspect-video rounded-xl overflow-hidden"
        >
          <VideoTile
            participant={p}
            isLocal={localParticipant?.id === p.id}
            size="small"
            onPin={handlePin(p.id)}
            facingMode={facingMode}
          />
        </div>
      ))}
    </div>
  );
});

// Composant pour une tuile de vidéo individuelle dans la grille - mémoïsé
const GridVideoTile = memo(function GridVideoTile({
  participant,
  isLocal,
  size,
  onPin,
  facingMode,
}: {
  participant: Participant;
  isLocal: boolean;
  size: "small" | "medium" | "large";
  onPin?: () => void;
  facingMode?: "user" | "environment";
}) {
  return (
    <div className="w-full h-full min-h-0 min-w-0">
      <VideoTile
        participant={participant}
        isLocal={isLocal}
        size={size}
        onPin={onPin}
        facingMode={facingMode}
      />
    </div>
  );
});

// Composant principal VideoGrid - mémoïsé
export const VideoGrid = memo(function VideoGrid({
  participants,
  localParticipant,
  pinnedId,
  onPinParticipant,
  videoFilter = "none",
  facingMode,
}: VideoGridProps) {
  const screenSize = useScreenSize();

  // Mémoriser la liste des participants pour éviter les recalculs
  const allParticipants = useMemo(() => {
    return localParticipant
      ? [localParticipant, ...Array.from(participants.values())]
      : Array.from(participants.values());
  }, [localParticipant, participants]);

  const count = allParticipants.length;

  // Mémoriser le participant épinglé
  const pinned = useMemo(
    () => (pinnedId ? allParticipants.find((p) => p.id === pinnedId) : null),
    [pinnedId, allParticipants],
  );

  const others = useMemo(
    () => (pinned ? allParticipants.filter((p) => p.id !== pinnedId) : []),
    [pinned, pinnedId, allParticipants],
  );

  // Determine grid layout based on participant count AND screen size - mémoïsé
  const layout = useMemo(
    () => calculateGridLayout(count, screenSize),
    [screenSize, count],
  );

  // Determine tile size based on participant count and screen size - mémoïsé
  const tileSize = useMemo(
    () => calculateTileSize(count, screenSize),
    [count, screenSize],
  );

  // Calculate optimal grid template based on layout - mémoïsé
  const gridStyle = useMemo(
    () => calculateGridStyle(layout, count, screenSize),
    [layout, count, screenSize],
  );

  // Callbacks mémoïsés pour éviter les re-renders
  const handleUnpin = useCallback(() => {
    onPinParticipant?.(null);
  }, [onPinParticipant]);

  const handlePinParticipant = useCallback(
    (id: string) => () => {
      onPinParticipant?.(id);
    },
    [onPinParticipant],
  );

  // Mode spotlight (participant épinglé)
  if (pinned) {
    return (
      <div
        className="h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden"
        style={{ filter: videoFilter }}
      >
        {/* Main participant - takes most of the space */}
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden">
          <VideoTile
            participant={pinned}
            isLocal={localParticipant?.id === pinned.id}
            isPinned
            size="large"
            onPin={handleUnpin}
            facingMode={facingMode}
          />
        </div>

        {/* Thumbnail strip at bottom for other participants */}
        {others.length > 0 && (
          <ThumbnailStrip
            others={others}
            localParticipant={localParticipant}
            onPinParticipant={onPinParticipant}
            facingMode={facingMode}
          />
        )}
      </div>
    );
  }

  // For 2 participants on small screens, use a special layout
  if (
    count === 2 &&
    (screenSize === "xs" || screenSize === "sm" || screenSize === "xxs")
  ) {
    return (
      <div
        className="h-full w-full p-2 sm:p-3 overflow-hidden flex flex-col gap-2 sm:gap-3"
        style={{ filter: videoFilter }}
      >
        {allParticipants.map((participant, index) => (
          <div
            key={participant.id}
            className="flex-1 min-h-0 w-full rounded-2xl overflow-hidden"
          >
            <GridVideoTile
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size={tileSize}
              onPin={handlePinParticipant(participant.id)}
              facingMode={facingMode}
            />
          </div>
        ))}
      </div>
    );
  }

  // For 3-4 participants on very small screens, use optimized 2x2 grid
  if (
    count >= 3 &&
    count <= 4 &&
    (screenSize === "xs" || screenSize === "xxs")
  ) {
    return (
      <div
        className="h-full w-full p-2 overflow-hidden"
        style={{ filter: videoFilter }}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-2 h-full w-full">
          {allParticipants.map((participant, index) => (
            <div key={participant.id} className="rounded-2xl overflow-hidden">
              <GridVideoTile
                participant={participant}
                isLocal={index === 0 && !!localParticipant}
                size="small"
                onPin={handlePinParticipant(participant.id)}
                facingMode={facingMode}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // For 3 participants on small screens (sm), use 2x2 grid with one empty slot
  if (count === 3 && screenSize === "sm") {
    return (
      <div
        className="h-full w-full p-2 sm:p-3 overflow-hidden"
        style={{ filter: videoFilter }}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:gap-3 h-full w-full">
          {allParticipants.map((participant, index) => (
            <div key={participant.id} className="rounded-2xl overflow-hidden">
              <GridVideoTile
                participant={participant}
                isLocal={index === 0 && !!localParticipant}
                size="small"
                onPin={handlePinParticipant(participant.id)}
                facingMode={facingMode}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Layout standard avec grille
  return (
    <div
      className="h-full w-full p-2 sm:p-3 md:p-4 overflow-hidden"
      style={{ filter: videoFilter }}
    >
      <div style={gridStyle}>
        {allParticipants.map((participant, index) => (
          <div key={participant.id} className="rounded-2xl overflow-hidden">
            <GridVideoTile
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size={tileSize}
              onPin={handlePinParticipant(participant.id)}
              facingMode={facingMode}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

// Export nommé pour la rétrocompatibilité
export default VideoGrid;
