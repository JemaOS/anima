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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] bg-neutral-900/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none sm:pb-0 sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
      <div className="bg-neutral-800 sm:rounded-2xl shadow-elevated px-1 sm:px-4 py-1.5 sm:py-3 flex flex-wrap items-center justify-center gap-1 sm:gap-2">
        {/* Micro */}
        <button
          onClick={onToggleAudio}
          className={`
            w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-100 shrink-0
            ${audioEnabled
              ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
              : 'bg-danger-500 hover:bg-danger-400 text-white'
            }
          `}
          title={audioEnabled ? 'Couper le micro' : 'Activer le micro'}
        >
          <Icon name={audioEnabled ? 'mic' : 'mic-off'} size={16} className="sm:hidden" />
          <Icon name={audioEnabled ? 'mic' : 'mic-off'} size={20} className="hidden sm:block" />
        </button>

        {/* Caméra */}
        <button
          onClick={onToggleVideo}
          className={`
            w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-100 shrink-0
            ${videoEnabled
              ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
              : 'bg-danger-500 hover:bg-danger-400 text-white'
            }
          `}
          title={videoEnabled ? 'Désactiver la caméra' : 'Activer la caméra'}
        >
          <Icon name={videoEnabled ? 'videocam' : 'videocam-off'} size={16} className="sm:hidden" />
          <Icon name={videoEnabled ? 'videocam' : 'videocam-off'} size={20} className="hidden sm:block" />
        </button>

        {/* Changer de caméra (avant/arrière) - visible uniquement sur mobile */}
        {onSwitchCamera && isMobileDevice() && videoEnabled && (
          <button
            onClick={onSwitchCamera}
            className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-white transition-all duration-100 shrink-0"
            title={facingMode === 'user' ? 'Passer à la caméra arrière' : 'Passer à la caméra avant'}
            aria-label={facingMode === 'user' ? 'Passer à la caméra arrière' : 'Passer à la caméra avant'}
          >
            <Icon name="flip-camera" size={18} className="sm:hidden" />
            <Icon name="flip-camera" size={22} className="hidden sm:block" />
          </button>
        )}

        {/* Partage d'écran - caché sur mobile (non supporté sur la plupart des mobiles) */}
        <button
          onClick={isScreenSharing ? onStopScreenShare : onScreenShare}
          className={`
            w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full items-center justify-center transition-all duration-100 shrink-0 hidden sm:flex
            ${isScreenSharing
              ? 'bg-primary-500 hover:bg-primary-400 text-white'
              : 'bg-neutral-700 hover:bg-neutral-600 text-white'
            }
          `}
          title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
        >
          <Icon name="present-to-all" size={20} />
        </button>

        {/* Réactions - caché sur mobile (<640px) */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-white transition-all duration-100"
            title="Réactions"
          >
            <Icon name="emoji" size={20} className="md:hidden" />
            <Icon name="emoji" size={24} className="hidden md:block" />
          </button>

          {showReactions && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl p-2 flex gap-1 shadow-modal">
              {['1f44d', '2764-fe0f', '1f389', '1f44f', '1f602', '1f914'].map((emoji, i) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onOpenReactions();
                    setShowReactions(false);
                  }}
                  className="text-2xl hover:scale-125 transition-transform p-1"
                >
                  {emoji.includes('-')
                    ? emoji.split('-').map(code => String.fromCodePoint(parseInt(code, 16))).join('')
                    : String.fromCodePoint(parseInt(emoji, 16))}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main levée - caché sur très petits écrans (<360px) */}
        <button
          onClick={handRaised ? onLowerHand : onRaiseHand}
          className={`
            w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full items-center justify-center transition-all duration-100 shrink-0 hidden min-[360px]:flex
            ${handRaised
              ? 'bg-warning-500 hover:bg-warning-500/80 text-neutral-900'
              : 'bg-neutral-700 hover:bg-neutral-600 text-white'
            }
          `}
          title={handRaised ? 'Baisser la main' : 'Lever la main'}
        >
          <Icon name="pan-tool" size={16} className="sm:hidden" />
          <Icon name="pan-tool" size={20} className="hidden sm:block" />
        </button>

        {/* Discussion */}
        <button
          onClick={onOpenChat}
          className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-white transition-all duration-100 shrink-0"
          title="Discussion"
        >
          <Icon name="chat" size={16} className="sm:hidden" />
          <Icon name="chat" size={20} className="hidden sm:block" />
        </button>

        {/* Participants */}
        <button
          onClick={onOpenParticipants}
          className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-white transition-all duration-100 shrink-0"
          title="Participants"
        >
          <Icon name="people" size={16} className="sm:hidden" />
          <Icon name="people" size={20} className="hidden sm:block" />
        </button>

        {/* Paramètres - caché sur très petits écrans (<360px) */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full items-center justify-center bg-neutral-700 hover:bg-neutral-600 text-white transition-all duration-100 shrink-0 hidden min-[360px]:flex"
            title="Paramètres"
          >
            <Icon name="settings" size={16} className="sm:hidden" />
            <Icon name="settings" size={20} className="hidden sm:block" />
          </button>
        )}

        {/* Séparateur */}
        <div className="w-px h-4 sm:h-5 md:h-6 bg-neutral-600 mx-0.5 shrink-0" />

        {/* Quitter */}
        <button
          onClick={onLeave}
          className="w-9 h-8 sm:w-11 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-danger-500 hover:bg-danger-400 text-white transition-all duration-100 shrink-0"
          title="Quitter la réunion"
        >
          <Icon name="call-end" size={16} className="sm:hidden" />
          <Icon name="call-end" size={20} className="hidden sm:block" />
        </button>
      </div>
    </div>
  );
}
