// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

export const LANGUAGES = {
  en: { code: "en", name: "English" },
  fr: { code: "fr", name: "Français" },
} as const;

export type Lang = keyof typeof LANGUAGES;

export type TranslationParams = Record<string, string | number>;

const en = {
    // HomePage
    secureP2pCalling: "Secure P2P video calling",
    newMeeting: "New meeting",
    or: "or",
    meetingCodePlaceholder: "Meeting code",
    enterRoomCode: "Enter a meeting code",
    invalidRoomCodeFormat: "Invalid code. Format: xxx-yyyy-zzz",
    join: "Join",
    noAccount: "No account",
    zeroLogs: "Zero logs",
    recents: "Recents",
    delete: "Delete",
    deleteThisMeeting: "Delete this meeting",
    developedBy: "Developed by",
    licenseLine: "© 2025 • Open Source & AGPL licensed",

    // PreJoinPage
    networkLost:
      "Network connection lost. Check your internet connection.",
    permissionsDeniedInSettings:
      "Permissions denied. Please allow camera and microphone access in your browser settings.",
    noInternetConnection: "No internet connection. Check your network.",
    unexpectedMediaInitError:
      "Unexpected error during media initialization.",
    cannotReenableCamera:
      "Unable to re-enable the camera. Please try again.",
    invalidMeetingCode: "Invalid meeting code.",
    allowCameraMicToJoin:
      "Please allow camera and microphone access to join the meeting.",
    permissionCheckTimeout:
      "Timeout while checking permissions. Make sure your camera is not being used by another application.",
    cannotAccessCameraOrMic:
      "Unable to access the camera or microphone.",
    joinMeetingError: "Error joining the meeting.",
    back: "Back",
    copyCode: "Copy code",
    anonymous: "Anonymous",
    offlineWarning: "⚠️ You are offline",
    retry: "Retry",
    allowCameraInSettings:
      "Please allow camera access in your browser settings.",
    allow: "Allow",
    micDefaultLabel: "Mic {id}",
    connecting: "Connecting...",
    start: "Start",
    joinNow: "Join now",
    yourName: "Your name",
    enterYourName: "Enter your name",
    allowCameraMicHint:
      "⚠️ Make sure to allow camera and microphone access",
    shareCodeWithParticipants:
      "Share this code with the participants:",

    // RoomPage
    networkRestored: "Network connection restored",
    networkLostReconnecting:
      "Network connection lost. Reconnecting...",
    errorChangingDevice: "Error changing {device}",
    microphone: "microphone",
    camera: "camera",
    errorChangingVideoQuality: "Error changing video quality",
    networkIssueReconnecting:
      "Network connection issue. Trying to reconnect...",
    unstableConnectionReconnecting:
      "Unstable connection. Reconnecting...",
    roomFullToast:
      "Meeting is full. Maximum 8 participants allowed.",
    connectionRetryAttempt:
      "Connection error. Retry {attempt}/{max}...",
    persistentConnectionError:
      "Persistent connection error. Please refresh the page or check your connection.",
    errorReenablingCamera: "Error re-enabling the camera",
    rearCameraUnavailable: "Rear camera not available",
    frontCameraUnavailable: "Front camera not available",
    screenShareNotSupported:
      "Screen sharing is not supported on this device",
    screenShareError: "Error during screen sharing",
    copied: "Copied!",
    copyMeetingLink: "Copy meeting link",
    linkCopied: "Link copied",
    viewParticipants: "View participants",
    openParticipantsPanel: "Open the participants panel",
    maxTag: "(max)",
    e2eeActive: "End-to-end encryption active (E2EE)",
    me: "Me",
    connectingInProgress: "Connecting...",
    establishingP2pConnection:
      "Establishing the P2P connection...",
    reconnecting: "Reconnecting...",
    cannotConnect: "Unable to connect",
    connectionFailedAfterAttempts:
      "The connection to the meeting failed after several attempts.",
    backToHome: "Back to home",
    appearOfflineWarning:
      "⚠️ You seem to be offline. Check your internet connection.",
    cannotConnectCheckConnection:
      "Unable to connect. Check your internet connection.",
    refreshPage: "Refresh the page",
    roomFull: "Meeting is full",
    roomFullMaxParticipants:
      "Maximum 8 participants allowed with the P2P mesh architecture.",
    waitingForParticipants: "Waiting for participants",
    shareInviteLinkPrefix: "Share this link to invite up to",
    maxPeople: "8 people",
    copyInviteLink: "Copy invite link",
    inviteLinkCopied: "Link copied!",
    p2pMeshInfo:
      "ℹ️ P2P Mesh architecture - Up to 8 participants",
    joiningMeeting: "Joining the meeting...",
    establishingP2pConnections: "Establishing P2P connections",
    cameraFallbackHint: "trying the default camera",

    // ControlBar
    muteMic: "Mute microphone",
    unmuteMic: "Unmute microphone",
    disableCamera: "Turn camera off",
    enableCamera: "Turn camera on",
    rearCamera: "Rear camera",
    frontCamera: "Front camera",
    stop: "Stop",
    share: "Share",
    participants: "Participants",
    lowerHand: "Lower",
    raiseHand: "Raise",
    chat: "Chat",
    settings: "Settings",
    leave: "Leave",

    // ChatPanel
    noMessages: "No messages yet.",
    messagesDisappearOnEnd:
      "Messages disappear at the end of the meeting",
    sendMessagePlaceholder: "Send a message...",

    // ParticipantsPanel
    you: "(You)",
    host: "Host",
    noOtherParticipants: "No other participants",

    // VideoTile
    videoQualityGood: "Video quality: good",
    videoQualityMedium: "Video quality: medium",
    videoQualityPoor: "Video quality: poor",
    videoQualityMeasuring: "Video quality: measuring",
    unpinParticipant: "Unpin participant",
    pinParticipant: "Pin participant",
    screenLabel: "Screen",

    // SettingsPanel
    microphoneLabel: "Microphone",
    cameraLabel: "Camera",
    noMicrophoneDetected: "No microphone detected",
    noCameraDetected: "No camera detected",
    videoQuality: "Video quality",
    qualityAuto: "Auto (recommended)",
    qualityLow: "Low (data saver)",
    qualityMedium: "Medium",
    qualityHigh: "High (720p)",
    qualityUltra: "Ultra (1080p 60fps)",
    qualityAutoDesc: "Quality automatically adapted to your device",
    qualityLowDesc: "320×240 at 15 fps - Ideal for slow connections",
    qualityMediumDesc:
      "640×480 at 24 fps - Good quality/performance balance",
    qualityHighDesc: "1280×720 at 30 fps - Best quality",
    qualityUltraDesc: "1920×1080 at 60 fps - Maximum quality",
    appearance: "Appearance",
    styles: "Styles",
    styleNormal: "Normal",
    styleContrast: "Contrast",
    styleBright: "Bright",
    styleWarm: "Warm",
    styleCool: "Cool",
    styleBw: "Black & White",
    meetingLink: "Meeting link",
    linkCopiedToast: "Link copied!",
    refreshDevices: "Refresh devices",
    deviceChangesAppliedImmediately:
      "Device changes will be applied immediately",
    microphoneDefaultLabel: "Microphone {id}",
    cameraDefaultLabel: "Camera {id}",

    // ErrorBoundary
    recurringProblemDetected: "Recurring problem detected",
    anErrorOccurred: "An error occurred",
    crashLoopDescription:
      "The application encountered several consecutive errors. Please refresh the page.",
    errorRecoveryDescription:
      "The application encountered a problem. You can try to recover or refresh the page.",
    refresh: "Refresh",
    technicalDetails: "Technical details",
    callProblem: "Problem with the call",
    callErrorDescription:
      "An error occurred during the video call. You can try again or leave the meeting.",
    leaveMeeting: "Leave meeting",
    videoError: "Video error",

    // SubscriptionGuard
    subscriptionRequired:
      "This application requires a JemaOS Pro subscription.",
    upgradeToPro: "Upgrade to Pro",
    reconnect: "Reconnect",
    reconnectingShort: "Reconnecting…",
    reconnectFailed:
      "Reconnection failed. Try again in a moment.",
    loading: "Loading…",
    reconnectScreenTitle: "Reconnecting…",
    verifyingSession:
      "Verifying your JemaOS session. You will be redirected automatically.",

    // mediaHelpers
    cameraUnavailableFallback:
      "Camera not available, trying the default camera...",
    cameraAccessError: "Camera access error",
    noCameraOrMicrophoneDetected:
      "No camera or microphone detected",
    permissionsDenied:
      "Permissions denied. Please allow camera and microphone access.",
    cameraInUse:
      "The camera is being used by another application",
    cameraInitError: "Camera initialization error",
    cameraNotResponding: "The camera is not responding",
    deviceAccessError: "Device access error",
};

