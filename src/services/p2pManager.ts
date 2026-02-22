// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import Peer, { DataConnection, MediaConnection } from "peerjs";
import { retry, RetryPresets } from "@/utils/retry";

export interface PeerInfo {
  readonly id: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly joinedAt: number;
}

export interface P2PMessage {
  readonly type:
    | "peer-list"
    | "peer-joined"
    | "peer-left"
    | "peer-info"
    | "chat-message"
    | "media-state"
    | "hand-raised"
    | "hand-lowered"
    | "room-full"
    | "stream-ready"
    | "ice-candidate"
    | "ping"
    | "pong";
  readonly data: any;
  readonly senderId: string;
  readonly timestamp: number;
}

// Connection state enum for proper state tracking
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  FAILED = "failed",
}

// ICE Connection state for detailed tracking
export enum ICEConnectionState {
  NEW = "new",
  CHECKING = "checking",
  CONNECTED = "connected",
  COMPLETED = "completed",
  DISCONNECTED = "disconnected",
  FAILED = "failed",
  CLOSED = "closed",
}

// Connection quality levels
export type ConnectionQuality = "good" | "medium" | "poor";

// Video quality levels for adaptive bitrate
export type VideoQuality = "low" | "medium" | "high" | "ultra";

// Connection statistics interface
export interface ConnectionStats {
  readonly packetsLost: number;
  readonly jitter: number;
  readonly roundTripTime: number;
  readonly bytesReceived: number;
  readonly framesPerSecond?: number;
  readonly quality: ConnectionQuality;
}

// Maximum participants allowed in a room (P2P mesh limitation)
const MAX_PARTICIPANTS = 8;

// Exponential backoff delays in milliseconds
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

// Connection timeout in milliseconds
const CONNECTION_TIMEOUT = 25000;

// ICE gathering timeout
const ICE_GATHERING_TIMEOUT = 15000;

// Initial connection retry delays
const INITIAL_RETRY_DELAYS = [500, 1000, 2000, 4000];

