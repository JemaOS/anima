import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { VideoGrid, ControlBar, SidePanel } from '@/components/room';
import { Icon } from '@/components/ui';
import { Participant, ChatMessage } from '@/types';
import { generateId, formatDuration } from '@/utils/helpers';

interface LocationState {
  userName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isHost: boolean;
  hostPeerId?: string; // Quick Fix P2P: ID du peer hôte
}

export function RoomPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // Si pas de state, rediriger vers la page prejoin (préserver le hash pour Quick Fix P2P)
  useEffect(() => {
    if (!state?.userName) {
      const hash = window.location.hash;
      console.log('[RoomPage] Redirection vers prejoin avec hash:', hash);
      navigate(`/prejoin/${code}${hash}`);
    }
  }, [state, code, navigate]);

  // État principal
  const [peer, setPeer] = useState<Peer | null>(null);
  const [myId, setMyId] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(state?.audioEnabled ?? true);
  const [videoEnabled, setVideoEnabled] = useState(state?.videoEnabled ?? true);
  const [handRaised, setHandRaised] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [duration, setDuration] = useState(0);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Panneaux
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs pour les connexions
  const dataConnections = useRef<Map<string, DataConnection>>(new Map());
  const mediaConnections = useRef<Map<string, MediaConnection>>(new Map());
  const startTime = useRef<number>(Date.now());

  // Timer de durée
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // État pour le mode sans média
  const [mediaError, setMediaError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const connectionAttempted = useRef(false);

  // Initialiser PeerJS et capturer le média local
  useEffect(() => {
    if (!state?.userName) return;

    const init = async () => {
      // 1. D'abord créer le Peer (indépendamment du média)
      const peerId = `meet-${code}-${Date.now().toString(36)}`;
      const newPeer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      newPeer.on('open', (id) => {
        console.log('[Peer] Connecte avec ID:', id);
        setMyId(id);
        setConnected(true);
        
        // Si hôte, ajouter le peer ID dans l'URL hash
        if (state?.isHost && !window.location.hash) {
          const newUrl = `${window.location.pathname}${window.location.search}#peer_id=${id}`;
          window.history.replaceState(null, '', newUrl);
          console.log('[Quick Fix P2P] Hôte - Peer ID ajouté au hash:', id);
        }
      });

      newPeer.on('error', (error) => {
        console.error('[Peer] Erreur:', error);
        // Mettre connected à true quand même pour ne pas bloquer l'UI
        setConnected(true);
      });

      setPeer(newPeer);

      // 2. Ensuite essayer de capturer le média (gestion d'erreur gracieuse)
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        
        // Appliquer les paramètres initiaux
        stream.getAudioTracks().forEach(track => {
          track.enabled = state.audioEnabled;
        });
        stream.getVideoTracks().forEach(track => {
          track.enabled = state.videoEnabled;
        });
        
        setLocalStream(stream);
        localStreamRef.current = stream;
        setMediaError(null);
      } catch (error: any) {
        console.warn('[Media] Erreur capture media:', error.name, error.message);
        // Permettre de continuer sans média
        if (error.name === 'NotFoundError') {
          setMediaError('Aucune camera ou microphone detecte. Vous pouvez continuer sans video.');
        } else if (error.name === 'NotAllowedError') {
          setMediaError('Permissions refusees. Vous pouvez continuer sans video.');
        } else {
          setMediaError('Impossible d\'acceder aux peripheriques. Mode sans video actif.');
        }
        setVideoEnabled(false);
        setAudioEnabled(false);
      }

      // 3. Configurer les handlers de connexion
      newPeer.on('connection', (dataConn) => {
        handleIncomingDataConnection(dataConn, localStreamRef.current);
      });

      newPeer.on('call', (mediaConn) => {
        handleIncomingCall(mediaConn, localStreamRef.current);
      });
    };

    init();

    return () => {
      // Cleanup
      localStream?.getTracks().forEach(track => track.stop());
      screenStream?.getTracks().forEach(track => track.stop());
      dataConnections.current.forEach(conn => conn.close());
      mediaConnections.current.forEach(conn => conn.close());
      peer?.destroy();
    };
  }, [code, state]);

  // Quick Fix P2P: Découverte automatique via hostPeerId du state
  useEffect(() => {
    console.log('[DEBUG useEffect P2P] Déclenchement du useEffect', {
      peer: !!peer,
      connected,
      myId,
      isHost: state?.isHost,
      connectionAttempted: connectionAttempted.current,
      hostPeerId: state?.hostPeerId
    });
    
    if (!peer) {
      console.log('[DEBUG useEffect P2P] ❌ Pas de peer, sortie');
      return;
    }
    if (!connected) {
      console.log('[DEBUG useEffect P2P] ❌ Pas connecté, sortie');
      return;
    }
    if (!myId) {
      console.log('[DEBUG useEffect P2P] ❌ Pas de myId, sortie');
      return;
    }
    if (connectionAttempted.current) {
      console.log('[DEBUG useEffect P2P] ❌ Connexion déjà tentée, sortie');
      return;
    }
    
    console.log('[DEBUG useEffect P2P] ✅ Toutes conditions remplies');
    
    // Si participant (pas hôte) et hostPeerId fourni, se connecter
    if (!state?.isHost && state?.hostPeerId) {
      console.log('[DEBUG useEffect P2P] 👤 Mode Participant détecté');
      console.log('[DEBUG useEffect P2P] Host Peer ID du state:', state.hostPeerId);
      
      // Vérifier que ce n'est pas notre propre ID
      if (state.hostPeerId && state.hostPeerId !== myId) {
        console.log('[Quick Fix P2P] 🚀 Participant - Lancement connexion à l\'hôte:', state.hostPeerId);
        connectionAttempted.current = true;
        
        // Attendre un peu pour s'assurer que tout est initialisé
        setTimeout(() => {
          console.log('[Quick Fix P2P] ⏱️ Timeout écoulé, appel de connectToPeer');
          connectToPeer(state.hostPeerId!);
        }, 1500);
      } else {
        console.log('[DEBUG useEffect P2P] ⚠️ hostPeerId invalide ou égal à myId');
      }
    } else if (state?.isHost) {
      console.log('[DEBUG useEffect P2P] 👑 Mode Hôte détecté, pas d\'auto-connexion');
    } else {
      console.log('[DEBUG useEffect P2P] ⚠️ Pas de hostPeerId dans le state');
    }
  }, [peer, connected, myId, state?.isHost, state?.hostPeerId]);

  // Gérer connexion de données entrante
  const handleIncomingDataConnection = useCallback((dataConn: DataConnection, stream: MediaStream | null) => {
    console.log('[Data] Connexion entrante de:', dataConn.peer);
    
    dataConnections.current.set(dataConn.peer, dataConn);

    dataConn.on('open', () => {
      // Envoyer nos infos
      dataConn.send({
        type: 'peer-info',
        data: {
          name: state?.userName,
          audioEnabled,
          videoEnabled,
        },
      });
    });

    dataConn.on('data', (data: any) => {
      handleDataMessage(data, dataConn.peer);
    });

    dataConn.on('close', () => {
      console.log('[Data] Connexion fermée avec:', dataConn.peer);
      removeParticipant(dataConn.peer);
    });
  }, [state, audioEnabled, videoEnabled]);

  // Gérer appel entrant
  const handleIncomingCall = useCallback((mediaConn: MediaConnection, stream: MediaStream | null) => {
    console.log('[Media] Appel entrant de:', mediaConn.peer);
    
    // Répondre avec notre flux (ou flux vide si pas de média)
    if (stream) {
      mediaConn.answer(stream);
    } else {
      // Créer un stream vide pour répondre
      const emptyStream = new MediaStream();
      mediaConn.answer(emptyStream);
    }
    mediaConnections.current.set(mediaConn.peer, mediaConn);

    mediaConn.on('stream', (remoteStream) => {
      console.log('[Media] Flux recu de:', mediaConn.peer);
      updateParticipant(mediaConn.peer, { stream: remoteStream });
    });

    mediaConn.on('close', () => {
      console.log('[Media] Appel ferme avec:', mediaConn.peer);
    });
  }, []);

  // Gérer les messages de données
  const handleDataMessage = useCallback((message: any, peerId: string) => {
    switch (message.type) {
      case 'peer-info':
        updateParticipant(peerId, {
          name: message.data.name,
          audioEnabled: message.data.audioEnabled,
          videoEnabled: message.data.videoEnabled,
        });
        break;

      case 'chat-message':
        setMessages(prev => [...prev, {
          id: generateId(),
          senderId: peerId,
          senderName: message.data.senderName,
          content: message.data.content,
          timestamp: message.data.timestamp,
        }]);
        break;

      case 'hand-raised':
        updateParticipant(peerId, { handRaised: true });
        break;

      case 'hand-lowered':
        updateParticipant(peerId, { handRaised: false });
        break;

      case 'media-state':
        updateParticipant(peerId, {
          audioEnabled: message.data.audioEnabled,
          videoEnabled: message.data.videoEnabled,
        });
        break;
    }
  }, []);

  // Mettre à jour un participant
  const updateParticipant = (peerId: string, data: Partial<Participant>) => {
    setParticipants(prev => {
      const updated = new Map(prev);
      const existing = updated.get(peerId);

      if (existing) {
        updated.set(peerId, { ...existing, ...data });
      } else {
        updated.set(peerId, {
          id: peerId,
          name: data.name || 'Anonyme',
          audioEnabled: data.audioEnabled ?? true,
          videoEnabled: data.videoEnabled ?? true,
          screenSharing: data.screenSharing ?? false,
          handRaised: data.handRaised ?? false,
          stream: data.stream,
        });
      }

      return updated;
    });
  };

  // Retirer un participant
  const removeParticipant = (peerId: string) => {
    setParticipants(prev => {
      const updated = new Map(prev);
      updated.delete(peerId);
      return updated;
    });
    dataConnections.current.delete(peerId);
    mediaConnections.current.delete(peerId);
  };

  // Diffuser à tous les participants
  const broadcast = (message: any) => {
    dataConnections.current.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  };

  // Connecter à un autre peer
  const connectToPeer = (peerId: string) => {
    console.log('[DEBUG connectToPeer] 🎯 Fonction appelée avec peerId:', peerId);
    console.log('[DEBUG connectToPeer] État actuel:', {
      peer: !!peer,
      hasExistingConnection: dataConnections.current.has(peerId),
      currentConnections: Array.from(dataConnections.current.keys())
    });
    
    if (!peer || dataConnections.current.has(peerId)) {
      console.log('[Connect] ❌ Impossible de se connecter:', !peer ? 'pas de peer' : 'déjà connecté');
      return;
    }

    console.log('[Connect] ✅ Lancement connexion à:', peerId);

    // Connexion de données
    const dataConn = peer.connect(peerId);
    dataConnections.current.set(peerId, dataConn);

    dataConn.on('open', () => {
      console.log('[Connect] DataConnection ouverte avec:', peerId);
      dataConn.send({
        type: 'peer-info',
        data: {
          name: state?.userName,
          audioEnabled,
          videoEnabled,
        },
      });
    });

    dataConn.on('data', (data: any) => {
      handleDataMessage(data, peerId);
    });

    dataConn.on('close', () => {
      console.log('[Connect] DataConnection fermée avec:', peerId);
      removeParticipant(peerId);
    });

    dataConn.on('error', (error) => {
      console.error('[Connect] Erreur DataConnection avec', peerId, ':', error);
    });

    // Appel média seulement si on a un stream local
    if (localStreamRef.current) {
      const mediaConn = peer.call(peerId, localStreamRef.current);
      mediaConnections.current.set(peerId, mediaConn);

      mediaConn.on('stream', (remoteStream) => {
        console.log('[Media] Flux recu de:', peerId);
        updateParticipant(peerId, { stream: remoteStream });
      });
      
      mediaConn.on('error', (error) => {
        console.error('[Media] Erreur MediaConnection avec', peerId, ':', error);
      });
    } else {
      console.log('[Connect] Pas de stream local, connexion data seulement');
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);

        broadcast({
          type: 'media-state',
          data: { audioEnabled: audioTrack.enabled, videoEnabled },
        });
      }
    }
  };

  // Toggle vidéo
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);

        broadcast({
          type: 'media-state',
          data: { audioEnabled, videoEnabled: videoTrack.enabled },
        });
      }
    }
  };

  // Partage d'écran
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      setScreenStream(stream);

      const screenTrack = stream.getVideoTracks()[0];
      
      // Remplacer la piste vidéo dans toutes les connexions
      mediaConnections.current.forEach((conn) => {
        const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      screenTrack.onended = () => {
        stopScreenShare();
      };

    } catch (error) {
      console.error('Erreur partage ecran:', error);
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);

      // Revenir à la caméra
      if (localStream) {
        const cameraTrack = localStream.getVideoTracks()[0];
        mediaConnections.current.forEach((conn) => {
          const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender && cameraTrack) {
            sender.replaceTrack(cameraTrack);
          }
        });
      }
    }
  };

  // Chat
  const sendChatMessage = (content: string) => {
    const message = {
      type: 'chat-message',
      data: {
        senderName: state?.userName,
        content,
        timestamp: Date.now(),
      },
    };

    broadcast(message);

    setMessages(prev => [...prev, {
      id: generateId(),
      senderId: myId,
      senderName: state?.userName || 'Moi',
      content,
      timestamp: Date.now(),
    }]);
  };

  // Lever/baisser la main
  const raiseHand = () => {
    setHandRaised(true);
    broadcast({ type: 'hand-raised' });
  };

  const lowerHand = () => {
    setHandRaised(false);
    broadcast({ type: 'hand-lowered' });
  };

  // Quitter la réunion
  const leaveRoom = () => {
    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());
    dataConnections.current.forEach(conn => conn.close());
    mediaConnections.current.forEach(conn => conn.close());
    peer?.destroy();
    navigate('/');
  };

  // Copier le lien de la réunion (avec hash pour Quick Fix P2P)
  const copyMeetingLink = () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigator.clipboard.writeText(url);
  };
  
  // Copier le lien d'invitation avec peer ID
  const copyInviteLink = () => {
    const fullUrl = `${window.location.href}`;
    navigator.clipboard.writeText(fullUrl);
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  };

  // Participant local pour l'affichage
  const localParticipant: Participant = {
    id: myId,
    name: state?.userName || 'Moi',
    stream: screenStream || localStream || undefined,
    audioEnabled,
    videoEnabled,
    screenSharing: !!screenStream,
    handRaised,
  };

  if (!state?.userName) {
    return null;
  }

  return (
    <div className="h-screen bg-neutral-900 flex flex-col overflow-hidden">
      {/* Header flottant */}
      <header className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between">
        <div className="flex items-center gap-4 bg-neutral-900/80 backdrop-blur-sm rounded-xl px-4 py-2">
          <span className="font-mono text-sm text-white">{code}</span>
          <button
            onClick={copyMeetingLink}
            className="p-1 hover:bg-neutral-700 rounded transition-colors"
            title="Copier le lien"
          >
            <Icon name="copy" size={16} className="text-neutral-400" />
          </button>
          <span className="text-neutral-400">|</span>
          <span className="text-sm text-neutral-400">{formatDuration(duration)}</span>
          {/* Badge limitation 2 participants */}
          <span className="text-neutral-400">|</span>
          <span className="text-xs px-2 py-1 bg-warning-500/20 text-warning-400 rounded-full">
            ⚠️ 2 max
          </span>
        </div>

        <div className="flex items-center gap-2 bg-neutral-900/80 backdrop-blur-sm rounded-xl px-4 py-2">
          <Icon name="people" size={18} className="text-neutral-400" />
          <span className="text-sm text-white">{participants.size + 1}</span>
        </div>
      </header>

      {/* Grille vidéo */}
      <main className="flex-1 pt-16 pb-24">
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

      {/* Panneau latéral - Chat */}
      <SidePanel
        type="chat"
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        onSendMessage={sendChatMessage}
      />

      {/* Panneau latéral - Participants */}
      <SidePanel
        type="participants"
        isOpen={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        participants={participants}
        localParticipant={localParticipant}
      />

      {/* Panneau latéral - Paramètres */}
      <SidePanel
        type="settings"
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Message de connexion */}
      {!connected && (
        <div className="absolute inset-0 bg-neutral-900/90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Connexion en cours...</p>
          </div>
        </div>
      )}

      {/* Message d'erreur média */}
      {mediaError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-warning-500/90 text-neutral-900 rounded-lg px-4 py-2 text-sm max-w-md text-center z-40">
          <Icon name="warning" size={18} className="inline mr-2" />
          {mediaError}
        </div>
      )}

      {/* Info P2P pour rejoindre */}
      {connected && participants.size === 0 && state?.isHost && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl px-6 py-4 text-center max-w-lg z-40">
          <p className="text-white text-sm mb-3 font-medium">
            En attente d'un participant
          </p>
          <p className="text-neutral-400 text-xs mb-4">
            Partagez ce lien pour inviter <span className="text-warning-400 font-semibold">1 personne</span> (max 2 participants)
          </p>
          <button
            onClick={copyInviteLink}
            className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Icon name={inviteLinkCopied ? "check" : "copy"} size={18} />
            {inviteLinkCopied ? 'Lien copié!' : 'Copier le lien d\'invitation'}
          </button>
          <p className="text-neutral-500 text-xs mt-3">
            ℹ️ Version Quick Fix - Pour plus de participants, contactez l'administrateur
          </p>
        </div>
      )}
      
      {/* Message pour participant en attente de connexion */}
      {connected && participants.size === 0 && !state?.isHost && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-neutral-800 rounded-xl px-6 py-4 text-center max-w-md z-40">
          <p className="text-white text-sm mb-2">
            Connexion à l'hôte en cours...
          </p>
          <p className="text-neutral-400 text-xs">
            Veuillez patienter quelques instants
          </p>
        </div>
      )}
    </div>
  );
}