export type TranslationKey = keyof typeof en;

export const translations: Record<Lang, Record<TranslationKey, string>> = {
  en,
  fr: {
    // HomePage
    secureP2pCalling: "Visioconférence P2P sécurisée",
    newMeeting: "Nouvelle réunion",
    or: "ou",
    meetingCodePlaceholder: "Code de réunion",
    enterRoomCode: "Entrez un code de reunion",
    invalidRoomCodeFormat: "Code invalide. Format: xxx-yyyy-zzz",
    join: "Rejoindre",
    noAccount: "Sans compte",
    zeroLogs: "Zéro logs",
    recents: "Récents",
    delete: "Supprimer",
    deleteThisMeeting: "Supprimer cette réunion",
    developedBy: "Développé par",
    licenseLine: "© 2025 • Open Source & sous licence AGPL",

    // PreJoinPage
    networkLost:
      "Connexion réseau perdue. Vérifiez votre connexion internet.",
    permissionsDeniedInSettings:
      "Permissions refusées. Veuillez autoriser l'accès à la caméra et au microphone dans les paramètres de votre navigateur.",
    noInternetConnection:
      "Pas de connexion internet. Vérifiez votre réseau.",
    unexpectedMediaInitError:
      "Erreur inattendue lors de l'initialisation média.",
    cannotReenableCamera:
      "Impossible de réactiver la caméra. Veuillez réessayer.",
    invalidMeetingCode: "Code de réunion invalide.",
    allowCameraMicToJoin:
      "Veuillez autoriser l'accès à la caméra et au microphone pour rejoindre la réunion.",
    permissionCheckTimeout:
      "Délai dépassé lors de la vérification des permissions. Vérifiez que votre caméra n'est pas utilisée par une autre application.",
    cannotAccessCameraOrMic:
      "Impossible d'accéder à la caméra ou au microphone.",
    joinMeetingError: "Erreur lors de la connexion à la réunion.",
    back: "Retour",
    copyCode: "Copier le code",
    anonymous: "Anonyme",
    offlineWarning: "⚠️ Vous êtes hors ligne",
    retry: "Réessayer",
    allowCameraInSettings:
      "Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.",
    allow: "Autoriser",
    micDefaultLabel: "Micro {id}",
    connecting: "Connexion...",
    start: "Démarrer",
    joinNow: "Rejoindre maintenant",
    yourName: "Votre nom",
    enterYourName: "Entrez votre nom",
    allowCameraMicHint:
      "⚠️ Assurez-vous d'autoriser l'accès à la caméra et au microphone",
    shareCodeWithParticipants:
      "Partagez ce code avec les participants:",

    // RoomPage
    networkRestored: "Connexion réseau restaurée",
    networkLostReconnecting:
      "Connexion réseau perdue. Reconnexion en cours...",
    errorChangingDevice: "Erreur lors du changement de {device}",
    microphone: "microphone",
    camera: "caméra",
    errorChangingVideoQuality:
      "Erreur lors du changement de qualité vidéo",
    networkIssueReconnecting:
      "Problème de connexion réseau. Tentative de reconnexion...",
    unstableConnectionReconnecting:
      "Connexion instable. Reconnexion en cours...",
    roomFullToast:
      "Réunion complète. Maximum 8 participants autorisés.",
    connectionRetryAttempt:
      "Erreur de connexion. Nouvelle tentative {attempt}/{max}...",
    persistentConnectionError:
      "Erreur de connexion persistante. Veuillez rafraîchir la page ou vérifier votre connexion.",
    errorReenablingCamera:
      "Erreur lors de la réactivation de la caméra",
    rearCameraUnavailable: "Caméra arrière non disponible",
    frontCameraUnavailable: "Caméra avant non disponible",
    screenShareNotSupported:
      "Partage d'écran non supporté sur cet appareil",
    screenShareError: "Erreur lors du partage d'écran",
    copied: "Copié !",
    copyMeetingLink: "Copier le lien de la réunion",
    linkCopied: "Lien copié",
    viewParticipants: "Voir les participants",
    openParticipantsPanel: "Ouvrir le panneau des participants",
    maxTag: "(max)",
    e2eeActive: "Chiffrement de bout en bout actif (E2EE)",
    me: "Me",
    connectingInProgress: "Connexion en cours...",
    establishingP2pConnection:
      "Établissement de la connexion P2P...",
    reconnecting: "Reconnexion en cours...",
    cannotConnect: "Impossible de se connecter",
    connectionFailedAfterAttempts:
      "La connexion à la réunion a échoué après plusieurs tentatives.",
    backToHome: "Retour à l'accueil",
    appearOfflineWarning:
      "⚠️ Vous semblez être hors ligne. Vérifiez votre connexion internet.",
    cannotConnectCheckConnection:
      "Impossible de se connecter. Vérifiez votre connexion internet.",
    refreshPage: "Rafraîchir la page",
    roomFull: "Réunion complète",
    roomFullMaxParticipants:
      "Maximum 8 participants autorisés avec l'architecture P2P mesh.",
    waitingForParticipants: "En attente des participants",
    shareInviteLinkPrefix: "Partagez ce lien pour inviter jusqu'à",
    maxPeople: "8 personnes",
    copyInviteLink: "Copier le lien d'invitation",
    inviteLinkCopied: "Lien copié !",
    p2pMeshInfo:
      "ℹ️ Architecture P2P Mesh - Jusqu'à 8 participants",
    joiningMeeting: "Connexion à la réunion...",
    establishingP2pConnections: "Établissement des connexions P2P",
    cameraFallbackHint: "essai avec la caméra par défaut",

    // ControlBar
    muteMic: "Couper le micro",
    unmuteMic: "Activer le micro",
    disableCamera: "Désactiver la caméra",
    enableCamera: "Activer la caméra",
    rearCamera: "Caméra arrière",
    frontCamera: "Caméra avant",
    stop: "Arrêter",
    share: "Partager",
    participants: "Participants",
    lowerHand: "Baisser",
    raiseHand: "Lever",
    chat: "Discussion",
    settings: "Paramètres",
    leave: "Quitter",

    // ChatPanel
    noMessages: "Aucun message pour l'instant.",
    messagesDisappearOnEnd:
      "Les messages disparaissent à la fin de la réunion",
    sendMessagePlaceholder: "Envoyer un message...",

    // ParticipantsPanel
    you: "(Vous)",
    host: "Hôte",
    noOtherParticipants: "Aucun autre participant",

    // VideoTile
    videoQualityGood: "Qualité vidéo : bonne",
    videoQualityMedium: "Qualité vidéo : moyenne",
    videoQualityPoor: "Qualité vidéo : faible",
    videoQualityMeasuring: "Qualité vidéo : mesure en cours",
    unpinParticipant: "Désépingler le participant",
    pinParticipant: "Épingler le participant",
    screenLabel: "Screen",

    // SettingsPanel
    microphoneLabel: "Microphone",
    cameraLabel: "Caméra",
    noMicrophoneDetected: "Aucun microphone détecté",
    noCameraDetected: "Aucune caméra détectée",
    videoQuality: "Qualité vidéo",
    qualityAuto: "Auto (recommandé)",
    qualityLow: "Basse (économie de données)",
    qualityMedium: "Moyenne",
    qualityHigh: "Haute (720p)",
    qualityUltra: "Ultra (1080p 60fps)",
    qualityAutoDesc:
      "Qualité adaptée automatiquement à votre appareil",
    qualityLowDesc:
      "320×240 à 15 fps - Idéal pour connexions lentes",
    qualityMediumDesc:
      "640×480 à 24 fps - Bon équilibre qualité/performance",
    qualityHighDesc: "1280×720 à 30 fps - Meilleure qualité",
    qualityUltraDesc: "1920×1080 à 60 fps - Qualité maximale",
    appearance: "Apparence",
    styles: "Styles",
    styleNormal: "Normal",
    styleContrast: "Contraste",
    styleBright: "Lumineux",
    styleWarm: "Chaud",
    styleCool: "Froid",
    styleBw: "Noir & Blanc",
    meetingLink: "Lien de la réunion",
    linkCopiedToast: "Lien copié !",
    refreshDevices: "Actualiser les périphériques",
    deviceChangesAppliedImmediately:
      "Les changements de périphériques seront appliqués immédiatement",
    microphoneDefaultLabel: "Microphone {id}",
    cameraDefaultLabel: "Caméra {id}",

    // ErrorBoundary
    recurringProblemDetected: "Problème récurrent détecté",
    anErrorOccurred: "Une erreur s'est produite",
    crashLoopDescription:
      "L'application a rencontré plusieurs erreurs consécutives. Veuillez rafraîchir la page.",
    errorRecoveryDescription:
      "L'application a rencontré un problème. Vous pouvez essayer de récupérer ou rafraîchir la page.",
    refresh: "Rafraîchir",
    technicalDetails: "Détails techniques",
    callProblem: "Problème dans l'appel",
    callErrorDescription:
      "Une erreur est survenue pendant la visioconférence. Vous pouvez réessayer ou quitter la réunion.",
    leaveMeeting: "Quitter la réunion",
    videoError: "Erreur vidéo",

    // SubscriptionGuard
    subscriptionRequired:
      "Cette application nécessite un abonnement JemaOS Pro.",
    upgradeToPro: "Passer à Pro",
    reconnect: "Se reconnecter",
    reconnectingShort: "Reconnexion…",
    reconnectFailed:
      "La reconnexion a échoué. Réessayez dans un instant.",
    loading: "Chargement…",
    reconnectScreenTitle: "Reconnexion en cours…",
    verifyingSession:
      "Vérification de votre session JemaOS. Vous allez être redirigé automatiquement.",

    // mediaHelpers
    cameraUnavailableFallback:
      "Caméra non disponible, essai avec la caméra par défaut...",
    cameraAccessError: "Erreur d'accès à la caméra",
    noCameraOrMicrophoneDetected:
      "Aucune caméra ou microphone détecté",
    permissionsDenied:
      "Permissions refusées. Veuillez autoriser l'accès à la caméra et au microphone.",
    cameraInUse:
      "La caméra est utilisée par une autre application",
    cameraInitError: "Erreur d'initialisation de la caméra",
    cameraNotResponding: "La caméra ne répond pas",
    deviceAccessError: "Erreur d'accès aux périphériques",
  },
};

export function getSystemLang(): Lang {
  const browserLang =
    navigator.language ||
    (navigator as any).userLanguage ||
    "fr";
  const short = browserLang.split("-")[0].toLowerCase();
  return short === "fr" ? "fr" : "en";
}

let currentLang: Lang = getSystemLang();

export function getCurrentLang(): Lang {
  return currentLang;
}

export function setCurrentLang(lang: Lang): void {
  currentLang = lang;
}

export function translate(
  key: TranslationKey,
  params?: TranslationParams,
): string {
  let value: string =
    translations[currentLang][key] ??
    translations.en[key] ??
    key;
  if (params) {
    for (const [name, paramValue] of Object.entries(params)) {
      value = value
        .split(`{${name}}`)
        .join(String(paramValue));
    }
  }
  return value;
}
