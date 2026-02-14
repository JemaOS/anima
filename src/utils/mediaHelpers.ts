import {
  getOptimalAudioConstraints,
  getOptimalVideoConstraints,
  VideoQualityLevel,
} from "./videoConstraints";
import { withTimeoutRace } from "./retry";

// Detect if device is Android
export const isAndroid = () => /Android/i.test(navigator.userAgent);

// Detect if device is mobile
export const isMobileDevice = () => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || "ontouchstart" in window
  );
};

export async function captureMediaStream(
  audioOn: boolean,
  videoOn: boolean,
  videoQuality: VideoQualityLevel,
  facingMode: "user" | "environment",
  audioDeviceId?: string,
  videoDeviceId?: string,
  retryCount: number = 0,
): Promise<{ stream: MediaStream | null; error: string | null }> {
  const maxRetries = isAndroid() ? 3 : 1;

  try {
    // Use optimal audio constraints from utility
    const audioConstraints: MediaTrackConstraints = getOptimalAudioConstraints();

    if (audioDeviceId) {
      audioConstraints.deviceId = { exact: audioDeviceId };
    }

    // Get video constraints with the specified facing mode and quality using utility
    const videoConstraints: MediaTrackConstraints = {
      ...getOptimalVideoConstraints(
        facingMode,
        false,
        undefined,
        videoQuality,
      ),
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
      await new Promise((resolve) => setTimeout(resolve, 500 * retryCount));
    }

    // Add timeout to prevent hanging
    const stream = await withTimeoutRace(
      navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      }),
      15000, // 15 second timeout
      "Media capture timeout",
    );

    stream.getAudioTracks().forEach((track) => (track.enabled = audioOn));
    stream.getVideoTracks().forEach((track) => (track.enabled = videoOn));

    return { stream, error: null };
  } catch (error: any) {
    console.error(
      `Media capture error (attempt ${retryCount + 1}):`,
      error,
    );

    if (error.name === "NotFoundError") {
      return { stream: null, error: "Aucune caméra ou microphone détecté" };
    } else if (error.name === "NotAllowedError") {
      // On Android, permissions might need to be re-requested
      if (isAndroid() && retryCount < maxRetries) {
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return captureMediaStream(
          audioOn,
          videoOn,
          videoQuality,
          facingMode,
          audioDeviceId,
          videoDeviceId,
          retryCount + 1,
        );
      }
      return {
        stream: null,
        error: "Permissions refusées. Veuillez autoriser l'accès à la caméra et au microphone.",
      };
    } else if (error.name === "NotReadableError") {
      // Device is busy - common on Android when switching between pages
      if (retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return captureMediaStream(
          audioOn,
          videoOn,
          videoQuality,
          facingMode,
          audioDeviceId,
          videoDeviceId,
          retryCount + 1,
        );
      }
      return { stream: null, error: "La caméra est utilisée par une autre application" };
    } else if (error.name === "OverconstrainedError") {
      // If facingMode constraint fails (e.g., no back camera), try without it
      try {
        const fallbackAudioConstraints: MediaTrackConstraints = getOptimalAudioConstraints();
        if (audioDeviceId) {
          fallbackAudioConstraints.deviceId = { exact: audioDeviceId };
        }
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: fallbackAudioConstraints,
        });
        fallbackStream
          .getAudioTracks()
          .forEach((track) => (track.enabled = audioOn));
        fallbackStream
          .getVideoTracks()
          .forEach((track) => (track.enabled = videoOn));
        return { stream: fallbackStream, error: "Caméra non disponible, essai avec la caméra par défaut..." };
      } catch {
        return { stream: null, error: "Erreur d'accès à la caméra" };
      }
    } else if (error.name === "AbortError") {
      // Request was aborted - retry on Android
      if (isAndroid() && retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return captureMediaStream(
          audioOn,
          videoOn,
          videoQuality,
          facingMode,
          audioDeviceId,
          videoDeviceId,
          retryCount + 1,
        );
      }
      return { stream: null, error: "Erreur d'initialisation de la caméra" };
    } else if (error.message?.includes("timeout")) {
      // Timeout error
      if (retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return captureMediaStream(
          audioOn,
          videoOn,
          videoQuality,
          facingMode,
          audioDeviceId,
          videoDeviceId,
          retryCount + 1,
        );
      }
      return { stream: null, error: "La caméra ne répond pas" };
    } else {
      // Generic error - retry on Android
      if (isAndroid() && retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return captureMediaStream(
          audioOn,
          videoOn,
          videoQuality,
          facingMode,
          audioDeviceId,
          videoDeviceId,
          retryCount + 1,
        );
      }
      return { stream: null, error: "Erreur d'accès aux périphériques" };
    }
  }
}

export async function restartVideoTrack(
  currentStream: MediaStream,
  facingMode: "user" | "environment",
  videoQuality: VideoQualityLevel,
): Promise<{ success: boolean; error?: string; newStream?: MediaStream }> {
  try {
    // Wait a bit for the camera to be released (important on mobile)
    if (isMobileDevice()) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: getOptimalVideoConstraints(
        facingMode,
        false,
        undefined,
        videoQuality,
      ),
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) {
      return { success: false, error: "No video track found" };
    }

    // Wait for unmute
    if (newVideoTrack.muted) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const onUnmute = () => {
          if (!resolved) {
            resolved = true;
            newVideoTrack.removeEventListener("unmute", onUnmute);
            resolve();
          }
        };
        newVideoTrack.addEventListener("unmute", onUnmute);
        if (!newVideoTrack.muted) onUnmute();
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            newVideoTrack.removeEventListener("unmute", onUnmute);
            resolve();
          }
        }, 2000);
      });
    }

    // Remove old track
    const oldVideoTrack = currentStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      currentStream.removeTrack(oldVideoTrack);
      if (oldVideoTrack.readyState === "live") {
        oldVideoTrack.stop();
      }
    }

    currentStream.addTrack(newVideoTrack);

    // Create new stream reference
    const newStreamRef = new MediaStream(currentStream.getTracks());

    return { success: true, newStream: newStreamRef };
  } catch (error: any) {
    return { success: false, error: error.message || "Error restarting video" };
  }
}

// Helper function to get French camera label
export const getCameraLabel = (device: MediaDeviceInfo): string => {
  const label = device.label.toLowerCase();

  // Detect front camera
  if (
    label.includes("front") ||
    label.includes("user") ||
    label.includes("avant") ||
    label.includes("facing front")
  ) {
    return "Caméra avant";
  }

  // Detect back camera
  if (
    label.includes("back") ||
    label.includes("environment") ||
    label.includes("arrière") ||
    label.includes("facing back") ||
    label.includes("rear")
  ) {
    return "Caméra arrière";
  }

  // If label contains camera number, try to determine type
  // Usually camera 0 is back, camera 1 is front on Android
  const cameraMatch = label.match(/camera\s*(\d+)/i);
  if (cameraMatch) {
    const cameraNum = parseInt(cameraMatch[1], 10);
    if (cameraNum === 0) return "Caméra arrière";
    if (cameraNum === 1) return "Caméra avant";
  }

  // Fallback: use original label or generic name
  return device.label || `Caméra ${device.deviceId.slice(0, 8)}`;
};

// Helper function to detect if a device is the back camera
export const isBackCamera = (device: MediaDeviceInfo): boolean => {
  const label = device.label.toLowerCase();
  return (
    label.includes("back") ||
    label.includes("environment") ||
    label.includes("arrière") ||
    label.includes("facing back") ||
    label.includes("rear") ||
    label.includes("camera 0")
  );
};
