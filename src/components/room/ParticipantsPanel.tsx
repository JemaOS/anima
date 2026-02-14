import React from "react";
import { Icon, Avatar } from "@/components/ui";
import { Participant } from "@/types";

interface ParticipantsPanelProps {
  participants?: Map<string, Participant>;
  localParticipant?: Participant;
}

export function ParticipantsPanel({
  participants,
  localParticipant,
}: ParticipantsPanelProps) {
  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
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
              <Icon name="mic-off" size={18} className="text-danger-500" />
            )}
            {!localParticipant.videoEnabled && (
              <Icon name="videocam-off" size={18} className="text-danger-500" />
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
                    className="text-[#8f88ed]"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!p.audioEnabled && (
                <Icon name="mic-off" size={18} className="text-danger-500" />
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

      {(!participants || participants.size === 0) && !localParticipant && (
        <div className="text-center py-8">
          <p className="text-neutral-400 text-sm">Aucun autre participant</p>
        </div>
      )}
    </div>
  );
}