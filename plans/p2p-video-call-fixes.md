# P2P Video Call Application - Critical Issues Fix Plan

## Executive Summary

This document outlines the technical solutions for four critical issues in the anima-app P2P video call application:
1. Audio problems - No sound during P2P calls
2. Video not being sent from mobile devices
3. TURN server fallback for P2P connection failures
4. Mobile responsive issues on iPhone 5s (320px) and Honor Magic V3 (foldable)

---

## Issue 1: Audio Problems - No Sound During P2P Calls

### Root Cause Analysis

After analyzing [`p2pManager.ts`](src/services/p2pManager.ts), [`VideoTile.tsx`](src/components/room/VideoTile.tsx), and [`RoomPage.tsx`](src/pages/RoomPage.tsx), several issues were identified:

1. **Audio Track Not Enabled on Remote Streams** (lines 757-771 in RoomPage.tsx): While the code attempts to enable audio tracks when receiving streams, the timing may be incorrect - tracks might be enabled AFTER the stream is already dispatched to React state.

2. **Video Element Muting** (lines 222-224, 395 in VideoTile.tsx): The video element has `muted={isLocal}` which correctly mutes local video but remote videos should NOT be muted. However, there's a race condition where the `muted` property might be set incorrectly.

3. **Missing Audio Context Resume**: The AudioContext for audio level detection is created but may not be resumed after user interaction, which is required by modern browsers.

4. **Stream Processing Order** (lines 1365-1371 in p2pManager.ts): In `setupMediaConnectionHandlers`, audio tracks are enabled but this happens inside the PeerJS callback which may fire before the stream is fully processed.

### Solution Design

#### 1.1 Fix Audio Track Enabling in RoomPage.tsx

**Location**: [`src/pages/RoomPage.tsx`](src/pages/RoomPage.tsx), around line 733

**Current Code**:
```typescript
manager.onStream((peerId, stream) => {
  // ... logging ...
  
  // Ensure audio tracks are enabled on the stream BEFORE dispatching
  stream.getAudioTracks().forEach((track) => {
    track.enabled = true;
  });
  
  dispatchParticipants({
    type: "SET_STREAM",
    payload: { id: peerId, stream },
  });
});
```

**Problem**: The audio tracks are enabled, but the stream reference passed to React is the same object. React's useMemo in VideoTile.tsx checks `participant.stream` by reference, so it may not detect track changes.

**Fix**: Create a new MediaStream with the same tracks to force React to detect the change:

```typescript
manager.onStream((peerId, stream) => {
  console.log("[RoomPage] Received stream from peer:", peerId);
  
  // Ensure all tracks are enabled
  stream.getAudioTracks().forEach((track) => {
    track.enabled = true;
    console.log("[RoomPage] Audio track enabled:", track.id, "enabled:", track.enabled, "muted:", track.muted);
  });
  stream.getVideoTracks().forEach((track) => {
    track.enabled = true;
  });
  
  // CRITICAL FIX: Create a new MediaStream to force React re-render
  // This ensures VideoTile receives a new stream reference
  const streamWithEnabledTracks = new MediaStream(stream.getTracks());
  
  dispatchParticipants({
    type: "SET_STREAM",
    payload: { id: peerId, stream: streamWithEnabledTracks },
  });
});
```

#### 1.2 Fix VideoTile Audio Handling

**Location**: [`src/components/room/VideoTile.tsx`](src/components/room/VideoTile.tsx), lines 188-240

**Current Issue**: The `useEffect` that handles stream binding sets `video.muted = false` for remote participants, but this happens asynchronously and may not take effect immediately.

**Fix**: Add explicit audio track monitoring and force unmute:

```typescript
useEffect(() => {
  const video = videoRef.current;
  if (!video || !participant.stream) return;

  // Always set srcObject
  video.srcObject = participant.stream;
  
  // CRITICAL FIX: For remote participants, ensure audio is NEVER muted
  if (!isLocal) {
    video.muted = false;
    video.volume = 1.0;
    
    // Force audio tracks to be enabled and unmuted
    participant.stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
      
      // Listen for mute events from the track itself
      track.onmute = () => {
        console.warn("[VideoTile] Audio track muted:", track.id);
        // Try to re-enable
        track.enabled = true;
      };
      
      track.onunmute = () => {
        console.log("[VideoTile] Audio track unmuted:", track.id);
      };
    });
    
    // Ensure video plays with audio
    const playWithAudio = async () => {
      try {
        video.muted = false;
        await video.play();
        console.log("[VideoTile] Video playing with audio enabled");
      } catch (err) {
        console.error("[VideoTile] Failed to play video:", err);
      }
    };
    
    playWithAudio();
  }
  
  // ... rest of effect
}, [participant.stream, isLocal, participant.id]);
```

