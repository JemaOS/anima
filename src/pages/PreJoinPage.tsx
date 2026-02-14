// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Icon, Avatar } from "@/components/ui";
import { saveRecentRoom } from "@/utils/helpers";
import {
  getOptimalVideoConstraints,
  getOptimalAudioConstraints,
  VIDEO_PRESETS,
  getDeviceType,
} from "@/utils/videoConstraints";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { withTimeoutRace } from "@/utils/retry";
import { captureMediaStream, getCameraLabel, isBackCamera, isAndroid, isMobileDevice } from "@/utils/mediaHelpers";



export function PreJoinPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get("host") === "true";

  const [userName, setUserName] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true); // Track if using front camera for mirroring

  const videoRef = useRef<HTMLVideoElement>(null);
  const isNavigatingRef = useRef(false);
  const mediaRetryCount = useRef(0);
  const maxMediaRetries = 3;

  // Network status
  const networkStatus = useNetworkStatus({
    onOnline: () => {
      console.log("[PreJoinPage] 🌐 Network restored");
      // Retry media initialization if we had a network error
      if (error?.includes("réseau") || error?.includes("network")) {
        setError(null);
        initializeMedia();
      }
    },
    onOffline: () => {
      console.log("[PreJoinPage] 🌐 Network lost");
      setError("Connexion réseau perdue. Vérifiez votre connexion internet.");
    },
  });

  // Request permissions explicitly (important for Android)
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // On Android, we need to explicitly request permissions
      // This ensures the user sees the permission dialog
      const permissionStatus = await Promise.all([
        navigator.permissions
          ?.query({ name: "camera" as PermissionName })
          .catch(() => null),
        navigator.permissions
          ?.query({ name: "microphone" as PermissionName })
          .catch(() => null),
      ]);

      const cameraPermission = permissionStatus[0];
      const micPermission = permissionStatus[1];

      // If permissions are already granted, return true
      if (
        cameraPermission?.state === "granted" &&
        micPermission?.state === "granted"
      ) {
        setPermissionsGranted(true);
        return true;
      }

      // If permissions are denied, show error
      if (
        cameraPermission?.state === "denied" ||
        micPermission?.state === "denied"
      ) {
        setError(
          "Permissions refusées. Veuillez autoriser l'accès à la caméra et au microphone dans les paramètres de votre navigateur.",
        );
        return false;
      }

      // Permissions need to be requested - this will be done via getUserMedia
      return true;
    } catch {
      // Permissions API not supported, continue with getUserMedia
      return true;
    }
  }, []);

  // Initialiser la capture média
  useEffect(() => {
    const init = async () => {
      await requestPermissions();
      await initializeMedia();
      await loadDevices();
    };
    init();

    return () => {
      // Only stop the stream if we're NOT navigating to the room
      // This prevents the stream from being released before RoomPage can use it
      if (!isNavigatingRef.current && stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mettre à jour le flux vidéo
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const loadDevices = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList);

      const videoDevice = deviceList.find((d) => d.kind === "videoinput");
      const audioDevice = deviceList.find((d) => d.kind === "audioinput");

      if (videoDevice) {
        setSelectedVideoDevice(videoDevice.deviceId);
        // Set initial camera type - default devices are usually front cameras
        setIsFrontCamera(!isBackCamera(videoDevice));
      }
      if (audioDevice) setSelectedAudioDevice(audioDevice.deviceId);
    } catch (_err) {
      // Error loading devices handled silently
    }
  };



  const initializeMedia = async (deviceIdOverride?: string, retryCount: number = 0) => {
    try {
      // Check network status first
      if (!networkStatus.isOnline) {
        setError("Pas de connexion internet. Vérifiez votre réseau.");
        return;
      }

      const videoDeviceId = deviceIdOverride || selectedVideoDevice || undefined;
      
      // Determine facing mode based on device ID if possible
      let facingMode: "user" | "environment" = "user";
      if (videoDeviceId) {
          const device = devices.find(d => d.deviceId === videoDeviceId);
          if (device && isBackCamera(device)) {
              facingMode = "environment";
          }
      }

      const { stream, error } = await captureMediaStream(
          true, // audioOn
          true, // videoOn
          "auto", // videoQuality
          facingMode,
          selectedAudioDevice || undefined,
          videoDeviceId,
          retryCount
      );

      if (stream) {
        setStream(stream);
        setPermissionsGranted(true);
        setError(null);
        mediaRetryCount.current = 0;
      } else if (error) {
          setError(error);
          // Handle retries if needed (captureMediaStream already handles some retries)
          if (error.includes("occupée") || error.includes("timeout") || error.includes("interrompue") || error.includes("Erreur")) {
             if (retryCount < maxMediaRetries) {
                setTimeout(() => {
                    initializeMedia(deviceIdOverride, retryCount + 1);
                }, 1000 * (retryCount + 1));
             }
          }
      }
    } catch (err: any) {
        console.error("Media initialization error:", err);
        setError("Erreur inattendue lors de l'initialisation média.");
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = async () => {
    if (videoEnabled) {
      // DISABLE: Stop video tracks properly
      if (stream) {
        stream.getVideoTracks().forEach((track) => track.stop());
      }
      setVideoEnabled(false);
    } else {
      // ENABLE: Get a fresh video stream since stopped tracks cannot be restarted
      try {
        // Use optimal video constraints when re-enabling camera
        const videoConstraints = selectedVideoDevice
          ? getOptimalVideoConstraints(
              isFrontCamera ? "user" : "environment",
              false,
              selectedVideoDevice,
            )
          : getOptimalVideoConstraints("user", false);

        // Get existing audio tracks that are still live
        const existingAudioTracks =
          stream?.getAudioTracks().filter((t) => t.readyState === "live") || [];

        // If we have live audio tracks, only request video
        // Otherwise, request both video and audio
        let newStream: MediaStream;

        if (existingAudioTracks.length > 0) {
          // Only get video, reuse existing audio
          const newVideoStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
          const newVideoTrack = newVideoStream.getVideoTracks()[0];

          if (newVideoTrack) {
            // Combine with existing live audio tracks
            newStream = new MediaStream([
              ...existingAudioTracks,
              newVideoTrack,
            ]);
          } else {
            throw new Error("No video track obtained");
          }
        } else {
          // No live audio tracks, get both video and audio
          const audioConstraints = selectedAudioDevice
            ? {
                ...getOptimalAudioConstraints(),
                deviceId: { exact: selectedAudioDevice },
              }
            : getOptimalAudioConstraints();

          newStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: audioConstraints,
          });
        }

        // Update the stream state
        setStream(newStream);

        // Update the video element
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          try {
            await videoRef.current.play();
          } catch (e) {
            // Autoplay might be blocked, but that's okay for preview
          }
        }

        setVideoEnabled(true);
      } catch (error) {
        console.error("Failed to re-enable camera:", error);
        setError("Impossible de réactiver la caméra. Veuillez réessayer.");
      }
    }
  };

  const handleJoin = async () => {
    if (!userName.trim() || isJoining) {
      return;
    }

    // Validate room code
    if (!code || code.length < 3) {
      setError("Code de réunion invalide.");
      return;
    }

    // Check network status
    if (!networkStatus.isOnline) {
      setError("Pas de connexion internet. Vérifiez votre réseau.");
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      // On Android, ensure we have fresh permissions before joining
      if (isAndroid() && !permissionsGranted) {
        // Try to get permissions one more time with timeout
        try {
          const testStream = await withTimeoutRace(
            navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            }),
            10000,
            "Permission check timeout"
          );
          // Stop the test stream immediately - RoomPage will create its own
          testStream.getTracks().forEach((track) => track.stop());
          setPermissionsGranted(true);
        } catch (permErr: any) {
          console.error("[PreJoinPage] Permission error:", permErr);
          if (permErr.name === "NotAllowedError") {
            setError(
              "Veuillez autoriser l'accès à la caméra et au microphone pour rejoindre la réunion.",
            );
          } else if (permErr.message?.includes("timeout")) {
            setError("Délai dépassé lors de la vérification des permissions. Vérifiez que votre caméra n'est pas utilisée par une autre application.");
          } else {
            setError("Impossible d'accéder à la caméra ou au microphone.");
          }
          setIsJoining(false);
          return;
        }
      }

      // Mark that we're navigating - this prevents cleanup from stopping the stream
      isNavigatingRef.current = true;

      // Stop the preview stream before navigating
      // RoomPage will create its own stream with the correct settings
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }

      // Small delay to ensure stream is fully released (important for Android)
      if (isAndroid() || isMobileDevice()) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Sauvegarder dans l'historique
      if (code) {
        saveRecentRoom(code);
      }

      // Extraire le hostPeerId du hash pour Quick Fix P2P
      // Le hash contient le peer ID de l'hôte (format: #peer_id=xxx)
      // CRITICAL FIX: If no hash, use deterministic host ID based on room code
      const hash = window.location.hash;
      let hostPeerId: string | undefined = undefined;
      if (hash.startsWith("#peer_id=")) {
        hostPeerId = hash.replace("#peer_id=", "");
        console.log(
          "[PreJoinPage] Using hostPeerId from URL hash:",
          hostPeerId,
        );
      } else if (code && !isHost) {
        // No hash provided - use deterministic host ID
        // This allows joining with just the room code
        hostPeerId = `host-${code}`;
        console.log(
          "[PreJoinPage] No hash provided, using deterministic hostPeerId:",
          hostPeerId,
        );
      }

      // Passer les infos à la page de réunion
      navigate(`/room/${code}`, {
        state: {
          userName: userName.trim(),
          audioEnabled,
          videoEnabled,
          isHost,
          hostPeerId,
        },
      });
    } catch (err: any) {
      console.error("Error joining room:", err);
      setError(err.message || "Erreur lors de la connexion à la réunion.");
      setIsJoining(false);
      isNavigatingRef.current = false;
    }
  };

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioDevices = devices.filter((d) => d.kind === "audioinput");

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
        >
          <Icon name="arrow-back" size={24} />
          <span>Retour</span>
        </button>

        <div className="flex items-center gap-2 text-neutral-400">
          <span className="font-mono text-sm">{code}</span>
          <button
            onClick={copyCode}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
            title="Copier le code"
          >
            <Icon
              name={copied ? "check" : "copy"}
              size={18}
              className={copied ? "text-success-500" : ""}
            />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="max-w-3xl w-full flex flex-col lg:flex-row gap-8 items-center">
          {/* Prévisualisation vidéo */}
          <div className="flex-1 w-full max-w-md">
            <div className="aspect-video bg-neutral-800 rounded-xl overflow-hidden relative">
              {videoEnabled && stream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: isFrontCamera ? "scaleX(-1)" : "none" }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar name={userName || "Anonyme"} id="local" size="xl" />
                </div>
              )}

              {/* Contrôles */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                <button
                  onClick={toggleAudio}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${
                      audioEnabled
                        ? "bg-neutral-700/80 hover:bg-neutral-600/80 text-white"
                        : "bg-danger-500 hover:bg-danger-400 text-white"
                    }
                  `}
                >
                  <Icon name={audioEnabled ? "mic" : "mic-off"} size={24} />
                </button>

                <button
                  onClick={toggleVideo}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${
                      videoEnabled
                        ? "bg-neutral-700/80 hover:bg-neutral-600/80 text-white"
                        : "bg-danger-500 hover:bg-danger-400 text-white"
                    }
                  `}
                >
                  <Icon
                    name={videoEnabled ? "videocam" : "videocam-off"}
                    size={24}
                  />
                </button>
              </div>

              {/* Erreur */}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/90 p-4">
                  <div className="text-center max-w-xs">
                    <Icon
                      name="videocam-off"
                      size={48}
                      className="text-danger-500 mx-auto mb-4"
                    />
                    <p className="text-white text-sm mb-2">{error}</p>
                    
                    {/* Show network warning if offline */}
                    {!networkStatus.isOnline && (
                      <p className="text-warning-400 text-xs mb-3">
                        ⚠️ Vous êtes hors ligne
                      </p>
                    )}
                    
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => initializeMedia()}
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        disabled={!networkStatus.isOnline}
                      >
                        Réessayer
                      </Button>
                      
                      {/* Show settings button for permission errors */}
                      {(error.includes("permission") || error.includes("Permission")) && (
                        <Button
                          onClick={() => {
                            // Open browser settings (works in some browsers)
                            if (navigator.permissions) {
                              navigator.permissions.query({ name: "camera" as PermissionName })
                                .then(() => {
                                  // Try to trigger permission prompt again
                                  initializeMedia();
                                })
                                .catch(() => {
                                  // Show help message
                                  alert("Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.");
                                });
                            }
                          }}
                          variant="primary"
                          size="sm"
                          className="mt-2"
                        >
                          Autoriser
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sélecteurs de périphériques */}
            <div className="mt-4 space-y-3">
              {videoDevices.length > 1 && (
                <select
                  value={selectedVideoDevice}
                  onChange={async (e) => {
                    const newDeviceId = e.target.value;
                    console.log("Camera selection changed to:", newDeviceId);
                    console.log("Previous device:", selectedVideoDevice);

                    // Detect if the new camera is front or back for mirroring
                    const newDevice = videoDevices.find(
                      (d) => d.deviceId === newDeviceId,
                    );
                    const isBack = newDevice ? isBackCamera(newDevice) : false;
                    console.log("New camera is back camera:", isBack);
                    setIsFrontCamera(!isBack);

                    // Stop current stream before switching - this is critical!
                    if (stream) {
                      console.log("Stopping current stream tracks...");
                      stream.getTracks().forEach((track) => {
                        console.log("Stopping track:", track.kind, track.label);
                        track.stop();
                      });
                      setStream(null);
                    }

                    // Update state first
                    setSelectedVideoDevice(newDeviceId);

                    // Wait for the camera to be fully released (important on mobile)
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    // Re-initialize with new device
                    console.log(
                      "Re-initializing media with device:",
                      newDeviceId,
                    );
                    await initializeMedia(newDeviceId);
                  }}
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white"
                >
                  {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {getCameraLabel(device)}
                    </option>
                  ))}
                </select>
              )}

              {audioDevices.length > 1 && (
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white"
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Micro ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Formulaire */}
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-medium text-white mb-2">
              {isHost ? "Creer une reunion" : "Rejoindre la reunion"}
            </h1>
            <p className="text-neutral-400 mb-6">
              Code: <span className="font-mono text-white">{code}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-2">
                  Votre nom
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Entrez votre nom"
                  className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
              </div>

              <Button
                onClick={handleJoin}
                disabled={!userName.trim() || isJoining}
                className="w-full"
                size="lg"
              >
                {isJoining
                  ? "Connexion..."
                  : isHost
                    ? "Démarrer"
                    : "Rejoindre maintenant"}
              </Button>

              {/* Permission warning for Android */}
              {isAndroid() && !permissionsGranted && !error && (
                <p className="text-xs text-warning-400 text-center mt-2">
                  ⚠️ Assurez-vous d'autoriser l'accès à la caméra et au
                  microphone
                </p>
              )}

              {isHost && (
                <div className="mt-6 p-4 bg-neutral-800 rounded-lg">
                  <p className="text-sm text-neutral-400 mb-2">
                    Partagez ce code avec les participants:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-neutral-900 rounded font-mono text-white">
                      {code}
                    </code>
                    <Button onClick={copyCode} variant="secondary" size="sm">
                      <Icon name={copied ? "check" : "copy"} size={18} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-neutral-800 bg-neutral-900">
        <p className="text-neutral-500 text-xs">
          Développé par{" "}
          <a
            href="https://www.jematechnology.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:underline"
          >
            Jema Technology
          </a>{" "}
          © 2025 • Open Source & sous licence AGPL
        </p>
      </footer>
    </div>
  );
}
