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
    <div className="relative hidden lg:block">
      <button
        onClick={toggleReactions}
        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 bg-neutral-700/80 hover:bg-neutral-600 text-white"
        title="Réactions"
      >
        <Icon name="emoji" size={18} />
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
      return "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
    }
    // Google Meet style: 40px on mobile, 44px on larger screens
    return "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
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
      <Icon name={icon} size={isCompact ? 16 : 18} />
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
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Also track if we need to show more/less buttons based on available space
  const maxButtonsOnOneLine = Math.floor((screenWidth - 32) / 44); // 44px per button + gap
  const shouldShowCompact = maxButtonsOnOneLine < 10;

  // Determine which buttons to show based on screen size
  const isUltraSmall = screenWidth < 320;   // Very small phones
  const isSmall = screenWidth < 375;        // Small phones (iPhone SE, etc)
  const isMedium = screenWidth < 480;       // Medium phones
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
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] sm:pb-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-auto">
      <div className={`
        bg-neutral-800/95 backdrop-blur-md
        px-2 sm:px-3 py-2 sm:py-2.5
        shadow-lg flex items-center justify-center gap-1 sm:gap-2
        rounded-t-xl sm:rounded-full
        flex-nowrap overflow-x-auto
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

        {/* Changer de caméra - visible sur mobile quand vidéo active, hidden on very small screens */}
        {onSwitchCamera && isMobile && videoEnabled && !isUltraSmall && (
          <ControlButton
            onClick={onSwitchCamera}
            icon="flip-camera"
            title={facingMode === "user" ? "Caméra arrière" : "Caméra avant"}
          />
        )}

        {/* Partage d'écran - visible on all screens except ultra-small */}
        {!isUltraSmall && (
          <ControlButton
            onClick={handleToggleScreenShare}
            icon="present-to-all"
            title={isScreenSharing ? "Arrêter" : "Partager"}
            variant="primary"
            isActive={isScreenSharing}
          />
        )}

        {/* Participants - always visible */}
        <ControlButton
          onClick={onOpenParticipants}
          icon="people"
          title="Participants"
        />

        {/* Main levée - hidden on small screens */}
        {!isSmall && (
          <ControlButton
            onClick={handleToggleHand}
            icon="pan-tool"
            title={handRaised ? "Baisser" : "Lever"}
            variant="warning"
            isActive={handRaised}
          />
        )}

        {/* Réactions - hidden on medium and smaller screens */}
        {!isMedium && <ReactionsButton onOpenReactions={onOpenReactions} />}

        {/* Discussion - toujours visible */}
        <ControlButton
          onClick={onOpenChat}
          icon="chat"
          title="Discussion"
        />

        {/* Paramètres - only on larger screens */}
        {!isMedium && onOpenSettings && (
          <ControlButton
            onClick={onOpenSettings}
            icon="settings"
            title="Paramètres"
          />
        )}

        {/* Séparateur avant quitter */}
        <div className="w-px h-5 sm:h-6 bg-neutral-600/50 mx-1 sm:mx-1.5 shrink-0" />

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