#### 1.3 Add AudioContext Resume on User Interaction

**Location**: [`src/pages/RoomPage.tsx`](src/pages/RoomPage.tsx), add to the initialization effect

**New Code**:
```typescript
// Add to the init() function or useEffect
const resumeAudioContext = () => {
  if (p2pManager.current) {
    // Access the audio context through a new method we'll add
    p2pManager.current.resumeAudioContext?.();
  }
};

// Resume audio context on first user interaction
document.addEventListener('click', resumeAudioContext, { once: true });
document.addEventListener('touchstart', resumeAudioContext, { once: true });
```

**In p2pManager.ts**, add the method:

```typescript
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
```

#### 1.4 Fix Audio in P2PManager Stream Handling

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), lines 1365-1371

**Current Code**:
```typescript
// Ensure all tracks are enabled
receivedStream.getAudioTracks().forEach((track) => {
  track.enabled = true;
});
receivedStream.getVideoTracks().forEach((track) => {
  track.enabled = true;
});

this.onStreamCallback?.(peerId, receivedStream);
```

**Fix**: Same pattern - create new stream with enabled tracks:

```typescript
// Ensure all tracks are enabled
receivedStream.getAudioTracks().forEach((track) => {
  track.enabled = true;
});
receivedStream.getVideoTracks().forEach((track) => {
  track.enabled = true;
});

// CRITICAL FIX: Create new stream to ensure React detects changes
const processedStream = new MediaStream(receivedStream.getTracks());
this.onStreamCallback?.(peerId, processedStream);
```

---

## Issue 2: Video Not Being Sent from Mobile

### Root Cause Analysis

1. **Video Track Muted on Mobile** (lines 919-965 in p2pManager.ts): The code waits for video tracks to unmute, but on mobile devices, tracks may never unmute if the camera isn't properly initialized.

2. **Fresh Track Acquisition Timing** (lines 880-980 in p2pManager.ts): While the code attempts to get a fresh video track before initiating calls, the timing and error handling may not be sufficient for mobile devices.

3. **Stream Update Race Condition** (lines 2733-2890 in p2pManager.ts): When `updateLocalStream` is called, the video track monitoring may not properly handle mobile-specific mute events.

4. **Mobile Constraints Too Aggressive** ([`videoConstraints.ts`](src/utils/videoConstraints.ts)): The mobile preset uses 640x480 which may be too high for some mobile devices, causing the camera to fail silently.

### Solution Design

#### 2.1 Improve Mobile Video Constraints

**Location**: [`src/utils/videoConstraints.ts`](src/utils/videoConstraints.ts), lines 10-32

**Current Mobile Preset**:
```typescript
mobile: {
  width: 640,
  height: 480,
  frameRate: 24,
  bitrate: 600000,
}
```

**Fix**: Use more conservative constraints for mobile, with better fallback handling:

```typescript
// For mobile devices - more conservative for better compatibility
mobile: {
  width: 480,      // Reduced from 640
  height: 360,     // Reduced from 480
  frameRate: 15,   // Reduced from 24 for better compatibility
  bitrate: 400000, // Reduced from 600 kbps
}
```

#### 2.2 Add Mobile-Specific Video Track Initialization

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), add helper function

**New Function**:
```typescript
/**
 * Get video stream with mobile-specific fallbacks
 */
private async getMobileVideoStream(
  facingMode: "user" | "environment" = "user"
): Promise<MediaStream | null> {
  const constraints = [
    // Try ideal constraints first
    {
      video: {
        width: { ideal: 480 },
        height: { ideal: 360 },
        facingMode: { ideal: facingMode },
        frameRate: { ideal: 15 },
      },
    },
    // Fallback to lower resolution
    {
      video: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        facingMode: { ideal: facingMode },
        frameRate: { ideal: 15 },
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
```

#### 2.3 Fix Video Track Mute Handling for Mobile

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), lines 919-965

**Current Code**: Waits for `unmute` event with 3-second timeout

