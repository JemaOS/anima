// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState } from 'react';
import { Icon } from '@/components/ui';

interface ControlBarProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera?: () => void;
  facingMode?: 'user' | 'environment';
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

// Detect if device is mobile (has touch and likely has front/back cameras)
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window);
};

export function ControlBar({
  audioEnabled,
  videoEnabled,
  isScreenSharing,
  handRaised,
  onToggleAudio,
  onToggleVideo,
  onSwitchCamera,
  facingMode = 'user',
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
  const [showReactions, setShowReactions] = useState(false);

  const reactions = ['thumbsup', 'heart', 'tada', 'clap', 'joy', 'thinking'];

  // Taille des boutons adaptative - plus petits sur très petits écrans
  const btnClass = "w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 min-[400px]:w-10 min-[400px]:h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
  const iconSize = 16;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] sm:pb-0 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
      <div className="bg-neutral-800/95 backdrop-blur-md sm:rounded-full shadow-lg px-1 min-[360px]:px-1.5 min-[400px]:px-2 sm:px-3 py-1 min-[360px]:py-1.5 min-[400px]:py-2 flex items-center justify-center gap-0.5 min-[400px]:gap-1 sm:gap-1.5">
        {/* Micro - toujours visible */}
        <button
          onClick={onToggleAudio}
          className={`
            ${btnClass}
            ${audioEnabled
              ? 'bg-neutral-700/80 hover:bg-neutral-600 text-white'
              : 'bg-danger-500 hover:bg-danger-400 text-white'
            }
          `}
          title={audioEnabled ? 'Couper le micro' : 'Activer le micro'}
        >
          <Icon name={audioEnabled ? 'mic' : 'mic-off'} size={iconSize} />
        </button>

        {/* Caméra - toujours visible */}
        <button
          onClick={onToggleVideo}
          className={`
            ${btnClass}
            ${videoEnabled
              ? 'bg-neutral-700/80 hover:bg-neutral-600 text-white'
              : 'bg-danger-500 hover:bg-danger-400 text-white'
            }
          `}
          title={videoEnabled ? 'Désactiver la caméra' : 'Activer la caméra'}
        >
          <Icon name={videoEnabled ? 'videocam' : 'videocam-off'} size={iconSize} />
        </button>

        {/* Changer de caméra - visible sur mobile quand vidéo active, caché sur très petits écrans */}
        {onSwitchCamera && isMobileDevice() && videoEnabled && (
          <button
            onClick={onSwitchCamera}
            className={`${btnClass} bg-neutral-700/80 hover:bg-neutral-600 text-white hidden min-[360px]:flex`}
            title={facingMode === 'user' ? 'Caméra arrière' : 'Caméra avant'}
          >
            <Icon name="flip-camera" size={iconSize} />
          </button>
        )}

        {/* Partage d'écran - TOUJOURS visible */}
        <button
          onClick={isScreenSharing ? onStopScreenShare : onScreenShare}
          className={`
            ${btnClass}
            ${isScreenSharing
              ? 'bg-primary-500 hover:bg-primary-400 text-white'
              : 'bg-neutral-700/80 hover:bg-neutral-600 text-white'
            }
          `}
          title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
        >
          <Icon name="present-to-all" size={iconSize} />
        </button>

        {/* Réactions - caché sur petits écrans (<640px) */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className={`${btnClass} bg-neutral-700/80 hover:bg-neutral-600 text-white`}
            title="Réactions"
          >
            <Icon name="emoji" size={iconSize} />
          </button>

          {showReactions && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl p-1.5 flex gap-0.5 shadow-lg">
              {['1f44d', '2764-fe0f', '1f389', '1f44f', '1f602', '1f914'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onOpenReactions();
                    setShowReactions(false);
                  }}
                  className="text-lg hover:scale-125 transition-transform p-0.5"
                >
                  {emoji.includes('-')
                    ? emoji.split('-').map(code => String.fromCodePoint(parseInt(code, 16))).join('')
                    : String.fromCodePoint(parseInt(emoji, 16))}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main levée - caché sur petits écrans (<640px) */}
        <button
          onClick={handRaised ? onLowerHand : onRaiseHand}
          className={`
            ${btnClass} hidden sm:flex
            ${handRaised
              ? 'bg-warning-500 hover:bg-warning-500/80 text-neutral-900'
              : 'bg-neutral-700/80 hover:bg-neutral-600 text-white'
            }
          `}
          title={handRaised ? 'Baisser la main' : 'Lever la main'}
        >
          <Icon name="pan-tool" size={iconSize} />
        </button>

        {/* Discussion - toujours visible */}
        <button
          onClick={onOpenChat}
          className={`${btnClass} bg-neutral-700/80 hover:bg-neutral-600 text-white`}
          title="Discussion"
        >
          <Icon name="chat" size={iconSize} />
        </button>

        {/* Participants - caché sur petits écrans (<640px) */}
        <button
          onClick={onOpenParticipants}
          className={`${btnClass} bg-neutral-700/80 hover:bg-neutral-600 text-white hidden sm:flex`}
          title="Participants"
        >
          <Icon name="people" size={iconSize} />
        </button>

        {/* Paramètres - TOUJOURS visible */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className={`${btnClass} bg-neutral-700/80 hover:bg-neutral-600 text-white`}
            title="Paramètres"
          >
            <Icon name="settings" size={iconSize} />
          </button>
        )}

        {/* Séparateur avant quitter */}
        <div className="w-px h-4 min-[360px]:h-5 bg-neutral-600/50 mx-0.5 shrink-0" />

        {/* Quitter - toujours visible */}
        <button
          onClick={onLeave}
          className={`${btnClass} bg-danger-500 hover:bg-danger-400 text-white`}
          title="Quitter la réunion"
        >
          <Icon name="call-end" size={iconSize} />
        </button>
      </div>
    </div>
  );
}
