// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, {
  useState,
  useEffect,
  useRef,
  useReducer,
  useCallback,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { VideoGrid, ControlBar, SidePanel } from "@/components/room";
import {
  VideoStyle,
  VIDEO_STYLES,
  getSavedVideoStyle,
  saveVideoStyle,
} from "@/components/room/SidePanel";
import { Icon } from "@/components/ui";
import { Participant, ChatMessage, ConnectionQuality } from "@/types";
import { generateId, formatDuration } from "@/utils/helpers";
import {
  P2PManager,
  type PeerInfo,
  type P2PMessage,
  ConnectionState,
  ICEConnectionState,
} from "@/services/p2pManager";
import {
  getOptimalVideoConstraints,
  getOptimalAudioConstraints,
  VideoQualityLevel,
  getSavedVideoQuality,
  saveVideoQuality,
} from "@/utils/videoConstraints";
import { captureMediaStream, isAndroid, isMobileDevice, restartVideoTrack } from "@/utils/mediaHelpers";
import { useNetworkStatus, useReconnection } from "@/hooks/useNetworkStatus";

interface LocationState {
  userName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isHost: boolean;
  hostPeerId?: string;
}



// Participant state reducer for efficient updates
type ParticipantAction =
  | {
      type: "ADD_PARTICIPANT";
      payload: { id: string; participant: Participant };
    }
  | { type: "REMOVE_PARTICIPANT"; payload: { id: string } }
  | {
      type: "UPDATE_PARTICIPANT";
      payload: { id: string; updates: Partial<Participant> };
    }
  | { type: "SET_STREAM"; payload: { id: string; stream: MediaStream } }
  | { type: "SET_AUDIO_LEVEL"; payload: { id: string; audioLevel: number } }
  | {
      type: "SET_CONNECTION_QUALITY";
      payload: { id: string; connectionQuality: ConnectionQuality };
    }
  | { type: "CLEAR_ALL" };

// Helper functions for participantsReducer to reduce cognitive complexity
function handleAddParticipant(
  state: Map<string, Participant>,
  payload: { id: string; participant: Participant },
): Map<string, Participant> {
  const newState = new Map(state);
  // CRITICAL FIX: Check if there's an existing entry with a stream (from race condition)
  // If so, preserve the stream when adding the participant info
  const existing = state.get(payload.id);
  if (existing?.stream) {
    console.log(
      "[Reducer] ADD_PARTICIPANT: Preserving existing stream from placeholder",
      {
        id: payload.id,
        existingName: existing.name,
        newName: payload.participant.name,
        hasStream: !!existing.stream,
      },
    );
    newState.set(payload.id, {
      ...payload.participant,
      stream: existing.stream, // Preserve the stream!
    });
  } else {
    newState.set(payload.id, payload.participant);
  }
  return newState;
}

function handleSetStream(
  state: Map<string, Participant>,
  payload: { id: string; stream: MediaStream },
): Map<string, Participant> {
  const existing = state.get(payload.id);
  if (!existing) {
    // Participant doesn't exist yet - this can happen due to race condition
    // Store the stream anyway, it will be used when participant is added
    console.warn(
      "[Reducer] SET_STREAM: Participant not found, creating placeholder",
      payload.id,
    );
    const newState = new Map(state);
    newState.set(payload.id, {
      id: payload.id,
      name: "Connecting...",
      stream: payload.stream,
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
      handRaised: false,
    });
    return newState;
  }
  // Only update if stream actually changed
  if (existing.stream === payload.stream) return state;
  const newState = new Map(state);
  newState.set(payload.id, {
    ...existing,
    stream: payload.stream,
  });
  return newState;
}

function handleUpdateParticipant(
  state: Map<string, Participant>,
  payload: { id: string; updates: Partial<Participant> },
): Map<string, Participant> {
  const existing = state.get(payload.id);
  if (!existing) return state;
  const newState = new Map(state);
  newState.set(payload.id, {
    ...existing,
    ...payload.updates,
  });
  return newState;
}

function participantsReducer(
  state: Map<string, Participant>,
  action: ParticipantAction,
): Map<string, Participant> {
  switch (action.type) {
    case "ADD_PARTICIPANT":
      return handleAddParticipant(state, action.payload);

    case "REMOVE_PARTICIPANT": {
      const newState = new Map(state);
      newState.delete(action.payload.id);
      return newState;
    }

    case "UPDATE_PARTICIPANT":
      return handleUpdateParticipant(state, action.payload);

    case "SET_STREAM":
      return handleSetStream(state, action.payload);

    case "SET_AUDIO_LEVEL": {
      const existing = state.get(action.payload.id);
      if (!existing) return state;
      // Only update if level changed significantly (avoid excessive re-renders)
      if (
        Math.abs((existing.audioLevel || 0) - action.payload.audioLevel) < 0.05
      )
        return state;
      const newState = new Map(state);
      newState.set(action.payload.id, {
        ...existing,
        audioLevel: action.payload.audioLevel,
      });
      return newState;
    }

    case "SET_CONNECTION_QUALITY": {
      const existing = state.get(action.payload.id);
      if (!existing) return state;
      if (existing.connectionQuality === action.payload.connectionQuality)
        return state;
      const newState = new Map(state);
      newState.set(action.payload.id, {
        ...existing,
        connectionQuality: action.payload.connectionQuality,
      });
      return newState;
    }

    case "CLEAR_ALL":
      return new Map();

    default:
      return state;
  }
}