**Fix**: More aggressive handling for mobile:

```typescript
// CRITICAL FIX: If the fresh track is muted, wait for it to unmute
// This happens on mobile when the camera needs time to "warm up"
if (freshVideoTrack.muted) {
  log("MEDIA", "⏳ Fresh video track is muted, waiting for unmute...", { peerId });

  // For mobile, also try to force-enable the track
  if (this.isMobileDevice()) {
    freshVideoTrack.enabled = true;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    let checkInterval: ReturnType<typeof setInterval>;

    const onUnmute = () => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        freshVideoTrack.removeEventListener("unmute", onUnmute);
        log("MEDIA", "✅ Video track unmuted, proceeding with call", {
          peerId,
          muted: freshVideoTrack.muted,
        });
        resolve();
      }
    };

    freshVideoTrack.addEventListener("unmute", onUnmute);

    // Also check immediately in case it already unmuted
    if (!freshVideoTrack.muted) {
      onUnmute();
      return;
    }

    // For mobile, periodically check if track becomes unmuted
    checkInterval = setInterval(() => {
      if (!freshVideoTrack.muted && !resolved) {
        onUnmute();
      }
    }, 100);

    // Timeout after 5 seconds (increased from 3 for mobile)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        freshVideoTrack.removeEventListener("unmute", onUnmute);
        log("MEDIA", "⚠️ Timeout waiting for video track to unmute, proceeding anyway", {
          peerId,
          muted: freshVideoTrack.muted,
          readyState: freshVideoTrack.readyState,
        });
        resolve();
      }
    }, 5000);
  });
}
```

#### 2.4 Add Mobile Device Detection

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), add method

**New Code**:
```typescript
/**
 * Check if current device is mobile
 */
private isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || "ontouchstart" in window;
}
```

---

## Issue 3: TURN Server Fallback

### Root Cause Analysis

The current implementation in [`p2pManager.ts`](src/services/p2pManager.ts) (lines 393-446) already includes multiple TURN servers:
- Metered.ca TURN servers (free tier with hardcoded credentials)
- OpenRelay TURN servers (public free servers)

However, there are issues:
1. **Hardcoded Credentials**: The Metered.ca credentials may expire or be rate-limited
2. **No Fallback Logic**: If all TURN servers fail, there's no mechanism to fetch new ones
3. **Missing STUN-Only Fallback**: Some networks block TURN but allow direct P2P with STUN

### Solution Design

#### 3.1 Implement Dynamic TURN Server Fetching

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), replace static iceServers

**New Implementation**:

```typescript
// Free TURN server sources
const TURN_SERVERS = {
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
  ],
  // Twilio TURN (requires account but has free tier)
  // This would need to be fetched from your backend
};

/**
 * Get ICE servers configuration
 * Tries multiple free TURN services for maximum compatibility
 */
private getIceServers(): RTCIceServer[] {
  // Google STUN servers (always included)
  const stunServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  // Add public TURN servers
  const turnServers: RTCIceServer[] = [
    ...TURN_SERVERS.metered,
    ...TURN_SERVERS.openrelay,
  ];

  // Return STUN first, then TURN (order matters for connection speed)
  return [...stunServers, ...turnServers];
}
```

#### 3.2 Add ICE Connection Failure Detection and Retry

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), enhance `setupICEMonitoring`

**Enhanced Code**:

