import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui";
import { useI18n } from "@/i18n";
import { translate, type TranslationKey } from "@/i18n/translations";
import {
  VideoQualityLevel,
  getSavedVideoQuality,
  saveVideoQuality,
} from "@/utils/videoConstraints";
import {
  VideoStyle,
  VIDEO_STYLES,
  getSavedVideoStyle,
  saveVideoStyle,
} from "@/utils/videoStyles";

const VIDEO_STYLE_LABEL_KEYS: Record<VideoStyle, TranslationKey> = {
  normal: "styleNormal",
  contrast: "styleContrast",
  bright: "styleBright",
  warm: "styleWarm",
  cool: "styleCool",
  bw: "styleBw",
};

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "videoinput" | "audiooutput";
}

interface SettingsPanelProps {
  readonly onDeviceChange?: (type: "audio" | "video", deviceId: string) => void;
  readonly onVideoQualityChange?: (quality: VideoQualityLevel) => void;
  readonly onVideoStyleChange?: (style: VideoStyle) => void;
  readonly currentAudioDevice?: string;
  readonly currentVideoDevice?: string;
  readonly currentVideoQuality?: VideoQualityLevel;
  readonly currentVideoStyle?: VideoStyle;
  readonly isOpen: boolean;
}

export function SettingsPanel({
  onDeviceChange,
  onVideoQualityChange,
  onVideoStyleChange,
  currentAudioDevice,
  currentVideoDevice,
  currentVideoQuality,
  currentVideoStyle,
  isOpen,
}: SettingsPanelProps) {
  const { t } = useI18n();
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

  // Load available devices when settings panel opens
  const loadDevices = useCallback(async () => {
    if (!isOpen) return;

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
          label:
            device.label ||
            translate("microphoneDefaultLabel", {
              id: device.deviceId.slice(0, 5),
            }),
          kind: device.kind as "audioinput",
        }));

      const videoInputs = devices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label:
            device.label ||
            translate("cameraDefaultLabel", {
              id: device.deviceId.slice(0, 5),
            }),
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
  }, [isOpen, selectedAudioDevice, selectedVideoDevice]);

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
    const url = globalThis.location.href;
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
      textArea.remove();
    }
  };

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Audio Device Selection */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Icon name="mic" size={18} className="text-neutral-400" />
          {t("microphoneLabel")}
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
            {t("noMicrophoneDetected")}
          </p>
        )}
      </div>

      {/* Video Device Selection */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Icon name="videocam" size={18} className="text-neutral-400" />
          {t("cameraLabel")}
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
            {t("noCameraDetected")}
          </p>
        )}
      </div>

      {/* Video Quality Selection */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Icon name="tune" size={18} className="text-neutral-400" />
          {t("videoQuality")}
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
          <option value="auto">{t("qualityAuto")}</option>
          <option value="low">{t("qualityLow")}</option>
          <option value="medium">{t("qualityMedium")}</option>
          <option value="high">{t("qualityHigh")}</option>
          <option value="ultra">{t("qualityUltra")}</option>
        </select>
        <p className="text-xs text-neutral-500">
          {selectedVideoQuality === "auto" && t("qualityAutoDesc")}
          {selectedVideoQuality === "low" && t("qualityLowDesc")}
          {selectedVideoQuality === "medium" && t("qualityMediumDesc")}
          {selectedVideoQuality === "high" && t("qualityHighDesc")}
          {selectedVideoQuality === "ultra" && t("qualityUltraDesc")}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-700" />

      {/* Apparence - Video Styles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
          <Icon name="palette" size={18} className="text-neutral-400" />
          {t("appearance")}
        </h3>

        {/* Styles */}
        <div className="space-y-2">
          <label className="text-xs text-neutral-400 flex items-center gap-2">
            {t("styles")}
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
                title={t(VIDEO_STYLE_LABEL_KEYS[key])}
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
            {t(VIDEO_STYLE_LABEL_KEYS[selectedVideoStyle])}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-700" />

      {/* Copy Meeting Link */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Icon name="link" size={18} className="text-neutral-400" />
          {t("meetingLink")}
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
          {linkCopied ? t("linkCopiedToast") : t("copyMeetingLink")}
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
          {t("refreshDevices")}
        </button>
      </div>

      {/* Info */}
      <div className="pt-4 border-t border-neutral-700">
        <p className="text-xs text-neutral-500 text-center">
          {t("deviceChangesAppliedImmediately")}
        </p>
      </div>
    </div>
  );
}