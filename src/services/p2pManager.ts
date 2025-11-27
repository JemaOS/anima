// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import Peer, { DataConnection, MediaConnection } from 'peerjs';

export interface PeerInfo {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface P2PMessage {
  type: 'peer-list' | 'peer-joined' | 'peer-left' | 'peer-info' | 'chat-message' | 'media-state' | 'hand-raised' | 'hand-lowered' | 'room-full' | 'stream-ready' | 'ice-candidate';
  data: any;
  senderId: string;
  timestamp: number;
}

// Connection state enum for proper state tracking
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

// ICE Connection state for detailed tracking
export enum ICEConnectionState {
  NEW = 'new',
  CHECKING = 'checking',
  CONNECTED = 'connected',
  COMPLETED = 'completed',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  CLOSED = 'closed'
}

// Connection quality levels
export type ConnectionQuality = 'good' | 'medium' | 'poor';

// Video quality levels for adaptive bitrate
export type VideoQuality = 'low' | 'medium' | 'high';

// Connection statistics interface
export interface ConnectionStats {
  packetsLost: number;
  jitter: number;
  roundTripTime: number;
  bytesReceived: number;
  framesPerSecond?: number;
  quality: ConnectionQuality;
}

// Maximum participants allowed in a room (P2P mesh limitation)
const MAX_PARTICIPANTS = 8;

// Exponential backoff delays in milliseconds
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

// Connection timeout in milliseconds
const CONNECTION_TIMEOUT = 20000;

// ICE gathering timeout
const ICE_GATHERING_TIMEOUT = 10000;

// Debug logging helper - set to true for debugging
const DEBUG = true;
const log = (category: string, message: string, data?: any) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().substr(11, 12);
    if (data) {
      console.log(`[${timestamp}] [P2P:${category}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] [P2P:${category}] ${message}`);
    }
  }
};

export class P2PManager {
  private peer: Peer | null = null;
  private myId: string = '';
  private isHost: boolean = false;
  private dataConnections: Map<string, DataConnection> = new Map();
  private mediaConnections: Map<string, MediaConnection> = new Map();
  private peers: Map<string, PeerInfo> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private connectionStates: Map<string, ConnectionState> = new Map();
  private iceConnectionStates: Map<string, ICEConnectionState> = new Map();
  private maxReconnectAttempts = 5;
  private localStream: MediaStream | null = null;
  private pendingMediaConnections: Map<string, MediaConnection> = new Map();
  
  // Queue for ICE candidates received before remote description is set
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  // Quality monitoring
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private connectionStats: Map<string, ConnectionStats> = new Map();

  // Audio level detection
  private audioContext: AudioContext | null = null;
  private audioAnalysers: Map<string, AnalyserNode> = new Map();
  private audioSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private audioLevelInterval: ReturnType<typeof setInterval> | null = null;

  // ICE restart tracking
  private iceRestartAttempts: Map<string, number> = new Map();
  private maxIceRestartAttempts = 3;

  // Callbacks
  private onPeerConnectedCallback?: (peerId: string, peerInfo: PeerInfo) => void;
  private onPeerDisconnectedCallback?: (peerId: string) => void;
  private onMessageCallback?: (message: P2PMessage) => void;
  private onStreamCallback?: (peerId: string, stream: MediaStream) => void;
  private onConnectionStateChangeCallback?: (peerId: string, state: ConnectionState) => void;
  private onRoomFullCallback?: () => void;
  private onAudioLevelCallback?: (peerId: string, level: number) => void;
  private onConnectionQualityCallback?: (peerId: string, quality: ConnectionQuality) => void;
  private onICEStateChangeCallback?: (peerId: string, state: ICEConnectionState) => void;
  private onTrackUnmutedCallback?: (peerId: string, stream: MediaStream) => void;

  constructor() {
    log('INIT', 'P2PManager instance created');
  }

  /**
   * Initialiser le peer avec PeerJS
   * Uses multiple reliable TURN servers for better connectivity
   */
  async initialize(peerId: string, isHost: boolean, retryCount: number = 0): Promise<string> {
    this.isHost = isHost;
    
    // If retrying due to unavailable-id, add a suffix to make the ID unique
    const actualPeerId = retryCount > 0 ? `${peerId}-${Date.now().toString(36)}` : peerId;
    
    log('INIT', `Initializing peer as ${isHost ? 'HOST' : 'PARTICIPANT'}`, {
      requestedPeerId: peerId,
      actualPeerId,
      retryCount
    });

    return new Promise((resolve, reject) => {
      // Timeout for peer initialization
      const initTimeout = setTimeout(() => {
        log('INIT', 'Peer initialization timeout');
        reject(new Error('Peer initialization timeout'));
      }, 15000);

      // Use standard ICE configuration with STUN and TURN servers
      // iceTransportPolicy: 'all' allows both direct and relay connections
      this.peer = new Peer(actualPeerId, {
        debug: DEBUG ? 3 : 0, // Enable maximum PeerJS debug logging
        config: {
          iceServers: [
            // Google STUN servers (free, reliable)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // Metered.ca TURN servers (free tier)
            {
              urls: 'turn:a.relay.metered.ca:80',
              username: 'e8dd65b92c62d5e98c3d0104',
              credential: 'uWdWNmkhvyqTEj3B'
            },
            {
              urls: 'turn:a.relay.metered.ca:80?transport=tcp',
              username: 'e8dd65b92c62d5e98c3d0104',
              credential: 'uWdWNmkhvyqTEj3B'
            },
            {
              urls: 'turn:a.relay.metered.ca:443',
              username: 'e8dd65b92c62d5e98c3d0104',
              credential: 'uWdWNmkhvyqTEj3B'
            },
            {
              urls: 'turn:a.relay.metered.ca:443?transport=tcp',
              username: 'e8dd65b92c62d5e98c3d0104',
              credential: 'uWdWNmkhvyqTEj3B'
            },
            // OpenRelay TURN servers (another free option)
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ],
          // Use 'all' to allow both direct (host/srflx) and relay connections
          // This is more reliable than 'relay' only
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10, // Pre-gather ICE candidates
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        },
      });

      this.peer.on('open', (id) => {
        clearTimeout(initTimeout);
        this.myId = id;
        log('INIT', 'Peer opened successfully', { id });
        resolve(id);
      });

      this.peer.on('error', (error) => {
        clearTimeout(initTimeout);
        log('ERROR', 'Peer error', { error: (error as any).type, message: (error as any).message });
        
        // Handle specific error types
        if ((error as any).type === 'unavailable-id') {
          // ID is taken, try with a modified ID
          log('ERROR', 'Peer ID unavailable, retrying with modified ID', { retryCount });
          
          // Clean up current peer
          if (this.peer) {
            this.peer.destroy();
            this.peer = null;
          }
          
          // Retry with a modified ID (max 3 retries)
          if (retryCount < 3) {
            setTimeout(() => {
              this.initialize(peerId, isHost, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, 500 * (retryCount + 1)); // Exponential backoff
            return; // Don't reject yet, we're retrying
          } else {
            log('ERROR', 'Max retries reached for unavailable-id');
          }
        } else if ((error as any).type === 'network') {
          log('ERROR', 'Network error - check internet connection');
        } else if ((error as any).type === 'server-error') {
          log('ERROR', 'PeerJS server error - signaling server may be down');
        }
        
        reject(error);
      });

      this.peer.on('disconnected', () => {
        log('WARN', 'Peer disconnected from signaling server, attempting reconnect...');
        // Try to reconnect to signaling server
        if (this.peer && !this.peer.destroyed) {
          setTimeout(() => {
            this.peer?.reconnect();
          }, 1000);
        }
      });

      this.peer.on('close', () => {
        log('INFO', 'Peer connection closed');
      });

      // Handle incoming data connections
      this.peer.on('connection', (dataConn) => {
        log('CONN', 'Incoming data connection', { from: dataConn.peer });
        this.handleIncomingDataConnection(dataConn);
      });

      // Handle incoming media calls
      this.peer.on('call', (mediaConn) => {
        log('MEDIA', 'Incoming media call', { from: mediaConn.peer });
        this.handleIncomingCall(mediaConn);
      });
    });
  }

  /**
   * Rejoindre une room en se connectant à l'hôte
   * Includes retry logic and better error handling
   */
  async joinRoom(hostPeerId: string, userName: string, localStream: MediaStream | null): Promise<boolean> {
    if (!this.peer || this.isHost) {
      log('JOIN', 'Cannot join room - invalid state', { hasPeer: !!this.peer, isHost: this.isHost });
      return false;
    }

    log('JOIN', '🚀 Attempting to join room', {
      hostPeerId,
      userName,
      hasStream: !!localStream,
      myPeerId: this.myId,
      peerState: this.peer?.open ? 'open' : 'not open'
    });

    // Store local stream for later use - CRITICAL for media connections
    if (localStream) {
      this.localStream = localStream;
      
      // CRITICAL: Log detailed track info including muted state
      const audioTracks = localStream.getAudioTracks();
      const videoTracks = localStream.getVideoTracks();
      
      log('JOIN', '📹 Local stream stored in P2PManager', {
        audioTracks: audioTracks.length,
        videoTracks: videoTracks.length,
        audioTrackStates: audioTracks.map(t => ({
          id: t.id,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        })),
        videoTrackStates: videoTracks.map(t => ({
          id: t.id,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        }))
      });
      
      // DIAGNOSTIC: Warn if no video track
      if (videoTracks.length === 0) {
        log('JOIN', '⚠️ WARNING: Joining room WITHOUT video track in local stream!');
      }
      
      // CRITICAL: Check if video track is already muted (no data flowing)
      const videoTrack = videoTracks[0];
      if (videoTrack && videoTrack.muted) {
        log('JOIN', '⚠️ WARNING: Video track is ALREADY MUTED when joining!', {
          trackId: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState
        });
      }
    } else {
      log('JOIN', '⚠️ WARNING: Joining room WITHOUT any local stream!');
    }

    // Retry logic for connection
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log('JOIN', `🔄 Connection attempt ${attempt}/${maxRetries} to host: ${hostPeerId}`);
        
        // Connect to host and wait for connection to be established
        await this.connectToPeer(hostPeerId, localStream);
        
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify connection is actually open
        const dataConn = this.dataConnections.get(hostPeerId);
        log('JOIN', '🔍 Checking data connection', {
          hasConnection: !!dataConn,
          isOpen: dataConn?.open,
          connectionId: dataConn?.connectionId
        });
        
        if (!dataConn || !dataConn.open) {
          throw new Error('Data connection not established');
        }
        
        // Now that connection is open, send our info to host
        log('JOIN', '📤 Sending peer-info to host', { hostPeerId, userName });
        this.sendMessage(hostPeerId, {
          type: 'peer-info',
          data: {
            name: userName,
            isHost: false,
            hasStream: !!localStream,
          },
          senderId: this.myId,
          timestamp: Date.now(),
        });

        log('JOIN', '✅ Successfully joined room and sent peer-info');
        return true;
      } catch (error) {
        lastError = error as Error;
        log('JOIN', `❌ Attempt ${attempt} failed`, { error: (error as Error).message });
        
        // Clean up failed connection before retry
        this.dataConnections.delete(hostPeerId);
        this.mediaConnections.delete(hostPeerId);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    log('JOIN', '❌ All connection attempts failed', { lastError: lastError?.message });
    return false;
  }

  /**
   * Créer une room en tant qu'hôte
   */
  createRoom(userName: string) {
    if (!this.isHost) {
      return;
    }

    // Ajouter l'hôte à la liste des pairs
    this.peers.set(this.myId, {
      id: this.myId,
      name: userName,
      isHost: true,
      joinedAt: Date.now(),
    });
  }

  /**
   * Set connection state for a peer with callback notification
   */
  private setConnectionState(peerId: string, state: ConnectionState): void {
    const previousState = this.connectionStates.get(peerId);
    this.connectionStates.set(peerId, state);
    
    if (previousState !== state) {
      this.onConnectionStateChangeCallback?.(peerId, state);
    }
  }

  /**
   * Get connection state for a peer
   */
  getConnectionState(peerId: string): ConnectionState {
    return this.connectionStates.get(peerId) || ConnectionState.DISCONNECTED;
  }

  /**
   * Check if room is full
   */
  isRoomFull(): boolean {
    return this.peers.size >= MAX_PARTICIPANTS;
  }

  /**
   * Get current participant count
   */
  getParticipantCount(): number {
    return this.peers.size;
  }

  /**
   * Se connecter à un pair spécifique
   * Returns a Promise that resolves when the data connection is established
   * Includes ICE state monitoring and proper error handling
   */
  private connectToPeer(peerId: string, localStream: MediaStream | null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        log('CONN', 'Cannot connect - no peer instance');
        reject(new Error('No peer instance'));
        return;
      }
      
      // Check if already connected
      const existingConn = this.dataConnections.get(peerId);
      if (existingConn && existingConn.open) {
        log('CONN', 'Already connected to peer', { peerId });
        resolve();
        return;
      }

      // Clean up any stale connection
      if (existingConn) {
        log('CONN', 'Cleaning up stale connection', { peerId });
        existingConn.close();
        this.dataConnections.delete(peerId);
      }

      // Set initial connection state
      this.setConnectionState(peerId, ConnectionState.CONNECTING);
      log('CONN', 'Initiating connection to peer', { peerId });

      // Data connection with serialization for reliability
      const dataConn = this.peer.connect(peerId, {
        reliable: true,
        serialization: 'json'
      });
      
      // Timeout for connection
      const connectionTimeout = setTimeout(() => {
        log('CONN', 'Connection timeout', { peerId });
        dataConn.close();
        this.setConnectionState(peerId, ConnectionState.FAILED);
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);

      dataConn.on('open', () => {
        clearTimeout(connectionTimeout);
        this.dataConnections.set(peerId, dataConn);
        this.reconnectAttempts.delete(peerId);
        this.setConnectionState(peerId, ConnectionState.CONNECTED);
        log('CONN', 'Data connection established', { peerId });
        
        // CRITICAL FIX: Only the HOST should initiate media calls
        // Participants should wait for the host to call them
        // This prevents both sides from calling each other simultaneously
        // which causes ICE negotiation to fail
        if (this.isHost) {
          log('CONN', '⏳ HOST: Waiting 1s before initiating media connection...', { peerId });
          setTimeout(() => {
            log('CONN', '📞 HOST: Now initiating media connection after delay', { peerId });
            this.initiateMediaConnection(peerId, localStream);
          }, 1000);
        } else {
          log('CONN', '⏸️ PARTICIPANT: Waiting for host to initiate media call (not calling)', { peerId });
          // Participant does NOT initiate media call - waits for host to call
        }
        
        resolve();
      });

      dataConn.on('data', (data: any) => {
        this.handleMessage(data as P2PMessage, peerId);
      });

      dataConn.on('close', () => {
        log('CONN', 'Data connection closed', { peerId });
        this.setConnectionState(peerId, ConnectionState.DISCONNECTED);
        this.handlePeerDisconnection(peerId);
      });

      dataConn.on('error', (error) => {
        clearTimeout(connectionTimeout);
        log('CONN', 'Data connection error', { peerId, error: (error as any).message || error });
        this.setConnectionState(peerId, ConnectionState.RECONNECTING);
        this.attemptReconnect(peerId, localStream);
        reject(error);
      });
    });
  }

