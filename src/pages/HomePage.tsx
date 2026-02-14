// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui";
import {
  generateRoomCode,
  getRecentRooms,
  isValidRoomCode,
  removeRecentRoom,
} from "@/utils/helpers";

export function HomePage() {
  const navigate = useNavigate();
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
      setError("Entrez un code de reunion");
      return;
    }

    if (!isValidRoomCode(cleanCode)) {
      setError("Code invalide. Format: xxx-yyyy-zzz");
      return;
    }

    navigate(`/prejoin/${cleanCode}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomCode(e.target.value);
    setError("");
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0f0f1a] relative flex flex-col">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f1a] via-[#151528] to-[#0f0f1a]" />

      {/* Single subtle accent glow */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[100px]"
        style={{
          background: "radial-gradient(circle, #8f88ed 0%, transparent 70%)",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Main content - centered with flex */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6">
        {/* Logo and branding - compact */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-[#8f88ed] to-[#6366f1] rounded-xl flex items-center justify-center mb-3 shadow-lg">
            <Icon name="videocam" size={28} className="text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">
            Anima
          </h1>
          <p className="text-sm text-gray-500">Visioconférence P2P sécurisée</p>
        </div>

        {/* Main card - compact */}
        <div className="w-full max-w-sm">
          <div className="p-5 rounded-2xl bg-[#1a1a2e]/80 border border-white/[0.06] backdrop-blur-sm">
            {/* Create meeting button */}
            <button
              onClick={handleCreateRoom}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-[#8f88ed] hover:bg-[#7b74d9] text-white font-medium transition-colors duration-200 text-sm"
            >
              <Icon name="video-call" size={20} className="text-white" />
              <span>Nouvelle réunion</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-gray-600 text-xs">ou</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Join meeting section */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={roomCode}
                  onChange={handleCodeChange}
                  placeholder="Code de réunion"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinRoom();
                  }}
                  className="w-full h-11 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:border-[#8f88ed]/40 transition-colors duration-200 text-sm"
                />
                {error && (
                  <p className="absolute -bottom-4 left-0 text-red-400 text-xs">
                    {error}
                  </p>
                )}
              </div>

              <button
                onClick={handleJoinRoom}
                className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-gray-300 font-medium transition-colors duration-200 text-sm"
              >
                Rejoindre
              </button>
            </div>
          </div>
        </div>

        {/* Features - inline compact */}
        <div className="mt-5 flex items-center justify-center gap-5 text-gray-500 text-xs">
          <div className="flex items-center gap-1.5">
            <Icon name="shield" size={14} className="text-[#8f88ed]" />
            <span>P2P</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="person" size={14} className="text-emerald-500" />
            <span>Sans compte</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="lock" size={14} className="text-amber-500" />
            <span>Zéro logs</span>
          </div>
        </div>

        {/* Recent rooms - compact */}
        {recentRooms.length > 0 && (
          <div className="mt-5 w-full max-w-sm">
            <p className="text-gray-600 text-xs mb-2">Récents</p>
            <div className="space-y-1.5">
              {recentRooms.map((room) => (
                <div
                  key={room.code}
                  className="w-full flex items-center justify-between p-2.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-lg transition-colors duration-200 group"
                >
                  <button
                    onClick={() => navigate(`/prejoin/${room.code}`)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <Icon name="videocam" size={14} className="text-gray-600" />
                    <span className="font-mono text-xs text-gray-400">
                      {room.code}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteRoom(e, room.code)}
                      className="p-1.5 rounded-md hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Supprimer"
                      aria-label="Supprimer cette réunion"
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
                        className="text-gray-700 group-hover:text-gray-500 transition-colors"
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
        <p className="text-gray-700 text-xs">
          Développé par{" "}
          <a
            href="https://www.jematechnology.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8f88ed] hover:underline"
          >
            Jema Technology
          </a>{" "}
          © 2025 • Open Source & sous licence AGPL
        </p>
      </div>
    </div>
  );
}
