// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useCallback, memo, useMemo, useEffect } from "react";
import { Icon } from "@/components/ui";

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera?: () => void;
  facingMode?: "user" | "environment";
  onScreenShare: () => void;
  onStopScreenShare: () => void;
  onRaiseHand: () => void;
  onLowerHand: () => void;
  onOpenChat: () => void;
  onOpenParticipants: () => void;
  onOpenSettings?: () => void;
  onLeave: () => void;
  onOpenReactions: () => void;
}

// Détecter si l'appareil est mobile - mémoïsé
const isMobileDevice = () => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || "ontouchstart" in window
  );
};

// Composant pour le bouton de réaction - séparé pour éviter les re-renders
const ReactionsButton = memo(function ReactionsButton({
  onOpenReactions,
}: {
  onOpenReactions: () => void;
}) {
  const [showReactions, setShowReactions] = useState(false);

  const toggleReactions = useCallback(() => {
    setShowReactions((prev) => !prev);
  }, []);

  const handleReactionClick = useCallback(() => {
    onOpenReactions();
    setShowReactions(false);
  }, [onOpenReactions]);

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={toggleReactions}
        className="w-12 h-12 min-[360px]:w-14 min-[360px]:h-14 min-[400px]:w-14 min-[400px]:h-14 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 bg-neutral-700/80 hover:bg-neutral-600 text-white"
        title="Réactions"
      >
        <Icon name="emoji" size={20} />
      </button>

      {showReactions && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl p-1.5 flex gap-0.5 shadow-lg">
          {["1f44d", "2764-fe0f", "1f389", "1f44f", "1f602", "1f914"].map(
            (emoji) => (
              <button
                key={emoji}
                onClick={handleReactionClick}
                className="text-lg hover:scale-125 transition-transform p-0.5"
              >
                {emoji.includes("-")
                  ? emoji
                      .split("-")
                      .map((code) => String.fromCodePoint(parseInt(code, 16)))
                      .join("")
                  : String.fromCodePoint(parseInt(emoji, 16))}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
});

// Bouton individuel mémoïsé
const ControlButton = memo(function ControlButton({
  onClick,
  icon,
  title,
  variant = "neutral",
  isHidden = false,
  isActive = false,
  isCompact = false,
}: {
  onClick: () => void;
  icon: string;
  title: string;
  variant?: "neutral" | "danger" | "primary" | "warning";
  isHidden?: boolean;
  isActive?: boolean;
  isCompact?: boolean;
}) {
  const baseClasses = useMemo(() => {
    if (isCompact) {
      return "w-10 h-10 min-[360px]:w-11 min-[360px]:h-11 min-[400px]:w-12 min-[400px]:h-12 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
    }
    // Larger touch targets for mobile (56px+) like Google Meet
    return "w-12 h-12 min-[360px]:w-14 min-[360px]:h-14 min-[400px]:w-14 min-[400px]:h-14 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
  }, [isCompact]);

  const variantClasses = useMemo(() => {
    switch (variant) {
      case "danger":
        return isActive
          ? "bg-danger-500 hover:bg-danger-400 text-white"
          : "bg-neutral-700/80 hover:bg-neutral-600 text-white";
      case "primary":
        return isActive
          ? "bg-primary-500 hover:bg-primary-400 text-white"
          : "bg-neutral-700/80 hover:bg-neutral-600 text-white";
      case "warning":
        return isActive
          ? "bg-warning-500 hover:bg-warning-500/80 text-neutral-900"
          : "bg-neutral-700/80 hover:bg-neutral-600 text-white";
      default:
        return "bg-neutral-700/80 hover:bg-neutral-600 text-white";
    }
  }, [variant, isActive]);

  if (isHidden) return null;

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses}`}
      title={title}
    >
      <Icon name={icon} size={isCompact ? 18 : 20} />
    </button>
  );
});

// Composant principal ControlBar - mémoïsé
export const ControlBar = memo(function ControlBar({
  audioEnabled,
  videoEnabled,
  isScreenSharing,
  handRaised,
  onToggleAudio,
  onToggleVideo,
  onSwitchCamera,
  facingMode = "user",
  onScreenShare,
  onStopScreenShare,
  onRaiseHand,
  onLowerHand,
  onOpenChat,
  onOpenParticipants,
  onOpenSettings,
  onLeave,
  onOpenReactions,
}: ControlBarProps) {
  // Mémoriser la détection mobile pour éviter les recalculs
  const isMobile = useMemo(() => isMobileDevice(), []);

  // Track screen width for responsive button visibility
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine which buttons to show based on screen size
  const isUltraSmall = screenWidth < 360;  // iPhone 5s, SE (1st gen)
  const isSmall = screenWidth < 400;       // Small phones
  const isMobileScreen = screenWidth < 640; // All mobile devices

  // Callbacks mémoïsés
  const handleToggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      onStopScreenShare();
    } else {
      onScreenShare();
    }
  }, [isScreenSharing, onStopScreenShare, onScreenShare]);

  const handleToggleHand = useCallback(() => {
    if (handRaised) {
      onLowerHand();
    } else {
      onRaiseHand();
    }
  }, [handRaised, onLowerHand, onRaiseHand]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] sm:pb-0 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
      <div className={`
        bg-neutral-800/95 backdrop-blur-md
        ${isUltraSmall ? 'rounded-t-xl px-2 py-2' : 'sm:rounded-full px-2 min-[360px]:px-3 min-[400px]:px-4 sm:px-4 py-2 min-[360px]:py-2.5 min-[400px]:py-3'}
        shadow-lg flex items-center justify-center gap-1 min-[360px]:gap-1.5 min-[400px]:gap-2 sm:gap-3
        ${isUltraSmall ? 'flex-wrap' : ''}
      `}>
        {/* Micro - toujours visible */}
        <ControlButton
          onClick={onToggleAudio}
          icon={audioEnabled ? "mic" : "mic-off"}
          title={audioEnabled ? "Couper le micro" : "Activer le micro"}
          variant={audioEnabled ? "neutral" : "danger"}
          isActive={!audioEnabled}
        />

        {/* Caméra - toujours visible */}
        <ControlButton
          onClick={onToggleVideo}
          icon={videoEnabled ? "videocam" : "videocam-off"}
          title={videoEnabled ? "Désactiver la caméra" : "Activer la caméra"}
          variant={videoEnabled ? "neutral" : "danger"}
          isActive={!videoEnabled}
        />

        {/* Changer de caméra - visible sur mobile quand vidéo active */}
        {onSwitchCamera && isMobile && videoEnabled && (
          <ControlButton
            onClick={onSwitchCamera}
            icon="flip-camera"
            title={facingMode === "user" ? "Caméra arrière" : "Caméra avant"}
          />
        )}

        {/* Partage d'écran - visible on all screens */}
        <ControlButton
          onClick={handleToggleScreenShare}
          icon="present-to-all"
          title={isScreenSharing ? "Arrêter" : "Partager"}
          variant="primary"
          isActive={isScreenSharing}
        />

        {/* Participants - always visible on mobile */}
        <ControlButton
          onClick={onOpenParticipants}
          icon="people"
          title="Participants"
        />

        {/* Réactions - hidden on small screens */}
        {!isSmall && <ReactionsButton onOpenReactions={onOpenReactions} />}

        {/* Main levée - hidden on ultra-small */}
        {!isUltraSmall && (
          <ControlButton
            onClick={handleToggleHand}
            icon="pan-tool"
            title={handRaised ? "Baisser" : "Lever"}
            variant="warning"
            isActive={handRaised}
          />
        )}

        {/* Discussion - toujours visible */}
        <ControlButton
          onClick={onOpenChat}
          icon="chat"
          title="Discussion"
        />

        {/* Paramètres - only on larger screens */}
        {!isSmall && onOpenSettings && (
          <ControlButton
            onClick={onOpenSettings}
            icon="settings"
            title="Paramètres"
          />
        )}

        {/* Séparateur avant quitter */}
        <div className="w-px h-6 sm:h-8 bg-neutral-600/50 mx-1 sm:mx-2 shrink-0" />

        {/* Quitter - toujours visible */}
        <ControlButton
          onClick={onLeave}
          icon="call-end"
          title="Quitter"
          variant="danger"
        />
      </div>
    </div>
  );
});

// Export nommé pour la rétrocompatibilité
export { ControlBar as default };
