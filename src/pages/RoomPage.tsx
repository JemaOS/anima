import React, { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { VideoGrid, ControlBar, SidePanel } from '@/components/room';
import { Icon } from '@/components/ui';
import { Participant, ChatMessage, ConnectionQuality } from '@/types';
import { generateId, formatDuration } from '@/utils/helpers';
import { P2PManager, type PeerInfo, type P2PMessage, ConnectionState, ICEConnectionState } from '@/services/p2pManager';

interface LocationState {
  userName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isHost: boolean;
  hostPeerId?: string;
}

// Detect if device is Android
const isAndroid = () => /Android/i.test(navigator.userAgent);

// Detect if device is mobile
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window);
};

// Adaptive video constraints for better performance
// Using less restrictive constraints to avoid excessive zoom on mobile
const getVideoConstraints = (facingMode: 'user' | 'environment' = 'user', useExact: boolean = false): MediaTrackConstraints => {
  // For Android, use simpler constraints to avoid issues
  if (isAndroid()) {
    return {
      facingMode: useExact ? { exact: facingMode } : facingMode,
      width: { ideal: 640 },
      height: { ideal: 480 },
    };
  }
  
  return {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { min: 15, ideal: 24, max: 30 },
    facingMode: useExact ? { exact: facingMode } : facingMode,
    aspectRatio: { ideal: 4/3 }
  };
};

// Get camera stream with facingMode fallback support
const getCameraStreamWithFallback = async (
  facingMode: 'user' | 'environment',
  audioConstraints: MediaTrackConstraints
): Promise<MediaStream> => {
  // Try with exact facingMode first (most reliable for back camera)
  try {
    console.log(`Trying camera with facingMode: { exact: '${facingMode}' }`);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: audioConstraints,
    });
    return stream;
  } catch (exactError) {
    console.log(`exact ${facingMode} failed:`, exactError);
    
    // Fallback: try with ideal instead of exact
    try {
      console.log(`Trying camera with facingMode: { ideal: '${facingMode}' }`);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: audioConstraints,
      });
      return stream;
    } catch (idealError) {
      console.log(`ideal ${facingMode} failed:`, idealError);
      
      // Last fallback: try without exact constraint
      console.log(`Trying camera with facingMode: '${facingMode}'`);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: audioConstraints,
      });
      return stream;
    }
  }
};

// Participant state reducer for efficient updates
type ParticipantAction =
  | { type: 'ADD_PARTICIPANT'; payload: { id: string; participant: Participant } }
  | { type: 'REMOVE_PARTICIPANT'; payload: { id: string } }
  | { type: 'UPDATE_PARTICIPANT'; payload: { id: string; updates: Partial<Participant> } }
  | { type: 'SET_STREAM'; payload: { id: string; stream: MediaStream } }
  | { type: 'SET_AUDIO_LEVEL'; payload: { id: string; audioLevel: number } }
  | { type: 'SET_CONNECTION_QUALITY'; payload: { id: string; connectionQuality: ConnectionQuality } }
  | { type: 'CLEAR_ALL' };

