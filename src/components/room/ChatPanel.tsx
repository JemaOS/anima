import React, { useState, useRef, useEffect } from "react";
import { Icon, Avatar } from "@/components/ui";
import { ChatMessage } from "@/types";
import { convertEmoticons } from "@/utils/chatHelpers";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage?: (content: string) => void;
}

export function ChatPanel({ messages, onSendMessage }: ChatPanelProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll vers le bas quand un nouveau message arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                <p className="text-sm text-neutral-200 mt-1 whitespace-pre-wrap break-words">
                  {convertEmoticons(msg.content)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input chat - avec padding pour éviter la barre de contrôle sur mobile */}
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
    </div>
  );
}