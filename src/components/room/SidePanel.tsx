// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon, Avatar } from "@/components/ui";
import { ChatMessage, Participant } from "@/types";
import {
  VideoQualityLevel,
  getSavedVideoQuality,
  saveVideoQuality,
} from "@/utils/videoConstraints";

// Video style types and constants
export type VideoStyle =
  | "normal"
  | "contrast"
  | "bright"
  | "warm"
  | "cool"
  | "bw";

export const VIDEO_STYLES: Record<
  VideoStyle,
  { label: string; icon: string; filter: string }
> = {
  normal: {
    label: "Normal",
    icon: "contrast",
    filter: "none",
  },
  contrast: {
    label: "Contraste",
    icon: "exposure",
    filter: "contrast(1.2) saturate(1.1)",
  },
  bright: {
    label: "Lumineux",
    icon: "wb-sunny",
    filter: "brightness(1.15) contrast(1.05)",
  },
  warm: {
    label: "Chaud",
    icon: "local-fire-department",
    filter: "sepia(0.2) saturate(1.2) brightness(1.05)",
  },
  cool: {
    label: "Froid",
    icon: "ac-unit",
    filter: "saturate(0.9) hue-rotate(10deg) brightness(1.05)",
  },
  bw: {
    label: "Noir & Blanc",
    icon: "monochrome",
    filter: "grayscale(1) contrast(1.1)",
  },
};

// Storage key for video style persistence
const VIDEO_STYLE_STORAGE_KEY = "anima-video-style";

export const getSavedVideoStyle = (): VideoStyle => {
  try {
    const saved = localStorage.getItem(VIDEO_STYLE_STORAGE_KEY);
    if (saved && saved in VIDEO_STYLES) {
      return saved as VideoStyle;
    }
  } catch (e) {
    console.warn("Failed to read video style from localStorage:", e);
  }
  return "normal";
};