export function RoomPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // Redirect if no state
  useEffect(() => {
    if (!state?.userName) {
      const hash = globalThis.location.hash;
      navigate(`/prejoin/${code}${hash}`);
    }
  }, [state, code, navigate]);

  // Main states
  const [myId, setMyId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [participants, dispatchParticipants] = useReducer(
    participantsReducer,
    new Map<string, Participant>(),
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(state?.audioEnabled ?? true);
  const [videoEnabled, setVideoEnabled] = useState(state?.videoEnabled ?? true);
  const [handRaised, setHandRaised] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [meetingLinkCopied, setMeetingLinkCopied] = useState(false);
  const [roomFullError, setRoomFullError] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "reconnecting" | "failed"
  >("connecting");
  const [iceStatus, setIceStatus] = useState<Map<string, ICEConnectionState>>(
    new Map(),
  );

  // Network status and reconnection
  const networkStatus = useNetworkStatus({
    onOnline: () => {
      console.log("[RoomPage] 🌐 Network restored");
      setMediaError("Connexion réseau restaurée");
      setTimeout(() => setMediaError(null), 3000);
    },
    onOffline: () => {
      console.log("[RoomPage] 🌐 Network lost");
      setMediaError("Connexion réseau perdue. Reconnexion en cours...");
    },
  });

  const reconnection = useReconnection({
    maxAttempts: 5,
    delay: 3000,
    autoReconnect: true,
  });

  // Error recovery state
  const [initError, setInitError] = useState<Error | null>(null);
  const [initAttempts, setInitAttempts] = useState(0);
  const maxInitAttempts = 3;

  // Panels
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs
  const p2pManager = useRef<P2PManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const startTime = useRef<number>(Date.now());
  const initializationComplete = useRef<boolean>(false);

  // Duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Current device IDs
  const [currentAudioDevice, setCurrentAudioDevice] = useState<string>("");
  const [currentVideoDevice, setCurrentVideoDevice] = useState<string>("");

  // Video quality state - load from localStorage on mount
  const [videoQuality, setVideoQuality] = useState<VideoQualityLevel>(() =>
    getSavedVideoQuality(),
  );

  // Video style state - load from localStorage on mount
  const [videoStyle, setVideoStyle] = useState<VideoStyle>(() =>
    getSavedVideoStyle(),
  );

  // Capture local media - extracted for reuse with adaptive constraints
  // Includes retry logic for Android devices and timeout handling
  const captureLocalMedia = useCallback(
    async (
      audioOn: boolean,
      videoOn: boolean,
      audioDeviceId?: string,
      videoDeviceId?: string,
      cameraFacingMode: "user" | "environment" = "user",
      retryCount: number = 0,
      qualityOverride?: VideoQualityLevel,
    ): Promise<MediaStream | null> => {
      const effectiveQuality = qualityOverride ?? videoQuality;

      if (retryCount === 0) {
        setMediaError(null);
      }

      const { stream, error } = await captureMediaStream(
        audioOn,
        videoOn,
        effectiveQuality,
        cameraFacingMode,
        audioDeviceId,
        videoDeviceId,
        retryCount,
      );

      if (error) {
        setMediaError(error);
        // If it's a warning (like fallback), we might still have a stream
        if (error.includes("essai avec la caméra par défaut")) {
          setTimeout(() => setMediaError(null), 2000);
        }
      }

      return stream;
    },
    [videoQuality],
  );

  const handleAudioDeviceChange = useCallback(async (deviceId: string) => {
    setCurrentAudioDevice(deviceId);
    // Get new audio stream with selected device
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...getOptimalAudioConstraints(),
        deviceId: { exact: deviceId },
      },
    });

    const newAudioTrack = newStream.getAudioTracks()[0];
    if (newAudioTrack && localStreamRef.current) {
      // Stop old audio track
      const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
      if (oldAudioTrack) {
        oldAudioTrack.stop();
        localStreamRef.current.removeTrack(oldAudioTrack);
      }

      // Add new audio track with current enabled state
      newAudioTrack.enabled = audioEnabled;
      localStreamRef.current.addTrack(newAudioTrack);

      // Update P2P manager with new stream
      p2pManager.current?.updateLocalStream(localStreamRef.current);
      setLocalStream(localStreamRef.current);
    }
  }, [audioEnabled]);

  const handleVideoDeviceChange = useCallback(async (deviceId: string) => {
    setCurrentVideoDevice(deviceId);
    // Get new video stream with selected device using optimal constraints
    const videoConstraints = getOptimalVideoConstraints(
      facingMode,
      false,
      deviceId,
    );
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (newVideoTrack && localStreamRef.current) {
      // Stop old video track
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        localStreamRef.current.removeTrack(oldVideoTrack);
      }

      // Add new video track with current enabled state
      newVideoTrack.enabled = videoEnabled;
      localStreamRef.current.addTrack(newVideoTrack);

      // Update P2P manager with new stream
      p2pManager.current?.updateLocalStream(localStreamRef.current);
      setLocalStream(localStreamRef.current);
    }
  }, [videoEnabled, facingMode]);

  // Handle device change from settings panel
  const handleDeviceChange = useCallback(
    async (type: "audio" | "video", deviceId: string) => {
      try {
        if (type === "audio") {
          await handleAudioDeviceChange(deviceId);
        } else if (type === "video") {
          await handleVideoDeviceChange(deviceId);
        }
      } catch (error) {
        console.error("Error changing device:", error);
        setMediaError(
          `Erreur lors du changement de ${type === "audio" ? "microphone" : "caméra"}`,
        );
        setTimeout(() => setMediaError(null), 3000);
      }
    },
    [handleAudioDeviceChange, handleVideoDeviceChange],
  );

  // Handle video quality change from settings panel
  const handleVideoQualityChange = useCallback(
    async (quality: VideoQualityLevel) => {
      console.log(
        "[handleVideoQualityChange] Changing video quality to:",
        quality,
      );

      // Update state and save to localStorage
      setVideoQuality(quality);
      saveVideoQuality(quality);

      // If video is currently enabled, apply the new quality immediately
      if (videoEnabled && localStreamRef.current) {
        try {
          // Get new video stream with the selected quality
          const videoConstraints = getOptimalVideoConstraints(
            facingMode,
            false,
            currentVideoDevice || undefined,
            quality,
          );
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
          });

          const newVideoTrack = newStream.getVideoTracks()[0];
          if (newVideoTrack && localStreamRef.current) {
            // Stop old video track
            const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldVideoTrack) {
              oldVideoTrack.stop();
              localStreamRef.current.removeTrack(oldVideoTrack);
            }

            // Add new video track
            localStreamRef.current.addTrack(newVideoTrack);

            // Update P2P manager with new stream
            p2pManager.current?.updateLocalStream(localStreamRef.current);

            // Create new stream reference for React
            const newStreamRef = new MediaStream(
              localStreamRef.current.getTracks(),
            );
            localStreamRef.current = newStreamRef;
            setLocalStream(newStreamRef);

            console.log(
              "[handleVideoQualityChange] Video quality applied successfully",
              {
                quality,
                width: newVideoTrack.getSettings().width,
                height: newVideoTrack.getSettings().height,
                frameRate: newVideoTrack.getSettings().frameRate,
              },
            );
          }
        } catch (error) {
          console.error(
            "[handleVideoQualityChange] Error applying video quality:",
            error,
          );
          setMediaError("Erreur lors du changement de qualité vidéo");
          setTimeout(() => setMediaError(null), 3000);
        }
      }
    },
    [videoEnabled, facingMode, currentVideoDevice],
  );

  // Handle video style change from settings panel
  const handleVideoStyleChange = useCallback((style: VideoStyle) => {
    console.log("[handleVideoStyleChange] Changing video style to:", style);
    setVideoStyle(style);
    saveVideoStyle(style);
  }, []);

  // --- P2P Event Handlers ---

  // Handle P2P messages with reducer dispatch
  const handleP2PMessage = useCallback((message: P2PMessage) => {
    switch (message.type) {
      case "chat-message":
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            senderId: message.senderId,
            senderName: message.data.senderName,
            content: message.data.content,
            timestamp: message.data.timestamp,
          },
        ]);
        break;

      case "hand-raised":
        dispatchParticipants({
          type: "UPDATE_PARTICIPANT",
          payload: { id: message.senderId, updates: { handRaised: true } },
        });
        break;

      case "hand-lowered":
        dispatchParticipants({
          type: "UPDATE_PARTICIPANT",
          payload: { id: message.senderId, updates: { handRaised: false } },
        });
        break;

      case "media-state":
        dispatchParticipants({
          type: "UPDATE_PARTICIPANT",
          payload: {
            id: message.senderId,
            updates: {
              audioEnabled: message.data.audioEnabled,
              videoEnabled: message.data.videoEnabled,
              // Handle screen sharing state if present
              ...(message.data.screenSharing !== undefined && {
                screenSharing: message.data.screenSharing,
              }),
            },
          },
        });
        break;
    }
  }, []);

  const handlePeerConnected = useCallback((peerId: string, peerInfo: PeerInfo) => {
    dispatchParticipants({
      type: "ADD_PARTICIPANT",
      payload: {
        id: peerId,
        participant: {
          id: peerId,
          name: peerInfo.name,
          audioEnabled: true,
          videoEnabled: true,
          screenSharing: false,
          handRaised: false,
        },
      },
    });
  }, []);

  const handlePeerDisconnected = useCallback((peerId: string) => {
    dispatchParticipants({
      type: "REMOVE_PARTICIPANT",
      payload: { id: peerId },
    });
  }, []);

  const handleStreamReceived = useCallback((peerId: string, stream: MediaStream) => {
    console.log("[RoomPage] 🎥 Received stream from peer:", peerId, {
      streamId: stream.id,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
    });

    // Ensure all tracks are enabled
    stream.getTracks().forEach((track) => {
      track.enabled = true;
    });

    // Create new stream reference to force React re-render
    const streamWithEnabledTracks = new MediaStream(stream.getTracks());

    dispatchParticipants({
      type: "SET_STREAM",
      payload: { id: peerId, stream: streamWithEnabledTracks },
    });

    // Update videoEnabled based on whether we have a video track
    const hasVideoTrack = stream.getVideoTracks().length > 0;
    if (hasVideoTrack) {
      dispatchParticipants({
        type: "UPDATE_PARTICIPANT",
        payload: {
          id: peerId,
          updates: { videoEnabled: true },
        },
      });
    }

    // Add audio analyser for the new stream
    p2pManager.current?.addAudioAnalyser(peerId, stream);
  }, []);

  const handleTrackUnmuted = useCallback((peerId: string, stream: MediaStream) => {
    console.log("[RoomPage] 🔄 Track unmuted callback received", { peerId });

    // Force update the participant's stream by creating a new MediaStream reference
    const newStreamRef = new MediaStream(stream.getTracks());

    dispatchParticipants({
      type: "SET_STREAM",
      payload: { id: peerId, stream: newStreamRef },
    });

    dispatchParticipants({
      type: "UPDATE_PARTICIPANT",
      payload: {
        id: peerId,
        updates: { videoEnabled: true },
      },
    });
  }, []);

  const handleICEStateChange = useCallback((peerId: string, iceState: ICEConnectionState) => {
    setIceStatus((prev) => {
      const newMap = new Map(prev);
      newMap.set(peerId, iceState);
      return newMap;
    });

    if (iceState === ICEConnectionState.FAILED) {
      setMediaError("Problème de connexion réseau. Tentative de reconnexion...");
      setTimeout(() => setMediaError(null), 5000);
    } else if (iceState === ICEConnectionState.DISCONNECTED) {
      setMediaError("Connexion instable. Reconnexion en cours...");
      setTimeout(() => setMediaError(null), 3000);
    }
  }, []);

  const handleConnectionStateChange = useCallback((peerId: string, connectionState: ConnectionState) => {
    if (connectionState === ConnectionState.CONNECTED) {
      setConnectionStatus("connected");
    } else if (connectionState === ConnectionState.RECONNECTING) {
      setConnectionStatus("reconnecting");
    } else if (connectionState === ConnectionState.FAILED) {
      const manager = p2pManager.current;
      if (manager) {
        const allFailed = Array.from(manager.getPeers()).every(
          (p) => manager.getConnectionState(p.id) === ConnectionState.FAILED,
        );
        if (allFailed && manager.getPeers().length > 0) {
          setConnectionStatus("failed");
        }
      }
    }
  }, []);

  const handleRoomFull = useCallback(() => {
    setRoomFullError(true);
    setMediaError("Réunion complète. Maximum 8 participants autorisés.");
  }, []);

  const handleAudioLevel = useCallback((peerId: string, level: number) => {
    dispatchParticipants({
      type: "SET_AUDIO_LEVEL",
      payload: { id: peerId, audioLevel: level },
    });
  }, []);

  const handleConnectionQuality = useCallback((peerId: string, quality: ConnectionQuality) => {
    dispatchParticipants({
      type: "SET_CONNECTION_QUALITY",
      payload: { id: peerId, connectionQuality: quality },
    });
  }, []);

  // Initialization - proper sequence to avoid race conditions
  // With improved Android support
  useEffect(() => {
    if (!state?.userName) return;

    // Use a local variable to track if this effect instance should proceed
    let isMounted = true;
    let currentManager: P2PManager | null = null;
    let currentStream: MediaStream | null = null;

    const initializePeerSession = async (manager: P2PManager, capturedStream: MediaStream | null) => {
      // 4. Initialize peer AFTER media capture
      let peerId: string;
      if (state.isHost) {
        peerId = `host-${code}`;
        console.log("[RoomPage] 🔌 HOST: Using deterministic peer ID", { peerId, code });
      } else {
        peerId = `meet-${code}-${Date.now().toString(36)}-${generateId().substring(0, 5)}`;
        console.log("[RoomPage] 🔌 PARTICIPANT: Using random peer ID", { peerId });
      }

      console.log("[RoomPage] 🔌 Initializing peer...", { peerId, isHost: state.isHost });
      const id = await manager.initialize(peerId, state.isHost);
      console.log("[RoomPage] ✅ Peer initialized", { requestedId: peerId, actualId: id });

      if (!isMounted) {
        manager.destroy();
        return;
      }

      setMyId(id);
      setConnected(true);

      // 5. Update local stream in manager immediately after initialization
      if (capturedStream) {
        console.log("[RoomPage] 📹 Updating local stream in manager", {
          audioTracks: capturedStream.getAudioTracks().length,
          videoTracks: capturedStream.getVideoTracks().length,
          isHost: state.isHost,
        });
        manager.updateLocalStream(capturedStream);
      } else {
        console.log("[RoomPage] ⚠️ No captured stream to update in manager!");
      }

      setConnectionStatus("connected");

      // 6. Create or join room with proper delay
      if (state.isHost) {
        manager.createRoom(state.userName);
        const newUrl = `${globalThis.location.pathname}${globalThis.location.search}#peer_id=${id}`;
        globalThis.history.replaceState(null, "", newUrl);
        console.log("[RoomPage] 🔗 Host URL updated with peer ID", { url: newUrl, peerId: id });
      } else {
        const hostPeerIdToUse = state.hostPeerId || `host-${code}`;
        console.log("[RoomPage] 🤝 Using host peer ID", { using: hostPeerIdToUse });

        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log("[RoomPage] 🤝 Joining room as participant", { hostPeerId: hostPeerIdToUse });
        
        const joined = await manager.joinRoom(hostPeerIdToUse, state.userName, capturedStream);
        console.log("[RoomPage] 🤝 Join room result", { joined });
      }

      manager.startQualityMonitoring();
      manager.startAudioLevelMonitoring();
      initializationComplete.current = true;
    };

    const init = async () => {
      // Skip if already initialized AND we have a valid manager
      if (initializationComplete.current && p2pManager.current) {
        console.log("[RoomPage] ⏭️ Already initialized, skipping");
        return;
      }

      // On Android, add initial delay to ensure previous page's media is fully released
      if (isAndroid() || isMobileDevice()) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 1. Initialize P2PManager FIRST
      const manager = new P2PManager();
      currentManager = manager;
      p2pManager.current = manager;

      // 2. Setup ALL callbacks BEFORE any connections
      manager.onPeerConnected(handlePeerConnected);
      manager.onPeerDisconnected(handlePeerDisconnected);
      manager.onMessage(handleP2PMessage);
      manager.onStream(handleStreamReceived);
      manager.onTrackUnmuted(handleTrackUnmuted);
      manager.onICEStateChange(handleICEStateChange);
      manager.onConnectionStateChange(handleConnectionStateChange);
      manager.onRoomFull(handleRoomFull);
      manager.onAudioLevel(handleAudioLevel);
      manager.onConnectionQuality(handleConnectionQuality);

      // CRITICAL FIX: Resume audio context on user interaction
      const resumeAudioContext = () => {
        manager.resumeAudioContext?.();
      };

      // Resume audio context on first user interaction
      document.addEventListener('click', resumeAudioContext, { once: true });
      document.addEventListener('touchstart', resumeAudioContext, { once: true });

      // 3. Capture media BEFORE peer initialization
      const capturedStream = await captureLocalMedia(
        state.audioEnabled,
        state.videoEnabled,
      );

      if (!isMounted) {
        capturedStream?.getTracks().forEach((track) => track.stop());
        return;
      }

      currentStream = capturedStream;

      if (capturedStream) {
        setLocalStream(capturedStream);
        localStreamRef.current = capturedStream;
        setMediaError(null);
      } else {
        setVideoEnabled(false);
        setAudioEnabled(false);
      }

      try {
        await initializePeerSession(manager, capturedStream);
      } catch (error) {
        console.error("[RoomPage] Initialization error:", error);
        const err = error instanceof Error ? error : new Error(String(error));
        
        setInitError(err);
        setInitAttempts(prev => prev + 1);
        
        // If we haven't exceeded max attempts, retry initialization
        if (initAttempts < maxInitAttempts - 1) {
          console.log(`[RoomPage] Retrying initialization (${initAttempts + 1}/${maxInitAttempts})`);
          setMediaError(`Erreur de connexion. Nouvelle tentative ${initAttempts + 2}/${maxInitAttempts}...`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Retry by calling init again (this effect will re-run due to state change)
          return;
        }
        
        setConnected(true); // Allow UI even if peer fails
        setConnectionStatus("failed");
        setMediaError("Erreur de connexion persistante. Veuillez rafraîchir la page ou vérifier votre connexion.");
        initializationComplete.current = true; // Still mark as complete to prevent infinite retries
      }
    };

    init();

    return () => {
      isMounted = false;

      // Only cleanup if we actually initialized something AND it's our manager
      if (currentManager && p2pManager.current === currentManager) {
        currentManager.stopQualityMonitoring();
        currentManager.stopAudioLevelMonitoring();
        currentManager.destroy();
        p2pManager.current = null;

        // Reset initialization flag so next mount can initialize
        initializationComplete.current = false;
      }

      if (currentStream && localStreamRef.current === currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    code,
    state,
    captureLocalMedia,
    handlePeerConnected,
    handlePeerDisconnected,
    handleP2PMessage,
    handleStreamReceived,
    handleTrackUnmuted,
    handleICEStateChange,
    handleConnectionStateChange,
    handleRoomFull,
    handleAudioLevel,
    handleConnectionQuality,
  ]);

  // Broadcast to all peers - memoized
  const broadcast = useCallback(
    (message: Omit<P2PMessage, "senderId" | "timestamp">) => {
      p2pManager.current?.broadcast({
        ...message,
        senderId: myId,
        timestamp: Date.now(),
      } as P2PMessage);
    },
    [myId],
  );

  // Toggle audio - memoized
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        p2pManager.current?.broadcast({
          type: "media-state",
          data: { audioEnabled: audioTrack.enabled, videoEnabled },
          senderId: myId,
          timestamp: Date.now(),
        } as P2PMessage);
      }
    }
  }, [myId, videoEnabled]);

  // Toggle video - memoized with FRESH TRACK approach for re-enabling
  // CRITICAL FIX: On mobile devices, simply enabling a disabled track doesn't always
  // restart the camera properly. We need to get a fresh track when re-enabling.
  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const currentVideoTrack = stream.getVideoTracks()[0];
    const newVideoEnabled = !videoEnabled;

    if (newVideoEnabled) {
      // Re-enable video - ALWAYS get a fresh track on mobile
      console.log("[toggleVideo] Getting FRESH video track for re-enable...");

      const { success, error, newStream } = await restartVideoTrack(
        stream,
        facingMode,
        videoQuality,
      );

      if (success && newStream) {
        // Update refs
        localStreamRef.current = newStream;

        // Update P2P manager
        p2pManager.current?.updateLocalStream(newStream);

        setVideoEnabled(true);
        setLocalStream(newStream);

        // Send media-state
        p2pManager.current?.broadcast({
          type: "media-state",
          data: { audioEnabled, videoEnabled: true },
          senderId: myId,
          timestamp: Date.now(),
        } as P2PMessage);
      } else {
        console.error("[toggleVideo] Error re-acquiring camera:", error);
        setMediaError("Erreur lors de la réactivation de la caméra");
        setTimeout(() => setMediaError(null), 3000);
      }
    } else {
      // Disable video
      console.log(
        "[toggleVideo] 📤 Sending media-state with videoEnabled=false",
      );
      p2pManager.current?.broadcast({
        type: "media-state",
        data: { audioEnabled, videoEnabled: false },
        senderId: myId,
        timestamp: Date.now(),
      } as P2PMessage);

      if (currentVideoTrack) {
        currentVideoTrack.enabled = false;
        currentVideoTrack.stop();
      }

      setVideoEnabled(false);
    }
  }, [myId, audioEnabled, videoEnabled, facingMode, videoQuality]);

  // Switch camera (front/back) - for mobile devices
  // Uses facingMode with fallback for better compatibility
  const switchCamera = useCallback(async () => {
    const newFacingMode = facingMode === "user" ? "environment" : "user";

    try {
      // Use the fallback function for better back camera support
      const audioConstraints: MediaTrackConstraints = getOptimalAudioConstraints();

      // Try with exact facingMode first, then fallback
      let newStream: MediaStream;
      try {
        console.log(
          `Switching to ${newFacingMode} camera with exact constraint`,
        );
        const exactConstraints = getOptimalVideoConstraints(
          newFacingMode,
          true,
        );
        // Remove deviceId if present since we're switching cameras
        delete exactConstraints.deviceId;
        newStream = await navigator.mediaDevices.getUserMedia({
          video: exactConstraints,
          audio: false, // Don't request audio again, we already have it
        });
      } catch (exactError) {
        console.log(`exact ${newFacingMode} failed, trying ideal:`, exactError);
        try {
          const idealConstraints = getOptimalVideoConstraints(
            newFacingMode,
            false,
          );
          delete idealConstraints.deviceId;
          newStream = await navigator.mediaDevices.getUserMedia({
            video: idealConstraints,
            audio: false,
          });
        } catch (idealError) {
          console.log(
            `ideal ${newFacingMode} failed, trying simple:`,
            idealError,
          );
          const simpleConstraints = getOptimalVideoConstraints(
            newFacingMode,
            false,
          );
          delete simpleConstraints.deviceId;
          newStream = await navigator.mediaDevices.getUserMedia({
            video: simpleConstraints,
            audio: false,
          });
        }
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack && localStreamRef.current) {
        // Stop old video track
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.stop();
          localStreamRef.current.removeTrack(oldVideoTrack);
        }

        // Add new video track
        newVideoTrack.enabled = videoEnabled;
        localStreamRef.current.addTrack(newVideoTrack);

        // Update P2P manager with new stream
        p2pManager.current?.updateLocalStream(localStreamRef.current);
        setLocalStream(localStreamRef.current);
        setFacingMode(newFacingMode);

        // Clear any previous error
        setMediaError(null);
      }
    } catch (error) {
      console.error("Error switching camera:", error);
      setMediaError(
        newFacingMode === "environment"
          ? "Caméra arrière non disponible"
          : "Caméra avant non disponible",
      );
      setTimeout(() => setMediaError(null), 3000);
    }
  }, [facingMode, videoEnabled]);

  const stopScreenShare = useCallback(() => {
    console.log("[stopScreenShare] 🛑 Stopping screen share...");

    setScreenStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((track) => {
          console.log("[stopScreenShare] Stopping track", {
            kind: track.kind,
            label: track.label,
          });
          track.stop();
        });
      }
      return null;
    });

    // Restore camera stream
    const stream = localStreamRef.current;
    if (stream) {
      console.log("[stopScreenShare] 📹 Restoring camera stream", {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // If camera was enabled before, we need to get a fresh video track
      // because the old one might have been replaced
      if (videoEnabled) {
        const cameraConstraints = getOptimalVideoConstraints(facingMode, false);
        navigator.mediaDevices
          .getUserMedia({
            video: cameraConstraints,
          })
          .then((freshStream) => {
            const freshVideoTrack = freshStream.getVideoTracks()[0];
            if (freshVideoTrack && stream) {
              // Remove old video track if any
              const oldVideoTrack = stream.getVideoTracks()[0];
              if (oldVideoTrack) {
                stream.removeTrack(oldVideoTrack);
                if (oldVideoTrack.readyState === "live") {
                  oldVideoTrack.stop();
                }
              }
              // Add fresh video track
              stream.addTrack(freshVideoTrack);

              // Update P2P manager
              p2pManager.current?.updateLocalStream(stream);

              // Update local stream state to trigger re-render
              const newStreamRef = new MediaStream(stream.getTracks());
              localStreamRef.current = newStreamRef;
              setLocalStream(newStreamRef);

              console.log(
                "[stopScreenShare] ✅ Camera restored with fresh track",
              );
            }
          })
          .catch((err) => {
            console.error("[stopScreenShare] Error getting fresh camera:", err);
            // Fallback: just update with existing stream
            p2pManager.current?.updateLocalStream(stream);
          });
      } else {
        // Camera was off, just restore the stream without video
        p2pManager.current?.updateLocalStream(stream);
      }

      // Notify peers that screen sharing stopped
      p2pManager.current?.broadcast({
        type: "media-state",
        data: {
          audioEnabled,
          videoEnabled,
          screenSharing: false,
        },
        senderId: myId,
        timestamp: Date.now(),
      } as P2PMessage);
    }

    console.log("[stopScreenShare] ✅ Screen share stopped");
  }, [myId, audioEnabled, videoEnabled, facingMode]);

  // Screen share - memoized
  // CRITICAL FIX: Properly handle screen sharing by:
  // 1. Creating a combined stream with screen video + local audio
  // 2. Notifying peers about screen sharing state
  // 3. Properly restoring camera when screen share ends
  const startScreenShare = useCallback(async () => {
    // Check if getDisplayMedia is supported
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.log("[startScreenShare] ❌ getDisplayMedia not supported");
      setMediaError("Partage d'écran non supporté sur cet appareil");
      setTimeout(() => setMediaError(null), 3000);
      return;
    }

    try {
      console.log("[startScreenShare] 🖥️ Starting screen share...");

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // Try to capture system audio
      });

      console.log("[startScreenShare] ✅ Got display stream", {
        videoTracks: displayStream.getVideoTracks().length,
        audioTracks: displayStream.getAudioTracks().length,
        videoTrackLabel: displayStream.getVideoTracks()[0]?.label,
      });

      // Create a combined stream with screen video + local audio (from mic)
      const combinedStream = new MediaStream();

      // Add screen video track
      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (screenVideoTrack) {
        combinedStream.addTrack(screenVideoTrack);
        console.log("[startScreenShare] Added screen video track", {
          trackId: screenVideoTrack.id,
          label: screenVideoTrack.label,
        });
      }

      // Add local audio track (from microphone) to keep voice communication
      const localAudioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (localAudioTrack) {
        combinedStream.addTrack(localAudioTrack);
        console.log("[startScreenShare] Added local audio track", {
          trackId: localAudioTrack.id,
          enabled: localAudioTrack.enabled,
        });
      }

      // Optionally add system audio if available
      const systemAudioTrack = displayStream.getAudioTracks()[0];
      if (systemAudioTrack && !localAudioTrack) {
        combinedStream.addTrack(systemAudioTrack);
        console.log("[startScreenShare] Added system audio track", {
          trackId: systemAudioTrack.id,
        });
      }

      setScreenStream(displayStream); // Keep reference to stop later

      // Update P2P manager with the combined stream
      console.log(
        "[startScreenShare] 📤 Updating P2P manager with screen share stream",
      );
      p2pManager.current?.updateLocalStream(combinedStream);

      // Notify peers about screen sharing state
      p2pManager.current?.broadcast({
        type: "media-state",
        data: {
          audioEnabled,
          videoEnabled: true,
          screenSharing: true,
        },
        senderId: myId,
        timestamp: Date.now(),
      } as P2PMessage);

      // Handle when user stops sharing via browser UI
      screenVideoTrack.onended = () => {
        console.log("[startScreenShare] 🛑 Screen share ended by user");
        stopScreenShare();
      };

      console.log("[startScreenShare] ✅ Screen share started successfully");
    } catch (error: any) {
      console.error("[startScreenShare] ❌ Error:", error);
      // Don't show error for user cancellation (NotAllowedError when user clicks cancel)
      // or AbortError (user dismissed the dialog)
      if (error.name === "NotAllowedError" || error.name === "AbortError") {
        // User cancelled - no error message needed
        console.log("[startScreenShare] User cancelled screen share");
        return;
      }
      // For other errors, show a helpful message
      if (error.name === "NotSupportedError" || error.name === "TypeError") {
        setMediaError("Partage d'écran non supporté sur cet appareil");
      } else {
        setMediaError("Erreur lors du partage d'écran");
      }
      setTimeout(() => setMediaError(null), 3000);
    }
  }, [myId, audioEnabled, stopScreenShare]);

  // Chat - memoized
  const sendChatMessage = useCallback(
    (content: string) => {
      const message: P2PMessage = {
        type: "chat-message",
        data: {
          senderName: state?.userName,
          content,
          timestamp: Date.now(),
        },
        senderId: myId,
        timestamp: Date.now(),
      };

      p2pManager.current?.broadcast(message);

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          senderId: myId,
          senderName: state?.userName || "Me",
          content,
          timestamp: Date.now(),
        },
      ]);
    },
    [myId, state?.userName],
  );

  // Raise/lower hand - memoized
  const raiseHand = useCallback(() => {
    setHandRaised(true);
    p2pManager.current?.broadcast({
      type: "hand-raised",
      data: {},
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId]);

  const lowerHand = useCallback(() => {
    setHandRaised(false);
    p2pManager.current?.broadcast({
      type: "hand-lowered",
      data: {},
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId]);

  // Leave room - memoized
  const leaveRoom = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    setScreenStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((track) => track.stop());
      }
      return null;
    });
    p2pManager.current?.destroy();
    dispatchParticipants({ type: "CLEAR_ALL" });
    navigate("/");
  }, [navigate]);

  // Copy meeting link - memoized with feedback
  const copyMeetingLink = useCallback(async () => {
    const url = `${globalThis.location.origin}${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setMeetingLinkCopied(true);
      setTimeout(() => setMeetingLinkCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers or when clipboard API fails
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        setMeetingLinkCopied(true);
        setTimeout(() => setMeetingLinkCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
      textArea.remove();
    }
  }, []);

  const copyInviteLink = useCallback(() => {
    const fullUrl = `${globalThis.location.href}`;
    navigator.clipboard.writeText(fullUrl);
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  }, []);

  // Local participant - memoized to prevent unnecessary re-renders
  const localParticipant: Participant = React.useMemo(
    () => ({
      id: myId,
      name: state?.userName || "Me",
      stream: screenStream || localStream || undefined,
      audioEnabled,
      videoEnabled,
      screenSharing: !!screenStream,
      handRaised,
      facingMode,
    }),
    [
      myId,
      state?.userName,
      screenStream,
      localStream,
      audioEnabled,
      videoEnabled,
      handRaised,
      facingMode,
    ],
  );

  // Get participant count for display
  const participantCount = participants.size + 1;

  if (!state?.userName) {
    return null;
  }

  // Show error state with retry option if initialization failed
  if (initAttempts >= maxInitAttempts && connectionStatus === "failed") {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">🔌</div>
          <h1 className="text-2xl font-medium text-white mb-4">
            Impossible de se connecter
          </h1>
          <p className="text-neutral-400 mb-6">
            {initError?.message || "La connexion à la réunion a échoué après plusieurs tentatives."}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setInitAttempts(0);
                setInitError(null);
                setConnectionStatus("connecting");
                initializationComplete.current = false;
                globalThis.location.reload();
              }}
              className="px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-full font-medium transition-colors"
            >
              Réessayer
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-full font-medium transition-colors"
            >
              Retour à l'accueil
            </button>
          </div>
          {!networkStatus.isOnline && (
            <p className="mt-4 text-warning-400 text-sm">
              ⚠️ Vous semblez être hors ligne. Vérifiez votre connexion internet.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-neutral-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4 bg-neutral-900/80 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-4">
          <span className="font-mono text-xs sm:text-sm text-white truncate max-w-[120px] sm:max-w-none">
            {code}
          </span>
          <button
            onClick={copyMeetingLink}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-neutral-700 rounded-lg transition-all duration-200 active:scale-95"
            title={
              meetingLinkCopied ? "Copié !" : "Copier le lien de la réunion"
            }
            aria-label={
              meetingLinkCopied ? "Lien copié" : "Copier le lien de la réunion"
            }
          >
            <Icon
              name={meetingLinkCopied ? "check" : "copy"}
              size={18}
              className={`transition-colors duration-200 ${meetingLinkCopied ? "text-green-400" : "text-neutral-400 hover:text-white"}`}
            />
          </button>
          {meetingLinkCopied && (
            <span className="text-xs text-green-400 font-medium animate-pulse hidden sm:inline">
              Copié !
            </span>
          )}
          <span className="text-neutral-400 hidden sm:inline">|</span>
          <span className="text-xs sm:text-sm text-neutral-400">
            {formatDuration(duration)}
          </span>
        </div>

        <button
          onClick={() => {
            setParticipantsOpen(true);
            setChatOpen(false);
            setSettingsOpen(false);
          }}
          className="flex items-center gap-2 bg-neutral-900/80 backdrop-blur-sm rounded-xl px-4 py-2 hover:bg-neutral-800/90 transition-colors cursor-pointer"
          title="Voir les participants"
          aria-label="Ouvrir le panneau des participants"
        >
          <Icon name="people" size={18} className="text-neutral-400" />
          <span className="text-sm text-white">{participantCount}</span>
          {participantCount >= 8 && (
            <span className="text-xs text-warning-400">(max)</span>
          )}
        </button>
      </header>

      {/* Grille vidéo */}
      <main className="flex-1 overflow-hidden pt-14 pb-20 sm:pt-16 sm:pb-24">
        <VideoGrid
          participants={participants}
          localParticipant={localParticipant}
          pinnedId={pinnedId}
          onPinParticipant={setPinnedId}
          videoFilter={VIDEO_STYLES[videoStyle].filter}
          facingMode={facingMode}
        />
      </main>

      {/* Barre de contrôles */}
      <ControlBar
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={!!screenStream}
        handRaised={handRaised}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onSwitchCamera={switchCamera}
        facingMode={facingMode}
        onScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
        onRaiseHand={raiseHand}
        onLowerHand={lowerHand}
        onOpenChat={() => {
          setChatOpen(true);
          setParticipantsOpen(false);
          setSettingsOpen(false);
        }}
        onOpenParticipants={() => {
          setParticipantsOpen(true);
          setChatOpen(false);
          setSettingsOpen(false);
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setChatOpen(false);
          setParticipantsOpen(false);
        }}
        onLeave={leaveRoom}
        onOpenReactions={() => {}}
      />

      {/* Panneaux latéraux */}
      <SidePanel
        type="chat"
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        onSendMessage={sendChatMessage}
      />

      <SidePanel
        type="participants"
        isOpen={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        participants={participants}
        localParticipant={localParticipant}
      />

      <SidePanel
        type="settings"
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDeviceChange={handleDeviceChange}
        onVideoQualityChange={handleVideoQualityChange}
        onVideoStyleChange={handleVideoStyleChange}
        currentAudioDevice={currentAudioDevice}
        currentVideoDevice={currentVideoDevice}
        currentVideoQuality={videoQuality}
        currentVideoStyle={videoStyle}
      />

      {/* Connexion en cours */}
      {!connected && (
        <div className="absolute inset-0 bg-neutral-900/90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Connexion en cours...</p>
            <p className="text-neutral-400 text-sm mt-2">
              Établissement de la connexion P2P...
            </p>
          </div>
        </div>
      )}

      {/* Reconnection status */}
      {connected && connectionStatus === "reconnecting" && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-warning-500/90 text-neutral-900 rounded-lg px-4 py-2 text-sm flex items-center gap-2 z-40">
          <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          Reconnexion en cours...
        </div>
      )}

      {/* Connection failed status */}
      {connected &&
        connectionStatus === "failed" &&
        participants.size === 0 && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-danger-500/90 text-white rounded-lg px-4 py-3 text-sm max-w-md text-center z-40">
            <Icon name="warning" size={18} className="inline mr-2" />
            Impossible de se connecter. Vérifiez votre connexion internet.
            <button
              onClick={() => globalThis.location.reload()}
              className="block w-full mt-2 px-3 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
            >
              Rafraîchir la page
            </button>
          </div>
        )}

      {/* Message erreur média */}
      {mediaError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-warning-500/90 text-neutral-900 rounded-lg px-4 py-2 text-sm max-w-md text-center z-40">
          <Icon name="warning" size={18} className="inline mr-2" />
          {mediaError}
        </div>
      )}

      {/* Room full error */}
      {roomFullError && (
        <div className="absolute bottom-32 sm:bottom-28 left-1/2 -translate-x-1/2 bg-danger-500/90 rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-center max-w-[90vw] sm:max-w-md z-40 mx-4">
          <p className="text-white text-sm mb-2 font-medium">
            Réunion complète
          </p>
          <p className="text-white/80 text-xs mb-3">
            Maximum 8 participants autorisés avec l'architecture P2P mesh.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-white text-danger-500 rounded-lg text-sm font-medium"
          >
            Retour à l'accueil
          </button>
        </div>
      )}

      {/* Info d'attente pour l'hôte */}
      {connected &&
        participants.size === 0 &&
        state?.isHost &&
        !roomFullError && (
          <div className="absolute bottom-32 sm:bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800/95 backdrop-blur-sm rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-center max-w-[90vw] sm:max-w-lg z-40 mx-4">
            <p className="text-white text-sm mb-2 sm:mb-3 font-medium">
              En attente des participants
            </p>
            <p className="text-neutral-400 text-xs mb-3 sm:mb-4">
              Partagez ce lien pour inviter jusqu'à{" "}
              <span className="text-primary-400 font-semibold">
                8 personnes
              </span>
            </p>
            <button
              onClick={copyInviteLink}
              className="w-full px-4 py-2.5 sm:py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Icon name={inviteLinkCopied ? "check" : "copy"} size={18} />
              {inviteLinkCopied
                ? "Lien copié !"
                : "Copier le lien d'invitation"}
            </button>
            <p className="text-neutral-500 text-xs mt-2 sm:mt-3">
              ℹ️ Architecture P2P Mesh - Jusqu'à 8 participants
            </p>
          </div>
        )}

      {/* Participant en connexion */}
      {connected &&
        participants.size === 0 &&
        !state?.isHost &&
        !roomFullError && (
          <div className="absolute bottom-32 sm:bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800/95 backdrop-blur-sm rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-center max-w-[90vw] sm:max-w-md z-40 mx-4">
            <p className="text-white text-sm mb-2">Connexion à la réunion...</p>
            <p className="text-neutral-400 text-xs">
              Établissement des connexions P2P
            </p>
          </div>
        )}
    </div>
  );
}