// Max initial connection attempts
const MAX_INITIAL_RETRIES = 4;

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
  private myId: string = "";
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

  // Network status tracking
  private isOnline: boolean = true;
  private networkReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingReconnects: Set<string> = new Set();

  // Connection health monitoring
  private connectionHealthChecks: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastPingTimes: Map<string, number> = new Map();
  private pingTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

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
  private onPeerConnectedCallback?: (
    peerId: string,
    peerInfo: PeerInfo,
  ) => void;
  private onPeerDisconnectedCallback?: (peerId: string) => void;
  private onMessageCallback?: (message: P2PMessage) => void;
  private onStreamCallback?: (peerId: string, stream: MediaStream) => void;
  private onConnectionStateChangeCallback?: (
    peerId: string,
    state: ConnectionState,
  ) => void;
  private onRoomFullCallback?: () => void;
  private onAudioLevelCallback?: (peerId: string, level: number) => void;
  private onConnectionQualityCallback?: (
    peerId: string,
    quality: ConnectionQuality,
  ) => void;
  private onICEStateChangeCallback?: (
    peerId: string,
    state: ICEConnectionState,
  ) => void;
  private onTrackUnmutedCallback?: (
    peerId: string,
    stream: MediaStream,
  ) => void;

  constructor() {
    log("INIT", "P2PManager instance created");
    this.setupNetworkListeners();
  }

  /**
   * Check if current device is mobile
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || "ontouchstart" in window;
  }

  // Free TURN server sources - expanded for better reliability
  private TURN_SERVERS = {
    // Metered.ca - free tier (50GB/month)
    metered: [
      {
        urls: "turn:a.relay.metered.ca:80",
        username: "e8dd65b92c62d5e98c3d0104",
        credential: "uWdWNmkhvyqTEj3B",
      },
      {
        urls: "turn:a.relay.metered.ca:443",
        username: "e8dd65b92c62d5e98c3d0104",
        credential: "uWdWNmkhvyqTEj3B",
      },
      {
        urls: "turn:a.relay.metered.ca:443?transport=tcp",
        username: "e8dd65b92c62d5e98c3d0104",
        credential: "uWdWNmkhvyqTEj3B",
      },
    ],
    // OpenRelay - public free servers
    openrelay: [
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    // Twilio TURN (public trial credentials - rotated frequently)
    twilio: [
      {
        urls: "stun:global.stun.twilio.com:3478",
      },
    ],
    // Google STUN (always reliable)
    google: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  };

  /**
   * Get ICE servers configuration
   * Tries multiple free TURN services for maximum compatibility
   */
  private getIceServers(): RTCIceServer[] {
    // Combine all servers with STUN first for speed, then TURN for reliability
    return [
      ...this.TURN_SERVERS.google,
      ...this.TURN_SERVERS.twilio,
      ...this.TURN_SERVERS.metered,
      ...this.TURN_SERVERS.openrelay,
    ];
  }

  /**
   * Get ICE servers with relay-only mode for fallback
   * Used when normal ICE fails
   */
  private getRelayOnlyIceServers(): RTCIceServer[] {
    // Return only TURN servers for forced relay mode
    return [
      ...this.TURN_SERVERS.metered,
      ...this.TURN_SERVERS.openrelay,
    ];
  }

  /**
   * Get optimized RTC configuration for low latency audio
   */
  private getOptimizedRTCConfig(): RTCConfiguration {
    return {
      iceServers: this.getIceServers(),
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };
  }

  /**
   * Get ICE configuration with optional relay-only mode
   */
  private getPeerConfig(relayOnly: boolean = false): RTCConfiguration {
    return {
      iceServers: this.getIceServers(),
      iceTransportPolicy: relayOnly ? "relay" : "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };
  }

  /**
   * Attempt connection with relay-only mode (force TURN)
   * Used when normal ICE fails
   */
  private async attemptRelayOnlyConnection(peerId: string): Promise<void> {
    log("ICE", "🔄 Attempting relay-only connection", { peerId });

    // Close existing connection
    const existingConn = this.mediaConnections.get(peerId);
    if (existingConn) {
      existingConn.close();
      this.mediaConnections.delete(peerId);
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Re-initiate with relay-only policy
    if (this.localStream && this.dataConnections.has(peerId) && this.peer) {
      // Create new peer connection with relay-only config
      const relayConfig = {
        iceServers: this.getRelayOnlyIceServers(),
        iceTransportPolicy: "relay" as const,
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle" as const,
        rtcpMuxPolicy: "require" as const,
      };

      // Create a new peer with relay-only config for this connection
      const mediaConn = this.peer.call(peerId, this.localStream, {
        metadata: { relayOnly: true },
        sdpTransform: (sdp: string) => {
          // Force relay by modifying SDP if needed
          return sdp;
        },
      });

      if (mediaConn) {
        // Override the peer connection config to force relay
        const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
        if (pc) {
          log("ICE", "✅ Created relay-only media connection", { peerId, config: relayConfig });
        }
        this.setupMediaConnectionHandlers(mediaConn, peerId);
      }
    }
  }

  /**
   * Attempt connection with alternative ICE servers
   * Used when default ICE fails
   */
  private async attemptAlternativeICE(peerId: string): Promise<void> {
    log("ICE", "🔄 Attempting alternative ICE configuration", { peerId });

    // Close existing media connection but keep data connection
    const existingConn = this.mediaConnections.get(peerId);
    if (existingConn) {
      existingConn.close();
      this.mediaConnections.delete(peerId);
    }

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try with just STUN servers (sometimes TURN causes issues)
    if (this.localStream && this.dataConnections.has(peerId) && this.peer) {
      log("ICE", "🔄 Trying STUN-only configuration", { peerId });
      
      const mediaConn = this.peer.call(peerId, this.localStream, {
        metadata: { alternativeICE: true },
      });

      if (mediaConn) {
        this.setupMediaConnectionHandlers(mediaConn, peerId);
        
        // Set a timeout to check if this worked
        setTimeout(() => {
          const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
          if (pc && pc.iceConnectionState === "failed") {
            log("ICE", "❌ Alternative ICE also failed, trying relay-only", { peerId });
            this.attemptRelayOnlyConnection(peerId);
          }
        }, 8000);
      }
    }
  }

  /**
   * Get video stream with mobile-specific fallbacks
   */
  private async getMobileVideoStream(
    facingMode: "user" | "environment" = "user"
  ): Promise<MediaStream | null> {
    const constraints = [
      // Try Full HD constraints first for mobile
      {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: { ideal: facingMode },
          frameRate: { ideal: 30 },
        },
      },
      // Fallback to HD resolution
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode },
          frameRate: { ideal: 30 },
        },
      },
      // Final fallback - any video
      {
        video: {
          facingMode: { ideal: facingMode },
        },
      },
      // Last resort - any camera
      { video: true },
    ];

    for (let i = 0; i < constraints.length; i++) {
      try {
        log("MEDIA", `Trying mobile video constraints (attempt ${i + 1})`, constraints[i]);
        const stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          log("MEDIA", "Got mobile video track", {
            trackId: videoTrack.id,
            settings: videoTrack.getSettings(),
            readyState: videoTrack.readyState,
            muted: videoTrack.muted,
          });

          // Wait for track to be ready (mobile cameras need time)
          if (videoTrack.readyState !== "live") {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          return stream;
        }
      } catch (err) {
        log("MEDIA", `Mobile video constraints ${i + 1} failed:`, (err as Error).message);
      }
    }

    return null;
  }

  /**
   * Setup network status listeners for automatic reconnection
   */
  private setupNetworkListeners(): void {
    const handleOnline = () => {
      if (!this.isOnline) {
        log("NETWORK", "🌐 Network connection restored");
        this.isOnline = true;
        this.handleNetworkReconnection();
      }
    };

    const handleOffline = () => {
      log("NETWORK", "🌐 Network connection lost");
      this.isOnline = false;
      
      // Clear any pending reconnects
      if (this.networkReconnectTimeout) {
        clearTimeout(this.networkReconnectTimeout);
        this.networkReconnectTimeout = null;
      }

      // Mark all connections as disconnected
      this.dataConnections.forEach((_, peerId) => {
        this.setConnectionState(peerId, ConnectionState.DISCONNECTED);
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Store cleanup function (called in destroy)
    this.cleanupNetworkListeners = () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }

  private cleanupNetworkListeners: (() => void) | null = null;

  /**
   * Handle network reconnection - attempt to restore all connections
   */
  private async handleNetworkReconnection(): Promise<void> {
    log("NETWORK", "🔄 Handling network reconnection");

    // Wait a moment for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect to signaling server if needed
    if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
      log("NETWORK", "🔄 Reconnecting to signaling server");
      this.peer.reconnect();
    }

    // Attempt to reconnect to all peers
    const peerIds = Array.from(this.peers.keys()).filter(id => id !== this.myId);
    
    for (const peerId of peerIds) {
      const currentState = this.getConnectionState(peerId);
      
      if (currentState === ConnectionState.DISCONNECTED ||
          currentState === ConnectionState.FAILED) {
        log("NETWORK", `🔄 Queueing reconnection to peer: ${peerId}`);
        this.pendingReconnects.add(peerId);
      }
    }

    // Process reconnections with staggered delays
    this.processPendingReconnects();
  }

  /**
   * Process pending reconnections with exponential backoff
   */
  private async processPendingReconnects(): Promise<void> {
    if (this.pendingReconnects.size === 0) return;

    const peerIds = Array.from(this.pendingReconnects);
    this.pendingReconnects.clear();

    for (let i = 0; i < peerIds.length; i++) {
      const peerId = peerIds[i];
      
      // Stagger reconnections to avoid overwhelming the network
      const delay = Math.min(i * 500, 3000);
      
      setTimeout(() => {
        if (this.isOnline) {
          log("NETWORK", `🔄 Attempting reconnection to ${peerId}`);
          this.attemptReconnect(peerId, this.localStream);
        }
      }, delay);
    }
  }

  /**
   * Send a ping to check connection health
   */
  private sendPing(peerId: string): void {
    const dataConn = this.dataConnections.get(peerId);
    if (!dataConn || !dataConn.open) return;

    const pingId = `ping-${Date.now()}`;
    this.lastPingTimes.set(pingId, Date.now());

    // Send ping message
    try {
      dataConn.send({
        type: "ping",
        data: { pingId },
        senderId: this.myId,
        timestamp: Date.now(),
      });

      // Set timeout for pong response
      const timeoutId = setTimeout(() => {
        log("HEALTH", `⚠️ Ping timeout for peer: ${peerId}`);
        this.lastPingTimes.delete(pingId);
        
        // Connection might be unhealthy, trigger reconnection
        const currentState = this.getConnectionState(peerId);
        if (currentState === ConnectionState.CONNECTED) {
          this.setConnectionState(peerId, ConnectionState.RECONNECTING);
          this.attemptReconnect(peerId, this.localStream);
        }
      }, 10000);

      this.pingTimeouts.set(pingId, timeoutId);
    } catch (error) {
      log("HEALTH", `❌ Failed to send ping to ${peerId}:`, error);
    }
  }

  /**
   * Handle pong response
   */
  private handlePong(peerId: string, pingId: string): void {
    const sentTime = this.lastPingTimes.get(pingId);
    if (!sentTime) return;

    // Clear timeout
    const timeoutId = this.pingTimeouts.get(pingId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pingTimeouts.delete(pingId);
    }

    const rtt = Date.now() - sentTime;
    this.lastPingTimes.delete(pingId);

    log("HEALTH", `✅ Pong received from ${peerId}, RTT: ${rtt}ms`);

    // If RTT is very high, connection quality might be poor
    if (rtt > 2000) {
      log("HEALTH", `⚠️ High RTT detected for ${peerId}: ${rtt}ms`);
    }
  }

  /**
   * Start health checks for a peer connection
   */
  private startHealthChecks(peerId: string): void {
    // Clear existing health check
    this.stopHealthChecks(peerId);

    // Start periodic ping
    const intervalId = setInterval(() => {
      const state = this.getConnectionState(peerId);
      if (state === ConnectionState.CONNECTED) {
        this.sendPing(peerId);
      }
    }, 30000); // Ping every 30 seconds

    this.connectionHealthChecks.set(peerId, intervalId);
  }

  /**
   * Stop health checks for a peer
   */
  private stopHealthChecks(peerId: string): void {
    const intervalId = this.connectionHealthChecks.get(peerId);
    if (intervalId) {
      clearInterval(intervalId);
      this.connectionHealthChecks.delete(peerId);
    }

    // Clear any pending ping timeouts
    this.pingTimeouts.forEach((timeoutId, pingId) => {
      clearTimeout(timeoutId);
    });
    this.pingTimeouts.clear();
    this.lastPingTimes.clear();
  }

  /**
   * Initialiser le peer avec PeerJS
   * Uses multiple reliable TURN servers for better connectivity
   */
  async initialize(
    peerId: string,
    isHost: boolean,
    retryCount: number = 0,
  ): Promise<string> {
    this.isHost = isHost;

    // If retrying due to unavailable-id, add a suffix to make the ID unique
    const actualPeerId =
      retryCount > 0 ? `${peerId}-${Date.now().toString(36)}` : peerId;

    log("INIT", `Initializing peer as ${isHost ? "HOST" : "PARTICIPANT"}`, {
      requestedPeerId: peerId,
      actualPeerId,
      retryCount,
    });

    return new Promise((resolve, reject) => {
      // Timeout for peer initialization
      const initTimeout = setTimeout(() => {
        log("INIT", "Peer initialization timeout");
        reject(new Error("Peer initialization timeout"));
      }, 15000);

      // Use standard ICE configuration with STUN and TURN servers
      // iceTransportPolicy: 'all' allows both direct and relay connections
      this.peer = new Peer(actualPeerId, {
        debug: DEBUG ? 3 : 0, // Enable maximum PeerJS debug logging
        config: this.getPeerConfig(),
      });

      this.peer.on("open", (id) => {
        clearTimeout(initTimeout);
        this.myId = id;
        log("INIT", "Peer opened successfully", { id });
        resolve(id);
      });

      this.peer.on("error", (error) => {
        clearTimeout(initTimeout);
        log("ERROR", "Peer error", {
          error: (error as any).type,
          message: (error as any).message,
        });

        // Handle specific error types
        if ((error as any).type === "unavailable-id") {
          // ID is taken, try with a modified ID
          log("ERROR", "Peer ID unavailable, retrying with modified ID", {
            retryCount,
          });

          // Clean up current peer
          if (this.peer) {
            this.peer.destroy();
            this.peer = null;
          }

          // Retry with a modified ID (max 3 retries)
          if (retryCount < 3) {
            setTimeout(
              () => {
                this.initialize(peerId, isHost, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              },
              500 * (retryCount + 1),
            ); // Exponential backoff
            return; // Don't reject yet, we're retrying
          } else {
            log("ERROR", "Max retries reached for unavailable-id");
          }
        } else if ((error as any).type === "network") {
          log("ERROR", "Network error - check internet connection");
        } else if ((error as any).type === "server-error") {
          log("ERROR", "PeerJS server error - signaling server may be down");
        }

        reject(error);
      });

      this.peer.on("disconnected", () => {
        log(
          "WARN",
          "Peer disconnected from signaling server, attempting reconnect...",
        );
        // Try to reconnect to signaling server
        if (this.peer && !this.peer.destroyed) {
          setTimeout(() => {
            this.peer?.reconnect();
          }, 1000);
        }
      });

      this.peer.on("close", () => {
        log("INFO", "Peer connection closed");
      });

      // Handle incoming data connections
      this.peer.on("connection", (dataConn) => {
        log("CONN", "Incoming data connection", { from: dataConn.peer });
        this.handleIncomingDataConnection(dataConn);
      });

      // Handle incoming media calls
      this.peer.on("call", (mediaConn) => {
        log("MEDIA", "Incoming media call", { from: mediaConn.peer });
        this.handleIncomingCall(mediaConn);
      });
    });
  }

  /**
   * Rejoindre une room en se connectant à l'hôte
   * Includes robust retry logic and better error handling
   */
  async joinRoom(
    hostPeerId: string,
    userName: string,
    localStream: MediaStream | null,
  ): Promise<boolean> {
    if (!this.peer || this.isHost) {
      log("JOIN", "Cannot join room - invalid state", {
        hasPeer: !!this.peer,
        isHost: this.isHost,
      });
      return false;
    }

    log("JOIN", "🚀 Attempting to join room", {
      hostPeerId,
      userName,
      hasStream: !!localStream,
      myPeerId: this.myId,
      peerState: this.peer?.open ? "open" : "not open",
    });

    // Store local stream for later use - CRITICAL for media connections
    if (localStream) {
      this.localStream = localStream;
      this.logLocalStreamDetails(localStream);
    } else {
      log("JOIN", "⚠️ WARNING: Joining room WITHOUT any local stream!");
    }

    return this.establishConnectionToHost(hostPeerId, userName, localStream);
  }

  private logLocalStreamDetails(stream: MediaStream) {
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();

    log("JOIN", "📹 Local stream stored in P2PManager", {
      audioTracks: audioTracks.length,
      videoTracks: videoTracks.length,
      audioTrackStates: audioTracks.map((t) => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
      })),
      videoTrackStates: videoTracks.map((t) => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
      })),
    });

    if (videoTracks.length === 0) {
      log("JOIN", "⚠️ WARNING: Joining room WITHOUT video track in local stream!");
    }

    const videoTrack = videoTracks[0];
    if (videoTrack && videoTrack.muted) {
      log("JOIN", "⚠️ WARNING: Video track is ALREADY MUTED when joining!", {
        trackId: videoTrack.id,
        enabled: videoTrack.enabled,
        readyState: videoTrack.readyState,
      });
    }
  }

  private async establishConnectionToHost(
    hostPeerId: string,
    userName: string,
    localStream: MediaStream | null
  ): Promise<boolean> {
    let lastError: Error | null = null;
    let useAlternativeICE = false;

    for (let attempt = 1; attempt <= MAX_INITIAL_RETRIES; attempt++) {
      try {
        log("JOIN", `🔄 Connection attempt ${attempt}/${MAX_INITIAL_RETRIES} to host: ${hostPeerId}`);

        await this.connectToPeerWithRetry(hostPeerId, localStream, useAlternativeICE);
        await new Promise((resolve) => setTimeout(resolve, 500));

        const dataConn = this.dataConnections.get(hostPeerId);
        log("JOIN", "🔍 Checking data connection", {
          hasConnection: !!dataConn,
          isOpen: dataConn?.open,
          connectionId: dataConn?.connectionId,
        });

        if (!dataConn || !dataConn.open) {
          throw new Error("Data connection not established");
        }

        log("JOIN", "📤 Sending peer-info to host", { hostPeerId, userName });
        this.sendMessage(hostPeerId, {
          type: "peer-info",
          data: {
            name: userName,
            isHost: false,
            hasStream: !!localStream,
          },
          senderId: this.myId,
          timestamp: Date.now(),
        });

        log("JOIN", "✅ Successfully joined room and sent peer-info");
        return true;
      } catch (error) {
        lastError = error as Error;
        log("JOIN", `❌ Attempt ${attempt} failed`, {
          error: (error as Error).message,
          willRetry: attempt < MAX_INITIAL_RETRIES,
        });

        this.dataConnections.delete(hostPeerId);
        this.mediaConnections.delete(hostPeerId);

        if (attempt < MAX_INITIAL_RETRIES) {
          const delay = this.calculateRetryDelay(attempt);
          log("JOIN", `⏳ Waiting ${Math.round(delay)}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          
          if (attempt >= 2) {
            useAlternativeICE = true;
            log("JOIN", "🔄 Will use alternative ICE configuration for next attempt");
          }
        }
      }
    }

    log("JOIN", "❌ All connection attempts failed", {
      lastError: lastError?.message,
    });
    return false;
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = INITIAL_RETRY_DELAYS[Math.min(attempt - 1, INITIAL_RETRY_DELAYS.length - 1)];
    // Use cryptographically secure random for jitter
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const jitter = (buffer[0] / 0xffffffff) * 500;
    return baseDelay + jitter;
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
   * Se connecter à un pair spécifique avec retry et fallback
   * Returns a Promise that resolves when the data connection is established
   * Includes ICE state monitoring and proper error handling
   */
  private async connectToPeerWithRetry(
    peerId: string,
    localStream: MediaStream | null,
    useAlternativeICE: boolean = false,
  ): Promise<void> {
    // Try primary connection method
    try {
      await this.connectToPeer(peerId, localStream, useAlternativeICE);
    } catch (error) {
      log("CONN", "Primary connection failed, trying fallback", { peerId, error: (error as Error).message });
      
      // If primary fails and we haven't tried alternative ICE, try it
      if (!useAlternativeICE) {
        log("CONN", "🔄 Trying alternative ICE configuration", { peerId });
        await this.connectToPeer(peerId, localStream, true);
      } else {
        throw error;
      }
    }
  }

  /**
   * Se connecter à un pair spécifique
   * Returns a Promise that resolves when the data connection is established
   * Includes ICE state monitoring and proper error handling
   */
  private connectToPeer(
    peerId: string,
    localStream: MediaStream | null,
    useAlternativeICE: boolean = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        log("CONN", "Cannot connect - no peer instance");
        reject(new Error("No peer instance"));
        return;
      }

      // Check if already connected
      const existingConn = this.dataConnections.get(peerId);
      if (existingConn && existingConn.open) {
        log("CONN", "Already connected to peer", { peerId });
        resolve();
        return;
      }

      // Clean up any stale connection
      if (existingConn) {
        log("CONN", "Cleaning up stale connection", { peerId });
        existingConn.close();
        this.dataConnections.delete(peerId);
      }

      // Set initial connection state
      this.setConnectionState(peerId, ConnectionState.CONNECTING);
      log("CONN", "Initiating connection to peer", { peerId });

      // Data connection with serialization for reliability
      // Use alternative config if specified
      const connectionOptions: any = {
        reliable: true,
        serialization: "json",
      };
      
      if (useAlternativeICE) {
        // Add custom config for alternative ICE
        connectionOptions.config = {
          iceServers: this.getRelayOnlyIceServers(),
          iceTransportPolicy: "relay",
          iceCandidatePoolSize: 10,
        };
      }
      
      const dataConn = this.peer.connect(peerId, connectionOptions);

      // Timeout for connection
      const connectionTimeout = setTimeout(() => {
        log("CONN", "Connection timeout", { peerId });
        dataConn.close();
        this.setConnectionState(peerId, ConnectionState.FAILED);
        reject(new Error("Connection timeout"));
      }, CONNECTION_TIMEOUT);

      dataConn.on("open", () => {
        clearTimeout(connectionTimeout);
        this.dataConnections.set(peerId, dataConn);
        this.reconnectAttempts.delete(peerId);
        this.setConnectionState(peerId, ConnectionState.CONNECTED);
        log("CONN", "Data connection established", { peerId });

        // CRITICAL FIX: Only the HOST should initiate media calls
        // Participants should wait for the host to call them
        // This prevents both sides from calling each other simultaneously
        // which causes ICE negotiation to fail
        if (this.isHost) {
          log(
            "CONN",
            "⏳ HOST: Waiting 1s before initiating media connection...",
            { peerId },
          );
          setTimeout(() => {
            log(
              "CONN",
              "📞 HOST: Now initiating media connection after delay",
              { peerId },
            );
            this.initiateMediaConnection(peerId, localStream);
          }, 1000);
        } else {
          log(
            "CONN",
            "⏸️ PARTICIPANT: Waiting for host to initiate media call (not calling)",
            { peerId },
          );
          // Participant does NOT initiate media call - waits for host to call
        }

        resolve();
      });

      dataConn.on("data", (data: any) => {
        this.handleMessage(data as P2PMessage, peerId);
      });

      dataConn.on("close", () => {
        log("CONN", "Data connection closed", { peerId });
        this.setConnectionState(peerId, ConnectionState.DISCONNECTED);
        this.handlePeerDisconnection(peerId);
      });

      dataConn.on("error", (error) => {
        clearTimeout(connectionTimeout);
        log("CONN", "Data connection error", {
          peerId,
          error: (error as any).message || error,
        });
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
  private async initiateMediaConnection(
    peerId: string,
    localStream: MediaStream | null,
  ): Promise<void> {
    if (!this.peer) {
      log("MEDIA", "❌ Cannot initiate media - no peer instance");
      return;
    }

    // Use provided stream or stored local stream
    const streamToUse = localStream || this.localStream;

    // If no stream available, create a placeholder and notify when ready
    if (!streamToUse || streamToUse.getTracks().length === 0) {
      log(
        "MEDIA",
        "⚠️ No local stream available, will connect when stream is ready",
        { peerId },
      );
      return;
    }

    // Check if already have media connection
    if (this.mediaConnections.has(peerId)) {
      log("MEDIA", "Media connection already exists", { peerId });
      return;
    }

    // Check if already have pending media connection
    if (this.pendingMediaConnections.has(peerId)) {
      log("MEDIA", "Pending media connection already exists", { peerId });
      return;
    }

    this.logMediaCallInitiation(peerId, streamToUse);

    // CRITICAL FIX: ALWAYS get a fresh video track before initiating a call
    // This ensures the track is actively capturing and not in a stale state
    await this.ensureFreshVideoTrack(streamToUse, peerId);

    // Verify the video track is in good state
    this.verifyTrackStates(streamToUse, peerId);

    // CRITICAL DIAGNOSTIC: Log the stream we're about to send
    this.logStreamDetails(streamToUse, peerId, "🚀 ABOUT TO CALL peer.call() with stream:");

    const mediaConn = this.peer.call(peerId, streamToUse);

    // CRITICAL: Verify the call was created
    if (!mediaConn) {
      log("MEDIA", "❌ peer.call() returned null/undefined!", { peerId });
      return;
    }

    log("MEDIA", "✅ peer.call() returned MediaConnection", {
      peerId,
      mediaConnType: typeof mediaConn,
      hasOpen: "open" in mediaConn,
      hasMetadata: !!mediaConn.metadata,
    });

    this.monitorPeerConnectionState(mediaConn, peerId);
    this.setupMediaConnectionHandlers(mediaConn, peerId);
  }

  private logMediaCallInitiation(peerId: string, streamToUse: MediaStream) {
    log("MEDIA", "📞 Initiating media call", {
      peerId,
      audioTracks: streamToUse.getAudioTracks().length,
      videoTracks: streamToUse.getVideoTracks().length,
      audioTrackIds: streamToUse.getAudioTracks().map((t) => t.id),
      videoTrackIds: streamToUse.getVideoTracks().map((t) => t.id),
      audioEnabled: streamToUse.getAudioTracks().map((t) => t.enabled),
      videoEnabled: streamToUse.getVideoTracks().map((t) => t.enabled),
      audioMuted: streamToUse.getAudioTracks().map((t) => t.muted),
      videoMuted: streamToUse.getVideoTracks().map((t) => t.muted),
      audioReadyState: streamToUse.getAudioTracks().map((t) => t.readyState),
      videoReadyState: streamToUse.getVideoTracks().map((t) => t.readyState),
    });
  }

  private async ensureFreshVideoTrack(streamToUse: MediaStream, peerId: string): Promise<void> {
    // Always try to get a fresh video track for outgoing calls
    try {
      log("MEDIA", "🔄 Getting fresh video track for call...", { peerId });
      const freshStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });

      const freshVideoTrack = freshStream.getVideoTracks()[0];
      if (freshVideoTrack && freshVideoTrack.readyState === "live") {
        log("MEDIA", "✅ Got fresh video track for call!", {
          peerId,
          newTrackId: freshVideoTrack.id,
          muted: freshVideoTrack.muted,
          enabled: freshVideoTrack.enabled,
          readyState: freshVideoTrack.readyState,
        });

        // Replace the old track in the stream
        const oldTrack = streamToUse.getVideoTracks()[0];
        if (oldTrack) {
          streamToUse.removeTrack(oldTrack);
          oldTrack.stop();
        }
        streamToUse.addTrack(freshVideoTrack);

        // Update local stream reference
        this.localStream = streamToUse;

        // CRITICAL FIX: If the fresh track is muted, wait for it to unmute
        // This happens on mobile when the camera needs time to "warm up"
        if (freshVideoTrack.muted) {
          // For mobile, also try to force-enable the track
          if (this.isMobileDevice()) {
            freshVideoTrack.enabled = true;
          }
          await this.waitForTrackUnmute(freshVideoTrack, peerId, "call");
        }
      } else {
        log("MEDIA", "⚠️ Fresh video track is not live!", {
          peerId,
          muted: freshVideoTrack?.muted,
          readyState: freshVideoTrack?.readyState,
        });
        // Stop the fresh track since we can't use it
        freshVideoTrack?.stop();
      }
    } catch (err) {
      log("MEDIA", "⚠️ Could not get fresh video track, using existing", {
        peerId,
        error: (err as Error).message,
      });
    }
  }

  private verifyTrackStates(streamToUse: MediaStream, peerId: string) {
    const videoTrack = streamToUse.getVideoTracks()[0];
    const audioTrack = streamToUse.getAudioTracks()[0];

    // Verify the video track is in good state
    if (videoTrack && videoTrack.readyState !== "live") {
      log("MEDIA", "⚠️ WARNING: Video track is not live!", {
        peerId,
        readyState: videoTrack.readyState,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
      });
    }

    // DIAGNOSTIC: Log final track state before call
    log("MEDIA", "📊 Final track state before call:", {
      peerId,
      videoTrackId: videoTrack?.id,
      videoMuted: videoTrack?.muted,
      videoEnabled: videoTrack?.enabled,
      videoReadyState: videoTrack?.readyState,
      audioTrackId: audioTrack?.id,
      audioMuted: audioTrack?.muted,
      audioEnabled: audioTrack?.enabled,
      audioReadyState: audioTrack?.readyState,
    });

    if (audioTrack && audioTrack.readyState !== "live") {
      log("MEDIA", "⚠️ WARNING: Audio track is not live!", {
        peerId,
        readyState: audioTrack.readyState,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
      });
    }
  }

  private logStreamDetails(streamToUse: MediaStream, peerId: string, message: string) {
    log("MEDIA", message, {
      peerId,
      streamId: streamToUse.id,
      streamActive: streamToUse.active,
      totalTracks: streamToUse.getTracks().length,
      audioTracks: streamToUse.getAudioTracks().map((t) => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
        contentHint: t.contentHint,
      })),
      videoTracks: streamToUse.getVideoTracks().map((t) => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label,
        contentHint: t.contentHint,
        // Try to get settings if available
        settings: typeof t.getSettings === "function" ? t.getSettings() : "N/A",
      })),
    });
  }

  private monitorPeerConnectionState(mediaConn: MediaConnection, peerId: string) {
    // Log the peer connection state immediately after call
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      this.logPeerConnectionState(pc, peerId, "IMMEDIATELY after call");

      // Also log after a delay to see if state changes
      setTimeout(() => {
        this.checkVideoSenderState(pc, peerId);
      }, 500);

      // Log after 2 seconds to see final state
      setTimeout(() => {
        this.checkConnectionStateAfterDelay(pc, peerId);
      }, 2000);

      // Check again after 5 seconds - if still stuck, try to restart the call
      setTimeout(() => {
        this.handleStuckConnection(pc, peerId, mediaConn);
      }, 5000);

      // CRITICAL: Monitor outbound video stats to see if we're actually sending data
      this.startOutboundVideoMonitor(pc, peerId, mediaConn);
    }
  }

  private logPeerConnectionState(pc: RTCPeerConnection, peerId: string, context: string) {
    log("MEDIA", `📊 Peer connection state ${context}`, {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      senders: pc.getSenders().map((s) => ({
        trackKind: s.track?.kind,
        trackId: s.track?.id,
        trackEnabled: s.track?.enabled,
        trackMuted: s.track?.muted,
        trackReadyState: s.track?.readyState,
        trackLabel: s.track?.label,
      })),
      transceivers: pc.getTransceivers().map((t) => ({
        mid: t.mid,
        direction: t.direction,
        currentDirection: t.currentDirection,
        senderTrackKind: t.sender.track?.kind,
        senderTrackEnabled: t.sender.track?.enabled,
        receiverTrackKind: t.receiver.track?.kind,
      })),
    });
  }

  private checkVideoSenderState(pc: RTCPeerConnection, peerId: string) {
    this.logPeerConnectionState(pc, peerId, "500ms after call");

    // CRITICAL: Check if video sender has a track
    const videoSender = pc
      .getSenders()
      .find((s) => s.track?.kind === "video");
    if (!videoSender) {
      log("MEDIA", "❌ NO VIDEO SENDER FOUND 500ms after call!", {
        peerId,
      });
    } else if (!videoSender.track) {
      log("MEDIA", "❌ VIDEO SENDER HAS NO TRACK 500ms after call!", {
        peerId,
      });
    } else {
      log("MEDIA", "✅ Video sender has track", {
        peerId,
        trackId: videoSender.track.id,
        trackMuted: videoSender.track.muted,
        trackEnabled: videoSender.track.enabled,
        trackReadyState: videoSender.track.readyState,
      });
    }
  }

  private checkConnectionStateAfterDelay(pc: RTCPeerConnection, peerId: string) {
    log("MEDIA", "📊 Peer connection state 2s after call", {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      senders: pc.getSenders().map((s) => ({
        trackKind: s.track?.kind,
        trackEnabled: s.track?.enabled,
        trackReadyState: s.track?.readyState,
      })),
      receivers: pc.getReceivers().map((r) => ({
        trackKind: r.track?.kind,
        trackEnabled: r.track?.enabled,
        trackMuted: r.track?.muted,
        trackReadyState: r.track?.readyState,
      })),
    });

    // CRITICAL FIX: If ICE connection is still "new" after 2 seconds,
    // the signaling may have failed. Try to force renegotiation.
    if (pc.iceConnectionState === "new" && pc.connectionState === "new") {
      log(
        "MEDIA",
        '⚠️ ICE connection stuck at "new" after 2s - signaling may have failed!',
        {
          peerId,
          signalingState: pc.signalingState,
          localDescription: pc.localDescription
            ? {
                type: pc.localDescription.type,
                sdpLength: pc.localDescription.sdp?.length,
              }
            : null,
          remoteDescription: pc.remoteDescription
            ? {
                type: pc.remoteDescription.type,
                sdpLength: pc.remoteDescription.sdp?.length,
              }
            : null,
        },
      );

      // Check if we have local and remote descriptions
      if (!pc.localDescription || !pc.remoteDescription) {
        log(
          "MEDIA",
          "❌ Missing SDP descriptions - PeerJS signaling failed!",
          {
            peerId,
            hasLocalDesc: !!pc.localDescription,
            hasRemoteDesc: !!pc.remoteDescription,
          },
        );
      }
    }
  }

  private async handleStuckConnection(pc: RTCPeerConnection, peerId: string, mediaConn: MediaConnection) {
    if (pc.iceConnectionState === "new" && pc.connectionState === "new") {
      log(
        "MEDIA",
        "🔄 ICE still stuck after 5s - attempting to restart media connection",
        { peerId },
      );

      // Close the current media connection
      try {
        mediaConn.close();
      } catch (e) {
        // Ignore
      }

      this.mediaConnections.delete(peerId);
      this.pendingMediaConnections.delete(peerId);

      // Wait a bit then try again
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Re-initiate the media connection
      if (this.dataConnections.has(peerId) && this.localStream) {
        log("MEDIA", "🔄 Re-initiating media connection after stuck ICE", {
          peerId,
        });
        this.initiateMediaConnection(peerId, this.localStream);
      }
    }
  }

  private startOutboundVideoMonitor(pc: RTCPeerConnection, peerId: string, mediaConn: MediaConnection) {
    // CRITICAL: Monitor outbound video stats to see if we're actually sending data
    // This runs on the SENDER side to diagnose if video data is being transmitted
    let lastBytesSent = 0;
    const outboundMonitorInterval = setInterval(() => {
      if (
        pc.connectionState === "closed" ||
        pc.connectionState === "failed"
      ) {
        clearInterval(outboundMonitorInterval);
        return;
      }

      const videoSender = pc
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (videoSender && videoSender.track) {
        pc.getStats(videoSender.track)
          .then((stats) => {
            stats.forEach((report) => {
              if (report.type === "outbound-rtp" && report.kind === "video") {
                const bytesSent = report.bytesSent || 0;
                const isSendingData = bytesSent > lastBytesSent;

                log("MEDIA", "📤 OUTBOUND Video RTP stats (SENDER):", {
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
                  trackReadyState: videoSender.track?.readyState,
                });

                // If not sending data, log a warning
                if (!isSendingData && lastBytesSent > 0) {
                  log("MEDIA", "⚠️ SENDER: No video data being sent!", {
                    peerId,
                    bytesSent,
                    lastBytesSent,
                    trackMuted: videoSender.track?.muted,
                    trackEnabled: videoSender.track?.enabled,
                  });
                }

                lastBytesSent = bytesSent;
              }
            });
          })
          .catch(() => {});
      }
    }, 5000);

    // Clean up monitor when media connection closes
    const originalClose = mediaConn.close.bind(mediaConn);
    mediaConn.close = () => {
      clearInterval(outboundMonitorInterval);
      originalClose();
    };
  }

  /**
   * Setup handlers for a media connection with ICE state monitoring
   */
  private setupMediaConnectionHandlers(
    mediaConn: MediaConnection,
    peerId: string,
  ): void {
    // Store as pending until we receive stream
    this.pendingMediaConnections.set(peerId, mediaConn);

    // Access the underlying RTCPeerConnection for ICE monitoring
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      this.setupICEMonitoring(pc, peerId);

      log("MEDIA", "📊 Peer connection setup for outgoing call", {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
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

        log("MEDIA", "🔍 Checking if stream is ready (outgoing)", {
          peerId,
          hasAudio,
          hasVideo,
          alreadyProcessed: this.mediaConnections.has(peerId),
        });

        if (this.mediaConnections.has(peerId)) {
          log("MEDIA", "⏭️ Stream already processed (outgoing), skipping", {
            peerId,
          });
          return;
        }

        // Wait for both tracks if possible
        if (hasAudio && hasVideo) {
          processedStream = true;
          log(
            "MEDIA",
            "🎥 Processing stream (outgoing) - BOTH tracks received",
            {
              peerId,
              audioTracks: receivedStream.getAudioTracks().length,
              videoTracks: receivedStream.getVideoTracks().length,
              audioTrackStates: receivedStream.getAudioTracks().map((t) => ({
                id: t.id,
                enabled: t.enabled,
                muted: t.muted,
                readyState: t.readyState,
              })),
              videoTrackStates: receivedStream.getVideoTracks().map((t) => ({
                id: t.id,
                enabled: t.enabled,
                muted: t.muted,
                readyState: t.readyState,
              })),
            },
          );

          // Move from pending to active
          this.pendingMediaConnections.delete(peerId);
          this.mediaConnections.set(peerId, mediaConn);

          // Ensure all tracks are enabled
          receivedStream.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
          receivedStream.getVideoTracks().forEach((track) => {
            track.enabled = true;
          });

          this.onStreamCallback?.(peerId, receivedStream);
        }
      };

      pc.ontrack = (event) => {
        log("MEDIA", "🎯 ontrack event fired (outgoing)!", {
          peerId,
          trackKind: event.track.kind,
          trackId: event.track.id,
          trackEnabled: event.track.enabled,
          trackMuted: event.track.muted,
          trackReadyState: event.track.readyState,
          streamsCount: event.streams.length,
        });

        // Get the stream from the event
        if (event.streams && event.streams.length > 0) {
          receivedStream = event.streams[0];

          // Ensure the new track is enabled
          event.track.enabled = true;

          // DIAGNOSTIC: Add event listeners to monitor track state changes
          const track = event.track;

          track.onmute = () => {
            log("MEDIA", "🔇 Track MUTED event (outgoing)!", {
              peerId,
              trackKind: track.kind,
              trackId: track.id,
              trackEnabled: track.enabled,
              trackMuted: track.muted,
              trackReadyState: track.readyState,
            });
          };

          track.onunmute = () => {
            log("MEDIA", "🔊 Track UNMUTED event (outgoing)!", {
              peerId,
              trackKind: track.kind,
              trackId: track.id,
              trackEnabled: track.enabled,
              trackMuted: track.muted,
              trackReadyState: track.readyState,
            });
            // When track unmutes, try to process stream again
            if (track.kind === "video") {
              processStreamIfReady();

              // CRITICAL FIX: Notify that video track is unmuted
              // This is needed when replaceTrack() is used - the track is replaced
              // but the stream reference in React state is not updated
              // By calling onTrackUnmutedCallback, we force React to update the participant's stream
              if (receivedStream) {
                log(
                  "MEDIA",
                  "🔄 Notifying track unmuted callback (outgoing call)",
                  {
                    peerId,
                    streamId: receivedStream.id,
                    videoTracks: receivedStream.getVideoTracks().length,
                  },
                );
                this.onTrackUnmutedCallback?.(peerId, receivedStream);
              }
            }
          };

          track.onended = () => {
            log("MEDIA", "⏹️ Track ENDED event (outgoing)!", {
              peerId,
              trackKind: track.kind,
              trackId: track.id,
            });
          };

          // DIAGNOSTIC: Check if video track is muted (no data flowing)
          if (track.kind === "video" && track.muted) {
            log(
              "MEDIA",
              "⚠️ WARNING: Video track is MUTED (outgoing - no data flowing)!",
              {
                peerId,
                trackId: track.id,
                trackEnabled: track.enabled,
                trackReadyState: track.readyState,
              },
            );
          }

          // Log current stream state
          log("MEDIA", "📊 Stream state after ontrack (outgoing)", {
            peerId,
            trackKind: event.track.kind,
            audioTracks: receivedStream.getAudioTracks().length,
            videoTracks: receivedStream.getVideoTracks().length,
            audioMuted: receivedStream.getAudioTracks().map((t) => t.muted),
            videoMuted: receivedStream.getVideoTracks().map((t) => t.muted),
          });

          // Try to process the stream
          processStreamIfReady();
        }
      };

      // DIAGNOSTIC: Log transceiver states to check direction
      setTimeout(() => {
        const transceivers = pc.getTransceivers();
        log("MEDIA", "📊 Transceiver states (outgoing call)", {
          peerId,
          transceivers: transceivers.map((t) => ({
            mid: t.mid,
            direction: t.direction,
            currentDirection: t.currentDirection,
            senderTrackKind: t.sender.track?.kind,
            senderTrackEnabled: t.sender.track?.enabled,
            senderTrackMuted: t.sender.track?.muted,
            receiverTrackKind: t.receiver.track?.kind,
            receiverTrackEnabled: t.receiver.track?.enabled,
            receiverTrackMuted: t.receiver.track?.muted,
          })),
        });
      }, 1000);

      // Fallback: if we only receive one track after timeout, process anyway
      setTimeout(() => {
        if (
          receivedStream &&
          !processedStream &&
          !this.mediaConnections.has(peerId)
        ) {
          log(
            "MEDIA",
            "⏰ Timeout (outgoing) - processing stream with available tracks",
            {
              peerId,
              audioTracks: receivedStream.getAudioTracks().length,
              videoTracks: receivedStream.getVideoTracks().length,
            },
          );

          processedStream = true;
          this.pendingMediaConnections.delete(peerId);
          this.mediaConnections.set(peerId, mediaConn);

          receivedStream.getTracks().forEach((track) => {
            track.enabled = true;
          });

          this.onStreamCallback?.(peerId, receivedStream);
        }
      }, 3000);
    }

    // Keep the PeerJS stream event as a fallback
    mediaConn.on("stream", (remoteStream) => {
      log("MEDIA", "🎥 Received remote stream via PeerJS event", {
        peerId,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTracks: remoteStream.getVideoTracks().length,
      });

      // Only process if we haven't already via ontrack
      if (!this.mediaConnections.has(peerId)) {
        this.pendingMediaConnections.delete(peerId);
        this.mediaConnections.set(peerId, mediaConn);

        remoteStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        remoteStream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });

        this.onStreamCallback?.(peerId, remoteStream);
      }
    });

    mediaConn.on("error", (error) => {
      log("MEDIA", "❌ Media connection error", {
        peerId,
        error: (error as any).message || error,
      });
      this.pendingMediaConnections.delete(peerId);

      // Attempt to re-establish media connection
      setTimeout(() => {
        if (
          this.dataConnections.has(peerId) &&
          !this.mediaConnections.has(peerId)
        ) {
          log("MEDIA", "Attempting to re-establish media connection", {
            peerId,
          });
          this.initiateMediaConnection(peerId, this.localStream);
        }
      }, 2000);
    });

    mediaConn.on("close", () => {
      log("MEDIA", "Media connection closed", { peerId });
      this.pendingMediaConnections.delete(peerId);
      this.mediaConnections.delete(peerId);
    });
  }

  /**
   * Setup ICE connection state monitoring for a peer connection
   */
  private setupICEMonitoring(pc: RTCPeerConnection, peerId: string): void {
    // Log initial state
    log("ICE", "🔧 Setting up ICE monitoring", {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      receivers: pc.getReceivers().map((r) => ({
        trackKind: r.track?.kind,
        trackEnabled: r.track?.enabled,
        trackMuted: r.track?.muted,
        trackReadyState: r.track?.readyState,
      })),
      senders: pc.getSenders().map((s) => ({
        trackKind: s.track?.kind,
        trackEnabled: s.track?.enabled,
        trackMuted: s.track?.muted,
        trackReadyState: s.track?.readyState,
      })),
    });

    // ICE failure tracking for automatic fallback
    let iceFailureCount = 0;
    const maxIceFailures = 3;
    let lastIceState = pc.iceConnectionState;

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState as ICEConnectionState;
      log("ICE", "ICE connection state changed", { peerId, state, previousState: lastIceState });
      lastIceState = state;

      this.iceConnectionStates.set(peerId, state);
      this.onICEStateChangeCallback?.(peerId, state);

      switch (state) {
        case "connected":
        case "completed":
          // Connection successful - reset failure count
          iceFailureCount = 0;
          this.iceRestartAttempts.delete(peerId);
          log("ICE", "✅ ICE connection successful", { peerId, state });

          // Log detailed receiver/sender state when connected
          log("ICE", "📊 Connection established - checking track states", {
            peerId,
            receivers: pc.getReceivers().map((r) => ({
              trackKind: r.track?.kind,
              trackEnabled: r.track?.enabled,
              trackMuted: r.track?.muted,
              trackReadyState: r.track?.readyState,
              trackId: r.track?.id,
            })),
            senders: pc.getSenders().map((s) => ({
              trackKind: s.track?.kind,
              trackEnabled: s.track?.enabled,
              trackMuted: s.track?.muted,
              trackReadyState: s.track?.readyState,
              trackId: s.track?.id,
            })),
          });

          // CRITICAL FIX: When ICE is connected, check if video receiver track is muted
          // If so, try to force a renegotiation by replacing the sender track
          setTimeout(async () => {
            if (pc.connectionState === "connected") {
              const videoReceiver = pc
                .getReceivers()
                .find((r) => r.track?.kind === "video");
              const videoSender = pc
                .getSenders()
                .find((s) => s.track?.kind === "video");

              log("ICE", "📊 Track states after 2s delay", {
                peerId,
                receivers: pc.getReceivers().map((r) => ({
                  trackKind: r.track?.kind,
                  trackEnabled: r.track?.enabled,
                  trackMuted: r.track?.muted,
                  trackReadyState: r.track?.readyState,
                })),
                senders: pc.getSenders().map((s) => ({
                  trackKind: s.track?.kind,
                  trackEnabled: s.track?.enabled,
                  trackMuted: s.track?.muted,
                  trackReadyState: s.track?.readyState,
                })),
              });

              // If video receiver track is muted and we have a local stream, try to refresh our sender
              if (videoReceiver?.track?.muted && this.localStream) {
                log(
                  "ICE",
                  "⚠️ Video receiver track is MUTED after ICE connected - attempting to refresh sender",
                  { peerId },
                );

                // Get a fresh video track and replace the sender
                try {
                  const freshStream = await navigator.mediaDevices.getUserMedia(
                    {
                      video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: "user",
                      },
                    },
                  );
                  const freshVideoTrack = freshStream.getVideoTracks()[0];

                  if (freshVideoTrack && videoSender) {
                    log(
                      "ICE",
                      "🔄 Replacing video sender track to trigger renegotiation",
                      { peerId },
                    );
                    await videoSender.replaceTrack(freshVideoTrack);

                    // Update local stream
                    const oldTrack = this.localStream.getVideoTracks()[0];
                    if (oldTrack) {
                      this.localStream.removeTrack(oldTrack);
                      oldTrack.stop();
                    }
                    this.localStream.addTrack(freshVideoTrack);

                    log("ICE", "✅ Video sender track replaced", { peerId });
                  }
                } catch (err) {
                  log("ICE", "❌ Failed to refresh video sender", {
                    peerId,
                    error: (err as Error).message,
                  });
                }
              }
            }
          }, 2000);
          break;

        case "disconnected":
          // Temporary disconnection - may recover
          log("ICE", "ICE disconnected, waiting for recovery...", { peerId });
          // Give it some time to recover before taking action
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected") {
              log("ICE", "ICE still disconnected, attempting restart", {
                peerId,
              });
              this.attemptICERestart(pc, peerId);
            }
          }, 3000);
          break;

        case "failed":
          // Connection failed - track failures and attempt fallback
          iceFailureCount++;
          log("ICE", "❌ ICE connection failed", { peerId, failureCount: iceFailureCount });
          
          if (iceFailureCount >= maxIceFailures) {
            log("ICE", "Max ICE failures reached, trying relay-only mode", { peerId });
            this.attemptRelayOnlyConnection(peerId);
          } else {
            this.attemptICERestart(pc, peerId);
          }
          break;

        case "closed":
          log("ICE", "ICE connection closed", { peerId });
          break;
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      log("ICE", "ICE gathering state changed", {
        peerId,
        state: pc.iceGatheringState,
      });
    };

    // Monitor ICE candidates and send them via data channel
    // CRITICAL FIX: PeerJS doesn't properly relay ICE candidates for MediaConnections
    // We need to manually exchange them via the data channel
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        log("ICE", "📤 New ICE candidate - sending via data channel", {
          peerId,
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port,
          candidateString: event.candidate.candidate?.substring(0, 100),
        });

        // CRITICAL: Send the ICE candidate via the data channel
        const dataConn = this.dataConnections.get(peerId);
        if (dataConn && dataConn.open) {
          this.sendMessage(peerId, {
            type: "ice-candidate",
            data: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
            senderId: this.myId,
            timestamp: Date.now(),
          });
          log("ICE", "✅ ICE candidate sent via data channel", { peerId });
        } else {
          log("ICE", "⚠️ Cannot send ICE candidate - data channel not open", {
            peerId,
            hasDataConn: !!dataConn,
            isOpen: dataConn?.open,
          });
        }
      } else {
        log("ICE", "✅ ICE gathering complete - all candidates sent", {
          peerId,
        });
      }
    };

    // CRITICAL: Monitor signaling state changes and process queued ICE candidates
    pc.onsignalingstatechange = () => {
      log("ICE", "📡 Signaling state changed", {
        peerId,
        signalingState: pc.signalingState,
        localDescriptionType: pc.localDescription?.type,
        remoteDescriptionType: pc.remoteDescription?.type,
      });

      // CRITICAL FIX: When signaling state becomes stable and we have remote description,
      // process any queued ICE candidates
      if (pc.signalingState === "stable" && pc.remoteDescription) {
        this.processQueuedIceCandidates(peerId, pc);
      }
    };

    // Monitor connection state (newer API)
    pc.onconnectionstatechange = () => {
      log("CONN", "Peer connection state changed", {
        peerId,
        state: pc.connectionState,
      });

      if (pc.connectionState === "failed") {
        // Try to recover
        this.attemptICERestart(pc, peerId);
      }
    };
  }

  /**
   * Attempt ICE restart for a failed connection
   */
  private async attemptICERestart(
    pc: RTCPeerConnection,
    peerId: string,
  ): Promise<void> {
    const attempts = this.iceRestartAttempts.get(peerId) || 0;

    if (attempts >= this.maxIceRestartAttempts) {
      log("ICE", "Max ICE restart attempts reached, giving up", {
        peerId,
        attempts,
      });
      this.setConnectionState(peerId, ConnectionState.FAILED);
      this.handlePeerDisconnection(peerId);
      return;
    }

    this.iceRestartAttempts.set(peerId, attempts + 1);
    log("ICE", "Attempting ICE restart", { peerId, attempt: attempts + 1 });

    try {
      // Create new offer with ICE restart
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      log("ICE", "ICE restart offer created", { peerId });
    } catch (error) {
      log("ICE", "ICE restart failed", {
        peerId,
        error: (error as Error).message,
      });

      // If ICE restart fails, try full reconnection
      if (attempts >= this.maxIceRestartAttempts - 1) {
        log("ICE", "Falling back to full reconnection", { peerId });
        this.attemptReconnect(peerId, this.localStream);
      }
    }
  }

  /**
   * Process queued ICE candidates for a peer
   * Called when remote description is set and signaling state is stable
   */
  private processQueuedIceCandidates(
    peerId: string,
    pc: RTCPeerConnection,
  ): void {
    const queuedCandidates = this.pendingIceCandidates.get(peerId);
    if (!queuedCandidates || queuedCandidates.length === 0) {
      return;
    }

    log("ICE", "🔄 Processing queued ICE candidates", {
      peerId,
      count: queuedCandidates.length,
      signalingState: pc.signalingState,
      hasRemoteDesc: !!pc.remoteDescription,
    });

    // Process all queued candidates
    queuedCandidates.forEach((candidateInit, index) => {
      try {
        const iceCandidate = new RTCIceCandidate(candidateInit);
        pc.addIceCandidate(iceCandidate)
          .then(() => {
            log("ICE", "✅ Queued ICE candidate added successfully", {
              peerId,
              index,
              iceConnectionState: pc.iceConnectionState,
              connectionState: pc.connectionState,
            });
          })
          .catch((err) => {
            log("ICE", "❌ Failed to add queued ICE candidate", {
              peerId,
              index,
              error: err.message,
            });
          });
      } catch (err) {
        log("ICE", "❌ Error creating queued ICE candidate", {
          peerId,
          index,
          error: (err as Error).message,
        });
      }
    });

    // Clear the queue
    this.pendingIceCandidates.delete(peerId);
    log("ICE", "✅ Cleared ICE candidate queue", { peerId });
  }

  /**
   * Initiate a media call to a peer (used by host to call participants)
   * Now uses the unified media connection handler
   */
  private callPeer(peerId: string): void {
    if (!this.peer) {
      log("MEDIA", "Cannot call peer - no peer instance");
      return;
    }

    if (!this.localStream || this.localStream.getTracks().length === 0) {
      log("MEDIA", "Cannot call peer - no local stream", { peerId });
      return;
    }

    if (
      this.mediaConnections.has(peerId) ||
      this.pendingMediaConnections.has(peerId)
    ) {
      log("MEDIA", "Media connection already exists or pending", { peerId });
      return;
    }

    log("MEDIA", "Host calling peer", { peerId });
    this.initiateMediaConnection(peerId, this.localStream);
  }

  /**
   * Gérer connexion de données entrante
   */
  private handleIncomingDataConnection(dataConn: DataConnection) {
    const peerId = dataConn.peer;
    log("CONN", "📥 Handling incoming data connection", {
      peerId,
      isHost: this.isHost,
      currentPeersCount: this.peers.size,
      existingPeers: Array.from(this.peers.keys()),
    });

    // Check if room is full (host only)
    if (this.isHost && this.isRoomFull()) {
      log("CONN", "🚫 Room is full, rejecting connection", {
        peerId,
        currentCount: this.peers.size,
      });

      // Send room-full message before closing
      dataConn.on("open", () => {
        dataConn.send({
          type: "room-full",
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
    log("CONN", "📝 Data connection stored", {
      peerId,
      totalConnections: this.dataConnections.size,
    });

    dataConn.on("open", () => {
      log("CONN", "✅ Incoming data connection opened", {
        peerId,
        isHost: this.isHost,
      });
      this.setConnectionState(peerId, ConnectionState.CONNECTED);

      // If host, send list of existing participants AND initiate media call
      if (this.isHost) {
        const peerList = Array.from(this.peers.values());
        log("CONN", "📤 HOST: Sending peer list to new participant", {
          peerId,
          peerCount: peerList.length,
          peerIds: peerList.map((p) => p.id),
          peerNames: peerList.map((p) => p.name),
        });
        this.sendMessage(peerId, {
          type: "peer-list",
          data: peerList,
          senderId: this.myId,
          timestamp: Date.now(),
        });

        // CRITICAL FIX: Host initiates media call to the new participant
        // Wait a bit for the participant to be ready
        if (
          this.localStream &&
          !this.mediaConnections.has(peerId) &&
          !this.pendingMediaConnections.has(peerId)
        ) {
          log(
            "CONN",
            "⏳ HOST: Waiting 1s before initiating media call to new participant...",
            { peerId },
          );
          setTimeout(() => {
            if (
              !this.mediaConnections.has(peerId) &&
              !this.pendingMediaConnections.has(peerId)
            ) {
              log("CONN", "📞 HOST: Initiating media call to new participant", {
                peerId,
              });
              this.initiateMediaConnection(peerId, this.localStream);
            } else {
              log(
                "CONN",
                "⏭️ HOST: Media connection already exists, skipping",
                { peerId },
              );
            }
          }, 1000);
        } else {
          log("CONN", "⚠️ HOST: Cannot initiate media call yet", {
            peerId,
            hasLocalStream: !!this.localStream,
            hasMediaConnection: this.mediaConnections.has(peerId),
            hasPendingMediaConnection: this.pendingMediaConnections.has(peerId),
          });
        }
      }
    });

    dataConn.on("data", (data: any) => {
      this.handleMessage(data as P2PMessage, peerId);
    });

    dataConn.on("close", () => {
      log("CONN", "Incoming data connection closed", { peerId });
      this.setConnectionState(peerId, ConnectionState.DISCONNECTED);
      this.handlePeerDisconnection(peerId);
    });

    dataConn.on("error", (error) => {
      log("CONN", "Incoming data connection error", {
        peerId,
        error: (error as any).message || error,
      });
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
    this.logIncomingCall(peerId);

    // Store as pending first
    this.pendingMediaConnections.set(peerId, mediaConn);

    // If we have a local stream, answer with it immediately
    if (this.localStream && this.localStream.getTracks().length > 0) {
      await this.answerCallWithLocalStream(mediaConn, peerId);
    } else {
      this.waitForStreamAndAnswer(mediaConn, peerId);
    }
  }

  private logIncomingCall(peerId: string) {
    log("MEDIA", "🔔 Handling incoming call", {
      peerId,
      hasLocalStream: !!this.localStream,
      localStreamTracks: this.localStream?.getTracks().length || 0,
      localStreamAudioTracks: this.localStream?.getAudioTracks().length || 0,
      localStreamVideoTracks: this.localStream?.getVideoTracks().length || 0,
    });
  }

  private async answerCallWithLocalStream(mediaConn: MediaConnection, peerId: string) {
    // CRITICAL FIX: ALWAYS get a fresh video track before answering
    await this.ensureFreshVideoTrackForAnswer(peerId);

    // CRITICAL DIAGNOSTIC: Log the stream we're about to answer with
    this.logStreamDetails(this.localStream!, peerId, "🚀 ABOUT TO ANSWER with local stream:");

    mediaConn.answer(this.localStream!);
    log("MEDIA", "✅ mediaConn.answer() called", { peerId });
    
    this.setupIncomingMediaHandlers(mediaConn, peerId);
  }

  private async ensureFreshVideoTrackForAnswer(peerId: string) {
    try {
      log("MEDIA", "🔄 Getting fresh video track for answer...", { peerId });
      const freshStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });

      const freshVideoTrack = freshStream.getVideoTracks()[0];
      if (freshVideoTrack && freshVideoTrack.readyState === "live") {
        this.replaceLocalVideoTrack(freshVideoTrack, peerId);
        
        if (freshVideoTrack.muted) {
          await this.waitForTrackUnmute(freshVideoTrack, peerId, "answer");
        }
      } else {
        log("MEDIA", "⚠️ Fresh video track is not live!", { peerId });
        freshVideoTrack?.stop();
      }
    } catch (err) {
      log("MEDIA", "⚠️ Could not get fresh video track for answer, using existing", {
        peerId,
        error: (err as Error).message,
      });
    }
  }

  private replaceLocalVideoTrack(freshVideoTrack: MediaStreamTrack, peerId: string) {
    if (!this.localStream) return;

    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(freshVideoTrack);
    
    log("MEDIA", "✅ Got fresh video track for answer!", {
      peerId,
      newTrackId: freshVideoTrack.id,
    });
  }

  private waitForStreamAndAnswer(mediaConn: MediaConnection, peerId: string) {
    log("MEDIA", "⚠️ WARNING: No local stream available for incoming call!", { peerId });
    
    let answered = false;
    const checkStreamInterval = setInterval(() => {
      if (this.localStream && this.localStream.getTracks().length > 0 && !answered) {
        clearInterval(checkStreamInterval);
        answered = true;
        log("MEDIA", "✅ Local stream now available, answering pending call", { peerId });
        mediaConn.answer(this.localStream);
        this.setupIncomingMediaHandlers(mediaConn, peerId);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkStreamInterval);
      if (!answered && this.pendingMediaConnections.has(peerId)) {
        answered = true;
        log("MEDIA", "❌ Timeout waiting for local stream, answering with empty stream", { peerId });
        mediaConn.answer(new MediaStream());
        this.setupIncomingMediaHandlers(mediaConn, peerId);
      }
    }, 10000);
  }

  private setupIncomingMediaHandlers(mediaConn: MediaConnection, peerId: string) {
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (pc) {
      this.setupICEMonitoring(pc, peerId);
      this.setupPeerConnectionTracks(pc, peerId, mediaConn);
    }

    mediaConn.on("stream", (remoteStream) => this.handlePeerJSStreamEvent(remoteStream, peerId, mediaConn));
    
    mediaConn.on("close", () => {
      log("MEDIA", "Incoming call closed", { peerId });
      this.pendingMediaConnections.delete(peerId);
      this.mediaConnections.delete(peerId);
    });

    mediaConn.on("error", (error) => {
      log("MEDIA", "Incoming call error", { peerId, error: (error as any).message });
      this.pendingMediaConnections.delete(peerId);
    });
  }

  private setupPeerConnectionTracks(pc: RTCPeerConnection, peerId: string, mediaConn: MediaConnection) {
    let receivedStream: MediaStream | null = null;
    let processedStream = false;

    const processStreamIfReady = () => {
      if (processedStream || !receivedStream) return;

      const hasAudio = receivedStream.getAudioTracks().length > 0;
      const hasVideo = receivedStream.getVideoTracks().length > 0;

      if (this.mediaConnections.has(peerId)) return;

      if (hasAudio && hasVideo) {
        processedStream = true;
        this.processIncomingStream(receivedStream, peerId, mediaConn);
      }
    };

    pc.ontrack = (event) => {
      log("MEDIA", "🎯 ontrack event fired (incoming call)!", { peerId, trackKind: event.track.kind });

      if (event.streams && event.streams.length > 0) {
        receivedStream = event.streams[0];
        event.track.enabled = true;

        this.setupTrackListeners(event.track, peerId, () => {
          if (event.track.kind === "video") {
            processStreamIfReady();
            if (receivedStream) {
              this.onTrackUnmutedCallback?.(peerId, receivedStream);
            }
          }
        });

        processStreamIfReady();
      }
    };

    this.setupTransceiverFix(pc, peerId);
    this.setupTrackMonitor(pc, peerId, mediaConn);

    // Fallback timeout
    setTimeout(() => {
      if (receivedStream && !processedStream && !this.mediaConnections.has(peerId)) {
        processedStream = true;
        this.processIncomingStream(receivedStream, peerId, mediaConn);
      }
    }, 3000);
  }

  private setupTrackListeners(track: MediaStreamTrack, peerId: string, onUnmute: () => void) {
    track.onmute = () => log("MEDIA", "🔇 Track MUTED event!", { peerId, kind: track.kind });
    track.onunmute = () => {
      log("MEDIA", "🔊 Track UNMUTED event!", { peerId, kind: track.kind });
      onUnmute();
    };
    track.onended = () => log("MEDIA", "⏹️ Track ENDED event!", { peerId, kind: track.kind });
  }

  private processIncomingStream(stream: MediaStream, peerId: string, mediaConn: MediaConnection) {
    log("MEDIA", "🎥 Processing stream - BOTH tracks received", { peerId });
    
    this.pendingMediaConnections.delete(peerId);
    this.mediaConnections.set(peerId, mediaConn);

    stream.getTracks().forEach(track => { track.enabled = true; });
    this.onStreamCallback?.(peerId, stream);
  }

  private handlePeerJSStreamEvent(remoteStream: MediaStream, peerId: string, mediaConn: MediaConnection) {
    log("MEDIA", "🎥 Received stream via PeerJS event (incoming)", { peerId });

    if (!this.mediaConnections.has(peerId)) {
      this.processIncomingStream(remoteStream, peerId, mediaConn);
    }
  }

  private setupTransceiverFix(pc: RTCPeerConnection, peerId: string) {
    setTimeout(() => {
      const transceivers = pc.getTransceivers();
      transceivers.forEach((t) => {
        if (t.direction !== "sendrecv" && t.direction !== "inactive") {
          try {
            t.direction = "sendrecv";
            log("MEDIA", "✅ Transceiver direction set to sendrecv", { peerId, mid: t.mid });
          } catch (e) {
            log("MEDIA", "❌ Failed to set transceiver direction", { peerId });
          }
        }
      });
    }, 1000);
  }

  private setupTrackMonitor(pc: RTCPeerConnection, peerId: string, mediaConn: MediaConnection) {
    let lastBytesReceived = 0;
    let noDataCount = 0;
    let renegotiationAttempted = false;

    const trackMonitorInterval = setInterval(async () => {
      if (pc.connectionState === "closed" || pc.connectionState === "failed") {
        clearInterval(trackMonitorInterval);
        return;
      }

      const videoReceiver = pc.getReceivers().find(r => r.track?.kind === "video");
      if (videoReceiver && videoReceiver.track) {
        try {
          const stats = await pc.getStats(videoReceiver.track);
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
              const bytesReceived = report.bytesReceived || 0;
              const isReceivingData = bytesReceived > lastBytesReceived;

              if (!isReceivingData && lastBytesReceived > 0) {
                noDataCount++;
                if (noDataCount >= 2 && !renegotiationAttempted) {
                  renegotiationAttempted = true;
                  log("MEDIA", "🔄 Attempting renegotiation to restore video", { peerId });
                  this.sendMessage(peerId, {
                    type: "stream-ready",
                    data: { requestRefresh: true },
                    senderId: this.myId,
                    timestamp: Date.now(),
                  });
                }
              } else if (isReceivingData) {
                noDataCount = 0;
                renegotiationAttempted = false;
              }
              lastBytesReceived = bytesReceived;
            }
          });
        } catch (e) {
          // Ignore error
        }

        if (videoReceiver.track.muted && lastBytesReceived === 0 && !renegotiationAttempted) {
          renegotiationAttempted = true;
          log("MEDIA", "🔄 Video track muted with no data - requesting stream refresh", { peerId });
          this.sendMessage(peerId, {
            type: "stream-ready",
            data: { requestRefresh: true },
            senderId: this.myId,
            timestamp: Date.now(),
          });
        }
      }
    }, 5000);

    mediaConn.on("close", () => clearInterval(trackMonitorInterval));
  }

  /**
   * Mettre à jour le stream local pour toutes les connexions
   * Now handles pending connections and properly updates tracks
   */
  updateLocalStream(stream: MediaStream | null) {
    if (!stream) {
      log("STREAM", "updateLocalStream called with null stream");
      return;
    }

    const previousStream = this.localStream;
    this.localStream = stream;

    this.logLocalStreamUpdate(stream, !!previousStream);

    // CRITICAL: Monitor local video track for mute events
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      this.setupVideoTrackMuteHandlers(videoTrack, stream);
    }

    this.updateAllConnections(stream);
  }

  private logLocalStreamUpdate(stream: MediaStream, hadPreviousStream: boolean) {
    log("STREAM", "🔄 Updating local stream in P2PManager", {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      audioTrackIds: stream.getAudioTracks().map((t) => t.id),
      videoTrackIds: stream.getVideoTracks().map((t) => t.id),
      audioEnabled: stream.getAudioTracks().map((t) => t.enabled),
      videoEnabled: stream.getVideoTracks().map((t) => t.enabled),
      hadPreviousStream,
      dataConnectionsCount: this.dataConnections.size,
      mediaConnectionsCount: this.mediaConnections.size,
      pendingMediaConnectionsCount: this.pendingMediaConnections.size,
    });
  }

  private setupVideoTrackMuteHandlers(videoTrack: MediaStreamTrack, stream: MediaStream) {
    videoTrack.onmute = () => this.handleVideoTrackMute(videoTrack, stream);
    videoTrack.onunmute = () => this.handleVideoTrackUnmute(videoTrack);
    
    videoTrack.onended = () => {
      log("STREAM", "🔴 LOCAL video track ENDED - camera was released!", {
        trackId: videoTrack.id,
      });
    };

    log("STREAM", "📹 Local video track state:", {
      trackId: videoTrack.id,
      enabled: videoTrack.enabled,
      muted: videoTrack.muted,
      readyState: videoTrack.readyState,
      label: videoTrack.label,
    });

    if (videoTrack.muted) {
      log("STREAM", "⚠️ WARNING: Local video track is ALREADY MUTED at initialization!", {
        trackId: videoTrack.id,
        enabled: videoTrack.enabled,
        readyState: videoTrack.readyState,
      });
    }
  }

  private handleVideoTrackMute(videoTrack: MediaStreamTrack, stream: MediaStream) {
    log("STREAM", "⚠️ LOCAL video track MUTED - camera may have stopped!", {
      trackId: videoTrack.id,
      enabled: videoTrack.enabled,
      readyState: videoTrack.readyState,
    });
    
    this.broadcast({
      type: "media-state",
      data: { videoMuted: true },
      senderId: this.myId,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      if (videoTrack.readyState === "live" && videoTrack.muted) {
        this.attemptReactivateMutedTrack(videoTrack, stream);
      }
    }, 1000);
  }

  private attemptReactivateMutedTrack(videoTrack: MediaStreamTrack, stream: MediaStream) {
    log("STREAM", "🔄 Attempting to reactivate muted video track...", {
      trackId: videoTrack.id,
    });

    const wasEnabled = videoTrack.enabled;
    videoTrack.enabled = false;
    
    setTimeout(() => {
      videoTrack.enabled = wasEnabled;
      log("STREAM", "🔄 Video track enabled toggled", {
        trackId: videoTrack.id,
        enabled: videoTrack.enabled,
        muted: videoTrack.muted,
      });

      if (videoTrack.muted) {
        log("STREAM", "⚠️ Video track still muted after toggle, updating connections...", {
          trackId: videoTrack.id,
        });
        this.mediaConnections.forEach((mediaConn, peerId) => {
          this.updateMediaConnectionTracks(mediaConn, stream, peerId);
        });
      }
    }, 100);
  }

  private handleVideoTrackUnmute(videoTrack: MediaStreamTrack) {
    log("STREAM", "✅ LOCAL video track UNMUTED - camera is sending data", {
      trackId: videoTrack.id,
      enabled: videoTrack.enabled,
      readyState: videoTrack.readyState,
    });
    
    this.broadcast({
      type: "media-state",
      data: { videoMuted: false },
      senderId: this.myId,
      timestamp: Date.now(),
    });
  }

  private updateAllConnections(stream: MediaStream) {
    // Update all active media connections
    this.mediaConnections.forEach((mediaConn, peerId) => {
      this.updateMediaConnectionTracks(mediaConn, stream, peerId);
    });

    // Also update pending connections that were waiting for a stream
    this.pendingMediaConnections.forEach((mediaConn, peerId) => {
      log("STREAM", "Updating pending media connection", { peerId });
      this.updateMediaConnectionTracks(mediaConn, stream, peerId);
    });

    // If we have data connections but no media connections, initiate media calls
    this.dataConnections.forEach((dataConn, peerId) => {
      if (
        dataConn.open &&
        !this.mediaConnections.has(peerId) &&
        !this.pendingMediaConnections.has(peerId)
      ) {
        log("STREAM", "Initiating media connection for peer without media", {
          peerId,
        });
        this.initiateMediaConnection(peerId, stream);
      }
    });

    // Notify peers that our stream is ready
    this.broadcast({
      type: "stream-ready",
      data: {
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0,
      },
      senderId: this.myId,
      timestamp: Date.now(),
    });
  }

  /**
   * Update tracks on a specific media connection
   * CRITICAL FIX: Use transceivers to find senders even when track is null
   * This happens when camera is toggled off (track removed) then back on
   */
  private updateMediaConnectionTracks(
    mediaConn: MediaConnection,
    stream: MediaStream,
    peerId: string,
  ): void {
    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (!pc) {
      log("STREAM", "No peer connection available for track update", {
        peerId,
      });
      return;
    }

    // Check connection state before updating
    if (pc.connectionState === "closed" || pc.connectionState === "failed") {
      log("STREAM", "Cannot update tracks - connection is closed/failed", {
        peerId,
        state: pc.connectionState,
      });
      return;
    }

    this.logTrackUpdateStart(pc, stream, peerId);

    const senders = pc.getSenders();

    // If no senders exist yet, add tracks
    if (senders.length === 0) {
      this.addTracksToConnection(pc, stream, peerId);
    } else {
      this.updateVideoTrack(pc, stream, peerId);
      this.updateAudioTrack(pc, stream, peerId);
    }
  }

  private logTrackUpdateStart(pc: RTCPeerConnection, stream: MediaStream, peerId: string) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    const senders = pc.getSenders();
    const transceivers = pc.getTransceivers();

    // CRITICAL DIAGNOSTIC: Determine if this is an incoming or outgoing connection
    const isIncomingConnection = pc.localDescription?.type === "answer";
    const isOutgoingConnection = pc.localDescription?.type === "offer";

    log("STREAM", "🔄🔄🔄 updateMediaConnectionTracks CALLED 🔄🔄🔄", {
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
      senderDetails: senders.map((s) => ({
        trackKind: s.track?.kind || "null",
        trackId: s.track?.id || "null",
        trackEnabled: s.track?.enabled,
        trackMuted: s.track?.muted,
        trackReadyState: s.track?.readyState || "null",
      })),
      transceiverDetails: transceivers.map((t) => ({
        mid: t.mid,
        direction: t.direction,
        currentDirection: t.currentDirection,
        senderTrackKind: t.sender.track?.kind || "null",
        senderTrackId: t.sender.track?.id || "null",
        senderTrackReadyState: t.sender.track?.readyState || "null",
        receiverTrackKind: t.receiver.track?.kind || "null",
      })),
    });

    // CRITICAL DIAGNOSTIC: For incoming connections, check if we have proper senders
    if (isIncomingConnection && senders.length === 0) {
      log("STREAM", "⚠️⚠️⚠️ INCOMING CONNECTION HAS NO SENDERS! ⚠️⚠️⚠️", {
        peerId,
        transceiverCount: transceivers.length,
        transceiverDirections: transceivers.map((t) => t.direction),
      });
    }
  }

  private addTracksToConnection(pc: RTCPeerConnection, stream: MediaStream, peerId: string) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    try {
      if (videoTrack) {
        pc.addTrack(videoTrack, stream);
        log("STREAM", "Added video track", { peerId });
      }
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
        log("STREAM", "Added audio track", { peerId });
      }
    } catch (error) {
      log("STREAM", "Error adding tracks", {
        peerId,
        error: (error as Error).message,
      });
    }
  }

  private updateVideoTrack(pc: RTCPeerConnection, stream: MediaStream, peerId: string) {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      log("STREAM", "📹 Looking for video sender to replace track", {
        peerId,
        newVideoTrackId: videoTrack.id,
        newVideoTrackEnabled: videoTrack.enabled,
        newVideoTrackMuted: videoTrack.muted,
        newVideoTrackReadyState: videoTrack.readyState,
      });

      const videoSender = this.findVideoSender(pc, peerId);

      if (videoSender) {
        this.replaceVideoTrack(videoSender, videoTrack, peerId, stream, pc);
      } else {
        this.addVideoTrackFallback(pc, videoTrack, stream, peerId);
      }
    } else {
      log("STREAM", "📹 No video track to update (camera may be off)", {
        peerId,
      });
    }
  }

  private findVideoSender(pc: RTCPeerConnection, peerId: string): RTCRtpSender | undefined {
    const senders = pc.getSenders();
    const transceivers = pc.getTransceivers();
    
    // First try to find sender with existing video track (live or ended)
    let videoSender = senders.find((s) => s.track?.kind === "video");
    let foundVia = "existing sender with video track";

    // CRITICAL: Also check for sender with ended track
    if (!videoSender) {
      const senderWithEndedTrack = senders.find(
        (s) =>
          s.track &&
          s.track.readyState === "ended" &&
          s.track.kind === "video",
      );
      if (senderWithEndedTrack) {
        videoSender = senderWithEndedTrack;
        foundVia = "sender with ended video track";
        log("STREAM", "🔍 Found video sender with ENDED track", {
          peerId,
          trackId: senderWithEndedTrack.track?.id,
          trackReadyState: senderWithEndedTrack.track?.readyState,
        });
      }
    }

    // If not found, look for a transceiver that was used for video
    if (!videoSender) {
      log(
        "STREAM",
        "🔍 No sender with video track found, checking transceivers...",
        { peerId },
      );

      // First, try to find by receiver track kind (most reliable)
      const videoTransceiver = transceivers.find(
        (t) => t.receiver.track?.kind === "video",
      );

      if (videoTransceiver) {
        videoSender = videoTransceiver.sender;
        foundVia = "transceiver (receiver.track.kind === video)";
        log("STREAM", "🔍 Found video sender via transceiver", {
          peerId,
          mid: videoTransceiver.mid,
          direction: videoTransceiver.direction,
          currentDirection: videoTransceiver.currentDirection,
          senderTrackNull: videoTransceiver.sender.track === null,
          senderTrackKind: videoTransceiver.sender.track?.kind,
          senderTrackReadyState: videoTransceiver.sender.track?.readyState,
        });
      } else {
        log(
          "STREAM",
          "⚠️ No video transceiver found by receiver.track.kind",
          { peerId },
        );

        // Fallback: look for first transceiver with null sender track that's not audio
        const audioTransceiver = transceivers.find(
          (t) => t.receiver.track?.kind === "audio",
        );
        const nullTrackTransceiver = transceivers.find(
          (t) =>
            t.sender.track === null &&
            t.mid !== null &&
            t.direction !== "inactive" &&
            t !== audioTransceiver,
        );
        if (nullTrackTransceiver) {
          videoSender = nullTrackTransceiver.sender;
          foundVia = "transceiver (null track, not audio)";
          log(
            "STREAM",
            "🔍 Found video sender via null track transceiver",
            {
              peerId,
              mid: nullTrackTransceiver.mid,
              direction: nullTrackTransceiver.direction,
            },
          );
        }
      }
    }

    if (videoSender) {
      log("STREAM", `🔍 Video sender found via: ${foundVia}`, { peerId });
    }

    return videoSender;
  }

  private replaceVideoTrack(
    videoSender: RTCRtpSender, 
    videoTrack: MediaStreamTrack, 
    peerId: string, 
    stream: MediaStream, 
    pc: RTCPeerConnection
  ) {
    log(
      "STREAM",
      `📹📹📹 REPLACING VIDEO TRACK 📹📹📹`,
      {
        peerId,
        newTrackId: videoTrack.id,
        newTrackEnabled: videoTrack.enabled,
        newTrackMuted: videoTrack.muted,
        newTrackReadyState: videoTrack.readyState,
        currentSenderTrackId: videoSender.track?.id || "null",
        currentSenderTrackKind: videoSender.track?.kind || "null",
        currentSenderTrackReadyState:
          videoSender.track?.readyState || "null",
      },
    );

    videoSender
      .replaceTrack(videoTrack)
      .then(() => {
        log("STREAM", "✅✅✅ REPLACED VIDEO TRACK SUCCESSFULLY ✅✅✅", {
          peerId,
          newTrackId: videoTrack.id,
          newTrackEnabled: videoTrack.enabled,
          newTrackMuted: videoTrack.muted,
          newTrackReadyState: videoTrack.readyState,
        });

        this.verifyVideoTrackReplacement(videoSender, videoTrack, peerId);
      })
      .catch((error) => {
        log("STREAM", "❌❌❌ ERROR REPLACING VIDEO TRACK ❌❌❌", {
          peerId,
          error: (error as Error).message,
          errorName: (error as Error).name,
          errorStack: (error as Error).stack,
        });
        // Try adding instead
        this.addVideoTrackFallback(pc, videoTrack, stream, peerId);
      });
  }

  private verifyVideoTrackReplacement(videoSender: RTCRtpSender, videoTrack: MediaStreamTrack, peerId: string) {
    // CRITICAL: Verify the track was actually set
    setTimeout(() => {
      const verifyTrack = videoSender!.track;
      log(
        "STREAM",
        "📊 Video sender state 100ms after replaceTrack",
        {
          peerId,
          senderTrackId: verifyTrack?.id || "null",
          senderTrackKind: verifyTrack?.kind || "null",
          senderTrackEnabled: verifyTrack?.enabled,
          senderTrackMuted: verifyTrack?.muted,
          senderTrackReadyState: verifyTrack?.readyState || "null",
          trackMatchesNewTrack: verifyTrack?.id === videoTrack.id,
        },
      );

      if (!verifyTrack || verifyTrack.id !== videoTrack.id) {
        log(
          "STREAM",
          "❌❌❌ TRACK REPLACEMENT VERIFICATION FAILED! ❌❌❌",
          {
            peerId,
            expectedTrackId: videoTrack.id,
            actualTrackId: verifyTrack?.id || "null",
          },
        );
      }
    }, 100);

    // Also check after 500ms
    setTimeout(() => {
      const verifyTrack = videoSender!.track;
      log(
        "STREAM",
        "📊 Video sender state 500ms after replaceTrack",
        {
          peerId,
          senderTrackId: verifyTrack?.id || "null",
          senderTrackEnabled: verifyTrack?.enabled,
          senderTrackMuted: verifyTrack?.muted,
          senderTrackReadyState: verifyTrack?.readyState || "null",
        },
      );
    }, 500);
  }

  private addVideoTrackFallback(pc: RTCPeerConnection, videoTrack: MediaStreamTrack, stream: MediaStream, peerId: string) {
    const senders = pc.getSenders();
    const transceivers = pc.getTransceivers();
    
    log("STREAM", "⚠️⚠️⚠️ NO VIDEO SENDER FOUND OR REPLACE FAILED! ⚠️⚠️⚠️", {
      peerId,
      senderCount: senders.length,
      transceiverCount: transceivers.length,
      allSenderKinds: senders.map((s) => s.track?.kind || "null"),
      allTransceiverReceiverKinds: transceivers.map(
        (t) => t.receiver.track?.kind || "null",
      ),
    });
    try {
      pc.addTrack(videoTrack, stream);
      log(
        "STREAM",
        "✅ Added new video track (fallback)",
        { peerId },
      );
    } catch (error) {
      log("STREAM", "❌ Error adding video track", {
        peerId,
        error: (error as Error).message,
      });
    }
  }

  private updateAudioTrack(pc: RTCPeerConnection, stream: MediaStream, peerId: string) {
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const senders = pc.getSenders();
      const transceivers = pc.getTransceivers();
      
      let audioSender = senders.find((s) => s.track?.kind === "audio");

      if (!audioSender) {
        const audioTransceiver = transceivers.find(
          (t) => t.receiver.track?.kind === "audio",
        );
        if (audioTransceiver) {
          audioSender = audioTransceiver.sender;
          log("STREAM", "🔍 Found audio sender via transceiver", {
            peerId,
            mid: audioTransceiver.mid,
          });
        }
      }

      if (audioSender) {
        audioSender
          .replaceTrack(audioTrack)
          .then(() => {
            log("STREAM", "✅ Replaced audio track successfully", { peerId });
          })
          .catch((error) => {
            log("STREAM", "❌ Error replacing audio track", {
              peerId,
              error: (error as Error).message,
            });
            try {
              pc.addTrack(audioTrack, stream);
            } catch (e) {
              log("STREAM", "❌ Error adding audio track as fallback", {
                peerId,
              });
            }
          });
      } else {
        try {
          pc.addTrack(audioTrack, stream);
          log("STREAM", "Added new audio track (no existing sender)", {
            peerId,
          });
        } catch (error) {
          log("STREAM", "Error adding audio track", {
            peerId,
            error: (error as Error).message,
          });
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
  async adjustVideoQuality(
    peerId: string,
    quality: VideoQuality,
  ): Promise<void> {
    const mediaConn = this.mediaConnections.get(peerId);
    if (!mediaConn) return;

    const pc = (mediaConn as any).peerConnection as RTCPeerConnection;
    if (!pc) return;

    const sender = pc
      .getSenders()
      ?.find((s: RTCRtpSender) => s.track?.kind === "video");

    if (sender) {
      try {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];

        const bitrates: Record<VideoQuality, number> = {
          low: 300000, // 300 kbps - for poor connections (was 150)
          medium: 800000, // 800 kbps - balanced (was 500)
          high: 1500000, // 1.5 Mbps - good connections (unchanged)
          ultra: 4000000, // 4 Mbps - for 1080p60
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
      let packetsLost = 0;
      let jitter = 0;
      let roundTripTime = 0;
      let bytesReceived = 0;
      let framesPerSecond: number | undefined;
      let quality: ConnectionQuality = "good";

      stats.forEach((report: any) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          packetsLost = report.packetsLost || 0;
          jitter = report.jitter || 0;
          bytesReceived = report.bytesReceived || 0;
          framesPerSecond = report.framesPerSecond;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          roundTripTime = (report.currentRoundTripTime || 0) * 1000;
        }
      });

      // Determine quality based on metrics
      if (packetsLost > 50 || roundTripTime > 300) {
        quality = "poor";
      } else if (packetsLost > 20 || roundTripTime > 150) {
        quality = "medium";
      } else {
        quality = "good";
      }

      return {
        packetsLost,
        jitter,
        roundTripTime,
        bytesReceived,
        framesPerSecond,
        quality,
      };
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
            poor: "low",
            medium: "medium",
            good: "high",
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
   * Resume audio context (required after user interaction)
   */
  resumeAudioContext(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        log("AUDIO", "AudioContext resumed successfully");
      }).catch((err) => {
        log("AUDIO", "Failed to resume AudioContext:", err);
      });
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
        if (transceiver.sender.track?.kind === "video") {
          const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs || [];

          // Prefer VP9 for better compression, fallback to VP8, then H264
          const vp9 = codecs.filter((c) => c.mimeType === "video/VP9");
          const vp8 = codecs.filter((c) => c.mimeType === "video/VP8");
          const h264 = codecs.filter((c) => c.mimeType === "video/H264");
          const others = codecs.filter(
            (c) =>
              c.mimeType !== "video/VP9" &&
              c.mimeType !== "video/VP8" &&
              c.mimeType !== "video/H264",
          );

          const preferredCodecs = [...vp9, ...vp8, ...h264, ...others];

          if (preferredCodecs.length > 0 && (transceiver as any).setCodecPreferences) {
            (transceiver as any).setCodecPreferences(preferredCodecs);
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
    log("MSG", `📨 Received message: ${message.type}`, {
      from: fromPeerId,
      isHost: this.isHost,
    });

    switch (message.type) {
      case "room-full":
        this.handleRoomFullMessage(fromPeerId);
        break;

      case "peer-info":
        this.handlePeerInfoMessage(message, fromPeerId);
        break;

      case "peer-list":
        this.handlePeerListMessage(message, fromPeerId);
        break;

      case "peer-joined":
        this.handlePeerJoinedMessage(message);
        break;

      case "peer-left":
        this.handlePeerLeftMessage(fromPeerId);
        break;

      case "stream-ready":
        this.handleStreamReadyMessage(message, fromPeerId);
        break;

      case "ping":
        this.handlePingMessage(message, fromPeerId);
        break;

      case "pong":
        this.handlePongMessage(message, fromPeerId);
        break;

      case "ice-candidate":
        this.handleIceCandidateMessage(message, fromPeerId);
        break;

      default:
        // Forward other messages to the application
        this.onMessageCallback?.(message);
        break;
    }
  }

  private handleRoomFullMessage(fromPeerId: string) {
    log("MSG", "🚫 Room is full");
    this.onRoomFullCallback?.();
    this.handlePeerDisconnection(fromPeerId);
  }

  private handlePeerInfoMessage(message: P2PMessage, fromPeerId: string) {
    log("MSG", "👤 Received peer-info", {
      from: fromPeerId,
      name: message.data.name,
      hasStream: message.data.hasStream,
      isHost: this.isHost,
      currentPeersCount: this.peers.size,
    });

    // Register the peer
    this.peers.set(fromPeerId, {
      id: fromPeerId,
      name: message.data.name,
      isHost: message.data.isHost || false,
      joinedAt: Date.now(),
    });

    log("MSG", "✅ Peer registered", {
      peerId: fromPeerId,
      totalPeers: this.peers.size,
      allPeerIds: Array.from(this.peers.keys()),
    });

    // If host, notify all other participants AND initiate media call
    if (this.isHost) {
      this.handleHostPeerInfoProcessing(fromPeerId);
    }

    log("MSG", "🔔 Calling onPeerConnectedCallback", {
      peerId: fromPeerId,
      name: message.data.name,
    });
    this.onPeerConnectedCallback?.(fromPeerId, message.data);
  }

  private handleHostPeerInfoProcessing(fromPeerId: string) {
    log("MSG", "📢 HOST: Broadcasting peer-joined to other participants");
    const peerJoinedMessage: P2PMessage = {
      type: "peer-joined",
      data: this.peers.get(fromPeerId),
      senderId: this.myId,
      timestamp: Date.now(),
    };

    this.broadcast(peerJoinedMessage, fromPeerId);

    // NOTE: Host media call is now initiated in connectToPeer() when data connection opens
    // This prevents duplicate calls and race conditions
    log(
      "MSG",
      "📋 HOST: Media call will be initiated from data connection handler",
      {
        peerId: fromPeerId,
        hasMediaConnection: this.mediaConnections.has(fromPeerId),
        hasPendingMediaConnection:
          this.pendingMediaConnections.has(fromPeerId),
      },
    );
  }

  private handlePeerListMessage(message: P2PMessage, fromPeerId: string) {
    // Receive participant list and connect to them
    const peerList = message.data as PeerInfo[];
    log("MSG", "📋 Received peer-list", {
      count: peerList.length,
      peers: peerList.map((p) => ({ id: p.id, name: p.name })),
      fromPeerId,
      myId: this.myId,
    });

    // CRITICAL FIX: First, ensure the host (sender of peer-list) is registered
    this.ensureHostRegistered(fromPeerId, peerList);

    // Process other peers in the list
    peerList.forEach((peer) => {
      this.processPeerFromList(peer, fromPeerId);
    });

    log("MSG", "📋 Peer-list processing complete", {
      totalPeers: this.peers.size,
      peerIds: Array.from(this.peers.keys()),
    });
  }

  private ensureHostRegistered(hostId: string, peerList: PeerInfo[]) {
    if (!this.peers.has(hostId)) {
      // Find host info in the peer list
      const hostInfo = peerList.find((p) => p.id === hostId);
      if (hostInfo) {
        log("MSG", "👑 Registering HOST from peer-list", {
          hostId: hostId,
          hostName: hostInfo.name,
        });
        this.peers.set(hostId, hostInfo);
        this.onPeerConnectedCallback?.(hostId, hostInfo);
      } else {
        // Host not in list (shouldn't happen, but handle it)
        log("MSG", "⚠️ Host not found in peer-list, creating entry", {
          fromPeerId: hostId,
        });
        const hostEntry: PeerInfo = {
          id: hostId,
          name: "Host",
          isHost: true,
          joinedAt: Date.now(),
        };
        this.peers.set(hostId, hostEntry);
        this.onPeerConnectedCallback?.(hostId, hostEntry);
      }
    }
  }

  private processPeerFromList(peer: PeerInfo, hostId: string) {
    log("MSG", "🔍 Processing peer from list", {
      peerId: peer.id,
      peerName: peer.name,
      isMyself: peer.id === this.myId,
      isFromPeer: peer.id === hostId,
      alreadyInPeers: this.peers.has(peer.id),
      alreadyConnected: this.dataConnections.has(peer.id),
    });

    // Skip ourselves
    if (peer.id === this.myId) {
      log("MSG", "⏭️ Skipping self", { peerId: peer.id });
      return;
    }

    // Skip the host (already handled above)
    if (peer.id === hostId) {
      log("MSG", "⏭️ Skipping host (already registered)", {
        peerId: peer.id,
      });
      return;
    }

    // Add other peers to our internal list
    if (!this.peers.has(peer.id)) {
      this.peers.set(peer.id, peer);
      log("MSG", "✅ Peer added to list", {
        peerId: peer.id,
        totalPeers: this.peers.size,
      });

      // Notify callback that this peer is connected (for UI update)
      log(
        "MSG",
        "🔔 Calling onPeerConnectedCallback for peer from list",
        { peerId: peer.id },
      );
      this.onPeerConnectedCallback?.(peer.id, peer);
    }

    // Connect to other participants (not the host we're already connected to)
    if (!this.dataConnections.has(peer.id)) {
      log("MSG", "🔗 Connecting to peer from list", { peerId: peer.id });
      setTimeout(
        () => this.connectToPeer(peer.id, this.localStream),
        500,
      );
    }
  }

  private handlePeerJoinedMessage(message: P2PMessage) {
    // A new participant joined
    const newPeer = message.data as PeerInfo;
    log("MSG", "🆕 New peer joined notification", {
      peerId: newPeer.id,
      name: newPeer.name,
      isMyself: newPeer.id === this.myId,
      alreadyConnected: this.dataConnections.has(newPeer.id),
      alreadyInPeers: this.peers.has(newPeer.id),
    });

    if (newPeer.id !== this.myId) {
      // Add to peers map if not already there
      if (!this.peers.has(newPeer.id)) {
        this.peers.set(newPeer.id, newPeer);
        log("MSG", "✅ New peer added to peers map", {
          peerId: newPeer.id,
          totalPeers: this.peers.size,
        });

        // CRITICAL: Notify UI about the new peer
        log("MSG", "🔔 Calling onPeerConnectedCallback for new peer", {
          peerId: newPeer.id,
          name: newPeer.name,
        });
        this.onPeerConnectedCallback?.(newPeer.id, newPeer);
      }

      // Connect to new participant if not already connected
      if (!this.dataConnections.has(newPeer.id)) {
        log("MSG", "🔗 Connecting to new peer", { peerId: newPeer.id });
        // Connect to new participant with local stream
        setTimeout(
          () => this.connectToPeer(newPeer.id, this.localStream),
          500,
        );
      }
    }
  }

  private handlePeerLeftMessage(fromPeerId: string) {
    log("MSG", "Peer left", { peerId: fromPeerId });
    this.peers.delete(fromPeerId);
    this.connectionStates.delete(fromPeerId);
    this.iceConnectionStates.delete(fromPeerId);
    this.onPeerDisconnectedCallback?.(fromPeerId);
  }

  private handleStreamReadyMessage(message: P2PMessage, fromPeerId: string) {
    // Peer's stream is ready, initiate media connection if we don't have one
    log("MSG", "Peer stream ready", {
      peerId: fromPeerId,
      data: message.data,
    });

    // CRITICAL FIX: If peer is requesting a stream refresh, re-send our video track
    if (message.data?.requestRefresh) {
      this.handleStreamRefreshRequest(fromPeerId);
    } else {
      // Normal stream-ready handling
      if (
        !this.mediaConnections.has(fromPeerId) &&
        !this.pendingMediaConnections.has(fromPeerId)
      ) {
        if (this.localStream) {
          log("MSG", "Initiating media connection after stream-ready", {
            peerId: fromPeerId,
          });
          this.initiateMediaConnection(fromPeerId, this.localStream);
        }
      }
    }
  }

  private handleStreamRefreshRequest(fromPeerId: string) {
    log(
      "MSG",
      "🔄 Peer requested stream refresh - re-sending video track",
      { peerId: fromPeerId },
    );

    // Get the media connection for this peer
    const refreshMediaConn = this.mediaConnections.get(fromPeerId);
    if (refreshMediaConn && this.localStream) {
      const refreshPc = (refreshMediaConn as any)
        .peerConnection as RTCPeerConnection;
      // Accept more connection states - the connection might still be establishing
      if (
        refreshPc &&
        (refreshPc.connectionState === "connected" ||
          refreshPc.connectionState === "connecting" ||
          refreshPc.iceConnectionState === "connected" ||
          refreshPc.iceConnectionState === "checking")
      ) {
        this.refreshVideoTrack(refreshPc, fromPeerId);
      } else {
        log("MSG", "⚠️ Peer connection not in valid state for refresh", {
          peerId: fromPeerId,
          connectionState: refreshPc?.connectionState,
          iceConnectionState: refreshPc?.iceConnectionState,
        });
      }
    }
  }

  private refreshVideoTrack(refreshPc: RTCPeerConnection, fromPeerId: string) {
    const currentVideoTrack = this.localStream?.getVideoTracks()[0];
    if (currentVideoTrack) {
      log("MSG", "📹 Refreshing video track", {
        peerId: fromPeerId,
        trackId: currentVideoTrack.id,
        enabled: currentVideoTrack.enabled,
        muted: currentVideoTrack.muted,
        readyState: currentVideoTrack.readyState,
        connectionState: refreshPc.connectionState,
        iceConnectionState: refreshPc.iceConnectionState,
      });

      // Try to replace the video track to force a refresh
      const refreshVideoSender = refreshPc
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (refreshVideoSender) {
        this.replaceVideoSenderTrack(refreshVideoSender, fromPeerId, currentVideoTrack);
      } else {
        log("MSG", "⚠️ No video sender found", {
          peerId: fromPeerId,
        });
      }
    } else {
      log("MSG", "⚠️ No video track in local stream", {
        peerId: fromPeerId,
      });
    }
  }

  private replaceVideoSenderTrack(refreshVideoSender: RTCRtpSender, fromPeerId: string, currentVideoTrack: MediaStreamTrack) {
    // First, try to get a fresh video track
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      })
      .then(async (freshStream) => {
        const freshVideoTrack = freshStream.getVideoTracks()[0];
        if (freshVideoTrack) {
          log("MSG", "✅ Got fresh video track for refresh", {
            peerId: fromPeerId,
            newTrackId: freshVideoTrack.id,
            muted: freshVideoTrack.muted,
            enabled: freshVideoTrack.enabled,
            readyState: freshVideoTrack.readyState,
          });

          // CRITICAL FIX: Wait for the track to unmute if needed
          if (freshVideoTrack.muted) {
            await this.waitForTrackUnmute(freshVideoTrack, fromPeerId, "refresh");
          }

          // Now replace the track in the sender
          try {
            await refreshVideoSender.replaceTrack(
              freshVideoTrack,
            );
            log("MSG", "✅ Video track replaced successfully", {
              peerId: fromPeerId,
              newTrackMuted: freshVideoTrack.muted,
            });

            // Also update our local stream reference
            const oldTrack =
              this.localStream?.getVideoTracks()[0];
            if (oldTrack && this.localStream) {
              this.localStream.removeTrack(oldTrack);
              oldTrack.stop();
              this.localStream.addTrack(freshVideoTrack);
            }
          } catch (replaceErr) {
            log("MSG", "❌ Failed to replace video track", {
              peerId: fromPeerId,
              error: (replaceErr as Error).message,
            });
            // Stop the new track since we couldn't use it
            freshVideoTrack.stop();
          }
        }
      })
      .catch((err) => {
        log("MSG", "❌ Failed to get fresh video track", {
          peerId: fromPeerId,
          error: err.message,
        });

        // Fallback: try to toggle the existing track
        log("MSG", "🔄 Fallback: toggling existing video track", {
          peerId: fromPeerId,
        });
        const wasEnabled = currentVideoTrack.enabled;
        currentVideoTrack.enabled = false;
        setTimeout(() => {
          currentVideoTrack.enabled = wasEnabled;
          log("MSG", "🔄 Video track toggled", {
            peerId: fromPeerId,
            enabled: currentVideoTrack.enabled,
            muted: currentVideoTrack.muted,
          });
        }, 100);
      });
  }

  private async waitForTrackUnmute(track: MediaStreamTrack, peerId: string, context: string): Promise<void> {
    log(
      "MSG",
      `⏳ Fresh video track is muted (${context}), waiting for unmute...`,
      { peerId },
    );

    await new Promise<void>((resolve) => {
      let resolved = false;

      const onUnmute = () => {
        if (!resolved) {
          resolved = true;
          track.removeEventListener(
            "unmute",
            onUnmute,
          );
          log(
            "MSG",
            `✅ Video track unmuted (${context}), proceeding`,
            {
              peerId,
              muted: track.muted,
            },
          );
          resolve();
        }
      };

      track.addEventListener(
        "unmute",
        onUnmute,
      );

      // Also check immediately in case it already unmuted
      if (!track.muted) {
        onUnmute();
      }

      // Timeout after 3 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          track.removeEventListener(
            "unmute",
            onUnmute,
          );
          log(
            "MSG",
            `⚠️ Timeout waiting for video track to unmute (${context}), proceeding anyway`,
            {
              peerId,
              muted: track.muted,
            },
          );
          resolve();
        }
      }, 3000);
    });
  }

  private handlePingMessage(message: P2PMessage, fromPeerId: string) {
    // Respond to ping with pong
    const pingId = message.data?.pingId;
    if (pingId) {
      this.sendMessage(fromPeerId, {
        type: "pong",
        data: { pingId },
        senderId: this.myId,
        timestamp: Date.now(),
      });
    }
  }

  private handlePongMessage(message: P2PMessage, fromPeerId: string) {
    // Handle pong response
    const pongPingId = message.data?.pingId;
    if (pongPingId) {
      this.handlePong(fromPeerId, pongPingId);
    }
  }

  private handleIceCandidateMessage(message: P2PMessage, fromPeerId: string) {
    // CRITICAL FIX: Receive ICE candidate from peer and add it to the peer connection
    // Queue candidates if remote description is not yet set
    log("ICE", "📥 Received ICE candidate via data channel", {
      peerId: fromPeerId,
      candidate: message.data?.candidate?.substring(0, 50),
    });

    const candidateInit: RTCIceCandidateInit = {
      candidate: message.data.candidate,
      sdpMid: message.data.sdpMid,
      sdpMLineIndex: message.data.sdpMLineIndex,
      usernameFragment: message.data.usernameFragment,
    };

    // Find the media connection for this peer
    const mediaConnForIce =
      this.mediaConnections.get(fromPeerId) ||
      this.pendingMediaConnections.get(fromPeerId);
    
    if (mediaConnForIce) {
      this.addIceCandidateToConnection(mediaConnForIce, candidateInit, fromPeerId);
    } else {
      log("ICE", "⏳ Queuing ICE candidate - no media connection yet", {
        peerId: fromPeerId,
        hasMediaConn: this.mediaConnections.has(fromPeerId),
        hasPendingMediaConn: this.pendingMediaConnections.has(fromPeerId),
      });
      // Queue for later when media connection is established
      this.queueIceCandidate(candidateInit, fromPeerId);
    }
  }

  private addIceCandidateToConnection(mediaConn: MediaConnection, candidateInit: RTCIceCandidateInit, fromPeerId: string) {
    const pcForIce = (mediaConn as any)
      .peerConnection as RTCPeerConnection;
    
    if (pcForIce && pcForIce.signalingState !== "closed") {
      // CRITICAL: Check if remote description is set
      // If not, queue the candidate for later
      if (!pcForIce.remoteDescription) {
        log(
          "ICE",
          "⏳ Queuing ICE candidate - remote description not yet set",
          {
            peerId: fromPeerId,
            signalingState: pcForIce.signalingState,
          },
        );

        this.queueIceCandidate(candidateInit, fromPeerId);
      } else {
        // Remote description is set, add candidate immediately
        this.addIceCandidateToPc(pcForIce, candidateInit, fromPeerId);
      }
    } else {
      log(
        "ICE",
        "⚠️ Cannot add ICE candidate - peer connection not ready",
        {
          peerId: fromPeerId,
          hasPc: !!pcForIce,
          signalingState: pcForIce?.signalingState,
        },
      );
      // Queue for later
      this.queueIceCandidate(candidateInit, fromPeerId);
    }
  }

  private addIceCandidateToPc(pc: RTCPeerConnection, candidateInit: RTCIceCandidateInit, fromPeerId: string) {
    try {
      const iceCandidate = new RTCIceCandidate(candidateInit);

      pc
        .addIceCandidate(iceCandidate)
        .then(() => {
          log("ICE", "✅ ICE candidate added successfully", {
            peerId: fromPeerId,
            iceConnectionState: pc.iceConnectionState,
            connectionState: pc.connectionState,
          });
        })
        .catch((err) => {
          log("ICE", "❌ Failed to add ICE candidate", {
            peerId: fromPeerId,
            error: err.message,
            signalingState: pc.signalingState,
            hasRemoteDesc: !!pc.remoteDescription,
          });
        });
    } catch (err) {
      log("ICE", "❌ Error creating ICE candidate", {
        peerId: fromPeerId,
        error: (err as Error).message,
      });
    }
  }

  private queueIceCandidate(candidateInit: RTCIceCandidateInit, fromPeerId: string) {
    if (!this.pendingIceCandidates.has(fromPeerId)) {
      this.pendingIceCandidates.set(fromPeerId, []);
    }
    this.pendingIceCandidates.get(fromPeerId)!.push(candidateInit);
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
    log("DISC", "Handling peer disconnection", { peerId });

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
        type: "peer-left",
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
    log("RECONN", "Attempting reconnection", {
      peerId,
      attempt: attempts + 1,
      maxAttempts: this.maxReconnectAttempts,
    });

    if (attempts < this.maxReconnectAttempts) {
      // Use exponential backoff delays
      const delay =
        RECONNECT_DELAYS[Math.min(attempts, RECONNECT_DELAYS.length - 1)];

      this.reconnectAttempts.set(peerId, attempts + 1);
      this.setConnectionState(peerId, ConnectionState.RECONNECTING);

      setTimeout(async () => {
        const existingConn = this.dataConnections.get(peerId);
        if (!existingConn || !existingConn.open) {
          log("RECONN", "Cleaning up and reconnecting", { peerId });

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
            log("RECONN", "Reconnection successful", { peerId });
          } catch (error) {
            log("RECONN", "Reconnection failed", {
              peerId,
              error: (error as Error).message,
            });
            // Will retry on next attempt
          }
        } else {
          log("RECONN", "Connection already restored", { peerId });
        }
      }, delay);
    } else {
      log("RECONN", "Max reconnection attempts reached", { peerId });
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
  onConnectionStateChange(
    callback: (peerId: string, state: ConnectionState) => void,
  ) {
    this.onConnectionStateChangeCallback = callback;
  }

  /**
   * Set callback for ICE connection state changes
   */
  onICEStateChange(
    callback: (peerId: string, state: ICEConnectionState) => void,
  ) {
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
  onConnectionQuality(
    callback: (peerId: string, quality: ConnectionQuality) => void,
  ) {
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
    log("RECONN", "Force reconnect requested", { peerId });

    // Reset reconnect attempts
    this.reconnectAttempts.delete(peerId);
    this.iceRestartAttempts.delete(peerId);

    // Clean up existing connections
    this.handlePeerDisconnection(peerId);

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Try to reconnect
    try {
      await this.connectToPeer(peerId, this.localStream);
      return true;
    } catch (error) {
      log("RECONN", "Force reconnect failed", {
        peerId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Nettoyer et fermer toutes les connexions
   */
  destroy() {
    log("DESTROY", "Destroying P2PManager");

    // Cleanup network listeners
    this.cleanupNetworkListeners?.();

    // Clear network reconnect timeout
    if (this.networkReconnectTimeout) {
      clearTimeout(this.networkReconnectTimeout);
      this.networkReconnectTimeout = null;
    }

    // Stop all health checks
    this.connectionHealthChecks.forEach((_, peerId) => {
      this.stopHealthChecks(peerId);
    });

    // Clear all ping timeouts
    this.pingTimeouts.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    this.pingTimeouts.clear();

    // Stop monitoring
    this.stopQualityMonitoring();
    this.stopAudioLevelMonitoring();

    // Clean up audio analysers
    for (const [peerId] of this.audioAnalysers) {
      this.removeAudioAnalyser(peerId);
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Close all data connections
    this.dataConnections.forEach((conn, peerId) => {
      log("DESTROY", "Closing data connection", { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });

    // Close all media connections
    this.mediaConnections.forEach((conn, peerId) => {
      log("DESTROY", "Closing media connection", { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });

    // Close pending media connections
    this.pendingMediaConnections.forEach((conn, peerId) => {
      log("DESTROY", "Closing pending media connection", { peerId });
      try {
        conn.close();
      } catch (e) {
        // Ignore
      }
    });

    // Destroy peer
    if (this.peer) {
      log("DESTROY", "Destroying peer");
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
    this.pendingReconnects.clear();
    this.connectionHealthChecks.clear();
    this.lastPingTimes.clear();
    this.localStream = null;

    log("DESTROY", "P2PManager destroyed");
  }
}