```typescript
/**
 * Setup ICE connection state monitoring with enhanced failure handling
 */
private setupICEMonitoring(pc: RTCPeerConnection, peerId: string): void {
  let iceFailureCount = 0;
  const maxIceFailures = 3;
  let lastIceState = pc.iceConnectionState;

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState as ICEConnectionState;
    log("ICE", "ICE connection state changed", { peerId, state, previousState: lastIceState });
    lastIceState = state;

    this.iceConnectionStates.set(peerId, state);
    this.onICEStateChangeCallback?.(peerId, state);

    switch (state) {
      case "connected":
      case "completed":
        iceFailureCount = 0;
        this.iceRestartAttempts.delete(peerId);
        log("ICE", "✅ ICE connection successful", { peerId, state });
        break;

      case "failed":
        iceFailureCount++;
        log("ICE", "❌ ICE connection failed", { peerId, failureCount: iceFailureCount });
        
        if (iceFailureCount >= maxIceFailures) {
          log("ICE", "Max ICE failures reached, trying relay-only mode", { peerId });
          this.attemptRelayOnlyConnection(peerId);
        } else {
          this.attemptICERestart(pc, peerId);
        }
        break;

      case "disconnected":
        // Temporary disconnection - may recover
        log("ICE", "ICE disconnected, waiting for recovery...", { peerId });
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") {
            this.attemptICERestart(pc, peerId);
          }
        }, 3000);
        break;
    }
  };

  // ... rest of monitoring setup
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
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Re-initiate with relay-only policy
  if (this.localStream && this.dataConnections.has(peerId)) {
    // Create new peer connection with relay-only
    const mediaConn = this.peer?.call(peerId, this.localStream, {
      ...this.peer.options,
      config: {
        ...this.peer.options.config,
        iceTransportPolicy: "relay", // Force TURN relay
      },
    });

    if (mediaConn) {
      log("ICE", "✅ Created relay-only media connection", { peerId });
      this.setupMediaConnectionHandlers(mediaConn, peerId);
    }
  }
}
```

#### 3.3 Add STUN-Only Fallback Mode

**Location**: [`src/services/p2pManager.ts`](src/services/p2pManager.ts), add configuration option

**New Code**:
```typescript
/**
 * Get ICE configuration with optional relay-only mode
 */
private getPeerConfig(relayOnly: boolean = false): Peer.PeerJSOption {
  return {
    debug: DEBUG ? 3 : 0,
    config: {
      iceServers: this.getIceServers(),
      iceTransportPolicy: relayOnly ? "relay" : "all",
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    },
  };
}
```

---

## Issue 4: Mobile Responsive Issues

### Root Cause Analysis

1. **ControlBar Button Visibility** ([`ControlBar.tsx`](src/components/room/ControlBar.tsx), lines 178-265):
   - The control bar uses `hidden sm:block` for reactions button (line 54)
   - Button sizes use `min-[360px]:w-9` which may not work on iPhone 5s (320px width)
   - The container has `px-1 min-[360px]:px-1.5` which provides insufficient padding on very small screens

2. **VideoGrid Layout** ([`VideoGrid.tsx`](src/components/room/VideoGrid.tsx)):
   - The `xs` breakpoint is defined as `< 380px` (line 43), but iPhone 5s is 320px
   - Grid gaps are too large for small screens
   - No specific handling for foldable screens (Honor Magic V3)

3. **Missing Viewport Meta**: Need to verify proper viewport configuration for mobile

### Solution Design

#### 4.1 Fix ControlBar for iPhone 5s (320px)

**Location**: [`src/components/room/ControlBar.tsx`](src/components/room/ControlBar.tsx)

**Current Issues**:
- Line 54: `hidden sm:block` hides reactions on all screens < 640px
- Lines 103-104: Button sizes start at 360px breakpoint, leaving 320px unhandled
- Line 178-265: Too many buttons visible on small screens

**Fix - Updated ControlBar**:

```typescript
// Replace the entire ControlBar component with mobile-optimized version

// 1. Add smaller breakpoint support
const ControlButton = memo(function ControlButton({
  onClick,
  icon,
  title,
  variant = "neutral",
  isHidden = false,
  isActive = false,
  isCompact = false, // New prop for ultra-small screens
}: {
  onClick: () => void;
  icon: string;
  title: string;
  variant?: "neutral" | "danger" | "primary" | "warning";
  isHidden?: boolean;
  isActive?: boolean;
  isCompact?: boolean;
}) {
  const baseClasses = useMemo(() => {
    if (isCompact) {
      return "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
    }
    return "w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 min-[400px]:w-10 min-[400px]:h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-150 shrink-0";
  }, [isCompact]);

  // ... rest of component
});

// 2. Main ControlBar with responsive button visibility
export const ControlBar = memo(function ControlBar(props: ControlBarProps) {
  const isMobile = useMemo(() => isMobileDevice(), []);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine which buttons to show based on screen size
  const isUltraSmall = screenWidth < 360;  // iPhone 5s, SE (1st gen)
  const isSmall = screenWidth < 400;       // Small phones
  const isMedium = screenWidth < 640;      // Regular phones

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className={`
        bg-neutral-800/95 backdrop-blur-md 
        ${isUltraSmall ? 'rounded-t-lg px-1 py-1' : 'sm:rounded-full px-1 min-[360px]:px-1.5 min-[400px]:px-2 sm:px-3 py-1 min-[360px]:py-1.5 min-[400px]:py-2'}
        shadow-lg flex items-center justify-center gap-0.5 min-[400px]:gap-1 sm:gap-1.5
        ${isUltraSmall ? 'flex-wrap' : ''}
      `}>
        {/* Primary controls - always visible */}
        <ControlButton
          onClick={onToggleAudio}
          icon={audioEnabled ? "mic" : "mic-off"}
          title={audioEnabled ? "Couper le micro" : "Activer le micro"}
          variant={audioEnabled ? "neutral" : "danger"}
          isActive={!audioEnabled}
          isCompact={isUltraSmall}
        />

        <ControlButton
          onClick={onToggleVideo}
          icon={videoEnabled ? "videocam" : "videocam-off"}
          title={videoEnabled ? "Désactiver la caméra" : "Activer la caméra"}
          variant={videoEnabled ? "neutral" : "danger"}
          isActive={!videoEnabled}
          isCompact={isUltraSmall}
        />

        {/* Camera switch - only on mobile with video enabled */}
        {!isUltraSmall && onSwitchCamera && isMobile && videoEnabled && (
          <ControlButton
            onClick={onSwitchCamera}
            icon="flip-camera"
            title={facingMode === "user" ? "Caméra arrière" : "Caméra avant"}
          />
        )}

        {/* Screen share - visible on all but ultra-small */}
        {!isUltraSmall && (
          <ControlButton
            onClick={handleToggleScreenShare}
            icon="present-to-all"
            title={isScreenSharing ? "Arrêter" : "Partager"}
            variant="primary"
            isActive={isScreenSharing}
          />
        )}

        {/* Reactions - hidden on small screens */}
        {!isSmall && <ReactionsButton onOpenReactions={onOpenReactions} />}

        {/* Hand raise - hidden on ultra-small */}
        {!isUltraSmall && (
          <ControlButton
            onClick={handleToggleHand}
            icon="pan-tool"
            title={handRaised ? "Baisser" : "Lever"}
            variant="warning"
            isActive={handRaised}
          />
        )}

        {/* Chat - always visible but compact on small */}
        <ControlButton
          onClick={onOpenChat}
          icon="chat"
          title="Discussion"
          isCompact={isUltraSmall}
        />

        {/* Participants - hidden on small */}
        {!isSmall && (
          <ControlButton
            onClick={onOpenParticipants}
            icon="people"
            title="Participants"
          />
        )}

        {/* Settings - only on larger screens */}
        {!isSmall && onOpenSettings && (
          <ControlButton
            onClick={onOpenSettings}
            icon="settings"
            title="Paramètres"
          />
        )}

        {/* Separator */}
        {!isUltraSmall && <div className="w-px h-4 min-[360px]:h-5 bg-neutral-600/50 mx-0.5 shrink-0" />}

        {/* Leave button - always visible */}
        <ControlButton
          onClick={onLeave}
          icon="call-end"
          title="Quitter"
          variant="danger"
          isCompact={isUltraSmall}
        />
      </div>
    </div>
  );
});
```

#### 4.2 Fix VideoGrid for Small Screens and Foldables

**Location**: [`src/components/room/VideoGrid.tsx`](src/components/room/VideoGrid.tsx)

**Enhanced useScreenSize Hook**:

```typescript
function useScreenSize() {
  const [screenSize, setScreenSize] = useState<"xxs" | "xs" | "sm" | "md" | "lg" | "foldable">("md");

  useEffect(() => {
    let rafId: number | null = null;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const updateSize = () => {
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspectRatio = width / height;

        if (Math.abs(width - lastWidth) < 20 && Math.abs(height - lastHeight) < 20) {
          return;
        }

        lastWidth = width;
        lastHeight = height;

        // Detect foldable devices (Honor Magic V3, Samsung Fold, etc.)
        // These typically have unusual aspect ratios when unfolded
        const isFoldable = 
          /Magic V|Fold|Flip/i.test(navigator.userAgent) ||
          (width > 700 && width < 900 && aspectRatio > 0.8 && aspectRatio < 1.2);

        if (isFoldable) {
          setScreenSize("foldable");
        } else if (width < 340) {
          setScreenSize("xxs"); // iPhone 5s, SE (1st gen)
        } else if (width < 380 || (width < 500 && height < 700)) {
          setScreenSize("xs");
        } else if (width < 640) {
          setScreenSize("sm");
        } else if (width < 900) {
          setScreenSize("md");
        } else {
          setScreenSize("lg");
        }
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize, { passive: true });
    return () => {
      window.removeEventListener("resize", updateSize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return screenSize;
}
```