export const saveVideoStyle = (style: VideoStyle): void => {
  try {
    localStorage.setItem(VIDEO_STYLE_STORAGE_KEY, style);
  } catch (e) {
    console.warn("Failed to save video style to localStorage:", e);
  }
};

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "videoinput" | "audiooutput";
}

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
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Settings state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>(
    currentAudioDevice || "",
  );
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>(
    currentVideoDevice || "",
  );
  const [selectedVideoQuality, setSelectedVideoQuality] =
    useState<VideoQualityLevel>(currentVideoQuality || getSavedVideoQuality());
  const [selectedVideoStyle, setSelectedVideoStyle] = useState<VideoStyle>(
    currentVideoStyle || getSavedVideoStyle(),
  );
  const [linkCopied, setLinkCopied] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Scroll vers le bas quand un nouveau message arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load available devices when settings panel opens
  const loadDevices = useCallback(async () => {
    if (type !== "settings" || !isOpen) return;

    setDevicesLoading(true);
    try {
      // Request permissions first to get device labels
      await navigator.mediaDevices
        .getUserMedia({ audio: true, video: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch(() => {
          // Permissions might already be granted or denied
        });

      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
          kind: device.kind as "audioinput",
        }));

      const videoInputs = devices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Caméra ${device.deviceId.slice(0, 5)}`,
          kind: device.kind as "videoinput",
        }));

      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);

      // Set default selections if not already set
      if (!selectedAudioDevice && audioInputs.length > 0) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      if (!selectedVideoDevice && videoInputs.length > 0) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (error) {
      console.error("Error loading devices:", error);
    } finally {
      setDevicesLoading(false);
    }
  }, [type, isOpen, selectedAudioDevice, selectedVideoDevice]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Handle device change
  const handleAudioDeviceChange = (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    onDeviceChange?.("audio", deviceId);
  };

  const handleVideoDeviceChange = (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    onDeviceChange?.("video", deviceId);
  };

  // Handle video quality change
  const handleVideoQualityChange = (quality: VideoQualityLevel) => {
    setSelectedVideoQuality(quality);
    saveVideoQuality(quality);
    onVideoQualityChange?.(quality);
  };

  // Handle video style change
  const handleVideoStyleChange = (style: VideoStyle) => {
    setSelectedVideoStyle(style);
    saveVideoStyle(style);
    onVideoStyleChange?.(style);
  };

  // Copy meeting link
  const copyMeetingLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim() && onSendMessage) {
      onSendMessage(messageInput.trim());
      setMessageInput("");
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
          {type === "chat"
            ? "Discussion"
            : type === "participants"
              ? "Participants"
              : "Paramètres"}
        </h2>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        {type === "chat" ? (
          <div className="p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-400 text-sm">
                  Aucun message pour l'instant.
                </p>
                <p className="text-neutral-500 text-xs mt-1">
                  Les messages disparaissent à la fin de la réunion
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <Avatar name={msg.senderName} id={msg.senderId} size="sm" />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-white">
                        {msg.senderName}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200 mt-1">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : type === "participants" ? (
          <div className="p-4 space-y-2">
            {/* Participant local */}
            {localParticipant && (
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-700/50">
                <Avatar
                  name={localParticipant.name}
                  id={localParticipant.id}
                  size="md"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {localParticipant.name} (Vous)
                  </p>
                  <p className="text-xs text-neutral-400">Hôte</p>
                </div>
                <div className="flex items-center gap-2">
                  {!localParticipant.audioEnabled && (
                    <Icon
                      name="mic-off"
                      size={18}
                      className="text-danger-500"
                    />
                  )}
                  {!localParticipant.videoEnabled && (
                    <Icon
                      name="videocam-off"
                      size={18}
                      className="text-danger-500"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Autres participants */}
            {participants &&
              Array.from(participants.values()).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-700/50"
                >
                  <Avatar name={p.name} id={p.id} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      {p.handRaised && (
                        <Icon
                          name="pan-tool"
                          size={14}
                          className="text-warning-500"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.audioEnabled && (
                      <Icon
                        name="mic-off"
                        size={18}
                        className="text-danger-500"
                      />
                    )}
                    {!p.videoEnabled && (
                      <Icon
                        name="videocam-off"
                        size={18}
                        className="text-danger-500"
                      />
                    )}
                  </div>
                </div>
              ))}

            {(!participants || participants.size === 0) &&
              !localParticipant && (
                <div className="text-center py-8">
                  <p className="text-neutral-400 text-sm">
                    Aucun autre participant
                  </p>
                </div>
              )}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Audio Device Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <Icon name="mic" size={18} className="text-neutral-400" />
                Microphone
              </label>
              {devicesLoading ? (
                <div className="w-full h-10 bg-neutral-700 rounded-lg animate-pulse" />
              ) : audioDevices.length > 0 ? (
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => handleAudioDeviceChange(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-700 text-white text-sm rounded-lg border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-neutral-500 italic">
                  Aucun microphone détecté
                </p>
              )}
            </div>

            {/* Video Device Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <Icon name="videocam" size={18} className="text-neutral-400" />
                Caméra
              </label>
              {devicesLoading ? (
                <div className="w-full h-10 bg-neutral-700 rounded-lg animate-pulse" />
              ) : videoDevices.length > 0 ? (
                <select
                  value={selectedVideoDevice}
                  onChange={(e) => handleVideoDeviceChange(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-700 text-white text-sm rounded-lg border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-neutral-500 italic">
                  Aucune caméra détectée
                </p>
              )}
            </div>

            {/* Video Quality Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <Icon name="tune" size={18} className="text-neutral-400" />
                Qualité vidéo
              </label>
              <select
                value={selectedVideoQuality}
                onChange={(e) =>
                  handleVideoQualityChange(e.target.value as VideoQualityLevel)
                }
                className="w-full h-10 px-3 bg-neutral-700 text-white text-sm rounded-lg border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0.75rem center",
                  backgroundSize: "1rem",
                }}
              >
                <option value="auto">Auto (recommandé)</option>
                <option value="low">Basse (économie de données)</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute (720p)</option>
                <option value="ultra">Ultra (1080p 60fps)</option>
              </select>
              <p className="text-xs text-neutral-500">
                {selectedVideoQuality === "auto" &&
                  "Qualité adaptée automatiquement à votre appareil"}
                {selectedVideoQuality === "low" &&
                  "320×240 à 15 fps - Idéal pour connexions lentes"}
                {selectedVideoQuality === "medium" &&
                  "640×480 à 24 fps - Bon équilibre qualité/performance"}
                {selectedVideoQuality === "high" &&
                  "1280×720 à 30 fps - Meilleure qualité"}
                {selectedVideoQuality === "ultra" &&
                  "1920×1080 à 60 fps - Qualité maximale"}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-700" />

            {/* Apparence - Video Styles */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <Icon name="palette" size={18} className="text-neutral-400" />
                Apparence
              </h3>

              {/* Styles */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 flex items-center gap-2">
                  Styles
                  <Icon
                    name="monochrome"
                    size={14}
                    className="text-neutral-500"
                  />
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {(
                    Object.entries(VIDEO_STYLES) as [
                      VideoStyle,
                      (typeof VIDEO_STYLES)[VideoStyle],
                    ][]
                  ).map(([key, style]) => (
                    <button
                      key={key}
                      onClick={() => handleVideoStyleChange(key)}
                      className={`
                        aspect-square rounded-lg flex items-center justify-center
                        ${
                          selectedVideoStyle === key
                            ? "bg-primary-600 ring-2 ring-primary-400"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        transition-all
                      `}
                      title={style.label}
                    >
                      <Icon
                        name={style.icon}
                        size={20}
                        className="text-white"
                      />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500">
                  {VIDEO_STYLES[selectedVideoStyle].label}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-700" />

            {/* Copy Meeting Link */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <Icon name="link" size={18} className="text-neutral-400" />
                Lien de la réunion
              </label>
              <button
                onClick={copyMeetingLink}
                className={`w-full h-10 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  linkCopied
                    ? "bg-green-600 text-white"
                    : "bg-primary-500 hover:bg-primary-400 text-white"
                }`}
              >
                <Icon name={linkCopied ? "check" : "copy"} size={18} />
                {linkCopied ? "Lien copié !" : "Copier le lien de la réunion"}
              </button>
            </div>

            {/* Refresh Devices Button */}
            <div className="pt-2">
              <button
                onClick={loadDevices}
                disabled={devicesLoading}
                className="w-full h-10 px-4 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon
                  name="refresh"
                  size={18}
                  className={devicesLoading ? "animate-spin" : ""}
                />
                Actualiser les périphériques
              </button>
            </div>

            {/* Info */}
            <div className="pt-4 border-t border-neutral-700">
              <p className="text-xs text-neutral-500 text-center">
                Les changements de périphériques seront appliqués immédiatement
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input chat - avec padding pour éviter la barre de contrôle sur mobile */}
      {type === "chat" && (
        <form
          onSubmit={handleSendMessage}
          className="p-3 sm:p-4 border-t border-neutral-700 bg-neutral-800"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Envoyer un message..."
              className="flex-1 min-w-0 h-10 px-3 sm:px-4 bg-neutral-700 border-none rounded-full text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="w-10 h-10 shrink-0 rounded-full bg-primary-500 hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
            >
              <Icon name="send" size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
