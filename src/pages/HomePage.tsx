import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Input } from '@/components/ui';
import { generateRoomCode, getRecentRooms, isValidRoomCode } from '@/utils/helpers';

export function HomePage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const recentRooms = getRecentRooms().slice(0, 3); // Limit to 3 for compact view

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    navigate(`/prejoin/${code}?host=true`);
  };

  const handleJoinRoom = () => {
    const cleanCode = roomCode.trim().toLowerCase();
    
    if (!cleanCode) {
      setError('Entrez un code de reunion');
      return;
    }

    if (!isValidRoomCode(cleanCode)) {
      setError('Code invalide. Format: xxx-yyyy-zzz');
      return;
    }

    navigate(`/prejoin/${cleanCode}`);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomCode(e.target.value);
    setError('');
  };

  return (
    <div className="min-h-screen w-screen overflow-auto bg-[#24283f] flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Logo/Title - directly on background */}
      <div className="flex items-center justify-center gap-3 mb-6 sm:mb-8">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#8f88ed] rounded-xl flex items-center justify-center">
          <Icon name="videocam" size={28} className="text-white sm:hidden" />
          <Icon name="videocam" size={32} className="text-white hidden sm:block" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Anima</h1>
          <p className="text-xs sm:text-sm text-gray-400">Visioconference P2P</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-center text-sm sm:text-base text-gray-300 mb-6 sm:mb-8 max-w-sm">
        Reunions securisees, gratuites et sans logs
      </p>

      {/* Main actions container */}
      <div className="w-full max-w-sm space-y-4">
        {/* Create Meeting Button */}
        <Button
          onClick={handleCreateRoom}
          size="lg"
          className="w-full bg-[#8f88ed] hover:bg-[#7b74d9] text-white rounded-xl py-3 sm:py-3.5 font-semibold text-sm sm:text-base"
        >
          <Icon name="video-call" size={20} className="sm:hidden" />
          <Icon name="video-call" size={22} className="hidden sm:block" />
          Nouvelle reunion
        </Button>

        {/* Join Meeting Input + Button */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={roomCode}
              onChange={handleCodeChange}
              placeholder="Code de réunion"
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
              className="w-full h-10 sm:h-12 px-3 sm:px-4 bg-white border border-gray-300 rounded-xl text-sm text-black placeholder:text-gray-500 focus:outline-none focus:border-[#8f88ed] focus:ring-1 focus:ring-[#8f88ed]"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <Button
            onClick={handleJoinRoom}
            variant="secondary"
            className="w-full sm:w-auto shrink-0 bg-[#3a3f5c] hover:bg-[#4a4f6c] text-white border-0 rounded-xl px-5 py-2.5 sm:py-2 text-sm"
          >
            Rejoindre
          </Button>
        </div>
      </div>

      {/* Features - simple icons with text */}
      <div className="flex items-center justify-center gap-6 sm:gap-8 mt-8 sm:mt-10">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#3a3f5c] rounded-lg flex items-center justify-center mb-2">
            <Icon name="settings" size={18} className="text-[#8f88ed] sm:hidden" />
            <Icon name="settings" size={20} className="text-[#8f88ed] hidden sm:block" />
          </div>
          <p className="text-xs text-gray-400">100% P2P</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#3a3f5c] rounded-lg flex items-center justify-center mb-2">
            <Icon name="check" size={18} className="text-green-500 sm:hidden" />
            <Icon name="check" size={20} className="text-green-500 hidden sm:block" />
          </div>
          <p className="text-xs text-gray-400">Sans compte</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#3a3f5c] rounded-lg flex items-center justify-center mb-2">
            <Icon name="close" size={18} className="text-red-400 sm:hidden" />
            <Icon name="close" size={20} className="text-red-400 hidden sm:block" />
          </div>
          <p className="text-xs text-gray-400">Zero logs</p>
        </div>
      </div>

      {/* Recent rooms */}
      {recentRooms.length > 0 && (
        <div className="mt-8 sm:mt-10 w-full max-w-sm">
          <p className="text-xs text-gray-500 mb-2">Reunions recentes</p>
          <div className="space-y-2">
            {recentRooms.map((room) => (
              <button
                key={room.code}
                onClick={() => navigate(`/prejoin/${room.code}`)}
                className="w-full flex items-center justify-between p-3 bg-[#1a1d2e] hover:bg-[#2a2d3e] rounded-xl transition-all text-left"
              >
                <div className="flex items-center gap-2">
                  <Icon name="videocam" size={16} className="text-[#8f88ed]" />
                  <span className="font-mono text-sm text-gray-300">{room.code}</span>
                </div>
                <Icon name="arrow-back" size={16} className="text-gray-500 rotate-180" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-8 sm:mt-10 text-center">
        <p className="text-xs text-gray-500">
          Max 8 participants • Architecture mesh P2P
        </p>
      </div>
    </div>
  );
}
