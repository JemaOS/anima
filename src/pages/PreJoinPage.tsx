// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Icon, Avatar } from '@/components/ui';
import { saveRecentRoom } from '@/utils/helpers';
import { getOptimalVideoConstraints, getOptimalAudioConstraints, VIDEO_PRESETS, getDeviceType } from '@/utils/videoConstraints';

// Detect if device is Android
const isAndroid = () => /Android/i.test(navigator.userAgent);

// Detect if device is mobile
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window);
};

// Helper function to get French camera label
const getCameraLabel = (device: MediaDeviceInfo): string => {
  const label = device.label.toLowerCase();
  
  // Detect front camera
  if (label.includes('front') || label.includes('user') || label.includes('avant') || label.includes('facing front')) {
    return 'Caméra avant';
  }
  
  // Detect back camera
  if (label.includes('back') || label.includes('environment') || label.includes('arrière') || label.includes('facing back') || label.includes('rear')) {
    return 'Caméra arrière';
  }
  
  // If label contains camera number, try to determine type
  // Usually camera 0 is back, camera 1 is front on Android
  const cameraMatch = label.match(/camera\s*(\d+)/i);
  if (cameraMatch) {
    const cameraNum = parseInt(cameraMatch[1], 10);
    if (cameraNum === 0) return 'Caméra arrière';
    if (cameraNum === 1) return 'Caméra avant';
  }
  
  // Fallback: use original label or generic name
  return device.label || `Caméra ${device.deviceId.slice(0, 8)}`;
};

// Helper function to detect if a device is the back camera
const isBackCamera = (device: MediaDeviceInfo): boolean => {
  const label = device.label.toLowerCase();
  return label.includes('back') ||
         label.includes('environment') ||
         label.includes('arrière') ||
         label.includes('facing back') ||
         label.includes('rear') ||
         label.includes('camera 0');
};

