// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect, useMemo, memo, useCallback } from "react";
import { VideoTile } from "./VideoTile";
import { Participant } from "@/types";

interface VideoGridProps {
  participants: Map<string, Participant>;
  localParticipant?: Participant;
  pinnedId?: string | null;
  onPinParticipant?: (id: string | null) => void;
  videoFilter?: string;
}

// Hook personnalisé pour détecter la taille de l'écran - optimisé
function useScreenSize() {
  const [screenSize, setScreenSize] = useState<"xxs" | "xs" | "sm" | "md" | "lg" | "foldable">("md");

  useEffect(() => {
    // Utiliser requestAnimationFrame pour éviter les recalculs excessifs
    let rafId: number | null = null;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const updateSize = () => {
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspectRatio = width / height;

        // Ne mettre à jour que si la taille a significativement changé
        if (Math.abs(width - lastWidth) < 20 && Math.abs(height - lastHeight) < 20) {
          return;
        }

        lastWidth = width;
        lastHeight = height;

        // Detect foldable devices (Honor Magic V3, Samsung Fold, etc.)
        // These typically have unusual aspect ratios when unfolded
        const isFoldable =
          /Magic V|Fold|Flip/i.test(navigator.userAgent) ||
          (width > 700 && width < 900 && aspectRatio > 0.8 && aspectRatio < 1.2);

        if (isFoldable) {
          setScreenSize("foldable");
        } else if (width < 340) {
          setScreenSize("xxs"); // iPhone 5s, SE (1st gen)
        } else if (width < 380 || (width < 500 && height < 700)) {
          setScreenSize("xs");
        } else if (width < 640) {
          setScreenSize("sm");
        } else if (width < 900) {
          setScreenSize("md");
        } else {
          setScreenSize("lg");
        }
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize, { passive: true });
    return () => {
      window.removeEventListener("resize", updateSize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return screenSize;
}

// Composant pour la grille de vignettes en mode spotlight - mémoïsé
const ThumbnailStrip = memo(function ThumbnailStrip({
  others,
  localParticipant,
  onPinParticipant,
}: {
  others: Participant[];
  localParticipant?: Participant;
  onPinParticipant?: (id: string | null) => void;
}) {
  const handlePin = useCallback(
    (id: string) => () => {
      onPinParticipant?.(id);
    },
    [onPinParticipant]
  );

  return (
    <div className="flex gap-2 overflow-x-auto shrink-0 h-20 sm:h-24 md:h-28">
      {others.map((p) => (
        <div key={p.id} className="shrink-0 h-full aspect-video">
          <VideoTile
            participant={p}
            isLocal={localParticipant?.id === p.id}
            size="small"
            onPin={handlePin(p.id)}
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
}: {
  participant: Participant;
  isLocal: boolean;
  size: "small" | "medium" | "large";
  onPin?: () => void;
}) {
  return (
    <div className="w-full h-full min-h-0 min-w-0 overflow-hidden">
      <VideoTile participant={participant} isLocal={isLocal} size={size} onPin={onPin} />
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
    [pinnedId, allParticipants]
  );

  const others = useMemo(
    () => (pinned ? allParticipants.filter((p) => p.id !== pinnedId) : []),
    [pinned, pinnedId, allParticipants]
  );

  // Determine grid layout based on participant count AND screen size - mémoïsé
  const layout = useMemo(() => {
    // For ultra-small screens (iPhone 5s - 320px)
    if (screenSize === "xxs") {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 1, rows: 2 };
      if (count <= 4) return { cols: 2, rows: 2 };
      return { cols: 2, rows: Math.ceil(count / 2) };
    }

    // For very small screens (4-5 inch phones)
    if (screenSize === "xs") {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 1, rows: 2 };
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 2, rows: 3 };
      return { cols: 2, rows: 4 };
    }

    // For small screens (5-6 inch phones)
    if (screenSize === "sm") {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 1, rows: 2 };
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 2, rows: 3 };
      return { cols: 2, rows: 4 };
    }

    // For foldable devices (Honor Magic V3, etc.)
    if (screenSize === "foldable") {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 2, rows: 1 };
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 3, rows: 2 };
      return { cols: 3, rows: 3 };
    }

    // For medium screens (6-8 inch phones/tablets)
    if (screenSize === "md") {
      if (count === 1) return { cols: 1, rows: 1 };
      if (count === 2) return { cols: 2, rows: 1 };
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
  }, [screenSize, count]);

  // Determine tile size based on participant count and screen size - mémoïsé
  const tileSize = useMemo<"small" | "medium" | "large">(() => {
    if (count === 1) return "large";
    if (screenSize === "xs" || screenSize === "sm") {
      if (count === 2) return "medium";
      return "small";
    }
    if (count === 2) return "large";
    if (count <= 4) return "medium";
    return "small";
  }, [count, screenSize]);

  // Calculate optimal grid template based on layout - mémoïsé
  const gridStyle = useMemo(() => {
    const { cols, rows } = layout;
    const actualRows = Math.ceil(count / cols);

    const gap =
      screenSize === "xxs" ? "2px" :
      screenSize === "xs" ? "4px" :
      screenSize === "sm" ? "6px" : "8px";

    return {
      display: "grid" as const,
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${actualRows}, 1fr)`,
      gap,
      height: "100%",
      width: "100%",
      padding: screenSize === "xxs" ? "2px" : undefined,
    };
  }, [layout, count, screenSize]);

  // Callbacks mémoïsés pour éviter les re-renders
  const handleUnpin = useCallback(() => {
    onPinParticipant?.(null);
  }, [onPinParticipant]);

  const handlePinParticipant = useCallback(
    (id: string) => () => {
      onPinParticipant?.(id);
    },
    [onPinParticipant]
  );

  // Mode spotlight (participant épinglé)
  if (pinned) {
    return (
      <div
        className="h-full flex flex-col gap-2 p-2 sm:p-3 overflow-hidden"
        style={{ filter: videoFilter }}
      >
        {/* Main participant - takes most of the space */}
        <div className="flex-1 min-h-0">
          <VideoTile
            participant={pinned}
            isLocal={localParticipant?.id === pinned.id}
            isPinned
            size="large"
            onPin={handleUnpin}
          />
        </div>

        {/* Thumbnail strip at bottom for other participants */}
        {others.length > 0 && (
          <ThumbnailStrip
            others={others}
            localParticipant={localParticipant}
            onPinParticipant={onPinParticipant}
          />
        )}
      </div>
    );
  }

  // For 2 participants on small screens, use a special layout
  if (count === 2 && (screenSize === "xs" || screenSize === "sm")) {
    return (
      <div
        className="h-full w-full p-1 sm:p-2 overflow-hidden flex flex-col gap-1 sm:gap-2"
        style={{ filter: videoFilter }}
      >
        {allParticipants.map((participant, index) => (
          <div key={participant.id} className="flex-1 min-h-0 w-full">
            <GridVideoTile
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size={tileSize}
              onPin={handlePinParticipant(participant.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  // For 3-4 participants on very small screens, use optimized 2x2 grid
  if (count >= 3 && count <= 4 && screenSize === "xs") {
    return (
      <div
        className="h-full w-full p-1 overflow-hidden"
        style={{ filter: videoFilter }}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full w-full">
          {allParticipants.map((participant, index) => (
            <GridVideoTile
              key={participant.id}
              participant={participant}
              isLocal={index === 0 && !!localParticipant}
              size="small"
              onPin={handlePinParticipant(participant.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Layout standard avec grille
  return (
    <div
      className="h-full w-full p-1 sm:p-2 md:p-3 overflow-hidden"
      style={{ filter: videoFilter }}
    >
      <div style={gridStyle}>
        {allParticipants.map((participant, index) => (
          <GridVideoTile
            key={participant.id}
            participant={participant}
            isLocal={index === 0 && !!localParticipant}
            size={tileSize}
            onPin={handlePinParticipant(participant.id)}
          />
        ))}
      </div>
    </div>
  );
});

// Export nommé pour la rétrocompatibilité
export { VideoGrid as default };