function participantsReducer(
  state: Map<string, Participant>,
  action: ParticipantAction
): Map<string, Participant> {
  switch (action.type) {
    case 'ADD_PARTICIPANT': {
      const newState = new Map(state);
      // CRITICAL FIX: Check if there's an existing entry with a stream (from race condition)
      // If so, preserve the stream when adding the participant info
      const existing = state.get(action.payload.id);
      if (existing?.stream) {
        console.log('[Reducer] ADD_PARTICIPANT: Preserving existing stream from placeholder', {
          id: action.payload.id,
          existingName: existing.name,
          newName: action.payload.participant.name,
          hasStream: !!existing.stream
        });
        newState.set(action.payload.id, {
          ...action.payload.participant,
          stream: existing.stream, // Preserve the stream!
        });
      } else {
        newState.set(action.payload.id, action.payload.participant);
      }
      return newState;
    }
    case 'REMOVE_PARTICIPANT': {
      const newState = new Map(state);
      newState.delete(action.payload.id);
      return newState;
    }
    case 'UPDATE_PARTICIPANT': {
      const existing = state.get(action.payload.id);
      if (!existing) return state;
      const newState = new Map(state);
      newState.set(action.payload.id, { ...existing, ...action.payload.updates });
      return newState;
    }
    case 'SET_STREAM': {
      const existing = state.get(action.payload.id);
      if (!existing) {
        // Participant doesn't exist yet - this can happen due to race condition
        // Store the stream anyway, it will be used when participant is added
        console.warn('[Reducer] SET_STREAM: Participant not found, creating placeholder', action.payload.id);
        const newState = new Map(state);
        newState.set(action.payload.id, {
          id: action.payload.id,
          name: 'Connecting...',
          stream: action.payload.stream,
          audioEnabled: true,
          videoEnabled: true,
          screenSharing: false,
          handRaised: false,
        });
        return newState;
      }
      // Only update if stream actually changed
      if (existing.stream === action.payload.stream) return state;
      const newState = new Map(state);
      newState.set(action.payload.id, { ...existing, stream: action.payload.stream });
      return newState;
    }
    case 'SET_AUDIO_LEVEL': {
      const existing = state.get(action.payload.id);
      if (!existing) return state;
      // Only update if level changed significantly (avoid excessive re-renders)
      if (Math.abs((existing.audioLevel || 0) - action.payload.audioLevel) < 0.05) return state;
      const newState = new Map(state);
      newState.set(action.payload.id, { ...existing, audioLevel: action.payload.audioLevel });
      return newState;
    }
    case 'SET_CONNECTION_QUALITY': {
      const existing = state.get(action.payload.id);
      if (!existing) return state;
      if (existing.connectionQuality === action.payload.connectionQuality) return state;
      const newState = new Map(state);
      newState.set(action.payload.id, { ...existing, connectionQuality: action.payload.connectionQuality });
      return newState;
    }
    case 'CLEAR_ALL':
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
      const hash = window.location.hash;
      navigate(`/prejoin/${code}${hash}`);
    }
  }, [state, code, navigate]);

  // Main states
  const [myId, setMyId] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [participants, dispatchParticipants] = useReducer(participantsReducer, new Map<string, Participant>());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(state?.audioEnabled ?? true);
  const [videoEnabled, setVideoEnabled] = useState(state?.videoEnabled ?? true);
  const [handRaised, setHandRaised] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [meetingLinkCopied, setMeetingLinkCopied] = useState(false);
  const [roomFullError, setRoomFullError] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting');
  const [iceStatus, setIceStatus] = useState<Map<string, ICEConnectionState>>(new Map());

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
  const [currentAudioDevice, setCurrentAudioDevice] = useState<string>('');
  const [currentVideoDevice, setCurrentVideoDevice] = useState<string>('');

  // Capture local media - extracted for reuse with adaptive constraints
  // Includes retry logic for Android devices
  const captureLocalMedia = useCallback(async (
    audioOn: boolean,
    videoOn: boolean,
    audioDeviceId?: string,
    videoDeviceId?: string,
    cameraFacingMode: 'user' | 'environment' = 'user',
    retryCount: number = 0
  ): Promise<MediaStream | null> => {
    const maxRetries = isAndroid() ? 3 : 1;
    
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      
      if (audioDeviceId) {
        audioConstraints.deviceId = { exact: audioDeviceId };
      }

      // Get video constraints with the specified facing mode
      const videoConstraints: MediaTrackConstraints = {
        ...getVideoConstraints(cameraFacingMode),
      };
      
      // If a specific device is selected, use it instead of facingMode
      if (videoDeviceId) {
        videoConstraints.deviceId = { exact: videoDeviceId };
        // Remove facingMode when using specific deviceId to avoid conflicts
        delete videoConstraints.facingMode;
      }

      // On Android, add a small delay before requesting media to ensure
      // previous streams are fully released
      if (isAndroid() && retryCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });

      stream.getAudioTracks().forEach(track => track.enabled = audioOn);
      stream.getVideoTracks().forEach(track => track.enabled = videoOn);

      // Clear any previous error
      setMediaError(null);
      return stream;
    } catch (error: any) {
      console.error(`Media capture error (attempt ${retryCount + 1}):`, error);
      
      if (error.name === 'NotFoundError') {
        setMediaError('Aucune caméra ou microphone détecté');
      } else if (error.name === 'NotAllowedError') {
        // On Android, permissions might need to be re-requested
        if (isAndroid() && retryCount < maxRetries) {
          setMediaError('Demande de permissions...');
          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return captureLocalMedia(audioOn, videoOn, audioDeviceId, videoDeviceId, cameraFacingMode, retryCount + 1);
        }
        setMediaError('Permissions refusées. Veuillez autoriser l\'accès à la caméra et au microphone.');
      } else if (error.name === 'NotReadableError') {
        // Device is busy - common on Android when switching between pages
        if (retryCount < maxRetries) {
          setMediaError('Caméra occupée, nouvelle tentative...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return captureLocalMedia(audioOn, videoOn, audioDeviceId, videoDeviceId, cameraFacingMode, retryCount + 1);
        }
        setMediaError('La caméra est utilisée par une autre application');
      } else if (error.name === 'OverconstrainedError') {
        // If facingMode constraint fails (e.g., no back camera), try without it
        setMediaError('Caméra non disponible, essai avec la caméra par défaut...');
        setTimeout(() => setMediaError(null), 2000);
        try {
          const fallbackAudioConstraints: MediaTrackConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
          if (audioDeviceId) {
            fallbackAudioConstraints.deviceId = { exact: audioDeviceId };
          }
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: fallbackAudioConstraints,
          });
          fallbackStream.getAudioTracks().forEach(track => track.enabled = audioOn);
          fallbackStream.getVideoTracks().forEach(track => track.enabled = videoOn);
          return fallbackStream;
        } catch {
          setMediaError('Erreur d\'accès à la caméra');
          return null;
        }
      } else if (error.name === 'AbortError') {
        // Request was aborted - retry on Android
        if (isAndroid() && retryCount < maxRetries) {
          setMediaError('Initialisation de la caméra...');
          await new Promise(resolve => setTimeout(resolve, 800));
          return captureLocalMedia(audioOn, videoOn, audioDeviceId, videoDeviceId, cameraFacingMode, retryCount + 1);
        }
        setMediaError('Erreur d\'initialisation de la caméra');
      } else {
        // Generic error - retry on Android
        if (isAndroid() && retryCount < maxRetries) {
          setMediaError('Erreur, nouvelle tentative...');
          await new Promise(resolve => setTimeout(resolve, 800));
          return captureLocalMedia(audioOn, videoOn, audioDeviceId, videoDeviceId, cameraFacingMode, retryCount + 1);
        }
        setMediaError('Erreur d\'accès aux périphériques');
      }
      return null;
    }
  }, []);

  // Handle device change from settings panel
  const handleDeviceChange = useCallback(async (type: 'audio' | 'video', deviceId: string) => {
    try {
      if (type === 'audio') {
        setCurrentAudioDevice(deviceId);
        // Get new audio stream with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
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
      } else if (type === 'video') {
        setCurrentVideoDevice(deviceId);
        // Get new video stream with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            ...getVideoConstraints(facingMode),
          },
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
      }
    } catch (error) {
      console.error('Error changing device:', error);
      setMediaError(`Erreur lors du changement de ${type === 'audio' ? 'microphone' : 'caméra'}`);
      setTimeout(() => setMediaError(null), 3000);
    }
  }, [audioEnabled, videoEnabled]);

  // Initialization - proper sequence to avoid race conditions
  // With improved Android support
  useEffect(() => {
    if (!state?.userName) return;
    
    // Use a local variable to track if this effect instance should proceed
    let isMounted = true;
    let currentManager: P2PManager | null = null;
    let currentStream: MediaStream | null = null;

    const init = async () => {
      // Skip if already initialized AND we have a valid manager
      if (initializationComplete.current && p2pManager.current) {
        console.log('[RoomPage] ⏭️ Already initialized, skipping');
        return;
      }

      // On Android, add initial delay to ensure previous page's media is fully released
      if (isAndroid() || isMobileDevice()) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 1. Initialize P2PManager FIRST
      const manager = new P2PManager();
      currentManager = manager;
      p2pManager.current = manager;

      // 2. Setup ALL callbacks BEFORE any connections
      manager.onPeerConnected((peerId, peerInfo) => {
        dispatchParticipants({
          type: 'ADD_PARTICIPANT',
          payload: {
            id: peerId,
            participant: {
              id: peerId,
              name: peerInfo.name,
              audioEnabled: true,
              videoEnabled: true,
              screenSharing: false,
              handRaised: false,
            }
          }
        });
      });

      manager.onPeerDisconnected((peerId) => {
        dispatchParticipants({ type: 'REMOVE_PARTICIPANT', payload: { id: peerId } });
      });

      manager.onMessage((message: P2PMessage) => {
        handleP2PMessage(message);
      });

      manager.onStream((peerId, stream) => {
        console.log('[RoomPage] 🎥 Received stream from peer:', peerId, {
          streamId: stream.id,
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTrackStates: stream.getAudioTracks().map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
          videoTrackStates: stream.getVideoTracks().map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
        });
        
        // Ensure audio tracks are enabled on the stream BEFORE dispatching
        stream.getAudioTracks().forEach(track => {
          console.log('[RoomPage] 🔊 Audio track state before enable:', { id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState });
          track.enabled = true;
          console.log('[RoomPage] 🔊 Audio track state after enable:', { id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState });
        });
        
        // Ensure video tracks are enabled on the stream BEFORE dispatching
        stream.getVideoTracks().forEach(track => {
          console.log('[RoomPage] 📹 Video track state before enable:', { id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState });
          track.enabled = true;
          console.log('[RoomPage] 📹 Video track state after enable:', { id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState });
        });
        
        dispatchParticipants({ type: 'SET_STREAM', payload: { id: peerId, stream } });
        
        // Add audio analyser for the new stream
        manager.addAudioAnalyser(peerId, stream);
      });

      manager.onConnectionStateChange((peerId, connectionState) => {
        // Update overall connection status based on peer states
        if (connectionState === ConnectionState.CONNECTED) {
          setConnectionStatus('connected');
        } else if (connectionState === ConnectionState.RECONNECTING) {
          setConnectionStatus('reconnecting');
        } else if (connectionState === ConnectionState.FAILED) {
          // Only set failed if all connections failed
          const allFailed = Array.from(manager.getPeers()).every(
            p => manager.getConnectionState(p.id) === ConnectionState.FAILED
          );
          if (allFailed && manager.getPeers().length > 0) {
            setConnectionStatus('failed');
          }
        }
      });

      // ICE state change callback for detailed connection monitoring
      manager.onICEStateChange((peerId, iceState) => {
        setIceStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(peerId, iceState);
          return newMap;
        });
        
        // Show user-friendly messages for ICE issues
        if (iceState === ICEConnectionState.FAILED) {
          setMediaError('Problème de connexion réseau. Tentative de reconnexion...');
          setTimeout(() => setMediaError(null), 5000);
        } else if (iceState === ICEConnectionState.DISCONNECTED) {
          setMediaError('Connexion instable. Reconnexion en cours...');
          setTimeout(() => setMediaError(null), 3000);
        }
      });

      manager.onRoomFull(() => {
        setRoomFullError(true);
        setMediaError('Réunion complète. Maximum 8 participants autorisés.');
      });

      // Audio level callback for active speaker detection
      manager.onAudioLevel((peerId, level) => {
        dispatchParticipants({ type: 'SET_AUDIO_LEVEL', payload: { id: peerId, audioLevel: level } });
      });

      // Connection quality callback for network indicators
      manager.onConnectionQuality((peerId, quality) => {
        dispatchParticipants({ type: 'SET_CONNECTION_QUALITY', payload: { id: peerId, connectionQuality: quality } });
      });

      // 3. Capture media BEFORE peer initialization
      const capturedStream = await captureLocalMedia(state.audioEnabled, state.videoEnabled);
      
      if (!isMounted) {
        // Component unmounted during async operation
        capturedStream?.getTracks().forEach(track => track.stop());
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

      // 4. Initialize peer AFTER media capture
      // Use random peer IDs for everyone - the URL hash system handles sharing the host's ID
      // This avoids conflicts when rejoining (deterministic IDs can cause "unavailable-id" errors)
      const peerId = `meet-${code}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
      console.log('[RoomPage] 🔌 Using random peer ID', { peerId, isHost: state.isHost });
      
      try {
        console.log('[RoomPage] 🔌 Initializing peer...', { peerId, isHost: state.isHost });
        const id = await manager.initialize(peerId, state.isHost);
        console.log('[RoomPage] ✅ Peer initialized', { requestedId: peerId, actualId: id });
        
        if (!isMounted) {
          // Component unmounted during async operation
          manager.destroy();
          return;
        }
        
        setMyId(id);
        setConnected(true);

        // 5. Update local stream in manager immediately after initialization
        // This is CRITICAL - the manager needs the stream to answer incoming calls
        if (capturedStream) {
          console.log('[RoomPage] 📹 Updating local stream in manager', {
            audioTracks: capturedStream.getAudioTracks().length,
            videoTracks: capturedStream.getVideoTracks().length,
            isHost: state.isHost
          });
          manager.updateLocalStream(capturedStream);
        } else {
          console.log('[RoomPage] ⚠️ No captured stream to update in manager!');
        }
        
        setConnectionStatus('connected');

        // 6. Create or join room with proper delay
        if (state.isHost) {
          manager.createRoom(state.userName);
          // Add hash for sharing - use the actual peer ID returned by initialize
          // This is important because if the original ID was taken, a modified ID is used
          const newUrl = `${window.location.pathname}${window.location.search}#peer_id=${id}`;
          window.history.replaceState(null, '', newUrl);
          console.log('[RoomPage] 🔗 Host URL updated with peer ID', { url: newUrl, peerId: id });
        } else if (state.hostPeerId) {
          // Small delay to ensure everything is ready
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log('[RoomPage] 🤝 Joining room as participant', {
            hostPeerId: state.hostPeerId,
            hasStream: !!capturedStream,
            streamTracks: capturedStream?.getTracks().length || 0
          });
          const joined = await manager.joinRoom(state.hostPeerId, state.userName, capturedStream);
          console.log('[RoomPage] 🤝 Join room result', {
            joined,
            hostPeerId: state.hostPeerId,
            streamWasProvided: !!capturedStream
          });
        }

        // Start quality and audio level monitoring after connection
        manager.startQualityMonitoring();
        manager.startAudioLevelMonitoring();
        
        // Mark initialization as complete ONLY after everything succeeds
        initializationComplete.current = true;
      } catch (error) {
        console.error('[RoomPage] Initialization error:', error);
        setConnected(true); // Allow UI even if peer fails
        setConnectionStatus('failed');
        setMediaError('Erreur de connexion. Veuillez rafraîchir la page.');
        initializationComplete.current = true; // Still mark as complete to prevent retries
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
        currentStream.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [code, state, captureLocalMedia]);

  // Handle P2P messages with reducer dispatch
  const handleP2PMessage = useCallback((message: P2PMessage) => {
    switch (message.type) {
      case 'chat-message':
        setMessages(prev => [...prev, {
          id: generateId(),
          senderId: message.senderId,
          senderName: message.data.senderName,
          content: message.data.content,
          timestamp: message.data.timestamp,
        }]);
        break;

      case 'hand-raised':
        dispatchParticipants({
          type: 'UPDATE_PARTICIPANT',
          payload: { id: message.senderId, updates: { handRaised: true } }
        });
        break;

      case 'hand-lowered':
        dispatchParticipants({
          type: 'UPDATE_PARTICIPANT',
          payload: { id: message.senderId, updates: { handRaised: false } }
        });
        break;

      case 'media-state':
        dispatchParticipants({
          type: 'UPDATE_PARTICIPANT',
          payload: {
            id: message.senderId,
            updates: {
              audioEnabled: message.data.audioEnabled,
              videoEnabled: message.data.videoEnabled,
            }
          }
        });
        break;
    }
  }, []);

  // Broadcast to all peers - memoized
  const broadcast = useCallback((message: Omit<P2PMessage, 'senderId' | 'timestamp'>) => {
    p2pManager.current?.broadcast({
      ...message,
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId]);

  // Toggle audio - memoized
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        p2pManager.current?.broadcast({
          type: 'media-state',
          data: { audioEnabled: audioTrack.enabled, videoEnabled },
          senderId: myId,
          timestamp: Date.now(),
        } as P2PMessage);
      }
    }
  }, [myId, videoEnabled]);

  // Toggle video - memoized with SIMPLE enable/disable approach
  // CRITICAL FIX: Instead of removing/adding tracks (which breaks WebRTC),
  // we simply enable/disable the existing track. This preserves the RTP stream.
  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    let currentVideoTrack = stream.getVideoTracks()[0];
    const newVideoEnabled = !videoEnabled;

    console.log('[toggleVideo] Starting toggle', {
      currentVideoEnabled: videoEnabled,
      newVideoEnabled,
      hasCurrentTrack: !!currentVideoTrack,
      currentTrackEnabled: currentVideoTrack?.enabled,
      streamId: stream.id
    });

    if (newVideoEnabled) {
      // Re-enable video
      if (currentVideoTrack && currentVideoTrack.readyState === 'live') {
        // Track still exists and is live - just enable it
        console.log('[toggleVideo] Re-enabling existing video track', { trackId: currentVideoTrack.id });
        currentVideoTrack.enabled = true;
        setVideoEnabled(true);
        
        // Notify P2P manager
        p2pManager.current?.updateLocalStream(stream);
      } else {
        // Track was stopped or doesn't exist - need to get a new one
        try {
          console.log('[toggleVideo] Getting new video track (old one was stopped)...');
          
          // Wait a bit for the camera to be released (important on mobile)
          if (isMobileDevice()) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: getVideoConstraints(facingMode),
          });
          
          const newVideoTrack = newStream.getVideoTracks()[0];
          if (newVideoTrack) {
            console.log('[toggleVideo] Got new video track', {
              trackId: newVideoTrack.id,
              enabled: newVideoTrack.enabled,
              muted: newVideoTrack.muted,
              readyState: newVideoTrack.readyState
            });
            
            // Remove old track if exists
            if (currentVideoTrack) {
              stream.removeTrack(currentVideoTrack);
              currentVideoTrack.stop();
            }
            
            // Add new video track
            stream.addTrack(newVideoTrack);
            
            // Update refs
            localStreamRef.current = stream;
            
            console.log('[toggleVideo] Updating P2P manager with new track');
            p2pManager.current?.updateLocalStream(stream);
            
            // Force re-render
            setLocalStream(null);
            requestAnimationFrame(() => {
              setLocalStream(stream);
              console.log('[toggleVideo] Local stream state updated');
            });
          }
          
          setVideoEnabled(true);
        } catch (error) {
          console.error('[toggleVideo] Error re-acquiring camera:', error);
          setMediaError('Erreur lors de la réactivation de la caméra');
          setTimeout(() => setMediaError(null), 3000);
          return;
        }
      }
    } else {
      // Disable video - JUST disable the track, don't remove it!
      // This keeps the RTP stream alive and allows re-enabling later
      if (currentVideoTrack) {
        console.log('[toggleVideo] Disabling video track (not removing)', { trackId: currentVideoTrack.id });
        currentVideoTrack.enabled = false;
        
        // DON'T stop or remove the track - just disable it
        // This preserves the WebRTC connection
      }
      
      setVideoEnabled(false);
      
      // Notify P2P manager about the state change
      p2pManager.current?.updateLocalStream(stream);
    }

    p2pManager.current?.broadcast({
      type: 'media-state',
      data: { audioEnabled, videoEnabled: newVideoEnabled },
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId, audioEnabled, videoEnabled, facingMode]);

  // Switch camera (front/back) - for mobile devices
  // Uses facingMode with fallback for better compatibility
  const switchCamera = useCallback(async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    try {
      // Use the fallback function for better back camera support
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      
      // Try with exact facingMode first, then fallback
      let newStream: MediaStream;
      try {
        console.log(`Switching to ${newFacingMode} camera with exact constraint`);
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: newFacingMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false, // Don't request audio again, we already have it
        });
      } catch (exactError) {
        console.log(`exact ${newFacingMode} failed, trying ideal:`, exactError);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: newFacingMode },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
        } catch (idealError) {
          console.log(`ideal ${newFacingMode} failed, trying simple:`, idealError);
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: newFacingMode,
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
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
      console.error('Error switching camera:', error);
      setMediaError(newFacingMode === 'environment'
        ? 'Caméra arrière non disponible'
        : 'Caméra avant non disponible');
      setTimeout(() => setMediaError(null), 3000);
    }
  }, [facingMode, videoEnabled]);

  // Screen share - memoized
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      setScreenStream(stream);
      p2pManager.current?.updateLocalStream(stream);

      const screenTrack = stream.getVideoTracks()[0];
      screenTrack.onended = () => stopScreenShare();
    } catch (_error) {
      // Screen share error handled silently
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    setScreenStream(prev => {
      if (prev) {
        prev.getTracks().forEach(track => track.stop());
      }
      return null;
    });

    const stream = localStreamRef.current;
    if (stream) {
      p2pManager.current?.updateLocalStream(stream);
    }
  }, []);

  // Chat - memoized
  const sendChatMessage = useCallback((content: string) => {
    const message: P2PMessage = {
      type: 'chat-message',
      data: {
        senderName: state?.userName,
        content,
        timestamp: Date.now(),
      },
      senderId: myId,
      timestamp: Date.now(),
    };

    p2pManager.current?.broadcast(message);

    setMessages(prev => [...prev, {
      id: generateId(),
      senderId: myId,
      senderName: state?.userName || 'Me',
      content,
      timestamp: Date.now(),
    }]);
  }, [myId, state?.userName]);

  // Raise/lower hand - memoized
  const raiseHand = useCallback(() => {
    setHandRaised(true);
    p2pManager.current?.broadcast({
      type: 'hand-raised',
      data: {},
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId]);

  const lowerHand = useCallback(() => {
    setHandRaised(false);
    p2pManager.current?.broadcast({
      type: 'hand-lowered',
      data: {},
      senderId: myId,
      timestamp: Date.now(),
    } as P2PMessage);
  }, [myId]);

  // Leave room - memoized
  const leaveRoom = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    setScreenStream(prev => {
      if (prev) {
        prev.getTracks().forEach(track => track.stop());
      }
      return null;
    });
    p2pManager.current?.destroy();
    dispatchParticipants({ type: 'CLEAR_ALL' });
    navigate('/');
  }, [navigate]);

  // Copy meeting link - memoized with feedback
  const copyMeetingLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setMeetingLinkCopied(true);
      setTimeout(() => setMeetingLinkCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers or when clipboard API fails
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setMeetingLinkCopied(true);
        setTimeout(() => setMeetingLinkCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textArea);
    }
  }, []);

  const copyInviteLink = useCallback(() => {
    const fullUrl = `${window.location.href}`;
    navigator.clipboard.writeText(fullUrl);
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  }, []);

  // Local participant - memoized to prevent unnecessary re-renders
  const localParticipant: Participant = React.useMemo(() => ({
    id: myId,
    name: state?.userName || 'Me',
    stream: screenStream || localStream || undefined,
    audioEnabled,
    videoEnabled,
    screenSharing: !!screenStream,
    handRaised,
  }), [myId, state?.userName, screenStream, localStream, audioEnabled, videoEnabled, handRaised]);

  // Get participant count for display
  const participantCount = participants.size + 1;

  if (!state?.userName) {
    return null;
  }

  return (
    <div className="h-screen bg-neutral-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4 bg-neutral-900/80 backdrop-blur-sm rounded-xl px-3 py-2 sm:px-4">
          <span className="font-mono text-xs sm:text-sm text-white truncate max-w-[120px] sm:max-w-none">{code}</span>
          <button
            onClick={copyMeetingLink}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-neutral-700 rounded-lg transition-all duration-200 active:scale-95"
            title={meetingLinkCopied ? "Copié !" : "Copier le lien de la réunion"}
            aria-label={meetingLinkCopied ? "Lien copié" : "Copier le lien de la réunion"}
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
          <span className="text-xs sm:text-sm text-neutral-400">{formatDuration(duration)}</span>
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
        onOpenChat={() => { setChatOpen(true); setParticipantsOpen(false); setSettingsOpen(false); }}
        onOpenParticipants={() => { setParticipantsOpen(true); setChatOpen(false); setSettingsOpen(false); }}
        onOpenSettings={() => { setSettingsOpen(true); setChatOpen(false); setParticipantsOpen(false); }}
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
        currentAudioDevice={currentAudioDevice}
        currentVideoDevice={currentVideoDevice}
      />

      {/* Connexion en cours */}
      {!connected && (
        <div className="absolute inset-0 bg-neutral-900/90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Connexion en cours...</p>
            <p className="text-neutral-400 text-sm mt-2">Établissement de la connexion P2P...</p>
          </div>
        </div>
      )}

      {/* Reconnection status */}
      {connected && connectionStatus === 'reconnecting' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-warning-500/90 text-neutral-900 rounded-lg px-4 py-2 text-sm flex items-center gap-2 z-40">
          <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          Reconnexion en cours...
        </div>
      )}

      {/* Connection failed status */}
      {connected && connectionStatus === 'failed' && participants.size === 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-danger-500/90 text-white rounded-lg px-4 py-3 text-sm max-w-md text-center z-40">
          <Icon name="warning" size={18} className="inline mr-2" />
          Impossible de se connecter. Vérifiez votre connexion internet.
          <button
            onClick={() => window.location.reload()}
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
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-danger-500/90 rounded-xl px-6 py-4 text-center max-w-md z-40">
          <p className="text-white text-sm mb-2 font-medium">
            Réunion complète
          </p>
          <p className="text-white/80 text-xs mb-3">
            Maximum 8 participants autorisés avec l'architecture P2P mesh.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-white text-danger-500 rounded-lg text-sm font-medium"
          >
            Retour à l'accueil
          </button>
        </div>
      )}

      {/* Info d'attente pour l'hôte */}
      {connected && participants.size === 0 && state?.isHost && !roomFullError && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl px-6 py-4 text-center max-w-lg z-40">
          <p className="text-white text-sm mb-3 font-medium">
            En attente des participants
          </p>
          <p className="text-neutral-400 text-xs mb-4">
            Partagez ce lien pour inviter jusqu'à <span className="text-primary-400 font-semibold">8 personnes</span>
          </p>
          <button
            onClick={copyInviteLink}
            className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Icon name={inviteLinkCopied ? "check" : "copy"} size={18} />
            {inviteLinkCopied ? 'Lien copié !' : 'Copier le lien d\'invitation'}
          </button>
          <p className="text-neutral-500 text-xs mt-3">
            ℹ️ Architecture P2P Mesh - Jusqu'à 8 participants
          </p>
        </div>
      )}

      {/* Participant en connexion */}
      {connected && participants.size === 0 && !state?.isHost && !roomFullError && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl px-6 py-4 text-center max-w-md z-40">
          <p className="text-white text-sm mb-2">
            Connexion à la réunion...
          </p>
          <p className="text-neutral-400 text-xs">
            Établissement des connexions P2P
          </p>
        </div>
      )}
    </div>
  );
}