  /**
   * Initiate media connection to a peer with proper ICE handling
   * CRITICAL: Always get a fresh video track to ensure data is flowing
   */
  private async initiateMediaConnection(peerId: string, localStream: MediaStream | null): Promise<void> {
    if (!this.peer) {
      log('MEDIA', '❌ Cannot initiate media - no peer instance');
      return;
    }

    // Use provided stream or stored local stream
    let streamToUse = localStream || this.localStream;
    
    // If no stream available, create a placeholder and notify when ready
    if (!streamToUse || streamToUse.getTracks().length === 0) {
      log('MEDIA', '⚠️ No local stream available, will connect when stream is ready', { peerId });
      return;
    }

    // Check if already have media connection
    if (this.mediaConnections.has(peerId)) {
      log('MEDIA', 'Media connection already exists', { peerId });
      return;
    }
    
    // Check if already have pending media connection
    if (this.pendingMediaConnections.has(peerId)) {
      log('MEDIA', 'Pending media connection already exists', { peerId });
      return;
    }

    log('MEDIA', '📞 Initiating media call', {
      peerId,
      audioTracks: streamToUse.getAudioTracks().length,
      videoTracks: streamToUse.getVideoTracks().length,
      audioTrackIds: streamToUse.getAudioTracks().map(t => t.id),
      videoTrackIds: streamToUse.getVideoTracks().map(t => t.id),
      audioEnabled: streamToUse.getAudioTracks().map(t => t.enabled),
      videoEnabled: streamToUse.getVideoTracks().map(t => t.enabled),
      audioMuted: streamToUse.getAudioTracks().map(t => t.muted),
      videoMuted: streamToUse.getVideoTracks().map(t => t.muted),
      audioReadyState: streamToUse.getAudioTracks().map(t => t.readyState),
      videoReadyState: streamToUse.getVideoTracks().map(t => t.readyState)
    });

    // CRITICAL FIX: ALWAYS get a fresh video track before initiating a call
    // This ensures the track is actively capturing and not in a stale state
    let videoTrack = streamToUse.getVideoTracks()[0];
    const audioTrack = streamToUse.getAudioTracks()[0];
    
    // Always try to get a fresh video track for outgoing calls
    try {
      log('MEDIA', '🔄 Getting fresh video track for call...', { peerId });
      const freshStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      
      const freshVideoTrack = freshStream.getVideoTracks()[0];
      if (freshVideoTrack && freshVideoTrack.readyState === 'live') {
        log('MEDIA', '✅ Got fresh video track for call!', {
          peerId,
          newTrackId: freshVideoTrack.id,
          muted: freshVideoTrack.muted,
          enabled: freshVideoTrack.enabled,
          readyState: freshVideoTrack.readyState
        });
        
        // Replace the old track in the stream
        const oldTrack = streamToUse.getVideoTracks()[0];
        if (oldTrack) {
          streamToUse.removeTrack(oldTrack);
          oldTrack.stop();
        }
        streamToUse.addTrack(freshVideoTrack);
        videoTrack = freshVideoTrack;
        
        // Update local stream reference
        this.localStream = streamToUse;
        
        // CRITICAL FIX: If the fresh track is muted, wait for it to unmute
        // This happens on mobile when the camera needs time to "warm up"
        if (freshVideoTrack.muted) {
          log('MEDIA', '⏳ Fresh video track is muted, waiting for unmute...', { peerId });
          
          // Wait for the track to unmute (max 3 seconds)
          await new Promise<void>((resolve) => {
            let resolved = false;
            
            const onUnmute = () => {
              if (!resolved) {
                resolved = true;
                freshVideoTrack.removeEventListener('unmute', onUnmute);
                log('MEDIA', '✅ Video track unmuted, proceeding with call', {
                  peerId,
                  muted: freshVideoTrack.muted
                });
                resolve();
              }
            };
            
            freshVideoTrack.addEventListener('unmute', onUnmute);
            
            // Also check immediately in case it already unmuted
            if (!freshVideoTrack.muted) {
              onUnmute();
            }
            
            // Timeout after 3 seconds
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                freshVideoTrack.removeEventListener('unmute', onUnmute);
                log('MEDIA', '⚠️ Timeout waiting for video track to unmute, proceeding anyway', {
                  peerId,
                  muted: freshVideoTrack.muted
                });
                resolve();
              }
            }, 3000);
          });
        }
      } else {
        log('MEDIA', '⚠️ Fresh video track is not live!', {
          peerId,
          muted: freshVideoTrack?.muted,
          readyState: freshVideoTrack?.readyState
        });
        // Stop the fresh track since we can't use it
        freshVideoTrack?.stop();
      }
    } catch (err) {
      log('MEDIA', '⚠️ Could not get fresh video track, using existing', {
        peerId,
        error: (err as Error).message
      });
    }
    
    // Verify the video track is in good state
    if (videoTrack && videoTrack.readyState !== 'live') {
      log('MEDIA', '⚠️ WARNING: Video track is not live!', {
        peerId,
        readyState: videoTrack.readyState,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted
      });
    }
    
    // DIAGNOSTIC: Log final track state before call
    log('MEDIA', '📊 Final track state before call:', {
      peerId,
      videoTrackId: videoTrack?.id,
      videoMuted: videoTrack?.muted,
      videoEnabled: videoTrack?.enabled,
      videoReadyState: videoTrack?.readyState,
      audioTrackId: audioTrack?.id,
      audioMuted: audioTrack?.muted,
      audioEnabled: audioTrack?.enabled,
      audioReadyState: audioTrack?.readyState
    });
    
    if (audioTrack && audioTrack.readyState !== 'live') {
      log('MEDIA', '⚠️ WARNING: Audio track is not live!', {
        peerId,
        readyState: audioTrack.readyState,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted
      });
    }

    // CRITICAL DIAGNOSTIC: Log the stream we're about to send
    log('MEDIA', '🚀 ABOUT TO CALL peer.call() with stream:', {
      peerId,
      streamId: streamToUse.id,
      streamActive: streamToUse.active,
      totalTracks: streamToUse.getTracks().length,
      audioTracks: streamToUse.getAudioTracks().map(t => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
        contentHint: t.contentHint
      })),
      videoTracks: streamToUse.getVideoTracks().map(t => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
        contentHint: t.contentHint,
        // Try to get settings if available
        settings: typeof t.getSettings === 'function' ? t.getSettings() : 'N/A'
      }))
    });
    
    const mediaConn = this.peer.call(peerId, streamToUse);
    
    // CRITICAL: Verify the call was created
    if (!mediaConn) {
      log('MEDIA', '❌ peer.call() returned null/undefined!', { peerId });
      return;
    }
    
    log('MEDIA', '✅ peer.call() returned MediaConnection', {
      peerId,
      mediaConnType: typeof mediaConn,
      hasOpen: 'open' in mediaConn,
      hasMetadata: !!mediaConn.metadata
    });
    
    // Log the peer connection state immediately after call
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      log('MEDIA', '📊 Peer connection state IMMEDIATELY after call', {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        senders: pc.getSenders().map(s => ({
          trackKind: s.track?.kind,
          trackId: s.track?.id,
          trackEnabled: s.track?.enabled,
          trackMuted: s.track?.muted,
          trackReadyState: s.track?.readyState,
          trackLabel: s.track?.label
        })),
        transceivers: pc.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          currentDirection: t.currentDirection,
          senderTrackKind: t.sender.track?.kind,
          senderTrackEnabled: t.sender.track?.enabled,
          receiverTrackKind: t.receiver.track?.kind
        }))
      });
      
      // Also log after a delay to see if state changes
      setTimeout(() => {
        log('MEDIA', '📊 Peer connection state 500ms after call', {
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          senders: pc.getSenders().map(s => ({
            trackKind: s.track?.kind,
            trackId: s.track?.id,
            trackEnabled: s.track?.enabled,
            trackMuted: s.track?.muted,
            trackReadyState: s.track?.readyState
          })),
          transceivers: pc.getTransceivers().map(t => ({
            mid: t.mid,
            direction: t.direction,
            currentDirection: t.currentDirection
          }))
        });
        
        // CRITICAL: Check if video sender has a track
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (!videoSender) {
          log('MEDIA', '❌ NO VIDEO SENDER FOUND 500ms after call!', { peerId });
        } else if (!videoSender.track) {
          log('MEDIA', '❌ VIDEO SENDER HAS NO TRACK 500ms after call!', { peerId });
        } else {
          log('MEDIA', '✅ Video sender has track', {
            peerId,
            trackId: videoSender.track.id,
            trackMuted: videoSender.track.muted,
            trackEnabled: videoSender.track.enabled,
            trackReadyState: videoSender.track.readyState
          });
        }
      }, 500);
      
      // Log after 2 seconds to see final state
      setTimeout(() => {
        log('MEDIA', '📊 Peer connection state 2s after call', {
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          senders: pc.getSenders().map(s => ({
            trackKind: s.track?.kind,
            trackEnabled: s.track?.enabled,
            trackReadyState: s.track?.readyState
          })),
          receivers: pc.getReceivers().map(r => ({
            trackKind: r.track?.kind,
            trackEnabled: r.track?.enabled,
            trackMuted: r.track?.muted,
            trackReadyState: r.track?.readyState
          }))
        });
        
        // CRITICAL FIX: If ICE connection is still "new" after 2 seconds,
        // the signaling may have failed. Try to force renegotiation.
        if (pc.iceConnectionState === 'new' && pc.connectionState === 'new') {
          log('MEDIA', '⚠️ ICE connection stuck at "new" after 2s - signaling may have failed!', {
            peerId,
            signalingState: pc.signalingState,
            localDescription: pc.localDescription ? {
              type: pc.localDescription.type,
              sdpLength: pc.localDescription.sdp?.length
            } : null,
            remoteDescription: pc.remoteDescription ? {
              type: pc.remoteDescription.type,
              sdpLength: pc.remoteDescription.sdp?.length
            } : null
          });
          
          // Check if we have local and remote descriptions
          if (!pc.localDescription || !pc.remoteDescription) {
            log('MEDIA', '❌ Missing SDP descriptions - PeerJS signaling failed!', {
              peerId,
              hasLocalDesc: !!pc.localDescription,
              hasRemoteDesc: !!pc.remoteDescription
            });
          }
        }
      }, 2000);
      
      // Check again after 5 seconds - if still stuck, try to restart the call
      setTimeout(async () => {
        if (pc.iceConnectionState === 'new' && pc.connectionState === 'new') {
          log('MEDIA', '🔄 ICE still stuck after 5s - attempting to restart media connection', { peerId });
          
          // Close the current media connection
          try {
            mediaConn.close();
          } catch (e) {
            // Ignore
          }
          
          this.mediaConnections.delete(peerId);
          this.pendingMediaConnections.delete(peerId);
          
          // Wait a bit then try again
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Re-initiate the media connection
          if (this.dataConnections.has(peerId) && this.localStream) {
            log('MEDIA', '🔄 Re-initiating media connection after stuck ICE', { peerId });
            this.initiateMediaConnection(peerId, this.localStream);
          }
        }
      }, 5000);
      
      // CRITICAL: Monitor outbound video stats to see if we're actually sending data
      // This runs on the SENDER side to diagnose if video data is being transmitted
      let lastBytesSent = 0;
      const outboundMonitorInterval = setInterval(() => {
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          clearInterval(outboundMonitorInterval);
          return;
        }
        
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender && videoSender.track) {
          pc.getStats(videoSender.track).then(stats => {
            stats.forEach(report => {
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                const bytesSent = report.bytesSent || 0;
                const isSendingData = bytesSent > lastBytesSent;
                
                log('MEDIA', '📤 OUTBOUND Video RTP stats (SENDER):', {
                  peerId,
                  bytesSent,
                  bytesDelta: bytesSent - lastBytesSent,
                  isSendingData,
                  packetsSent: report.packetsSent,
                  framesEncoded: report.framesEncoded,
                  framesSent: report.framesSent,
                  frameWidth: report.frameWidth,
                  frameHeight: report.frameHeight,
                  framesPerSecond: report.framesPerSecond,
                  qualityLimitationReason: report.qualityLimitationReason,
                  trackMuted: videoSender.track?.muted,
                  trackEnabled: videoSender.track?.enabled,
                  trackReadyState: videoSender.track?.readyState
                });
                
                // If not sending data, log a warning
                if (!isSendingData && lastBytesSent > 0) {
                  log('MEDIA', '⚠️ SENDER: No video data being sent!', {
                    peerId,
                    bytesSent,
                    lastBytesSent,
                    trackMuted: videoSender.track?.muted,
                    trackEnabled: videoSender.track?.enabled
                  });
                }
                
                lastBytesSent = bytesSent;
              }
            });
          }).catch(() => {});
        }
      }, 5000);
      
      // Clean up monitor when media connection closes
      const originalClose = mediaConn.close.bind(mediaConn);
      mediaConn.close = () => {
        clearInterval(outboundMonitorInterval);
        originalClose();
      };
    }
    
    this.setupMediaConnectionHandlers(mediaConn, peerId);
  }

  /**
   * Setup handlers for a media connection with ICE state monitoring
   */
  private setupMediaConnectionHandlers(mediaConn: MediaConnection, peerId: string): void {
    // Store as pending until we receive stream
    this.pendingMediaConnections.set(peerId, mediaConn);

    // Access the underlying RTCPeerConnection for ICE monitoring
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      this.setupICEMonitoring(pc, peerId);
      
      log('MEDIA', '📊 Peer connection setup for outgoing call', {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState
      });
      
      // Use ontrack to capture streams directly from RTCPeerConnection
      // This is more reliable than PeerJS's stream event
      // IMPORTANT: Wait for BOTH audio and video tracks before notifying
      let receivedStream: MediaStream | null = null;
      let processedStream = false;
      
      const processStreamIfReady = () => {
        if (processedStream || !receivedStream) return;
        
        const hasAudio = receivedStream.getAudioTracks().length > 0;
        const hasVideo = receivedStream.getVideoTracks().length > 0;
        
        log('MEDIA', '🔍 Checking if stream is ready (outgoing)', {
          peerId,
          hasAudio,
          hasVideo,
          alreadyProcessed: this.mediaConnections.has(peerId)
        });
        
        if (this.mediaConnections.has(peerId)) {
          log('MEDIA', '⏭️ Stream already processed (outgoing), skipping', { peerId });
          return;
        }
        
        // Wait for both tracks if possible
        if (hasAudio && hasVideo) {
          processedStream = true;
          log('MEDIA', '🎥 Processing stream (outgoing) - BOTH tracks received', {
            peerId,
            audioTracks: receivedStream.getAudioTracks().length,
            videoTracks: receivedStream.getVideoTracks().length,
            audioTrackStates: receivedStream.getAudioTracks().map(t => ({
              id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState
            })),
            videoTrackStates: receivedStream.getVideoTracks().map(t => ({
              id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState
            }))
          });
          
          // Move from pending to active
          this.pendingMediaConnections.delete(peerId);
          this.mediaConnections.set(peerId, mediaConn);
          
          // Ensure all tracks are enabled
          receivedStream.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          receivedStream.getVideoTracks().forEach(track => {
            track.enabled = true;
          });
          
          this.onStreamCallback?.(peerId, receivedStream);
        }
      };
      
      pc.ontrack = (event) => {
        log('MEDIA', '🎯 ontrack event fired (outgoing)!', {
          peerId,
          trackKind: event.track.kind,
          trackId: event.track.id,
          trackEnabled: event.track.enabled,
          trackMuted: event.track.muted,
          trackReadyState: event.track.readyState,
          streamsCount: event.streams.length
        });
        
        // Get the stream from the event
        if (event.streams && event.streams.length > 0) {
          receivedStream = event.streams[0];
          
          // Ensure the new track is enabled
          event.track.enabled = true;
          
          // DIAGNOSTIC: Add event listeners to monitor track state changes
          const track = event.track;
          
          track.onmute = () => {
            log('MEDIA', '🔇 Track MUTED event (outgoing)!', {
              peerId,
              trackKind: track.kind,
              trackId: track.id,
              trackEnabled: track.enabled,
              trackMuted: track.muted,
              trackReadyState: track.readyState
            });
          };
          
          track.onunmute = () => {
            log('MEDIA', '🔊 Track UNMUTED event (outgoing)!', {
              peerId,
              trackKind: track.kind,
              trackId: track.id,
              trackEnabled: track.enabled,
              trackMuted: track.muted,
              trackReadyState: track.readyState
            });
            // When track unmutes, try to process stream again
            if (track.kind === 'video') {
              processStreamIfReady();
              
              // CRITICAL FIX: Notify that video track is unmuted
              // This is needed when replaceTrack() is used - the track is replaced
              // but the stream reference in React state is not updated
              // By calling onTrackUnmutedCallback, we force React to update the participant's stream
              if (receivedStream) {
                log('MEDIA', '🔄 Notifying track unmuted callback (outgoing call)', {
                  peerId,
                  streamId: receivedStream.id,
                  videoTracks: receivedStream.getVideoTracks().length
                });
                this.onTrackUnmutedCallback?.(peerId, receivedStream);
              }
            }
          };
          
          track.onended = () => {
            log('MEDIA', '⏹️ Track ENDED event (outgoing)!', {
              peerId,
              trackKind: track.kind,
              trackId: track.id
            });
          };
          
          // DIAGNOSTIC: Check if video track is muted (no data flowing)
          if (track.kind === 'video' && track.muted) {
            log('MEDIA', '⚠️ WARNING: Video track is MUTED (outgoing - no data flowing)!', {
              peerId,
              trackId: track.id,
              trackEnabled: track.enabled,
              trackReadyState: track.readyState
            });
          }
          
          // Log current stream state
          log('MEDIA', '📊 Stream state after ontrack (outgoing)', {
            peerId,
            trackKind: event.track.kind,
            audioTracks: receivedStream.getAudioTracks().length,
            videoTracks: receivedStream.getVideoTracks().length,
            audioMuted: receivedStream.getAudioTracks().map(t => t.muted),
            videoMuted: receivedStream.getVideoTracks().map(t => t.muted)
          });
          
          // Try to process the stream
          processStreamIfReady();
        }
      };
      
      // DIAGNOSTIC: Log transceiver states to check direction
      setTimeout(() => {
        const transceivers = pc.getTransceivers();
        log('MEDIA', '📊 Transceiver states (outgoing call)', {
          peerId,
          transceivers: transceivers.map(t => ({
            mid: t.mid,
            direction: t.direction,
            currentDirection: t.currentDirection,
            senderTrackKind: t.sender.track?.kind,
            senderTrackEnabled: t.sender.track?.enabled,
            senderTrackMuted: t.sender.track?.muted,
            receiverTrackKind: t.receiver.track?.kind,
            receiverTrackEnabled: t.receiver.track?.enabled,
            receiverTrackMuted: t.receiver.track?.muted
          }))
        });
      }, 1000);
      
      // Fallback: if we only receive one track after timeout, process anyway
      setTimeout(() => {
        if (receivedStream && !processedStream && !this.mediaConnections.has(peerId)) {
          log('MEDIA', '⏰ Timeout (outgoing) - processing stream with available tracks', {
            peerId,
            audioTracks: receivedStream.getAudioTracks().length,
            videoTracks: receivedStream.getVideoTracks().length
          });
          
          processedStream = true;
          this.pendingMediaConnections.delete(peerId);
          this.mediaConnections.set(peerId, mediaConn);
          
          receivedStream.getTracks().forEach(track => {
            track.enabled = true;
          });
          
          this.onStreamCallback?.(peerId, receivedStream);
        }
      }, 3000);
    }

    // Keep the PeerJS stream event as a fallback
    mediaConn.on('stream', (remoteStream) => {
      log('MEDIA', '🎥 Received remote stream via PeerJS event', {
        peerId,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTracks: remoteStream.getVideoTracks().length
      });
      
      // Only process if we haven't already via ontrack
      if (!this.mediaConnections.has(peerId)) {
        this.pendingMediaConnections.delete(peerId);
        this.mediaConnections.set(peerId, mediaConn);
        
        remoteStream.getAudioTracks().forEach(track => {
          track.enabled = true;
        });
        remoteStream.getVideoTracks().forEach(track => {
          track.enabled = true;
        });
        
        this.onStreamCallback?.(peerId, remoteStream);
      }
    });

    mediaConn.on('error', (error) => {
      log('MEDIA', '❌ Media connection error', { peerId, error: (error as any).message || error });
      this.pendingMediaConnections.delete(peerId);
      
      // Attempt to re-establish media connection
      setTimeout(() => {
        if (this.dataConnections.has(peerId) && !this.mediaConnections.has(peerId)) {
          log('MEDIA', 'Attempting to re-establish media connection', { peerId });
          this.initiateMediaConnection(peerId, this.localStream);
        }
      }, 2000);
    });

    mediaConn.on('close', () => {
      log('MEDIA', 'Media connection closed', { peerId });
      this.pendingMediaConnections.delete(peerId);
      this.mediaConnections.delete(peerId);
    });
  }

  /**
   * Setup ICE connection state monitoring for a peer connection
   */
  private setupICEMonitoring(pc: RTCPeerConnection, peerId: string): void {
    // Log initial state
    log('ICE', '🔧 Setting up ICE monitoring', {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      receivers: pc.getReceivers().map(r => ({
        trackKind: r.track?.kind,
        trackEnabled: r.track?.enabled,
        trackMuted: r.track?.muted,
        trackReadyState: r.track?.readyState
      })),
      senders: pc.getSenders().map(s => ({
        trackKind: s.track?.kind,
        trackEnabled: s.track?.enabled,
        trackMuted: s.track?.muted,
        trackReadyState: s.track?.readyState
      }))
    });
    
    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState as ICEConnectionState;
      log('ICE', 'ICE connection state changed', { peerId, state });
      
      this.iceConnectionStates.set(peerId, state);
      this.onICEStateChangeCallback?.(peerId, state);

      switch (state) {
        case 'connected':
        case 'completed':
          // Connection successful
          this.iceRestartAttempts.delete(peerId);
          log('ICE', '✅ ICE connection successful', { peerId, state });
          
          // Log detailed receiver/sender state when connected
          log('ICE', '📊 Connection established - checking track states', {
            peerId,
            receivers: pc.getReceivers().map(r => ({
              trackKind: r.track?.kind,
              trackEnabled: r.track?.enabled,
              trackMuted: r.track?.muted,
              trackReadyState: r.track?.readyState,
              trackId: r.track?.id
            })),
            senders: pc.getSenders().map(s => ({
              trackKind: s.track?.kind,
              trackEnabled: s.track?.enabled,
              trackMuted: s.track?.muted,
              trackReadyState: s.track?.readyState,
              trackId: s.track?.id
            }))
          });
          
          // CRITICAL FIX: When ICE is connected, check if video receiver track is muted
          // If so, try to force a renegotiation by replacing the sender track
          setTimeout(async () => {
            if (pc.connectionState === 'connected') {
              const videoReceiver = pc.getReceivers().find(r => r.track?.kind === 'video');
              const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
              
              log('ICE', '📊 Track states after 2s delay', {
                peerId,
                receivers: pc.getReceivers().map(r => ({
                  trackKind: r.track?.kind,
                  trackEnabled: r.track?.enabled,
                  trackMuted: r.track?.muted,
                  trackReadyState: r.track?.readyState
                })),
                senders: pc.getSenders().map(s => ({
                  trackKind: s.track?.kind,
                  trackEnabled: s.track?.enabled,
                  trackMuted: s.track?.muted,
                  trackReadyState: s.track?.readyState
                }))
              });
              
              // If video receiver track is muted and we have a local stream, try to refresh our sender
              if (videoReceiver?.track?.muted && this.localStream) {
                log('ICE', '⚠️ Video receiver track is MUTED after ICE connected - attempting to refresh sender', { peerId });
                
                // Get a fresh video track and replace the sender
                try {
                  const freshStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
                  });
                  const freshVideoTrack = freshStream.getVideoTracks()[0];
                  
                  if (freshVideoTrack && videoSender) {
                    log('ICE', '🔄 Replacing video sender track to trigger renegotiation', { peerId });
                    await videoSender.replaceTrack(freshVideoTrack);
                    
                    // Update local stream
                    const oldTrack = this.localStream.getVideoTracks()[0];
                    if (oldTrack) {
                      this.localStream.removeTrack(oldTrack);
                      oldTrack.stop();
                    }
                    this.localStream.addTrack(freshVideoTrack);
                    
                    log('ICE', '✅ Video sender track replaced', { peerId });
                  }
                } catch (err) {
                  log('ICE', '❌ Failed to refresh video sender', { peerId, error: (err as Error).message });
                }
              }
            }
          }, 2000);
          break;
          
        case 'disconnected':
          // Temporary disconnection - may recover
          log('ICE', 'ICE disconnected, waiting for recovery...', { peerId });
          // Give it some time to recover before taking action
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              log('ICE', 'ICE still disconnected, attempting restart', { peerId });
              this.attemptICERestart(pc, peerId);
            }
          }, 3000);
          break;
          
        case 'failed':
          // Connection failed - attempt ICE restart
          log('ICE', 'ICE connection failed', { peerId });
          this.attemptICERestart(pc, peerId);
          break;
          
        case 'closed':
          log('ICE', 'ICE connection closed', { peerId });
          break;
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      log('ICE', 'ICE gathering state changed', { peerId, state: pc.iceGatheringState });
    };

    // Monitor ICE candidates and send them via data channel
    // CRITICAL FIX: PeerJS doesn't properly relay ICE candidates for MediaConnections
    // We need to manually exchange them via the data channel
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        log('ICE', '📤 New ICE candidate - sending via data channel', {
          peerId,
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port,
          candidateString: event.candidate.candidate?.substring(0, 100)
        });
        
        // CRITICAL: Send the ICE candidate via the data channel
        const dataConn = this.dataConnections.get(peerId);
        if (dataConn && dataConn.open) {
          this.sendMessage(peerId, {
            type: 'ice-candidate',
            data: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment
            },
            senderId: this.myId,
            timestamp: Date.now()
          });
          log('ICE', '✅ ICE candidate sent via data channel', { peerId });
        } else {
          log('ICE', '⚠️ Cannot send ICE candidate - data channel not open', {
            peerId,
            hasDataConn: !!dataConn,
            isOpen: dataConn?.open
          });
        }
      } else {
        log('ICE', '✅ ICE gathering complete - all candidates sent', { peerId });
      }
    };
    
    // CRITICAL: Monitor signaling state changes and process queued ICE candidates
    pc.onsignalingstatechange = () => {
      log('ICE', '📡 Signaling state changed', {
        peerId,
        signalingState: pc.signalingState,
        localDescriptionType: pc.localDescription?.type,
        remoteDescriptionType: pc.remoteDescription?.type
      });
      
      // CRITICAL FIX: When signaling state becomes stable and we have remote description,
      // process any queued ICE candidates
      if (pc.signalingState === 'stable' && pc.remoteDescription) {
        this.processQueuedIceCandidates(peerId, pc);
      }
    };

    // Monitor connection state (newer API)
    pc.onconnectionstatechange = () => {
      log('CONN', 'Peer connection state changed', { peerId, state: pc.connectionState });
      
      if (pc.connectionState === 'failed') {
        // Try to recover
        this.attemptICERestart(pc, peerId);
      }
    };
  }

  /**
   * Attempt ICE restart for a failed connection
   */
  private async attemptICERestart(pc: RTCPeerConnection, peerId: string): Promise<void> {
    const attempts = this.iceRestartAttempts.get(peerId) || 0;
    
    if (attempts >= this.maxIceRestartAttempts) {
      log('ICE', 'Max ICE restart attempts reached, giving up', { peerId, attempts });
      this.setConnectionState(peerId, ConnectionState.FAILED);
      this.handlePeerDisconnection(peerId);
      return;
    }

    this.iceRestartAttempts.set(peerId, attempts + 1);
    log('ICE', 'Attempting ICE restart', { peerId, attempt: attempts + 1 });

    try {
      // Create new offer with ICE restart
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      log('ICE', 'ICE restart offer created', { peerId });
    } catch (error) {
      log('ICE', 'ICE restart failed', { peerId, error: (error as Error).message });
      
      // If ICE restart fails, try full reconnection
      if (attempts >= this.maxIceRestartAttempts - 1) {
        log('ICE', 'Falling back to full reconnection', { peerId });
        this.attemptReconnect(peerId, this.localStream);
      }
    }
  }

  /**
   * Process queued ICE candidates for a peer
   * Called when remote description is set and signaling state is stable
   */
  private processQueuedIceCandidates(peerId: string, pc: RTCPeerConnection): void {
    const queuedCandidates = this.pendingIceCandidates.get(peerId);
    if (!queuedCandidates || queuedCandidates.length === 0) {
      return;
    }
    
    log('ICE', '🔄 Processing queued ICE candidates', {
      peerId,
      count: queuedCandidates.length,
      signalingState: pc.signalingState,
      hasRemoteDesc: !!pc.remoteDescription
    });
    
    // Process all queued candidates
    queuedCandidates.forEach((candidateInit, index) => {
      try {
        const iceCandidate = new RTCIceCandidate(candidateInit);
        pc.addIceCandidate(iceCandidate).then(() => {
          log('ICE', '✅ Queued ICE candidate added successfully', {
            peerId,
            index,
            iceConnectionState: pc.iceConnectionState,
            connectionState: pc.connectionState
          });
        }).catch((err) => {
          log('ICE', '❌ Failed to add queued ICE candidate', {
            peerId,
            index,
            error: err.message
          });
        });
      } catch (err) {
        log('ICE', '❌ Error creating queued ICE candidate', {
          peerId,
          index,
          error: (err as Error).message
        });
      }
    });
    
    // Clear the queue
    this.pendingIceCandidates.delete(peerId);
    log('ICE', '✅ Cleared ICE candidate queue', { peerId });
  }

  /**
   * Initiate a media call to a peer (used by host to call participants)
   * Now uses the unified media connection handler
   */
  private callPeer(peerId: string): void {
    if (!this.peer) {
      log('MEDIA', 'Cannot call peer - no peer instance');
      return;
    }

    if (!this.localStream || this.localStream.getTracks().length === 0) {
      log('MEDIA', 'Cannot call peer - no local stream', { peerId });
      return;
    }

    if (this.mediaConnections.has(peerId) || this.pendingMediaConnections.has(peerId)) {
      log('MEDIA', 'Media connection already exists or pending', { peerId });
      return;
    }

    log('MEDIA', 'Host calling peer', { peerId });
    this.initiateMediaConnection(peerId, this.localStream);
  }

  /**
   * Gérer connexion de données entrante
   */
  private handleIncomingDataConnection(dataConn: DataConnection) {
    const peerId = dataConn.peer;
    log('CONN', '📥 Handling incoming data connection', {
      peerId,
      isHost: this.isHost,
      currentPeersCount: this.peers.size,
      existingPeers: Array.from(this.peers.keys())
    });

    // Check if room is full (host only)
    if (this.isHost && this.isRoomFull()) {
      log('CONN', '🚫 Room is full, rejecting connection', { peerId, currentCount: this.peers.size });
      
      // Send room-full message before closing
      dataConn.on('open', () => {
        dataConn.send({
          type: 'room-full',
          data: { maxParticipants: MAX_PARTICIPANTS },
          senderId: this.myId,
          timestamp: Date.now(),
        });
        
        // Close connection after sending message
        setTimeout(() => dataConn.close(), 500);
      });
      
      return;
    }

    this.setConnectionState(peerId, ConnectionState.CONNECTING);
    this.dataConnections.set(peerId, dataConn);
    log('CONN', '📝 Data connection stored', { peerId, totalConnections: this.dataConnections.size });

    dataConn.on('open', () => {
      log('CONN', '✅ Incoming data connection opened', { peerId, isHost: this.isHost });
      this.setConnectionState(peerId, ConnectionState.CONNECTED);

      // If host, send list of existing participants AND initiate media call
      if (this.isHost) {
        const peerList = Array.from(this.peers.values());
        log('CONN', '📤 HOST: Sending peer list to new participant', {
          peerId,
          peerCount: peerList.length,
          peerIds: peerList.map(p => p.id),
          peerNames: peerList.map(p => p.name)
        });
        this.sendMessage(peerId, {
          type: 'peer-list',
          data: peerList,
          senderId: this.myId,
          timestamp: Date.now(),
        });
        
        // CRITICAL FIX: Host initiates media call to the new participant
        // Wait a bit for the participant to be ready
        if (this.localStream && !this.mediaConnections.has(peerId) && !this.pendingMediaConnections.has(peerId)) {
          log('CONN', '⏳ HOST: Waiting 1s before initiating media call to new participant...', { peerId });
          setTimeout(() => {
            if (!this.mediaConnections.has(peerId) && !this.pendingMediaConnections.has(peerId)) {
              log('CONN', '📞 HOST: Initiating media call to new participant', { peerId });
              this.initiateMediaConnection(peerId, this.localStream);
            } else {
              log('CONN', '⏭️ HOST: Media connection already exists, skipping', { peerId });
            }
          }, 1000);
        } else {
          log('CONN', '⚠️ HOST: Cannot initiate media call yet', {
            peerId,
            hasLocalStream: !!this.localStream,
            hasMediaConnection: this.mediaConnections.has(peerId),
            hasPendingMediaConnection: this.pendingMediaConnections.has(peerId)
          });
        }
      }
    });

    dataConn.on('data', (data: any) => {
      this.handleMessage(data as P2PMessage, peerId);
    });

    dataConn.on('close', () => {
      log('CONN', 'Incoming data connection closed', { peerId });
      this.setConnectionState(peerId, ConnectionState.DISCONNECTED);
      this.handlePeerDisconnection(peerId);
    });

    dataConn.on('error', (error) => {
      log('CONN', 'Incoming data connection error', { peerId, error: (error as any).message || error });
      this.setConnectionState(peerId, ConnectionState.FAILED);
    });
  }

  /**
   * Gérer appel média entrant
   * Now properly handles the case when local stream is not yet available
   * CRITICAL: Always gets a fresh video track before answering
   */
  private async handleIncomingCall(mediaConn: MediaConnection) {
    const peerId = mediaConn.peer;
    log('MEDIA', '🔔 Handling incoming call', {
      peerId,
      hasLocalStream: !!this.localStream,
      localStreamTracks: this.localStream?.getTracks().length || 0,
      localStreamAudioTracks: this.localStream?.getAudioTracks().length || 0,
      localStreamVideoTracks: this.localStream?.getVideoTracks().length || 0,
      localStreamAudioEnabled: this.localStream?.getAudioTracks().map(t => ({ id: t.id, enabled: t.enabled, readyState: t.readyState })),
      localStreamVideoEnabled: this.localStream?.getVideoTracks().map(t => ({ id: t.id, enabled: t.enabled, readyState: t.readyState }))
    });

    // Store as pending first
    this.pendingMediaConnections.set(peerId, mediaConn);

    // Helper function to setup handlers after answering
    const setupHandlersAfterAnswer = () => {
      // Setup ICE monitoring
      const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
      if (pc) {
        this.setupICEMonitoring(pc, peerId);
        
        log('MEDIA', '📊 Peer connection state after answer', {
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState
        });
        
        // Use ontrack to capture streams directly from RTCPeerConnection
        // This is more reliable than PeerJS's stream event
        // IMPORTANT: Wait for BOTH audio and video tracks before notifying
        let receivedStream: MediaStream | null = null;
        let processedStream = false;
        
        const processStreamIfReady = () => {
          if (processedStream || !receivedStream) return;
          
          const hasAudio = receivedStream.getAudioTracks().length > 0;
          const hasVideo = receivedStream.getVideoTracks().length > 0;
          
          log('MEDIA', '🔍 Checking if stream is ready to process', {
            peerId,
            hasAudio,
            hasVideo,
            audioTracks: receivedStream.getAudioTracks().length,
            videoTracks: receivedStream.getVideoTracks().length,
            alreadyProcessed: this.mediaConnections.has(peerId)
          });
          
          // Only process if we have both tracks OR if we've already processed
          if (this.mediaConnections.has(peerId)) {
            log('MEDIA', '⏭️ Stream already processed, skipping', { peerId });
            return;
          }
          
          // Wait for both tracks if possible
          if (hasAudio && hasVideo) {
            processedStream = true;
            log('MEDIA', '🎥 Processing stream - BOTH tracks received', {
              peerId,
              audioTracks: receivedStream.getAudioTracks().length,
              videoTracks: receivedStream.getVideoTracks().length,
              audioTrackStates: receivedStream.getAudioTracks().map(t => ({
                id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState
              })),
              videoTrackStates: receivedStream.getVideoTracks().map(t => ({
                id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState
              }))
            });
            
            this.pendingMediaConnections.delete(peerId);
            this.mediaConnections.set(peerId, mediaConn);
            
            // Ensure all tracks are enabled
            receivedStream.getAudioTracks().forEach(track => {
              track.enabled = true;
            });
            receivedStream.getVideoTracks().forEach(track => {
              track.enabled = true;
            });
            
            this.onStreamCallback?.(peerId, receivedStream);
          }
        };
        
        pc.ontrack = (event) => {
          log('MEDIA', '🎯 ontrack event fired (incoming call)!', {
            peerId,
            trackKind: event.track.kind,
            trackId: event.track.id,
            trackEnabled: event.track.enabled,
            trackMuted: event.track.muted,
            trackReadyState: event.track.readyState,
            streamsCount: event.streams.length
          });
          
          // Get the stream from the event
          if (event.streams && event.streams.length > 0) {
            receivedStream = event.streams[0];
            
            // Ensure the new track is enabled
            event.track.enabled = true;
            
            // DIAGNOSTIC: Add event listeners to monitor track state changes
            const track = event.track;
            
            track.onmute = () => {
              log('MEDIA', '🔇 Track MUTED event!', {
                peerId,
                trackKind: track.kind,
                trackId: track.id,
                trackEnabled: track.enabled,
                trackMuted: track.muted,
                trackReadyState: track.readyState
              });
            };
            
            track.onunmute = () => {
              log('MEDIA', '🔊 Track UNMUTED event!', {
                peerId,
                trackKind: track.kind,
                trackId: track.id,
                trackEnabled: track.enabled,
                trackMuted: track.muted,
                trackReadyState: track.readyState
              });
              // When track unmutes, try to process stream again
              if (track.kind === 'video') {
                processStreamIfReady();
                
                // CRITICAL FIX: Notify that video track is unmuted
                // This is needed when replaceTrack() is used - the track is replaced
                // but the stream reference in React state is not updated
                // By calling onTrackUnmutedCallback, we force React to update the participant's stream
                if (receivedStream) {
                  log('MEDIA', '🔄 Notifying track unmuted callback (incoming call)', {
                    peerId,
                    streamId: receivedStream.id,
                    videoTracks: receivedStream.getVideoTracks().length
                  });
                  this.onTrackUnmutedCallback?.(peerId, receivedStream);
                }
              }
            };
            
            track.onended = () => {
              log('MEDIA', '⏹️ Track ENDED event!', {
                peerId,
                trackKind: track.kind,
                trackId: track.id
              });
            };
            
            // DIAGNOSTIC: Check if video track is muted (no data flowing)
            if (track.kind === 'video' && track.muted) {
              log('MEDIA', '⚠️ WARNING: Video track is MUTED (no data flowing)!', {
                peerId,
                trackId: track.id,
                trackEnabled: track.enabled,
                trackReadyState: track.readyState
              });
            }
            
            // Log current stream state
            log('MEDIA', '📊 Stream state after ontrack', {
              peerId,
              trackKind: event.track.kind,
              audioTracks: receivedStream.getAudioTracks().length,
              videoTracks: receivedStream.getVideoTracks().length,
              audioMuted: receivedStream.getAudioTracks().map(t => t.muted),
              videoMuted: receivedStream.getVideoTracks().map(t => t.muted)
            });
            
            // Try to process the stream
            processStreamIfReady();
          }
        };
        
        // DIAGNOSTIC: Log transceiver states to check direction
        // Also fix direction if needed
        setTimeout(() => {
          const transceivers = pc.getTransceivers();
          log('MEDIA', '📊 Transceiver states (incoming call)', {
            peerId,
            transceivers: transceivers.map(t => ({
              mid: t.mid,
              direction: t.direction,
              currentDirection: t.currentDirection,
              senderTrackKind: t.sender.track?.kind,
              senderTrackEnabled: t.sender.track?.enabled,
              senderTrackMuted: t.sender.track?.muted,
              receiverTrackKind: t.receiver.track?.kind,
              receiverTrackEnabled: t.receiver.track?.enabled,
              receiverTrackMuted: t.receiver.track?.muted
            }))
          });
          
          // CRITICAL FIX: Ensure transceivers are set to sendrecv
          // This ensures bidirectional video flow
          transceivers.forEach(t => {
            if (t.direction !== 'sendrecv' && t.direction !== 'inactive') {
              log('MEDIA', '⚠️ Transceiver direction is not sendrecv, fixing...', {
                peerId,
                mid: t.mid,
                currentDirection: t.direction,
                receiverTrackKind: t.receiver.track?.kind
              });
              try {
                t.direction = 'sendrecv';
                log('MEDIA', '✅ Transceiver direction set to sendrecv', { peerId, mid: t.mid });
              } catch (e) {
                log('MEDIA', '❌ Failed to set transceiver direction', { peerId, error: (e as Error).message });
              }
            }
          });
        }, 1000);
        
        // Monitor receiver track states periodically and log if video stops
        let lastBytesReceived = 0;
        let noDataCount = 0;
        let renegotiationAttempted = false;
        const trackMonitorInterval = setInterval(async () => {
          if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            clearInterval(trackMonitorInterval);
            return;
          }
          
          const receivers = pc.getReceivers();
          const videoReceiver = receivers.find(r => r.track?.kind === 'video');
          
          if (videoReceiver && videoReceiver.track) {
            const track = videoReceiver.track;
            
            // Try to get stats to see what's happening
            try {
              const stats = await pc.getStats(videoReceiver.track);
              stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                  const bytesReceived = report.bytesReceived || 0;
                  const isReceivingData = bytesReceived > lastBytesReceived;
                  
                  log('MEDIA', '📊 Video RTP stats:', {
                    peerId,
                    bytesReceived,
                    bytesDelta: bytesReceived - lastBytesReceived,
                    isReceivingData,
                    packetsReceived: report.packetsReceived,
                    packetsLost: report.packetsLost,
                    framesReceived: report.framesReceived,
                    framesDecoded: report.framesDecoded,
                    framesDropped: report.framesDropped,
                    frameWidth: report.frameWidth,
                    frameHeight: report.frameHeight,
                    trackMuted: track.muted,
                    trackEnabled: track.enabled
                  });
                  
                  // If no data is being received for multiple intervals, try to renegotiate
                  if (!isReceivingData && lastBytesReceived > 0) {
                    noDataCount++;
                    log('MEDIA', '⚠️ No video data received!', { peerId, noDataCount, bytesReceived, lastBytesReceived });
                    
                    // After 2 intervals with no data, try renegotiation
                    if (noDataCount >= 2 && !renegotiationAttempted) {
                      renegotiationAttempted = true;
                      log('MEDIA', '🔄 Attempting renegotiation to restore video', { peerId });
                      
                      // Send a message to the peer to request stream refresh
                      this.sendMessage(peerId, {
                        type: 'stream-ready',
                        data: { requestRefresh: true },
                        senderId: this.myId,
                        timestamp: Date.now()
                      });
                    }
                  } else if (isReceivingData) {
                    noDataCount = 0; // Reset counter when data is flowing
                    renegotiationAttempted = false; // Allow future renegotiations
                  }
                  
                  lastBytesReceived = bytesReceived;
                }
              });
            } catch (e) {
              // Stats error, ignore
            }
            
            if (track.muted) {
              log('MEDIA', '⚠️ MONITOR: Video track is still MUTED', {
                peerId,
                trackId: track.id,
                enabled: track.enabled,
                readyState: track.readyState
              });
              
              // CRITICAL FIX: If video track is muted and we haven't received any data,
              // the sender might not be sending video. Request a stream refresh.
              if (lastBytesReceived === 0 && !renegotiationAttempted) {
                renegotiationAttempted = true;
                log('MEDIA', '🔄 Video track muted with no data - requesting stream refresh', { peerId });
                
                // Send a message to the peer to request stream refresh
                this.sendMessage(peerId, {
                  type: 'stream-ready',
                  data: { requestRefresh: true },
                  senderId: this.myId,
                  timestamp: Date.now()
                });
              }
            }
          }
        }, 5000);
        
        // Clean up monitor when connection closes
        mediaConn.on('close', () => {
          clearInterval(trackMonitorInterval);
        });
        
        // Fallback: if we only receive one track after timeout, process anyway
        setTimeout(() => {
          if (receivedStream && !processedStream && !this.mediaConnections.has(peerId)) {
            log('MEDIA', '⏰ Timeout - processing stream with available tracks', {
              peerId,
              audioTracks: receivedStream.getAudioTracks().length,
              videoTracks: receivedStream.getVideoTracks().length
            });
            
            processedStream = true;
            this.pendingMediaConnections.delete(peerId);
            this.mediaConnections.set(peerId, mediaConn);
            
            receivedStream.getTracks().forEach(track => {
              track.enabled = true;
            });
            
            this.onStreamCallback?.(peerId, receivedStream);
          }
        }, 3000);
      }

      // Keep the PeerJS stream event as a fallback
      mediaConn.on('stream', (remoteStream) => {
        log('MEDIA', '🎥 Received stream via PeerJS event (incoming)', {
          peerId,
          audioTracks: remoteStream.getAudioTracks().length,
          videoTracks: remoteStream.getVideoTracks().length
        });
        
        // Only process if we haven't already via ontrack
        if (!this.mediaConnections.has(peerId)) {
          this.pendingMediaConnections.delete(peerId);
          this.mediaConnections.set(peerId, mediaConn);
          
          remoteStream.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          remoteStream.getVideoTracks().forEach(track => {
            track.enabled = true;
          });
          
          this.onStreamCallback?.(peerId, remoteStream);
        }
      });

      mediaConn.on('close', () => {
        log('MEDIA', 'Incoming call closed', { peerId });
        this.pendingMediaConnections.delete(peerId);
        this.mediaConnections.delete(peerId);
      });

      mediaConn.on('error', (error) => {
        log('MEDIA', 'Incoming call error', { peerId, error: (error as any).message || error });
        this.pendingMediaConnections.delete(peerId);
      });
    };

    // If we have a local stream, answer with it immediately
    // CRITICAL FIX: Always get a fresh video track before answering
    if (this.localStream && this.localStream.getTracks().length > 0) {
      // DIAGNOSTIC: Check if video track is present and enabled
      let videoTracks = this.localStream.getVideoTracks();
      const audioTracks = this.localStream.getAudioTracks();
      
      log('MEDIA', '📞 Preparing to answer call', {
        peerId,
        audioTracks: audioTracks.length,
        videoTracks: videoTracks.length,
        audioTrackStates: audioTracks.map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
        videoTrackStates: videoTracks.map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
      });
      
      // CRITICAL FIX: ALWAYS get a fresh video track before answering
      // This ensures the track is actively capturing and not in a stale state
      try {
        log('MEDIA', '🔄 Getting fresh video track for answer...', { peerId });
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        
        const freshVideoTrack = freshStream.getVideoTracks()[0];
        if (freshVideoTrack && freshVideoTrack.readyState === 'live') {
          log('MEDIA', '✅ Got fresh video track for answer!', {
            peerId,
            newTrackId: freshVideoTrack.id,
            muted: freshVideoTrack.muted,
            enabled: freshVideoTrack.enabled,
            readyState: freshVideoTrack.readyState
          });
          
          // Replace the old track in the stream
          const oldTrack = this.localStream.getVideoTracks()[0];
          if (oldTrack) {
            this.localStream.removeTrack(oldTrack);
            oldTrack.stop();
          }
          this.localStream.addTrack(freshVideoTrack);
          videoTracks = this.localStream.getVideoTracks();
          
          // CRITICAL FIX: If the fresh track is muted, wait for it to unmute
          // This happens on mobile when the camera needs time to "warm up"
          if (freshVideoTrack.muted) {
            log('MEDIA', '⏳ Fresh video track is muted (answer), waiting for unmute...', { peerId });
            
            // Wait for the track to unmute (max 3 seconds)
            await new Promise<void>((resolve) => {
              let resolved = false;
              
              const onUnmute = () => {
                if (!resolved) {
                  resolved = true;
                  freshVideoTrack.removeEventListener('unmute', onUnmute);
                  log('MEDIA', '✅ Video track unmuted (answer), proceeding', {
                    peerId,
                    muted: freshVideoTrack.muted
                  });
                  resolve();
                }
              };
              
              freshVideoTrack.addEventListener('unmute', onUnmute);
              
              // Also check immediately in case it already unmuted
              if (!freshVideoTrack.muted) {
                onUnmute();
              }
              
              // Timeout after 3 seconds
              setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  freshVideoTrack.removeEventListener('unmute', onUnmute);
                  log('MEDIA', '⚠️ Timeout waiting for video track to unmute (answer), proceeding anyway', {
                    peerId,
                    muted: freshVideoTrack.muted
                  });
                  resolve();
                }
              }, 3000);
            });
          }
        } else {
          log('MEDIA', '⚠️ Fresh video track is not live!', {
            peerId,
            muted: freshVideoTrack?.muted,
            readyState: freshVideoTrack?.readyState
          });
          freshVideoTrack?.stop();
        }
      } catch (err) {
        log('MEDIA', '⚠️ Could not get fresh video track for answer, using existing', {
          peerId,
          error: (err as Error).message
        });
      }
      
      // DIAGNOSTIC: Warn if no video track
      if (videoTracks.length === 0) {
        log('MEDIA', '⚠️ WARNING: Answering call WITHOUT video track!', { peerId });
      }
      
      // CRITICAL DIAGNOSTIC: Log the stream we're about to answer with
      log('MEDIA', '🚀 ABOUT TO ANSWER with local stream:', {
        peerId,
        streamId: this.localStream.id,
        streamActive: this.localStream.active,
        totalTracks: this.localStream.getTracks().length,
        audioTracks: this.localStream.getAudioTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        })),
        videoTracks: this.localStream.getVideoTracks().map(t => ({
          id: t.id,
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label,
          settings: typeof t.getSettings === 'function' ? t.getSettings() : 'N/A'
        }))
      });
      
      mediaConn.answer(this.localStream);
      
      log('MEDIA', '✅ mediaConn.answer() called', { peerId });
      setupHandlersAfterAnswer();
    } else {
      // DIAGNOSTIC: This is a potential problem - no local stream available
      log('MEDIA', '⚠️ WARNING: No local stream available for incoming call!', { peerId });
      log('MEDIA', '⚠️ Local stream state:', {
        hasLocalStream: !!this.localStream,
        trackCount: this.localStream?.getTracks().length || 0
      });
      
      // Set a timeout to check if stream becomes available
      let answered = false;
      const checkStreamInterval = setInterval(() => {
        if (this.localStream && this.localStream.getTracks().length > 0 && !answered) {
          clearInterval(checkStreamInterval);
          answered = true;
          log('MEDIA', '✅ Local stream now available, answering pending call', {
            peerId,
            audioTracks: this.localStream.getAudioTracks().length,
            videoTracks: this.localStream.getVideoTracks().length
          });
          mediaConn.answer(this.localStream);
          setupHandlersAfterAnswer();
        }
      }, 100);
      
      // Clear interval after 10 seconds to prevent memory leak
      setTimeout(() => {
        clearInterval(checkStreamInterval);
        // If still no stream, answer with empty to prevent hanging
        if (!answered && this.pendingMediaConnections.has(peerId)) {
          answered = true;
          log('MEDIA', '❌ Timeout waiting for local stream, answering with empty stream', { peerId });
          const emptyStream = new MediaStream();
          mediaConn.answer(emptyStream);
          setupHandlersAfterAnswer();
        }
      }, 10000);
    }
  }

  /**
   * Mettre à jour le stream local pour toutes les connexions
   * Now handles pending connections and properly updates tracks
   */
  updateLocalStream(stream: MediaStream | null) {
    if (!stream) {
      log('STREAM', 'updateLocalStream called with null stream');
      return;
    }

    const previousStream = this.localStream;
    this.localStream = stream;
    
    log('STREAM', '🔄 Updating local stream in P2PManager', {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      audioTrackIds: stream.getAudioTracks().map(t => t.id),
      videoTrackIds: stream.getVideoTracks().map(t => t.id),
      audioEnabled: stream.getAudioTracks().map(t => t.enabled),
      videoEnabled: stream.getVideoTracks().map(t => t.enabled),
      hadPreviousStream: !!previousStream,
      dataConnectionsCount: this.dataConnections.size,
      mediaConnectionsCount: this.mediaConnections.size,
      pendingMediaConnectionsCount: this.pendingMediaConnections.size
    });
    
    // CRITICAL: Monitor local video track for mute events
    // This helps detect when the camera stops sending data
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      // Store reference for potential reactivation
      const self = this;
      
      videoTrack.onmute = () => {
        log('STREAM', '⚠️ LOCAL video track MUTED - camera may have stopped!', {
          trackId: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState
        });
        // Notify peers that our video is temporarily unavailable
        this.broadcast({
          type: 'media-state',
          data: { videoMuted: true },
          senderId: this.myId,
          timestamp: Date.now()
        });
        
        // CRITICAL FIX: Try to reactivate the video track after a short delay
        // This can happen on mobile when the app goes to background briefly
        setTimeout(() => {
          if (videoTrack.readyState === 'live' && videoTrack.muted) {
            log('STREAM', '🔄 Attempting to reactivate muted video track...', {
              trackId: videoTrack.id
            });
            
            // Try toggling enabled state to kickstart the track
            const wasEnabled = videoTrack.enabled;
            videoTrack.enabled = false;
            setTimeout(() => {
              videoTrack.enabled = wasEnabled;
              log('STREAM', '🔄 Video track enabled toggled', {
                trackId: videoTrack.id,
                enabled: videoTrack.enabled,
                muted: videoTrack.muted
              });
              
              // If still muted after toggle, try to replace the track in all connections
              if (videoTrack.muted) {
                log('STREAM', '⚠️ Video track still muted after toggle, updating connections...', {
                  trackId: videoTrack.id
                });
                // Force update all media connections with the current stream
                self.mediaConnections.forEach((mediaConn, peerId) => {
                  self.updateMediaConnectionTracks(mediaConn, stream, peerId);
                });
              }
            }, 100);
          }
        }, 1000);
      };
      
      videoTrack.onunmute = () => {
        log('STREAM', '✅ LOCAL video track UNMUTED - camera is sending data', {
          trackId: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState
        });
        // Notify peers that our video is back
        this.broadcast({
          type: 'media-state',
          data: { videoMuted: false },
          senderId: this.myId,
          timestamp: Date.now()
        });
      };
      
      videoTrack.onended = () => {
        log('STREAM', '🔴 LOCAL video track ENDED - camera was released!', {
          trackId: videoTrack.id
        });
      };
      
      // Log initial state
      log('STREAM', '📹 Local video track state:', {
        trackId: videoTrack.id,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
        readyState: videoTrack.readyState,
        label: videoTrack.label
      });
      
      // DIAGNOSTIC: Check if video track is already muted at start
      if (videoTrack.muted) {
        log('STREAM', '⚠️ WARNING: Local video track is ALREADY MUTED at initialization!', {
          trackId: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState
        });
      }
    }

    // Update all active media connections
    this.mediaConnections.forEach((mediaConn, peerId) => {
      this.updateMediaConnectionTracks(mediaConn, stream, peerId);
    });

    // Also update pending connections that were waiting for a stream
    this.pendingMediaConnections.forEach((mediaConn, peerId) => {
      log('STREAM', 'Updating pending media connection', { peerId });
      this.updateMediaConnectionTracks(mediaConn, stream, peerId);
    });

    // If we have data connections but no media connections, initiate media calls
    this.dataConnections.forEach((dataConn, peerId) => {
      if (dataConn.open && !this.mediaConnections.has(peerId) && !this.pendingMediaConnections.has(peerId)) {
        log('STREAM', 'Initiating media connection for peer without media', { peerId });
        this.initiateMediaConnection(peerId, stream);
      }
    });

    // Notify peers that our stream is ready
    this.broadcast({
      type: 'stream-ready',
      data: {
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0
      },
      senderId: this.myId,
      timestamp: Date.now()
    });
  }

  /**
   * Update tracks on a specific media connection
   * CRITICAL FIX: Use transceivers to find senders even when track is null
   * This happens when camera is toggled off (track removed) then back on
   */
  private updateMediaConnectionTracks(mediaConn: MediaConnection, stream: MediaStream, peerId: string): void {
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (!pc) {
      log('STREAM', 'No peer connection available for track update', { peerId });
      return;
    }

    // Check connection state before updating
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      log('STREAM', 'Cannot update tracks - connection is closed/failed', { peerId, state: pc.connectionState });
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    const senders = pc.getSenders();
    const transceivers = pc.getTransceivers();
    
    // CRITICAL DIAGNOSTIC: Determine if this is an incoming or outgoing connection
    // For incoming calls (participant answering host's call), the local description type is 'answer'
    // For outgoing calls (host calling participant), the local description type is 'offer'
    const isIncomingConnection = pc.localDescription?.type === 'answer';
    const isOutgoingConnection = pc.localDescription?.type === 'offer';

    log('STREAM', '🔄🔄🔄 updateMediaConnectionTracks CALLED 🔄🔄🔄', {
      peerId,
      isIncomingConnection,
      isOutgoingConnection,
      localDescriptionType: pc.localDescription?.type,
      remoteDescriptionType: pc.remoteDescription?.type,
      hasVideo: !!videoTrack,
      hasAudio: !!audioTrack,
      videoTrackId: videoTrack?.id,
      videoTrackEnabled: videoTrack?.enabled,
      videoTrackMuted: videoTrack?.muted,
      videoTrackReadyState: videoTrack?.readyState,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      senderCount: senders.length,
      transceiverCount: transceivers.length,
      senderDetails: senders.map(s => ({
        trackKind: s.track?.kind || 'null',
        trackId: s.track?.id || 'null',
        trackEnabled: s.track?.enabled,
        trackMuted: s.track?.muted,
        trackReadyState: s.track?.readyState || 'null'
      })),
      transceiverDetails: transceivers.map(t => ({
        mid: t.mid,
        direction: t.direction,
        currentDirection: t.currentDirection,
        senderTrackKind: t.sender.track?.kind || 'null',
        senderTrackId: t.sender.track?.id || 'null',
        senderTrackReadyState: t.sender.track?.readyState || 'null',
        receiverTrackKind: t.receiver.track?.kind || 'null'
      }))
    });
    
    // CRITICAL DIAGNOSTIC: For incoming connections, check if we have proper senders
    if (isIncomingConnection && senders.length === 0) {
      log('STREAM', '⚠️⚠️⚠️ INCOMING CONNECTION HAS NO SENDERS! ⚠️⚠️⚠️', {
        peerId,
        transceiverCount: transceivers.length,
        transceiverDirections: transceivers.map(t => t.direction)
      });
    }

    // If no senders exist yet, add tracks
    if (senders.length === 0) {
      try {
        if (videoTrack) {
          pc.addTrack(videoTrack, stream);
          log('STREAM', 'Added video track', { peerId });
        }
        if (audioTrack) {
          pc.addTrack(audioTrack, stream);
          log('STREAM', 'Added audio track', { peerId });
        }
      } catch (error) {
        log('STREAM', 'Error adding tracks', { peerId, error: (error as Error).message });
      }
    } else {
      // CRITICAL FIX: Use transceivers to find the video sender
      // When camera is toggled off, the sender's track becomes null or ended
      // but the transceiver still exists and we can use replaceTrack on it
      if (videoTrack) {
        log('STREAM', '📹 Looking for video sender to replace track', {
          peerId,
          newVideoTrackId: videoTrack.id,
          newVideoTrackEnabled: videoTrack.enabled,
          newVideoTrackMuted: videoTrack.muted,
          newVideoTrackReadyState: videoTrack.readyState
        });
        
        // First try to find sender with existing video track (live or ended)
        let videoSender = senders.find(s => s.track?.kind === 'video');
        let foundVia = 'existing sender with video track';
        
        // CRITICAL: Also check for sender with ended track
        if (!videoSender) {
          // Check if any sender has a track that was video but is now ended
          const senderWithEndedTrack = senders.find(s =>
            s.track && s.track.readyState === 'ended' && s.track.kind === 'video'
          );
          if (senderWithEndedTrack) {
            videoSender = senderWithEndedTrack;
            foundVia = 'sender with ended video track';
            log('STREAM', '🔍 Found video sender with ENDED track', {
              peerId,
              trackId: senderWithEndedTrack.track?.id,
              trackReadyState: senderWithEndedTrack.track?.readyState
            });
          }
        }
        
        // If not found, look for a transceiver that was used for video
        // CRITICAL: Use receiver.track.kind to identify the video transceiver
        // because the sender.track may be null when camera was toggled off
        if (!videoSender) {
          log('STREAM', '🔍 No sender with video track found, checking transceivers...', { peerId });
          
          // First, try to find by receiver track kind (most reliable)
          const videoTransceiver = transceivers.find(t => t.receiver.track?.kind === 'video');
          
          if (videoTransceiver) {
            videoSender = videoTransceiver.sender;
            foundVia = 'transceiver (receiver.track.kind === video)';
            log('STREAM', '🔍 Found video sender via transceiver', {
              peerId,
              mid: videoTransceiver.mid,
              direction: videoTransceiver.direction,
              currentDirection: videoTransceiver.currentDirection,
              senderTrackNull: videoTransceiver.sender.track === null,
              senderTrackKind: videoTransceiver.sender.track?.kind,
              senderTrackReadyState: videoTransceiver.sender.track?.readyState
            });
          } else {
            log('STREAM', '⚠️ No video transceiver found by receiver.track.kind', { peerId });
            
            // Fallback: look for first transceiver with null sender track that's not audio
            // This is less reliable but may work in some cases
            const audioTransceiver = transceivers.find(t => t.receiver.track?.kind === 'audio');
            const nullTrackTransceiver = transceivers.find(t =>
              t.sender.track === null &&
              t.mid !== null &&
              t.direction !== 'inactive' &&
              t !== audioTransceiver
            );
            if (nullTrackTransceiver) {
              videoSender = nullTrackTransceiver.sender;
              foundVia = 'transceiver (null track, not audio)';
              log('STREAM', '🔍 Found video sender via null track transceiver', {
                peerId,
                mid: nullTrackTransceiver.mid,
                direction: nullTrackTransceiver.direction
              });
            }
          }
        }
        
        if (videoSender) {
          log('STREAM', `📹📹📹 REPLACING VIDEO TRACK (found via: ${foundVia}) 📹📹📹`, {
            peerId,
            newTrackId: videoTrack.id,
            newTrackEnabled: videoTrack.enabled,
            newTrackMuted: videoTrack.muted,
            newTrackReadyState: videoTrack.readyState,
            currentSenderTrackId: videoSender.track?.id || 'null',
            currentSenderTrackKind: videoSender.track?.kind || 'null',
            currentSenderTrackReadyState: videoSender.track?.readyState || 'null'
          });
          
          videoSender.replaceTrack(videoTrack).then(() => {
            log('STREAM', '✅✅✅ REPLACED VIDEO TRACK SUCCESSFULLY ✅✅✅', {
              peerId,
              newTrackId: videoTrack.id,
              newTrackEnabled: videoTrack.enabled,
              newTrackMuted: videoTrack.muted,
              newTrackReadyState: videoTrack.readyState
            });
            
            // CRITICAL: Verify the track was actually set
            setTimeout(() => {
              const verifyTrack = videoSender!.track;
              log('STREAM', '📊 Video sender state 100ms after replaceTrack', {
                peerId,
                senderTrackId: verifyTrack?.id || 'null',
                senderTrackKind: verifyTrack?.kind || 'null',
                senderTrackEnabled: verifyTrack?.enabled,
                senderTrackMuted: verifyTrack?.muted,
                senderTrackReadyState: verifyTrack?.readyState || 'null',
                trackMatchesNewTrack: verifyTrack?.id === videoTrack.id
              });
              
              if (!verifyTrack || verifyTrack.id !== videoTrack.id) {
                log('STREAM', '❌❌❌ TRACK REPLACEMENT VERIFICATION FAILED! ❌❌❌', {
                  peerId,
                  expectedTrackId: videoTrack.id,
                  actualTrackId: verifyTrack?.id || 'null'
                });
              }
            }, 100);
            
            // Also check after 500ms
            setTimeout(() => {
              const verifyTrack = videoSender!.track;
              log('STREAM', '📊 Video sender state 500ms after replaceTrack', {
                peerId,
                senderTrackId: verifyTrack?.id || 'null',
                senderTrackEnabled: verifyTrack?.enabled,
                senderTrackMuted: verifyTrack?.muted,
                senderTrackReadyState: verifyTrack?.readyState || 'null'
              });
            }, 500);
          }).catch(error => {
            log('STREAM', '❌❌❌ ERROR REPLACING VIDEO TRACK ❌❌❌', {
              peerId,
              error: (error as Error).message,
              errorName: (error as Error).name,
              errorStack: (error as Error).stack
            });
            // Try adding instead
            try {
              pc.addTrack(videoTrack, stream);
              log('STREAM', '✅ Added video track as fallback after replaceTrack failed', { peerId });
            } catch (e) {
              log('STREAM', '❌ Error adding video track as fallback', { peerId, error: (e as Error).message });
            }
          });
        } else {
          log('STREAM', '⚠️⚠️⚠️ NO VIDEO SENDER FOUND! ⚠️⚠️⚠️', {
            peerId,
            senderCount: senders.length,
            transceiverCount: transceivers.length,
            allSenderKinds: senders.map(s => s.track?.kind || 'null'),
            allTransceiverReceiverKinds: transceivers.map(t => t.receiver.track?.kind || 'null')
          });
          try {
            pc.addTrack(videoTrack, stream);
            log('STREAM', '✅ Added new video track (no existing sender or transceiver)', { peerId });
          } catch (error) {
            log('STREAM', '❌ Error adding video track', { peerId, error: (error as Error).message });
          }
        }
      } else {
        log('STREAM', '📹 No video track to update (camera may be off)', { peerId });
      }

      // Same fix for audio track
      if (audioTrack) {
        let audioSender = senders.find(s => s.track?.kind === 'audio');
        
        if (!audioSender) {
          const audioTransceiver = transceivers.find(t => t.receiver.track?.kind === 'audio');
          if (audioTransceiver) {
            audioSender = audioTransceiver.sender;
            log('STREAM', '🔍 Found audio sender via transceiver', {
              peerId,
              mid: audioTransceiver.mid
            });
          }
        }
        
        if (audioSender) {
          audioSender.replaceTrack(audioTrack).then(() => {
            log('STREAM', '✅ Replaced audio track successfully', { peerId });
          }).catch(error => {
            log('STREAM', '❌ Error replacing audio track', { peerId, error: (error as Error).message });
            try {
              pc.addTrack(audioTrack, stream);
            } catch (e) {
              log('STREAM', '❌ Error adding audio track as fallback', { peerId });
            }
          });
        } else {
          try {
            pc.addTrack(audioTrack, stream);
            log('STREAM', 'Added new audio track (no existing sender)', { peerId });
          } catch (error) {
            log('STREAM', 'Error adding audio track', { peerId, error: (error as Error).message });
          }
        }
      }
    }
  }

  // ==========================================
  // ADAPTIVE BITRATE CONTROL
  // ==========================================

  /**
   * Adjust video quality based on network conditions
   */
  async adjustVideoQuality(peerId: string, quality: VideoQuality): Promise<void> {
    const mediaConn = this.mediaConnections.get(peerId);
    if (!mediaConn) return;

    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (!pc) return;

    const sender = pc.getSenders()?.find((s: RTCRtpSender) => s.track?.kind === 'video');

    if (sender) {
      try {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];

        const bitrates: Record<VideoQuality, number> = {
          low: 150000,    // 150 kbps - for poor connections
          medium: 500000, // 500 kbps - balanced
          high: 1500000   // 1.5 Mbps - good connections
        };

        params.encodings[0].maxBitrate = bitrates[quality];
        await sender.setParameters(params);
      } catch (_error) {
        // Failed to adjust video quality
      }
    }
  }

  // ==========================================
  // CONNECTION QUALITY MONITORING
  // ==========================================

  /**
   * Get connection statistics for a peer
   */
  async getConnectionStats(peerId: string): Promise<ConnectionStats | null> {
    const mediaConn = this.mediaConnections.get(peerId);
    if (!mediaConn) return null;

    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (!pc) return null;

    try {
      const stats = await pc.getStats();
      let result: ConnectionStats = {
        packetsLost: 0,
        jitter: 0,
        roundTripTime: 0,
        bytesReceived: 0,
        quality: 'good'
      };

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          result.packetsLost = report.packetsLost || 0;
          result.jitter = report.jitter || 0;
          result.bytesReceived = report.bytesReceived || 0;
          result.framesPerSecond = report.framesPerSecond;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          result.roundTripTime = (report.currentRoundTripTime || 0) * 1000;
        }
      });

      // Determine quality based on metrics
      if (result.packetsLost > 50 || result.roundTripTime > 300) {
        result.quality = 'poor';
      } else if (result.packetsLost > 20 || result.roundTripTime > 150) {
        result.quality = 'medium';
      } else {
        result.quality = 'good';
      }

      return result;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Start monitoring connection quality and auto-adjust video quality
   */
  startQualityMonitoring(): void {
    if (this.qualityMonitorInterval) return;

    this.qualityMonitorInterval = setInterval(async () => {
      for (const [peerId] of this.mediaConnections) {
        const stats = await this.getConnectionStats(peerId);
        if (stats) {
          // Store stats
          this.connectionStats.set(peerId, stats);

          // Notify callback
          this.onConnectionQualityCallback?.(peerId, stats.quality);

          // Auto-adjust video quality based on connection quality
          const qualityMap: Record<ConnectionQuality, VideoQuality> = {
            poor: 'low',
            medium: 'medium',
            good: 'high'
          };
          await this.adjustVideoQuality(peerId, qualityMap[stats.quality]);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop quality monitoring
   */
  stopQualityMonitoring(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }
  }

  /**
   * Get cached connection stats for a peer
   */
  getCachedConnectionStats(peerId: string): ConnectionStats | undefined {
    return this.connectionStats.get(peerId);
  }

  // ==========================================
  // AUDIO LEVEL DETECTION
  // ==========================================

  /**
   * Initialize audio context for audio level detection
   */
  private initAudioContext(): void {
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
      } catch (_error) {
        // Failed to create AudioContext
      }
    }
  }

  /**
   * Add audio analyser for a peer's stream
   */
  addAudioAnalyser(peerId: string, stream: MediaStream): void {
    if (!this.audioContext) this.initAudioContext();
    if (!this.audioContext) return;

    // Remove existing analyser if any
    this.removeAudioAnalyser(peerId);

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      this.audioSources.set(peerId, source);
      this.audioAnalysers.set(peerId, analyser);
    } catch (_error) {
      // Failed to create audio analyser
    }
  }

  /**
   * Remove audio analyser for a peer
   */
  private removeAudioAnalyser(peerId: string): void {
    const source = this.audioSources.get(peerId);
    if (source) {
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.audioSources.delete(peerId);
    }
    this.audioAnalysers.delete(peerId);
  }

  /**
   * Get current audio level for a peer (0-1)
   */
  getAudioLevel(peerId: string): number {
    const analyser = this.audioAnalysers.get(peerId);
    if (!analyser) return 0;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Calculate average level
    const sum = data.reduce((a, b) => a + b, 0);
    return sum / data.length / 255; // Normalize to 0-1
  }

  /**
   * Start audio level monitoring
   */
  startAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) return;

    this.audioLevelInterval = setInterval(() => {
      for (const [peerId] of this.audioAnalysers) {
        const level = this.getAudioLevel(peerId);
        this.onAudioLevelCallback?.(peerId, level);
      }
    }, 100); // Check every 100ms for responsive UI
  }

  /**
   * Stop audio level monitoring
   */
  stopAudioLevelMonitoring(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
  }

  // ==========================================
  // CODEC PREFERENCES
  // ==========================================

  /**
   * Set codec preferences for better compression (VP9 > VP8 > H264)
   */
  private setCodecPreferences(peerConnection: RTCPeerConnection): void {
    try {
      const transceivers = peerConnection.getTransceivers();

      for (const transceiver of transceivers) {
        if (transceiver.sender.track?.kind === 'video') {
          const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];

          // Prefer VP9 for better compression, fallback to VP8, then H264
          const vp9 = codecs.filter(c => c.mimeType === 'video/VP9');
          const vp8 = codecs.filter(c => c.mimeType === 'video/VP8');
          const h264 = codecs.filter(c => c.mimeType === 'video/H264');
          const others = codecs.filter(c =>
            c.mimeType !== 'video/VP9' &&
            c.mimeType !== 'video/VP8' &&
            c.mimeType !== 'video/H264'
          );

          const preferredCodecs = [...vp9, ...vp8, ...h264, ...others];
          
          // if (preferredCodecs.length > 0 && transceiver.setCodecPreferences) {
          //   transceiver.setCodecPreferences(preferredCodecs);
          // }
        }
      }
    } catch (_error) {
      // Failed to set codec preferences
    }
  }

  /**
   * Gérer les messages P2P
   */
  private handleMessage(message: P2PMessage, fromPeerId: string) {
    log('MSG', `📨 Received message: ${message.type}`, { from: fromPeerId, isHost: this.isHost });
    
    switch (message.type) {
      case 'room-full':
        log('MSG', '🚫 Room is full');
        this.onRoomFullCallback?.();
        this.handlePeerDisconnection(fromPeerId);
        break;

      case 'peer-info':
        log('MSG', '👤 Received peer-info', {
          from: fromPeerId,
          name: message.data.name,
          hasStream: message.data.hasStream,
          isHost: this.isHost,
          currentPeersCount: this.peers.size
        });
        
        // Register the peer
        this.peers.set(fromPeerId, {
          id: fromPeerId,
          name: message.data.name,
          isHost: message.data.isHost || false,
          joinedAt: Date.now(),
        });
        
        log('MSG', '✅ Peer registered', {
          peerId: fromPeerId,
          totalPeers: this.peers.size,
          allPeerIds: Array.from(this.peers.keys())
        });

        // If host, notify all other participants AND initiate media call
        if (this.isHost) {
          log('MSG', '📢 HOST: Broadcasting peer-joined to other participants');
          const peerJoinedMessage: P2PMessage = {
            type: 'peer-joined',
            data: this.peers.get(fromPeerId),
            senderId: this.myId,
            timestamp: Date.now(),
          };

          this.broadcast(peerJoinedMessage, fromPeerId);

          // NOTE: Host media call is now initiated in connectToPeer() when data connection opens
          // This prevents duplicate calls and race conditions
          log('MSG', '📋 HOST: Media call will be initiated from data connection handler', {
            peerId: fromPeerId,
            hasMediaConnection: this.mediaConnections.has(fromPeerId),
            hasPendingMediaConnection: this.pendingMediaConnections.has(fromPeerId)
          });
        }

        log('MSG', '🔔 Calling onPeerConnectedCallback', { peerId: fromPeerId, name: message.data.name });
        this.onPeerConnectedCallback?.(fromPeerId, message.data);
        break;

      case 'peer-list':
        // Receive participant list and connect to them
        const peerList = message.data as PeerInfo[];
        log('MSG', '📋 Received peer-list', {
          count: peerList.length,
          peers: peerList.map(p => ({ id: p.id, name: p.name })),
          fromPeerId,
          myId: this.myId
        });
        
        // CRITICAL FIX: First, ensure the host (sender of peer-list) is registered
        // The host sends the peer-list, so fromPeerId IS the host
        // We need to make sure the host is in our peers map and UI is notified
        if (!this.peers.has(fromPeerId)) {
          // Find host info in the peer list
          const hostInfo = peerList.find(p => p.id === fromPeerId);
          if (hostInfo) {
            log('MSG', '👑 Registering HOST from peer-list', {
              hostId: fromPeerId,
              hostName: hostInfo.name
            });
            this.peers.set(fromPeerId, hostInfo);
            this.onPeerConnectedCallback?.(fromPeerId, hostInfo);
          } else {
            // Host not in list (shouldn't happen, but handle it)
            log('MSG', '⚠️ Host not found in peer-list, creating entry', { fromPeerId });
            const hostEntry: PeerInfo = {
              id: fromPeerId,
              name: 'Host',
              isHost: true,
              joinedAt: Date.now()
            };
            this.peers.set(fromPeerId, hostEntry);
            this.onPeerConnectedCallback?.(fromPeerId, hostEntry);
          }
        }
        
        // Process other peers in the list
        peerList.forEach((peer) => {
          log('MSG', '🔍 Processing peer from list', {
            peerId: peer.id,
            peerName: peer.name,
            isMyself: peer.id === this.myId,
            isFromPeer: peer.id === fromPeerId,
            alreadyInPeers: this.peers.has(peer.id),
            alreadyConnected: this.dataConnections.has(peer.id)
          });
          
          // Skip ourselves
          if (peer.id === this.myId) {
            log('MSG', '⏭️ Skipping self', { peerId: peer.id });
            return;
          }
          
          // Skip the host (already handled above)
          if (peer.id === fromPeerId) {
            log('MSG', '⏭️ Skipping host (already registered)', { peerId: peer.id });
            return;
          }
          
          // Add other peers to our internal list
          if (!this.peers.has(peer.id)) {
            this.peers.set(peer.id, peer);
            log('MSG', '✅ Peer added to list', { peerId: peer.id, totalPeers: this.peers.size });
            
            // Notify callback that this peer is connected (for UI update)
            log('MSG', '🔔 Calling onPeerConnectedCallback for peer from list', { peerId: peer.id });
            this.onPeerConnectedCallback?.(peer.id, peer);
          }
          
          // Connect to other participants (not the host we're already connected to)
          if (!this.dataConnections.has(peer.id)) {
            log('MSG', '🔗 Connecting to peer from list', { peerId: peer.id });
            setTimeout(() => this.connectToPeer(peer.id, this.localStream), 500);
          }
        });
        
        log('MSG', '📋 Peer-list processing complete', {
          totalPeers: this.peers.size,
          peerIds: Array.from(this.peers.keys())
        });
        break;

      case 'peer-joined':
        // A new participant joined
        const newPeer = message.data as PeerInfo;
        log('MSG', '🆕 New peer joined notification', {
          peerId: newPeer.id,
          name: newPeer.name,
          isMyself: newPeer.id === this.myId,
          alreadyConnected: this.dataConnections.has(newPeer.id),
          alreadyInPeers: this.peers.has(newPeer.id)
        });
        
        if (newPeer.id !== this.myId) {
          // Add to peers map if not already there
          if (!this.peers.has(newPeer.id)) {
            this.peers.set(newPeer.id, newPeer);
            log('MSG', '✅ New peer added to peers map', { peerId: newPeer.id, totalPeers: this.peers.size });
            
            // CRITICAL: Notify UI about the new peer
            log('MSG', '🔔 Calling onPeerConnectedCallback for new peer', { peerId: newPeer.id, name: newPeer.name });
            this.onPeerConnectedCallback?.(newPeer.id, newPeer);
          }
          
          // Connect to new participant if not already connected
          if (!this.dataConnections.has(newPeer.id)) {
            log('MSG', '🔗 Connecting to new peer', { peerId: newPeer.id });
            // Connect to new participant with local stream
            setTimeout(() => this.connectToPeer(newPeer.id, this.localStream), 500);
          }
        }
        break;

      case 'peer-left':
        log('MSG', 'Peer left', { peerId: fromPeerId });
        this.peers.delete(fromPeerId);
        this.connectionStates.delete(fromPeerId);
        this.iceConnectionStates.delete(fromPeerId);
        this.onPeerDisconnectedCallback?.(fromPeerId);
        break;

      case 'stream-ready':
        // Peer's stream is ready, initiate media connection if we don't have one
        log('MSG', 'Peer stream ready', { peerId: fromPeerId, data: message.data });
        
        // CRITICAL FIX: If peer is requesting a stream refresh, re-send our video track
        if (message.data?.requestRefresh) {
          log('MSG', '🔄 Peer requested stream refresh - re-sending video track', { peerId: fromPeerId });
          
          // Get the media connection for this peer
          const refreshMediaConn = this.mediaConnections.get(fromPeerId);
          if (refreshMediaConn && this.localStream) {
            const refreshPc = (refreshMediaConn as any).peerConnection as RTCPeerConnection;
            // Accept more connection states - the connection might still be establishing
            if (refreshPc && (refreshPc.connectionState === 'connected' || refreshPc.connectionState === 'connecting' || refreshPc.iceConnectionState === 'connected' || refreshPc.iceConnectionState === 'checking')) {
              const currentVideoTrack = this.localStream.getVideoTracks()[0];
              if (currentVideoTrack) {
                log('MSG', '📹 Refreshing video track', {
                  peerId: fromPeerId,
                  trackId: currentVideoTrack.id,
                  enabled: currentVideoTrack.enabled,
                  muted: currentVideoTrack.muted,
                  readyState: currentVideoTrack.readyState,
                  connectionState: refreshPc.connectionState,
                  iceConnectionState: refreshPc.iceConnectionState
                });
                
                // Try to replace the video track to force a refresh
                const refreshVideoSender = refreshPc.getSenders().find(s => s.track?.kind === 'video');
                if (refreshVideoSender) {
                  // First, try to get a fresh video track
                  navigator.mediaDevices.getUserMedia({
                    video: {
                      width: { ideal: 640 },
                      height: { ideal: 480 },
                      facingMode: 'user'
                    }
                  }).then(async (freshStream) => {
                    const freshVideoTrack = freshStream.getVideoTracks()[0];
                    if (freshVideoTrack) {
                      log('MSG', '✅ Got fresh video track for refresh', {
                        peerId: fromPeerId,
                        newTrackId: freshVideoTrack.id,
                        muted: freshVideoTrack.muted,
                        enabled: freshVideoTrack.enabled,
                        readyState: freshVideoTrack.readyState
                      });
                      
                      // CRITICAL FIX: Wait for the track to unmute if needed
                      if (freshVideoTrack.muted) {
                        log('MSG', '⏳ Fresh video track is muted (refresh), waiting for unmute...', { peerId: fromPeerId });
                        
                        await new Promise<void>((resolve) => {
                          let resolved = false;
                          
                          const onUnmute = () => {
                            if (!resolved) {
                              resolved = true;
                              freshVideoTrack.removeEventListener('unmute', onUnmute);
                              log('MSG', '✅ Video track unmuted (refresh), proceeding', {
                                peerId: fromPeerId,
                                muted: freshVideoTrack.muted
                              });
                              resolve();
                            }
                          };
                          
                          freshVideoTrack.addEventListener('unmute', onUnmute);
                          
                          // Also check immediately in case it already unmuted
                          if (!freshVideoTrack.muted) {
                            onUnmute();
                          }
                          
                          // Timeout after 3 seconds
                          setTimeout(() => {
                            if (!resolved) {
                              resolved = true;
                              freshVideoTrack.removeEventListener('unmute', onUnmute);
                              log('MSG', '⚠️ Timeout waiting for video track to unmute (refresh), proceeding anyway', {
                                peerId: fromPeerId,
                                muted: freshVideoTrack.muted
                              });
                              resolve();
                            }
                          }, 3000);
                        });
                      }
                      
                      // Now replace the track in the sender
                      try {
                        await refreshVideoSender.replaceTrack(freshVideoTrack);
                        log('MSG', '✅ Video track replaced successfully', {
                          peerId: fromPeerId,
                          newTrackMuted: freshVideoTrack.muted
                        });
                        
                        // Also update our local stream reference
                        const oldTrack = this.localStream?.getVideoTracks()[0];
                        if (oldTrack && this.localStream) {
                          this.localStream.removeTrack(oldTrack);
                          oldTrack.stop();
                          this.localStream.addTrack(freshVideoTrack);
                        }
                      } catch (replaceErr) {
                        log('MSG', '❌ Failed to replace video track', { peerId: fromPeerId, error: (replaceErr as Error).message });
                        // Stop the new track since we couldn't use it
                        freshVideoTrack.stop();
                      }
                    }
                  }).catch(err => {
                    log('MSG', '❌ Failed to get fresh video track', { peerId: fromPeerId, error: err.message });
                    
                    // Fallback: try to toggle the existing track
                    log('MSG', '🔄 Fallback: toggling existing video track', { peerId: fromPeerId });
                    const wasEnabled = currentVideoTrack.enabled;
                    currentVideoTrack.enabled = false;
                    setTimeout(() => {
                      currentVideoTrack.enabled = wasEnabled;
                      log('MSG', '🔄 Video track toggled', {
                        peerId: fromPeerId,
                        enabled: currentVideoTrack.enabled,
                        muted: currentVideoTrack.muted
                      });
                    }, 100);
                  });
                } else {
                  log('MSG', '⚠️ No video sender found', { peerId: fromPeerId });
                }
              } else {
                log('MSG', '⚠️ No video track in local stream', { peerId: fromPeerId });
              }
            } else {
              log('MSG', '⚠️ Peer connection not in valid state for refresh', {
                peerId: fromPeerId,
                connectionState: refreshPc?.connectionState,
                iceConnectionState: refreshPc?.iceConnectionState
              });
            }
          }
        } else {
          // Normal stream-ready handling
          if (!this.mediaConnections.has(fromPeerId) && !this.pendingMediaConnections.has(fromPeerId)) {
            if (this.localStream) {
              log('MSG', 'Initiating media connection after stream-ready', { peerId: fromPeerId });
              this.initiateMediaConnection(fromPeerId, this.localStream);
            }
          }
        }
        break;

      case 'ice-candidate':
        // CRITICAL FIX: Receive ICE candidate from peer and add it to the peer connection
        // Queue candidates if remote description is not yet set
        log('ICE', '📥 Received ICE candidate via data channel', {
          peerId: fromPeerId,
          candidate: message.data?.candidate?.substring(0, 50)
        });
        
        const candidateInit: RTCIceCandidateInit = {
          candidate: message.data.candidate,
          sdpMid: message.data.sdpMid,
          sdpMLineIndex: message.data.sdpMLineIndex,
          usernameFragment: message.data.usernameFragment
        };
        
        // Find the media connection for this peer
        const mediaConnForIce = this.mediaConnections.get(fromPeerId) || this.pendingMediaConnections.get(fromPeerId);
        if (mediaConnForIce) {
          const pcForIce = (mediaConnForIce as any).peerConnection as RTCPeerConnection;
          if (pcForIce && pcForIce.signalingState !== 'closed') {
            // CRITICAL: Check if remote description is set
            // If not, queue the candidate for later
            if (!pcForIce.remoteDescription) {
              log('ICE', '⏳ Queuing ICE candidate - remote description not yet set', {
                peerId: fromPeerId,
                signalingState: pcForIce.signalingState
              });
              
              // Add to queue
              if (!this.pendingIceCandidates.has(fromPeerId)) {
                this.pendingIceCandidates.set(fromPeerId, []);
              }
              this.pendingIceCandidates.get(fromPeerId)!.push(candidateInit);
            } else {
              // Remote description is set, add candidate immediately
              try {
                const iceCandidate = new RTCIceCandidate(candidateInit);
                
                pcForIce.addIceCandidate(iceCandidate).then(() => {
                  log('ICE', '✅ ICE candidate added successfully', {
                    peerId: fromPeerId,
                    iceConnectionState: pcForIce.iceConnectionState,
                    connectionState: pcForIce.connectionState
                  });
                }).catch((err) => {
                  log('ICE', '❌ Failed to add ICE candidate', {
                    peerId: fromPeerId,
                    error: err.message,
                    signalingState: pcForIce.signalingState,
                    hasRemoteDesc: !!pcForIce.remoteDescription
                  });
                });
              } catch (err) {
                log('ICE', '❌ Error creating ICE candidate', {
                  peerId: fromPeerId,
                  error: (err as Error).message
                });
              }
            }
          } else {
            log('ICE', '⚠️ Cannot add ICE candidate - peer connection not ready', {
              peerId: fromPeerId,
              hasPc: !!pcForIce,
              signalingState: pcForIce?.signalingState
            });
            // Queue for later
            if (!this.pendingIceCandidates.has(fromPeerId)) {
              this.pendingIceCandidates.set(fromPeerId, []);
            }
            this.pendingIceCandidates.get(fromPeerId)!.push(candidateInit);
          }
        } else {
          log('ICE', '⏳ Queuing ICE candidate - no media connection yet', {
            peerId: fromPeerId,
            hasMediaConn: this.mediaConnections.has(fromPeerId),
            hasPendingMediaConn: this.pendingMediaConnections.has(fromPeerId)
          });
          // Queue for later when media connection is established
          if (!this.pendingIceCandidates.has(fromPeerId)) {
            this.pendingIceCandidates.set(fromPeerId, []);
          }
          this.pendingIceCandidates.get(fromPeerId)!.push(candidateInit);
        }
        break;

      default:
        // Forward other messages to the application
        this.onMessageCallback?.(message);
        break;
    }
  }

  /**
   * Envoyer un message à un pair spécifique
   */
  sendMessage(peerId: string, message: P2PMessage) {
    const conn = this.dataConnections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }

  /**
   * Diffuser un message à tous les pairs
   */
  broadcast(message: P2PMessage, excludePeerId?: string) {
    this.dataConnections.forEach((conn, peerId) => {
      if (conn.open && peerId !== excludePeerId) {
        conn.send(message);
      }
    });
  }

  /**
   * Gérer la déconnexion d'un pair
   */
  private handlePeerDisconnection(peerId: string) {
    log('DISC', 'Handling peer disconnection', { peerId });
    
    // Close and clean up data connection
    const dataConn = this.dataConnections.get(peerId);
    if (dataConn) {
      try {
        dataConn.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    // Close and clean up media connection
    const mediaConn = this.mediaConnections.get(peerId);
    if (mediaConn) {
      try {
        mediaConn.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    // Close pending media connection
    const pendingMediaConn = this.pendingMediaConnections.get(peerId);
    if (pendingMediaConn) {
      try {
        pendingMediaConn.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    // Clean up pending ICE candidates
    this.pendingIceCandidates.delete(peerId);
    
    // Clean up audio analyser
    this.removeAudioAnalyser(peerId);
    
    // Remove from all maps
    this.dataConnections.delete(peerId);
    this.mediaConnections.delete(peerId);
    this.pendingMediaConnections.delete(peerId);
    this.peers.delete(peerId);
    this.connectionStates.delete(peerId);
    this.iceConnectionStates.delete(peerId);
    this.reconnectAttempts.delete(peerId);
    this.iceRestartAttempts.delete(peerId);
    this.connectionStats.delete(peerId);

    // Notify others of disconnection if host
    if (this.isHost) {
      this.broadcast({
        type: 'peer-left',
        data: { peerId },
        senderId: this.myId,
        timestamp: Date.now(),
      });
    }

    this.onPeerDisconnectedCallback?.(peerId);
  }

  /**
   * Tenter de se reconnecter à un pair avec exponential backoff
   */
  private attemptReconnect(peerId: string, localStream: MediaStream | null) {
    const attempts = this.reconnectAttempts.get(peerId) || 0;
    log('RECONN', 'Attempting reconnection', { peerId, attempt: attempts + 1, maxAttempts: this.maxReconnectAttempts });

    if (attempts < this.maxReconnectAttempts) {
      // Use exponential backoff delays
      const delay = RECONNECT_DELAYS[Math.min(attempts, RECONNECT_DELAYS.length - 1)];
      
      this.reconnectAttempts.set(peerId, attempts + 1);
      this.setConnectionState(peerId, ConnectionState.RECONNECTING);

      setTimeout(async () => {
        const existingConn = this.dataConnections.get(peerId);
        if (!existingConn || !existingConn.open) {
          log('RECONN', 'Cleaning up and reconnecting', { peerId });
          
          // Clean up old connections
          if (existingConn) {
            try {
              existingConn.close();
            } catch (e) {
              // Ignore
            }
          }
          
          const mediaConn = this.mediaConnections.get(peerId);
          if (mediaConn) {
            try {
              mediaConn.close();
            } catch (e) {
              // Ignore
            }
          }
          
          this.dataConnections.delete(peerId);
          this.mediaConnections.delete(peerId);
          this.pendingMediaConnections.delete(peerId);
          
          try {
            await this.connectToPeer(peerId, localStream || this.localStream);
            log('RECONN', 'Reconnection successful', { peerId });
          } catch (error) {
            log('RECONN', 'Reconnection failed', { peerId, error: (error as Error).message });
            // Will retry on next attempt
          }
        } else {
          log('RECONN', 'Connection already restored', { peerId });
        }
      }, delay);
    } else {
      log('RECONN', 'Max reconnection attempts reached', { peerId });
      this.setConnectionState(peerId, ConnectionState.FAILED);
      this.handlePeerDisconnection(peerId);
    }
  }

  /**
   * Définir les callbacks
   */
  onPeerConnected(callback: (peerId: string, peerInfo: PeerInfo) => void) {
    this.onPeerConnectedCallback = callback;
  }

  onPeerDisconnected(callback: (peerId: string) => void) {
    this.onPeerDisconnectedCallback = callback;
  }

  onMessage(callback: (message: P2PMessage) => void) {
    this.onMessageCallback = callback;
  }

  onStream(callback: (peerId: string, stream: MediaStream) => void) {
    this.onStreamCallback = callback;
  }

  /**
   * Set callback for connection state changes
   */
  onConnectionStateChange(callback: (peerId: string, state: ConnectionState) => void) {
    this.onConnectionStateChangeCallback = callback;
  }

  /**
   * Set callback for ICE connection state changes
   */
  onICEStateChange(callback: (peerId: string, state: ICEConnectionState) => void) {
    this.onICEStateChangeCallback = callback;
  }

  /**
   * Set callback for room full event
   */
  onRoomFull(callback: () => void) {
    this.onRoomFullCallback = callback;
  }

  /**
   * Set callback for audio level changes
   */
  onAudioLevel(callback: (peerId: string, level: number) => void) {
    this.onAudioLevelCallback = callback;
  }

  /**
   * Set callback for connection quality changes
   */
  onConnectionQuality(callback: (peerId: string, quality: ConnectionQuality) => void) {
    this.onConnectionQualityCallback = callback;
  }

  /**
   * Set callback for track unmuted events
   * This is called when a video track is unmuted (data starts flowing again)
   * Useful for updating React state when replaceTrack() is used
   */
  onTrackUnmuted(callback: (peerId: string, stream: MediaStream) => void) {
    this.onTrackUnmutedCallback = callback;
  }

  /**
   * Obtenir les pairs connectés
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  /**
   * Obtenir le nombre de pairs connectés
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Get max participants limit
   */
  getMaxParticipants(): number {
    return MAX_PARTICIPANTS;
  }

  /**
   * Get ICE connection state for a peer
   */
  getICEConnectionState(peerId: string): ICEConnectionState | undefined {
    return this.iceConnectionStates.get(peerId);
  }

  /**
   * Force reconnect to a specific peer
   */
  async forceReconnect(peerId: string): Promise<boolean> {
    log('RECONN', 'Force reconnect requested', { peerId });
    
    // Reset reconnect attempts
    this.reconnectAttempts.delete(peerId);
    this.iceRestartAttempts.delete(peerId);
    
    // Clean up existing connections
    this.handlePeerDisconnection(peerId);
    
    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try to reconnect
    try {
      await this.connectToPeer(peerId, this.localStream);
      return true;
    } catch (error) {
      log('RECONN', 'Force reconnect failed', { peerId, error: (error as Error).message });
      return false;
    }
  }

  /**
   * Nettoyer et fermer toutes les connexions
   */
  destroy() {
    log('DESTROY', 'Destroying P2PManager');
    
    // Stop monitoring
    this.stopQualityMonitoring();
    this.stopAudioLevelMonitoring();

    // Clean up audio analysers
    for (const [peerId] of this.audioAnalysers) {
      this.removeAudioAnalyser(peerId);
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Close all data connections
    this.dataConnections.forEach((conn, peerId) => {
      log('DESTROY', 'Closing data connection', { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });
    
    // Close all media connections
    this.mediaConnections.forEach((conn, peerId) => {
      log('DESTROY', 'Closing media connection', { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });
    
    // Close pending media connections
    this.pendingMediaConnections.forEach((conn, peerId) => {
      log('DESTROY', 'Closing pending media connection', { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });
    
    // Destroy peer
    if (this.peer) {
      log('DESTROY', 'Destroying peer');
      this.peer.destroy();
    }

    // Clear all maps
    this.dataConnections.clear();
    this.mediaConnections.clear();
    this.pendingMediaConnections.clear();
    this.peers.clear();
    this.reconnectAttempts.clear();
    this.iceRestartAttempts.clear();
    this.connectionStates.clear();
    this.iceConnectionStates.clear();
    this.connectionStats.clear();
    this.audioAnalysers.clear();
    this.audioSources.clear();
    this.localStream = null;
    
    log('DESTROY', 'P2PManager destroyed');
  }
}
