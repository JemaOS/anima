// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React from "react";
import { Icon } from "@/components/ui";
import { ChatMessage, Participant } from "@/types";
import { VideoQualityLevel } from "@/utils/videoConstraints";
import { VideoStyle } from "@/utils/videoStyles";
import { ChatPanel } from "./ChatPanel";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { SettingsPanel } from "./SettingsPanel";

// Re-export for backward compatibility
export * from "@/utils/videoStyles";

interface SidePanelProps {
  type: "chat" | "participants" | "settings";
  isOpen: boolean;
  onClose: () => void;
  // Chat
  messages?: ChatMessage[];
  onSendMessage?: (content: string) => void;
  // Participants
  participants?: Map<string, Participant>;
  localParticipant?: Participant;
  // Settings
  onDeviceChange?: (type: "audio" | "video", deviceId: string) => void;
  onVideoQualityChange?: (quality: VideoQualityLevel) => void;
  onVideoStyleChange?: (style: VideoStyle) => void;
  currentAudioDevice?: string;
  currentVideoDevice?: string;
  currentVideoQuality?: VideoQualityLevel;
  currentVideoStyle?: VideoStyle;
}

export function SidePanel({
  type,
  isOpen,
  onClose,
  messages = [],
  onSendMessage,
  participants,
  localParticipant,
  onDeviceChange,
  onVideoQualityChange,
  onVideoStyleChange,
  currentAudioDevice,
  currentVideoDevice,
  currentVideoQuality,
  currentVideoStyle,
}: SidePanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`
        fixed top-0 right-0 w-full md:w-[360px] bg-neutral-800
        shadow-modal z-[60] flex flex-col
        transform transition-transform duration-250 ease-enter
        ${isOpen ? "translate-x-0" : "translate-x-full"}
      `}
      style={{
        height: "100%",
        maxHeight: "100dvh",
      }}
    >
      {/* Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-neutral-700">
        <h2 className="text-lg font-medium text-white">
          {type === "chat"
            ? "Discussion"
            : type === "participants"
              ? "Participants"
              : "Paramètres"}
        </h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full hover:bg-neutral-700 active:bg-neutral-600 flex items-center justify-center text-neutral-400 hover:text-white transition-all shrink-0 focus:outline-none"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        {type === "chat" ? (
          <ChatPanel messages={messages} onSendMessage={onSendMessage} />
        ) : type === "participants" ? (
          <ParticipantsPanel
            participants={participants}
            localParticipant={localParticipant}
          />
        ) : (
          <SettingsPanel
            isOpen={isOpen}
            onDeviceChange={onDeviceChange}
            onVideoQualityChange={onVideoQualityChange}
            onVideoStyleChange={onVideoStyleChange}
            currentAudioDevice={currentAudioDevice}
            currentVideoDevice={currentVideoDevice}
            currentVideoQuality={currentVideoQuality}
            currentVideoStyle={currentVideoStyle}
          />
        )}
      </div>
    </div>
  );
}
