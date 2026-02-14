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
  readonly type: "chat" | "participants" | "settings";
  readonly isOpen: boolean;
  readonly onClose: () => void;
  // Chat
  readonly messages?: ChatMessage[];
  readonly onSendMessage?: (content: string) => void;
  // Participants
  readonly participants?: Map<string, Participant>;
  readonly localParticipant?: Participant;
  // Settings
  readonly onDeviceChange?: (type: "audio" | "video", deviceId: string) => void;
  readonly onVideoQualityChange?: (quality: VideoQualityLevel) => void;
  readonly onVideoStyleChange?: (style: VideoStyle) => void;
  readonly currentAudioDevice?: string;
  readonly currentVideoDevice?: string;
  readonly currentVideoQuality?: VideoQualityLevel;
  readonly currentVideoStyle?: VideoStyle;
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
  const getTitle = () => {
    switch (type) {
      case "chat":
        return "Discussion";
      case "participants":
        return "Participants";
      case "settings":
        return "Paramètres";
    }
  };

  const renderContent = () => {
    switch (type) {
      case "chat":
        return <ChatPanel messages={messages} onSendMessage={onSendMessage} />;
      case "participants":
        return (
          <ParticipantsPanel
            participants={participants}
            localParticipant={localParticipant}
          />
        );
      case "settings":
        return (
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
        );
    }
  };

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
          {getTitle()}
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
        {renderContent()}
      </div>
    </div>
  );
}
