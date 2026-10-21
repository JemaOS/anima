// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui";
import LanguageSelector from "@/components/LanguageSelector";
import { ThemeMenu } from "@/theme";
import { useI18n } from "@/i18n";
import {
  generateRoomCode,
  getRecentRooms,
  isValidRoomCode,
  removeRecentRoom,
} from "@/utils/helpers";

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [recentRoomsVersion, setRecentRoomsVersion] = useState(0);
  const recentRooms = getRecentRooms().slice(0, 3);

  const handleDeleteRoom = useCallback((e: React.MouseEvent, code: string) => {
    e.stopPropagation(); // Empêcher la navigation vers la réunion
    removeRecentRoom(code);
    setRecentRoomsVersion((v) => v + 1); // Forcer le re-render
  }, []);

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    navigate(`/prejoin/${code}?host=true`);
  };

  const handleJoinRoom = () => {
    const cleanCode = roomCode.trim().toLowerCase();

    if (!cleanCode) {
      setError(t("enterRoomCode"));
      return;
    }

    if (!isValidRoomCode(cleanCode)) {
      setError(t("invalidRoomCodeFormat"));
      return;
    }

    navigate(`/prejoin/${cleanCode}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomCode(e.target.value);
    setError("");
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[color:var(--home-bg)] relative flex flex-col">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 home-backdrop" />

      {/* Single subtle accent glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px]"
        style={{
          background: "radial-gradient(circle, #8f88ed 0%, transparent 70%)",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          opacity: "var(--accent-glow-opacity)",
        }}
      />

      {/* Language selector */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <ThemeMenu />
        <LanguageSelector />
      </div>

      {/* Main content - centered with flex */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6">
        {/* Logo and branding - compact */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-[#8f88ed] to-[#6366f1] rounded-xl flex items-center justify-center mb-3 shadow-lg">
            <Icon name="videocam" size={28} className="text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-[color:var(--foreground)] tracking-tight mb-1">
            Anima
          </h1>
          <p className="text-sm text-[color:var(--text-subtle)]">{t("secureP2pCalling")}</p>
        </div>

        {/* Main card - compact */}
        <div className="w-full max-w-sm">
          <div className="p-5 rounded-2xl bg-[color:var(--home-card-bg)] border border-[color:var(--home-card-border)] backdrop-blur-sm">
            {/* Create meeting button */}
            <button
              onClick={handleCreateRoom}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-[#8f88ed] hover:bg-[#7b74d9] text-white font-medium transition-colors duration-200 text-sm"
            >
              <Icon name="video-call" size={20} className="text-white" />
              <span>{t("newMeeting")}</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[color:var(--home-divider)]" />
              <span className="text-[color:var(--text-faint)] text-xs">{t("or")}</span>
              <div className="flex-1 h-px bg-[color:var(--home-divider)]" />
            </div>

            {/* Join meeting section */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={roomCode}
                  onChange={handleCodeChange}
                  placeholder={t("meetingCodePlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinRoom();
                  }}
                  className="w-full h-11 px-4 bg-[color:var(--home-input-bg)] border border-[color:var(--home-input-border)] rounded-xl text-[color:var(--foreground)] placeholder:text-[color:var(--home-placeholder)] focus:outline-none focus:border-[color:var(--focus-border)] transition-colors duration-200 text-sm"
                />
                {error && (
                  <p className="absolute -bottom-4 left-0 text-danger-500 dark:text-red-400 text-xs">
                    {error}
                  </p>
                )}
              </div>

              <button
                onClick={handleJoinRoom}
                className="w-full h-11 bg-[color:var(--home-control-bg)] hover:bg-[color:var(--home-control-hover)] border border-[color:var(--home-input-border)] rounded-xl text-[color:var(--home-control-text)] font-medium transition-colors duration-200 text-sm"
              >
                {t("join")}
              </button>
            </div>
          </div>
        </div>

        {/* Features - inline compact */}
        <div className="mt-5 flex items-center justify-center gap-5 text-[color:var(--text-subtle)] text-xs">
          <div className="flex items-center gap-1.5">
            <Icon name="shield" size={14} className="text-[#8f88ed]" />
            <span>P2P</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="person" size={14} className="text-emerald-500" />
            <span>{t("noAccount")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="lock" size={14} className="text-amber-500" />
            <span>{t("zeroLogs")}</span>
          </div>
        </div>

        {/* Recent rooms - compact */}
        {recentRooms.length > 0 && (
          <div className="mt-5 w-full max-w-sm">
            <p className="text-[color:var(--text-faint)] text-xs mb-2">{t("recents")}</p>
            <div className="space-y-1.5">
              {recentRooms.map((room) => (
                <div
                  key={room.code}
                  className="w-full flex items-center justify-between p-2.5 bg-[color:var(--home-row-bg)] hover:bg-[color:var(--home-row-hover)] border border-[color:var(--home-row-border)] rounded-lg transition-colors duration-200 group"
                >
                  <button
                    onClick={() => navigate(`/prejoin/${room.code}`)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <Icon name="videocam" size={14} className="text-[color:var(--text-faint)]" />
                    <span className="font-mono text-xs text-[color:var(--text-subtle)]">
                      {room.code}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteRoom(e, room.code)}
                      className="p-1.5 rounded-md hover:bg-red-500/20 text-[color:var(--text-faint)] hover:text-danger-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title={t("delete")}
                      aria-label={t("deleteThisMeeting")}
                    >
                      <Icon name="close" size={12} />
                    </button>
                    <button
                      onClick={() => navigate(`/prejoin/${room.code}`)}
                      className="p-1"
                    >
                      <Icon
                        name="arrow-forward"
                        size={14}
                        className="text-[color:var(--text-ghost)] group-hover:text-[color:var(--text-subtle)] transition-colors"
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - fixed at bottom */}
      <div className="relative z-10 pb-4 text-center">
        <p className="text-[color:var(--text-ghost)] text-xs">
          {t("developedBy")}{" "}
          <a
            href="https://www.jematechnology.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 dark:text-primary-400 hover:underline"
          >
            Jema Technology
          </a>{" "}
          {t("licenseLine")}
        </p>
      </div>
    </div>
  );
}
