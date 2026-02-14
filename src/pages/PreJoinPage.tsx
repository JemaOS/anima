// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Icon, Avatar } from "@/components/ui";
import { saveRecentRoom } from "@/utils/helpers";
import {
  getOptimalVideoConstraints,
  getOptimalAudioConstraints,
  getDeviceType,
} from "@/utils/videoConstraints";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { withTimeoutRace } from "@/utils/retry";
import {
  captureMediaStream,
  getCameraLabel,
  isBackCamera,
  isAndroid,
  isMobileDevice,
} from "@/utils/mediaHelpers";

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
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isNavigatingRef = useRef(false);
  const mediaRetryCount = useRef(0);
  const maxMediaRetries = 3;

  const networkStatus = useNetworkStatus({
    onOnline: () => {
      console.log("[PreJoinPage] 🌐 Network restored");
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

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const permissionStatus = await Promise.all([
        navigator.permissions?.query({ name: "camera" as PermissionName }).catch(() => null),
        navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null),
      ]);

      const [cameraPermission, micPermission] = permissionStatus;

      if (cameraPermission?.state === "granted" && micPermission?.state === "granted") {
        setPermissionsGranted(true);
        return true;
      }

      if (cameraPermission?.state === "denied" || micPermission?.state === "denied") {
        setError("Permissions refusées. Veuillez autoriser l'accès à la caméra et au microphone dans les paramètres de votre navigateur.");
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }, []);

  const getFacingMode = (videoDeviceId?: string): "user" | "environment" => {
    if (videoDeviceId) {
      const device = devices.find((d) => d.deviceId === videoDeviceId);
      if (device && isBackCamera(device)) {
        return "environment";
      }
    }
    return "user";
  };

  const handleStreamError = (streamError: string, retryCount: number, deviceIdOverride?: string) => {
    setError(streamError);
    if (
      (streamError.includes("occupée") ||
        streamError.includes("timeout") ||
        streamError.includes("interrompue") ||
        streamError.includes("Erreur")) &&
      retryCount < maxMediaRetries
    ) {
      setTimeout(() => {
        initializeMedia(deviceIdOverride, retryCount + 1);
      }, 1000 * (retryCount + 1));
    }
  };

  const initializeMedia = async (deviceIdOverride?: string, retryCount: number = 0) => {
    try {
      if (!networkStatus.isOnline) {
        setError("Pas de connexion internet. Vérifiez votre réseau.");
        return;
      }

      const videoDeviceId = deviceIdOverride || selectedVideoDevice || undefined;
      const facingMode = getFacingMode(videoDeviceId);

      const { stream: newStream, error: streamError } = await captureMediaStream(
        true,
        true,
        "auto",
        facingMode,
        selectedAudioDevice || undefined,
        videoDeviceId,
        retryCount
      );

      if (newStream) {
        setStream(newStream);
        setPermissionsGranted(true);
        setError(null);
        mediaRetryCount.current = 0;
      } else if (streamError) {
        handleStreamError(streamError, retryCount, deviceIdOverride);
      }
    } catch (err: any) {
      console.error("Media initialization error:", err);
      setError("Erreur inattendue lors de l'initialisation média.");
    }
  };

  useEffect(() => {
    const init = async () => {
      await requestPermissions();
      await initializeMedia();
      await loadDevices();
    };
    init();

    return () => {
      if (!isNavigatingRef.current && stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setIsFrontCamera(!isBackCamera(videoDevice));
      }
      if (audioDevice) setSelectedAudioDevice(audioDevice.deviceId);
    } catch (_err) {
      // Error loading devices handled silently
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

  const enableVideo = async () => {
    try {
      const videoConstraints = getVideoConstraints(selectedVideoDevice, isFrontCamera);
      const newStream = await createStreamWithVideo(stream, videoConstraints, selectedAudioDevice);

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        try {
          await videoRef.current.play();
        } catch (e) {
          // Autoplay might be blocked
        }
      }
      setVideoEnabled(true);
    } catch (error) {
      console.error("Failed to re-enable camera:", error);
      setError("Impossible de réactiver la caméra. Veuillez réessayer.");
    }
  };

  const toggleVideo = async () => {
    if (videoEnabled) {
      if (stream) {
        stream.getVideoTracks().forEach((track) => track.stop());
      }
      setVideoEnabled(false);
    } else {
      await enableVideo();
    }
  };

  const prepareForJoin = async () => {
    isNavigatingRef.current = true;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    if (isAndroid() || isMobileDevice()) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (code) saveRecentRoom(code);
  };

  const handleJoin = async () => {
    if (!validateJoinInputs(userName, code, isJoining, networkStatus, setError)) return;

    setIsJoining(true);
    setError(null);

    try {
      const permsOK = await ensurePermissions(isAndroid(), permissionsGranted, setError, setPermissionsGranted);
      if (!permsOK) {
        setIsJoining(false);
        return;
      }

      await prepareForJoin();

      const hostPeerId = getHostPeerIdFromUrl(window.location.hash, code, isHost);

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

  const handleVideoDeviceChange = async (newDeviceId: string) => {
    console.log("Camera selection changed to:", newDeviceId);
    const newDevice = devices.find((d) => d.deviceId === newDeviceId);
    const isBack = newDevice ? isBackCamera(newDevice) : false;
    setIsFrontCamera(!isBack);

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    setSelectedVideoDevice(newDeviceId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await initializeMedia(newDeviceId);
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      <PreJoinHeader code={code} copied={copied} onBack={() => navigate("/")} onCopy={copyCode} />

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="max-w-3xl w-full flex flex-col lg:flex-row gap-8 items-center">
          <div className="flex-1 w-full max-w-md">
            <VideoPreview
              videoRef={videoRef}
              stream={stream}
              videoEnabled={videoEnabled}
              audioEnabled={audioEnabled}
              isFrontCamera={isFrontCamera}
              userName={userName}
              error={error}
              networkStatus={networkStatus}
              onToggleAudio={toggleAudio}
              onToggleVideo={toggleVideo}
              onRetry={() => initializeMedia()}
            />

            <DeviceSelectors
              devices={devices}
              selectedVideoDevice={selectedVideoDevice}
              selectedAudioDevice={selectedAudioDevice}
              onVideoDeviceChange={handleVideoDeviceChange}
              onAudioDeviceChange={setSelectedAudioDevice}
            />
          </div>

          <JoinForm
            isHost={isHost}
            code={code}
            userName={userName}
            isJoining={isJoining}
            permissionsGranted={permissionsGranted}
            error={error}
            copied={copied}
            onUserNameChange={setUserName}
            onJoin={handleJoin}
            onCopyCode={copyCode}
          />
        </div>
      </main>

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

// --- Helper Functions & Sub-components ---

function getVideoConstraints(selectedVideoDevice: string, isFrontCamera: boolean) {
  return selectedVideoDevice
    ? getOptimalVideoConstraints(isFrontCamera ? "user" : "environment", false, selectedVideoDevice)
    : getOptimalVideoConstraints("user", false);
}

async function createStreamWithVideo(
  currentStream: MediaStream | null,
  videoConstraints: any,
  audioDeviceId: string
): Promise<MediaStream> {
  const existingAudioTracks =
    currentStream?.getAudioTracks().filter((t) => t.readyState === "live") || [];

  if (existingAudioTracks.length > 0) {
    const newVideoStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    if (!newVideoTrack) throw new Error("No video track obtained");
    return new MediaStream([...existingAudioTracks, newVideoTrack]);
  } else {
    const audioConstraints = audioDeviceId
      ? { ...getOptimalAudioConstraints(), deviceId: { exact: audioDeviceId } }
      : getOptimalAudioConstraints();
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints,
    });
  }
}

function validateJoinInputs(
  userName: string,
  code: string | undefined,
  isJoining: boolean,
  networkStatus: any,
  setError: (msg: string) => void
): boolean {
  if (!userName.trim() || isJoining) return false;
  if (!code || code.length < 3) {
    setError("Code de réunion invalide.");
    return false;
  }
  if (!networkStatus.isOnline) {
    setError("Pas de connexion internet. Vérifiez votre réseau.");
    return false;
  }
  return true;
}

async function ensurePermissions(
  isAndroidDevice: boolean,
  permissionsGranted: boolean,
  setError: (msg: string) => void,
  setPermissionsGranted: (granted: boolean) => void
): Promise<boolean> {
  if (isAndroidDevice && !permissionsGranted) {
    try {
      const testStream = await withTimeoutRace(
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
        10000,
        "Permission check timeout"
      );
      testStream.getTracks().forEach((track) => track.stop());
      setPermissionsGranted(true);
      return true;
    } catch (permErr: any) {
      console.error("[PreJoinPage] Permission error:", permErr);
      if (permErr.name === "NotAllowedError") {
        setError(
          "Veuillez autoriser l'accès à la caméra et au microphone pour rejoindre la réunion."
        );
      } else if (permErr.message?.includes("timeout")) {
        setError(
          "Délai dépassé lors de la vérification des permissions. Vérifiez que votre caméra n'est pas utilisée par une autre application."
        );
      } else {
        setError("Impossible d'accéder à la caméra ou au microphone.");
      }
      return false;
    }
  }
  return true;
}

function getHostPeerIdFromUrl(hash: string, code: string | undefined, isHost: boolean): string | undefined {
  if (hash.startsWith("#peer_id=")) {
    const id = hash.replace("#peer_id=", "");
    console.log("[PreJoinPage] Using hostPeerId from URL hash:", id);
    return id;
  } else if (code && !isHost) {
    const id = `host-${code}`;
    console.log("[PreJoinPage] No hash provided, using deterministic hostPeerId:", id);
    return id;
  }
  return undefined;
}

// --- Sub-components ---

const PreJoinHeader = ({
  code,
  copied,
  onBack,
  onCopy,
}: {
  code: string | undefined;
  copied: boolean;
  onBack: () => void;
  onCopy: () => void;
}) => (
  <header className="h-16 px-6 flex items-center justify-between">
    <button
      onClick={onBack}
      className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
    >
      <Icon name="arrow-back" size={24} />
      <span>Retour</span>
    </button>

    <div className="flex items-center gap-2 text-neutral-400">
      <span className="font-mono text-sm">{code}</span>
      <button
        onClick={onCopy}
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
);

const VideoPreview = ({
  videoRef,
  stream,
  videoEnabled,
  audioEnabled,
  isFrontCamera,
  userName,
  error,
  networkStatus,
  onToggleAudio,
  onToggleVideo,
  onRetry,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  stream: MediaStream | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  isFrontCamera: boolean;
  userName: string;
  error: string | null;
  networkStatus: any;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onRetry: () => void;
}) => (
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

    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
      <button
        onClick={onToggleAudio}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          audioEnabled
            ? "bg-neutral-700/80 hover:bg-neutral-600/80 text-white"
            : "bg-danger-500 hover:bg-danger-400 text-white"
        }`}
      >
        <Icon name={audioEnabled ? "mic" : "mic-off"} size={24} />
      </button>

      <button
        onClick={onToggleVideo}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          videoEnabled
            ? "bg-neutral-700/80 hover:bg-neutral-600/80 text-white"
            : "bg-danger-500 hover:bg-danger-400 text-white"
        }`}
      >
        <Icon name={videoEnabled ? "videocam" : "videocam-off"} size={24} />
      </button>
    </div>

    {error && (
      <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/90 p-4">
        <div className="text-center max-w-xs">
          <Icon name="videocam-off" size={48} className="text-danger-500 mx-auto mb-4" />
          <p className="text-white text-sm mb-2">{error}</p>

          {!networkStatus.isOnline && (
            <p className="text-warning-400 text-xs mb-3">⚠️ Vous êtes hors ligne</p>
          )}

          <div className="flex gap-2 justify-center">
            <Button
              onClick={onRetry}
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={!networkStatus.isOnline}
            >
              Réessayer
            </Button>

            {(error.includes("permission") || error.includes("Permission")) && (
              <Button
                onClick={() => {
                  if (navigator.permissions) {
                    navigator.permissions
                      .query({ name: "camera" as PermissionName })
                      .then(() => onRetry())
                      .catch(() =>
                        alert(
                          "Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur."
                        )
                      );
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
);

const DeviceSelectors = ({
  devices,
  selectedVideoDevice,
  selectedAudioDevice,
  onVideoDeviceChange,
  onAudioDeviceChange,
}: {
  devices: MediaDeviceInfo[];
  selectedVideoDevice: string;
  selectedAudioDevice: string;
  onVideoDeviceChange: (id: string) => void;
  onAudioDeviceChange: (id: string) => void;
}) => {
  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioDevices = devices.filter((d) => d.kind === "audioinput");

  return (
    <div className="mt-4 space-y-3">
      {videoDevices.length > 1 && (
        <select
          value={selectedVideoDevice}
          onChange={(e) => onVideoDeviceChange(e.target.value)}
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
          onChange={(e) => onAudioDeviceChange(e.target.value)}
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
  );
};

const JoinForm = ({
  isHost,
  code,
  userName,
  isJoining,
  permissionsGranted,
  error,
  copied,
  onUserNameChange,
  onJoin,
  onCopyCode,
}: {
  isHost: boolean;
  code: string | undefined;
  userName: string;
  isJoining: boolean;
  permissionsGranted: boolean;
  error: string | null;
  copied: boolean;
  onUserNameChange: (name: string) => void;
  onJoin: () => void;
  onCopyCode: () => void;
}) => (
  <div className="w-full max-w-sm">
    <h1 className="text-2xl font-medium text-white mb-2">
      {isHost ? "Creer une reunion" : "Rejoindre la reunion"}
    </h1>
    <p className="text-neutral-400 mb-6">
      Code: <span className="font-mono text-white">{code}</span>
    </p>

    <div className="space-y-4">
      <div>
        <label className="block text-sm text-neutral-400 mb-2">Votre nom</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => onUserNameChange(e.target.value)}
          placeholder="Entrez votre nom"
          className="w-full h-12 px-4 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
          onKeyDown={(e) => e.key === "Enter" && onJoin()}
        />
      </div>

      <Button
        onClick={onJoin}
        disabled={!userName.trim() || isJoining}
        className="w-full"
        size="lg"
      >
        {isJoining ? "Connexion..." : isHost ? "Démarrer" : "Rejoindre maintenant"}
      </Button>

      {isAndroid() && !permissionsGranted && !error && (
        <p className="text-xs text-warning-400 text-center mt-2">
          ⚠️ Assurez-vous d'autoriser l'accès à la caméra et au microphone
        </p>
      )}

      {isHost && (
        <div className="mt-6 p-4 bg-neutral-800 rounded-lg">
          <p className="text-sm text-neutral-400 mb-2">Partagez ce code avec les participants:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-neutral-900 rounded font-mono text-white">
              {code}
            </code>
            <Button onClick={onCopyCode} variant="secondary" size="sm">
              <Icon name={copied ? "check" : "copy"} size={18} />
            </Button>
          </div>
        </div>
      )}
    </div>
  </div>
);