**Updated Layout Logic**:

```typescript
// Determine grid layout based on participant count AND screen size
const layout = useMemo(() => {
  // For ultra-small screens (iPhone 5s - 320px)
  if (screenSize === "xxs") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: Math.ceil(count / 2) };
  }

  // For very small screens (4-5 inch phones)
  if (screenSize === "xs") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    return { cols: 2, rows: 4 };
  }

  // For foldable devices (Honor Magic V3, etc.)
  if (screenSize === "foldable") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }

  // ... rest of existing logic
}, [screenSize, count]);

// Updated grid style with smaller gaps for small screens
const gridStyle = useMemo(() => {
  const { cols, rows } = layout;
  const actualRows = Math.ceil(count / cols);

  const gap = 
    screenSize === "xxs" ? "2px" :
    screenSize === "xs" ? "4px" :
    screenSize === "sm" ? "6px" : "8px";

  return {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${actualRows}, 1fr)`,
    gap,
    height: "100%",
    width: "100%",
    padding: screenSize === "xxs" ? "2px" : undefined,
  };
}, [layout, count, screenSize]);
```

#### 4.3 Add Viewport Meta Tag Check

**Location**: [`index.html`](index.html) (verify this exists)

**Required Meta Tags**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0F0F0F">
```

#### 4.4 Safe Area Insets for Notched Devices

**Location**: [`src/index.css`](src/index.css)

**Add Safe Area Support**:
```css
@supports (padding: max(0px)) {
  .safe-area-top {
    padding-top: max(8px, env(safe-area-inset-top));
  }
  
  .safe-area-bottom {
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
  
  .safe-area-left {
    padding-left: max(8px, env(safe-area-inset-left));
  }
  
  .safe-area-right {
    padding-right: max(8px, env(safe-area-inset-right));
  }
}
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. **Audio Fix** - Create new MediaStream in `onStream` callback
2. **Mobile Video** - Reduce constraints and add mobile-specific handling
3. **TURN Servers** - Verify current servers work, add fallback logic

### Phase 2: Mobile Responsiveness (Next)
1. **ControlBar** - Implement responsive button visibility
2. **VideoGrid** - Add xxs breakpoint and foldable detection
3. **CSS** - Add safe area insets and viewport fixes

### Phase 3: Testing & Optimization
1. Test on iPhone 5s (iOS simulator or device)
2. Test on Android devices
3. Test P2P connections behind NAT/firewalls
4. Verify audio works in both directions

---

## Testing Checklist

### Audio Testing
- [ ] Local audio plays for remote participants
- [ ] Remote audio plays for local participant
- [ ] Audio continues after muting/unmuting
- [ ] Audio works after switching devices

### Mobile Video Testing
- [ ] Video displays on iPhone 5s (320px)
- [ ] Video displays on modern iPhones
- [ ] Video displays on Android devices
- [ ] Video displays on foldable devices (Honor Magic V3)
- [ ] Camera switch works on mobile

### TURN Server Testing
- [ ] P2P works on same network
- [ ] P2P works across different networks
- [ ] P2P works behind corporate firewalls
- [ ] Fallback to TURN when direct connection fails

### Responsive Testing
- [ ] All controls visible and usable on iPhone 5s
- [ ] All controls visible and usable on iPhone 14/15
- [ ] Layout adapts to foldable screens
- [ ] Layout works in portrait and landscape

---

## Notes

1. **Metered.ca TURN**: The current credentials are hardcoded. Consider implementing a backend proxy to fetch fresh credentials periodically.

2. **Mobile Constraints**: The reduced mobile constraints (480x360) should provide better compatibility while still maintaining acceptable quality.

3. **React Stream References**: The key insight for audio/video issues is that React's useMemo compares object references, not track states. Creating new MediaStream objects forces re-renders.

4. **iPhone 5s**: This device has a 320px width and iOS 12 max. Ensure CSS features used are compatible.

5. **Honor Magic V3**: This foldable device may report unusual viewport dimensions. The foldable detection logic should handle this.