export function PreJoinPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const isHost = searchParams.get('host') === 'true';

  const [userName, setUserName] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true); // Track if using front camera for mirroring

  const videoRef = useRef<HTMLVideoElement>(null);
  const isNavigatingRef = useRef(false);

  // Request permissions explicitly (important for Android)
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // On Android, we need to explicitly request permissions
      // This ensures the user sees the permission dialog
      const permissionStatus = await Promise.all([
        navigator.permissions?.query({ name: 'camera' as PermissionName }).catch(() => null),
        navigator.permissions?.query({ name: 'microphone' as PermissionName }).catch(() => null),
      ]);

      const cameraPermission = permissionStatus[0];
      const micPermission = permissionStatus[1];

      // If permissions are already granted, return true
      if (cameraPermission?.state === 'granted' && micPermission?.state === 'granted') {
        setPermissionsGranted(true);
        return true;
      }

      // If permissions are denied, show error
      if (cameraPermission?.state === 'denied' || micPermission?.state === 'denied') {
        setError('Permissions refusées. Veuillez autoriser l\'accès à la caméra et au microphone dans les paramètres de votre navigateur.');
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
        stream.getTracks().forEach(track => track.stop());
      }
    };
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
      
      const videoDevice = deviceList.find(d => d.kind === 'videoinput');
      const audioDevice = deviceList.find(d => d.kind === 'audioinput');
      
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

  // Get camera stream with facingMode support for back camera
  const getCameraStream = async (deviceId: string | null, devices: MediaDeviceInfo[]): Promise<MediaStream | null> => {
    // Use optimal audio constraints from utility
    const audioConstraints: MediaTrackConstraints = {
      ...getOptimalAudioConstraints(),
    };
    
    if (selectedAudioDevice) {
      audioConstraints.deviceId = { exact: selectedAudioDevice };
    }

    // If a specific device is selected, check if it's a back camera
    if (deviceId) {
      const selectedDevice = devices.find(d => d.deviceId === deviceId);
      const isBack = selectedDevice ? isBackCamera(selectedDevice) : false;
      
      console.log('getCameraStream called with deviceId:', deviceId);
      console.log('Selected device:', selectedDevice?.label);
      console.log('Is back camera:', isBack);
      
      // Get optimal video constraints based on device type and facing mode
      const facingMode = isBack ? 'environment' : 'user';
      const optimalVideoConstraints = getOptimalVideoConstraints(facingMode, false, deviceId);
      
      if (isBack) {
        // For back camera, ALWAYS use deviceId directly - this is the most reliable method
        // facingMode can be unreliable on many Android devices
        try {
          console.log('Trying back camera with deviceId: exact', deviceId);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: optimalVideoConstraints,
            audio: audioConstraints,
          });
          console.log('Back camera stream obtained successfully');
          return stream;
        } catch (deviceIdError) {
          console.log('deviceId exact failed, trying facingMode environment:', deviceIdError);
          // Fallback: try facingMode environment without deviceId
          try {
            const fallbackConstraints = getOptimalVideoConstraints('environment', true);
            const stream = await navigator.mediaDevices.getUserMedia({
              video: fallbackConstraints,
              audio: audioConstraints,
            });
            console.log('Back camera stream obtained with facingMode environment');
            return stream;
          } catch (envError) {
            console.error('All back camera methods failed:', envError);
            throw envError;
          }
        }
      } else {
        // For front camera, use deviceId directly first, then fallback to facingMode
        try {
          console.log('Trying front camera with deviceId: exact', deviceId);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: optimalVideoConstraints,
            audio: audioConstraints,
          });
          console.log('Front camera stream obtained successfully');
          return stream;
        } catch (deviceIdError) {
          console.log('deviceId exact failed, trying facingMode user:', deviceIdError);
          // Fallback to facingMode user without deviceId
          const fallbackConstraints = getOptimalVideoConstraints('user', false);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackConstraints,
            audio: audioConstraints,
          });
          console.log('Front camera stream obtained with facingMode user');
          return stream;
        }
      }
    }
    
    // No specific device selected, use optimal constraints based on device type
    const videoConstraints = getOptimalVideoConstraints('user', false);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints,
    });
    return stream;
  };

  const initializeMedia = async (deviceIdOverride?: string) => {
    try {
      // Get current device list for camera detection
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDeviceId = deviceIdOverride || selectedVideoDevice || null;
      
      const mediaStream = await getCameraStream(videoDeviceId, deviceList);
      
      if (mediaStream) {
        setStream(mediaStream);
        setPermissionsGranted(true);
        setError(null);
      }
    } catch (err: any) {
      console.error('Media initialization error:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Permissions refusées. Autorisez l\'accès à la caméra et au microphone.');
        setPermissionsGranted(false);
      } else if (err.name === 'NotFoundError') {
        setError('Aucune caméra ou microphone détecté.');
      } else if (err.name === 'OverconstrainedError') {
        // Try with less restrictive constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          setStream(fallbackStream);
          setPermissionsGranted(true);
          setError(null);
        } catch (fallbackErr) {
          setError('Erreur d\'accès aux périphériques multimédia.');
        }
      } else if (err.name === 'NotReadableError') {
        // Device is in use by another application
        setError('La caméra ou le microphone est utilisé par une autre application.');
      } else {
        setError('Erreur d\'accès aux périphériques multimédia.');
      }
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
        stream.getVideoTracks().forEach(track => track.stop());
      }
      setVideoEnabled(false);
    } else {
      // ENABLE: Get a fresh video stream since stopped tracks cannot be restarted
      try {
        // Use optimal video constraints when re-enabling camera
        const videoConstraints = selectedVideoDevice
          ? getOptimalVideoConstraints(isFrontCamera ? 'user' : 'environment', false, selectedVideoDevice)
          : getOptimalVideoConstraints('user', false);
        
        // Get existing audio tracks that are still live
        const existingAudioTracks = stream?.getAudioTracks().filter(t => t.readyState === 'live') || [];
        
        // If we have live audio tracks, only request video
        // Otherwise, request both video and audio
        let newStream: MediaStream;
        
        if (existingAudioTracks.length > 0) {
          // Only get video, reuse existing audio
          const newVideoStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
          });
          const newVideoTrack = newVideoStream.getVideoTracks()[0];
          
          if (newVideoTrack) {
            // Combine with existing live audio tracks
            newStream = new MediaStream([...existingAudioTracks, newVideoTrack]);
          } else {
            throw new Error('No video track obtained');
          }
        } else {
          // No live audio tracks, get both video and audio
          const audioConstraints = selectedAudioDevice
            ? { ...getOptimalAudioConstraints(), deviceId: { exact: selectedAudioDevice } }
            : getOptimalAudioConstraints();
          
          newStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: audioConstraints
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
        console.error('Failed to re-enable camera:', error);
        setError('Impossible de réactiver la caméra. Veuillez réessayer.');
      }
    }
  };

  const handleJoin = async () => {
    if (!userName.trim() || isJoining) {
      return;
    }

    setIsJoining(true);

    try {
      // On Android, ensure we have fresh permissions before joining
      if (isAndroid() && !permissionsGranted) {
        // Try to get permissions one more time
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          // Stop the test stream immediately - RoomPage will create its own
          testStream.getTracks().forEach(track => track.stop());
          setPermissionsGranted(true);
        } catch (permErr) {
          setError('Veuillez autoriser l\'accès à la caméra et au microphone pour rejoindre la réunion.');
          setIsJoining(false);
          return;
        }
      }

      // Mark that we're navigating - this prevents cleanup from stopping the stream
      isNavigatingRef.current = true;

      // Stop the preview stream before navigating
      // RoomPage will create its own stream with the correct settings
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      // Small delay to ensure stream is fully released (important for Android)
      if (isAndroid() || isMobileDevice()) {
        await new Promise(resolve => setTimeout(resolve, 300));
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
      if (hash.startsWith('#peer_id=')) {
        hostPeerId = hash.replace('#peer_id=', '');
        console.log('[PreJoinPage] Using hostPeerId from URL hash:', hostPeerId);
      } else if (code && !isHost) {
        // No hash provided - use deterministic host ID
        // This allows joining with just the room code
        hostPeerId = `host-${code}`;
        console.log('[PreJoinPage] No hash provided, using deterministic hostPeerId:', hostPeerId);
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
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Erreur lors de la connexion à la réunion.');
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

  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  const audioDevices = devices.filter(d => d.kind === 'audioinput');

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between">
        <button 
          onClick={() => navigate('/')}
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
            <Icon name={copied ? 'check' : 'copy'} size={18} className={copied ? 'text-success-500' : ''} />
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
                  style={{ transform: isFrontCamera ? 'scaleX(-1)' : 'none' }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar 
                    name={userName || 'Anonyme'} 
                    id="local" 
                    size="xl" 
                  />
                </div>
              )}

              {/* Contrôles */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                <button
                  onClick={toggleAudio}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${audioEnabled 
                      ? 'bg-neutral-700/80 hover:bg-neutral-600/80 text-white' 
                      : 'bg-danger-500 hover:bg-danger-400 text-white'
                    }
                  `}
                >
                  <Icon name={audioEnabled ? 'mic' : 'mic-off'} size={24} />
                </button>

                <button
                  onClick={toggleVideo}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center transition-all
                    ${videoEnabled 
                      ? 'bg-neutral-700/80 hover:bg-neutral-600/80 text-white' 
                      : 'bg-danger-500 hover:bg-danger-400 text-white'
                    }
                  `}
                >
                  <Icon name={videoEnabled ? 'videocam' : 'videocam-off'} size={24} />
                </button>
              </div>

              {/* Erreur */}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/90 p-4">
                  <div className="text-center">
                    <Icon name="videocam-off" size={48} className="text-danger-500 mx-auto mb-4" />
                    <p className="text-white text-sm">{error}</p>
                    <Button onClick={() => initializeMedia()} variant="secondary" size="sm" className="mt-4">
                      Reessayer
                    </Button>
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
                    console.log('Camera selection changed to:', newDeviceId);
                    console.log('Previous device:', selectedVideoDevice);
                    
                    // Detect if the new camera is front or back for mirroring
                    const newDevice = videoDevices.find(d => d.deviceId === newDeviceId);
                    const isBack = newDevice ? isBackCamera(newDevice) : false;
                    console.log('New camera is back camera:', isBack);
                    setIsFrontCamera(!isBack);
                    
                    // Stop current stream before switching - this is critical!
                    if (stream) {
                      console.log('Stopping current stream tracks...');
                      stream.getTracks().forEach(track => {
                        console.log('Stopping track:', track.kind, track.label);
                        track.stop();
                      });
                      setStream(null);
                    }
                    
                    // Update state first
                    setSelectedVideoDevice(newDeviceId);
                    
                    // Wait for the camera to be fully released (important on mobile)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Re-initialize with new device
                    console.log('Re-initializing media with device:', newDeviceId);
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
              {isHost ? 'Creer une reunion' : 'Rejoindre la reunion'}
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
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
              </div>

              <Button
                onClick={handleJoin}
                disabled={!userName.trim() || isJoining}
                className="w-full"
                size="lg"
              >
                {isJoining ? 'Connexion...' : (isHost ? 'Démarrer' : 'Rejoindre maintenant')}
              </Button>

              {/* Permission warning for Android */}
              {isAndroid() && !permissionsGranted && !error && (
                <p className="text-xs text-warning-400 text-center mt-2">
                  ⚠️ Assurez-vous d'autoriser l'accès à la caméra et au microphone
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
                      <Icon name={copied ? 'check' : 'copy'} size={18} />
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
          Développé par <a href="https://www.jematechnology.fr/" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">Jema Technology</a> © 2025 • Open Source & sous licence AGPL
        </p>
      </footer>
    </div>
  );
}
