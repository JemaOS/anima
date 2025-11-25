import Peer, { DataConnection, MediaConnection } from 'peerjs';

export interface PeerInfo {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface P2PMessage {
  type: 'peer-list' | 'peer-joined' | 'peer-left' | 'peer-info' | 'chat-message' | 'media-state' | 'hand-raised' | 'hand-lowered' | 'room-full' | 'stream-ready';
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

// Debug logging helper
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

  constructor() {
    log('INIT', 'P2PManager instance created');
  }

  /**
   * Initialiser le peer avec PeerJS
   * Uses multiple reliable TURN servers for better connectivity
   */
  async initialize(peerId: string, isHost: boolean): Promise<string> {
    this.isHost = isHost;
    log('INIT', `Initializing peer as ${isHost ? 'HOST' : 'PARTICIPANT'}`, { peerId });

    return new Promise((resolve, reject) => {
      // Timeout for peer initialization
      const initTimeout = setTimeout(() => {
        log('INIT', 'Peer initialization timeout');
        reject(new Error('Peer initialization timeout'));
      }, 15000);

      this.peer = new Peer(peerId, {
        debug: DEBUG ? 2 : 0, // Enable PeerJS debug logging
        config: {
          iceServers: [
            // Primary STUN servers (Google - highly reliable)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Twilio STUN (backup)
            { urls: 'stun:global.stun.twilio.com:3478' },
            // Metered.ca TURN servers (free tier - more reliable than openrelay)
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
            // OpenRelay TURN servers (backup)
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
          iceTransportPolicy: 'all', // Use both STUN and TURN
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
        log('ERROR', 'Peer error', { error: error.type, message: (error as any).message });
        
        // Handle specific error types
        if ((error as any).type === 'unavailable-id') {
          // ID is taken, try with a modified ID
          log('ERROR', 'Peer ID unavailable, this may indicate the peer is already connected');
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

    log('JOIN', 'Attempting to join room', { hostPeerId, userName, hasStream: !!localStream });

    // Store local stream for later use
    if (localStream) {
      this.localStream = localStream;
    }

    // Retry logic for connection
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log('JOIN', `Connection attempt ${attempt}/${maxRetries}`);
        
        // Connect to host and wait for connection to be established
        await this.connectToPeer(hostPeerId, localStream);
        
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify connection is actually open
        const dataConn = this.dataConnections.get(hostPeerId);
        if (!dataConn || !dataConn.open) {
          throw new Error('Data connection not established');
        }
        
        // Now that connection is open, send our info to host
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

        log('JOIN', 'Successfully joined room');
        return true;
      } catch (error) {
        lastError = error as Error;
        log('JOIN', `Attempt ${attempt} failed`, { error: (error as Error).message });
        
        // Clean up failed connection before retry
        this.dataConnections.delete(hostPeerId);
        this.mediaConnections.delete(hostPeerId);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    log('JOIN', 'All connection attempts failed', { lastError: lastError?.message });
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
        
        // Now initiate media connection
        this.initiateMediaConnection(peerId, localStream);
        
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
   */
  private initiateMediaConnection(peerId: string, localStream: MediaStream | null): void {
    if (!this.peer) {
      log('MEDIA', 'Cannot initiate media - no peer instance');
      return;
    }

    // Use provided stream or stored local stream
    const streamToUse = localStream || this.localStream;
    
    // If no stream available, create a placeholder and notify when ready
    if (!streamToUse || streamToUse.getTracks().length === 0) {
      log('MEDIA', 'No local stream available, will connect when stream is ready', { peerId });
      return;
    }

    // Check if already have media connection
    if (this.mediaConnections.has(peerId)) {
      log('MEDIA', 'Media connection already exists', { peerId });
      return;
    }

    log('MEDIA', 'Initiating media call', {
      peerId,
      audioTracks: streamToUse.getAudioTracks().length,
      videoTracks: streamToUse.getVideoTracks().length
    });

    const mediaConn = this.peer.call(peerId, streamToUse);
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
    }

    mediaConn.on('stream', (remoteStream) => {
      log('MEDIA', 'Received remote stream', {
        peerId,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTracks: remoteStream.getVideoTracks().length
      });
      
      // Move from pending to active
      this.pendingMediaConnections.delete(peerId);
      this.mediaConnections.set(peerId, mediaConn);
      
      // Ensure audio tracks are enabled
      remoteStream.getAudioTracks().forEach(track => {
        log('MEDIA', 'Remote audio track state', {
          peerId,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
        // Force enable audio track
        track.enabled = true;
      });
      
      this.onStreamCallback?.(peerId, remoteStream);
    });

    mediaConn.on('error', (error) => {
      log('MEDIA', 'Media connection error', { peerId, error: (error as any).message || error });
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
          log('ICE', 'ICE connection successful', { peerId });
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

    // Monitor ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        log('ICE', 'New ICE candidate', {
          peerId,
          type: event.candidate.type,
          protocol: event.candidate.protocol
        });
      } else {
        log('ICE', 'ICE gathering complete', { peerId });
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
    log('CONN', 'Handling incoming data connection', { peerId });

    // Check if room is full (host only)
    if (this.isHost && this.isRoomFull()) {
      log('CONN', 'Room is full, rejecting connection', { peerId, currentCount: this.peers.size });
      
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

    dataConn.on('open', () => {
      log('CONN', 'Incoming data connection opened', { peerId });
      this.setConnectionState(peerId, ConnectionState.CONNECTED);

      // If host, send list of existing participants
      if (this.isHost) {
        const peerList = Array.from(this.peers.values());
        log('CONN', 'Sending peer list to new participant', { peerId, peerCount: peerList.length });
        this.sendMessage(peerId, {
          type: 'peer-list',
          data: peerList,
          senderId: this.myId,
          timestamp: Date.now(),
        });
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
   */
  private handleIncomingCall(mediaConn: MediaConnection) {
    const peerId = mediaConn.peer;
    log('MEDIA', 'Handling incoming call', { peerId, hasLocalStream: !!this.localStream });

    // If we have a local stream, answer with it
    if (this.localStream && this.localStream.getTracks().length > 0) {
      log('MEDIA', 'Answering call with local stream', {
        peerId,
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length
      });
      mediaConn.answer(this.localStream);
    } else {
      // Create a temporary empty stream and answer
      // We'll update the tracks when local stream becomes available
      log('MEDIA', 'Answering call with empty stream (will update later)', { peerId });
      const emptyStream = new MediaStream();
      mediaConn.answer(emptyStream);
      
      // Store this connection so we can update it later
      this.pendingMediaConnections.set(peerId, mediaConn);
    }

    // Setup ICE monitoring
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      this.setupICEMonitoring(pc, peerId);
    }

    mediaConn.on('stream', (remoteStream) => {
      log('MEDIA', 'Received stream from incoming call', {
        peerId,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTracks: remoteStream.getVideoTracks().length
      });
      
      this.pendingMediaConnections.delete(peerId);
      this.mediaConnections.set(peerId, mediaConn);
      
      // Ensure audio tracks are enabled
      remoteStream.getAudioTracks().forEach(track => {
        log('MEDIA', 'Enabling remote audio track', { peerId, trackId: track.id });
        track.enabled = true;
      });
      
      this.onStreamCallback?.(peerId, remoteStream);
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
    
    log('STREAM', 'Updating local stream', {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      hadPreviousStream: !!previousStream
    });

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

    log('STREAM', 'Updating tracks for peer', {
      peerId,
      hasVideo: !!videoTrack,
      hasAudio: !!audioTrack,
      senderCount: senders.length
    });

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
      // Replace existing tracks
      if (videoTrack) {
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(videoTrack).then(() => {
            log('STREAM', 'Replaced video track', { peerId });
          }).catch(error => {
            log('STREAM', 'Error replacing video track', { peerId, error: (error as Error).message });
            // Try adding instead
            try {
              pc.addTrack(videoTrack, stream);
            } catch (e) {
              log('STREAM', 'Error adding video track as fallback', { peerId });
            }
          });
        } else {
          try {
            pc.addTrack(videoTrack, stream);
            log('STREAM', 'Added new video track (no existing sender)', { peerId });
          } catch (error) {
            log('STREAM', 'Error adding video track', { peerId, error: (error as Error).message });
          }
        }
      }

      if (audioTrack) {
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(audioTrack).then(() => {
            log('STREAM', 'Replaced audio track', { peerId });
          }).catch(error => {
            log('STREAM', 'Error replacing audio track', { peerId, error: (error as Error).message });
            // Try adding instead
            try {
              pc.addTrack(audioTrack, stream);
            } catch (e) {
              log('STREAM', 'Error adding audio track as fallback', { peerId });
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
          
          if (preferredCodecs.length > 0 && transceiver.setCodecPreferences) {
            transceiver.setCodecPreferences(preferredCodecs);
          }
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
    log('MSG', `Received message: ${message.type}`, { from: fromPeerId });
    
    switch (message.type) {
      case 'room-full':
        log('MSG', 'Room is full');
        this.onRoomFullCallback?.();
        this.handlePeerDisconnection(fromPeerId);
        break;

      case 'peer-info':
        log('MSG', 'Received peer info', { name: message.data.name, hasStream: message.data.hasStream });
        
        // Register the peer
        this.peers.set(fromPeerId, {
          id: fromPeerId,
          name: message.data.name,
          isHost: message.data.isHost || false,
          joinedAt: Date.now(),
        });

        // If host, notify all other participants AND initiate media call
        if (this.isHost) {
          const peerJoinedMessage: P2PMessage = {
            type: 'peer-joined',
            data: this.peers.get(fromPeerId),
            senderId: this.myId,
            timestamp: Date.now(),
          };

          this.broadcast(peerJoinedMessage, fromPeerId);

          // Host initiates media call to the new participant
          // This ensures bidirectional media flow
          if (this.localStream && this.peer && !this.mediaConnections.has(fromPeerId) && !this.pendingMediaConnections.has(fromPeerId)) {
            log('MSG', 'Host initiating media call to new participant', { peerId: fromPeerId });
            setTimeout(() => {
              this.callPeer(fromPeerId);
            }, 500);
          }
        }

        this.onPeerConnectedCallback?.(fromPeerId, message.data);
        break;

      case 'peer-list':
        // Receive participant list and connect to them
        const peerList = message.data as PeerInfo[];
        log('MSG', 'Received peer list', { count: peerList.length });
        
        peerList.forEach((peer) => {
          if (peer.id !== this.myId) {
            // Add peer to our internal list
            this.peers.set(peer.id, peer);
            
            // Notify callback that this peer is connected (for UI update)
            this.onPeerConnectedCallback?.(peer.id, peer);
            
            // Connect to other participants (not the host we're already connected to)
            if (peer.id !== fromPeerId && !this.dataConnections.has(peer.id)) {
              log('MSG', 'Connecting to peer from list', { peerId: peer.id });
              setTimeout(() => this.connectToPeer(peer.id, this.localStream), 500);
            }
          }
        });
        break;

      case 'peer-joined':
        // A new participant joined
        const newPeer = message.data as PeerInfo;
        log('MSG', 'New peer joined', { peerId: newPeer.id, name: newPeer.name });
        
        if (newPeer.id !== this.myId && !this.dataConnections.has(newPeer.id)) {
          this.peers.set(newPeer.id, newPeer);
          // Connect to new participant with local stream
          setTimeout(() => this.connectToPeer(newPeer.id, this.localStream), 500);
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
        if (!this.mediaConnections.has(fromPeerId) && !this.pendingMediaConnections.has(fromPeerId)) {
          if (this.localStream) {
            log('MSG', 'Initiating media connection after stream-ready', { peerId: fromPeerId });
            this.initiateMediaConnection(fromPeerId, this.localStream);
          }
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
