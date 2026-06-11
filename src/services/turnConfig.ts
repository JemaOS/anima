// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

/**
 * Configuration du serveur self-hosted (coturn + PeerServer) et récupération
 * des credentials TURN éphémères.
 *
 * - Le signaling (PeerServer) tourne derrière Nginx HTTPS sur turn.jemaos.com:8443
 * - Le TURN/STUN (coturn) tourne sur turn.jemaos.com (3478 / 5349 TLS)
 * - Les credentials TURN sont éphémères (HMAC) et fournies par la route
 *   serverless Vercel /api/turn-credentials. Le secret HMAC n'est jamais
 *   exposé au client.
 *
 * Tout est surchargeable via variables d'environnement Vite (VITE_*) pour
 * pouvoir basculer entre "serveur français" (self-hosted) et un éventuel
 * fallback, sans recompiler en dur.
 */

const env = import.meta.env;

export const SIGNALING_HOST: string =
  env.VITE_SIGNALING_HOST || "turn.jemaos.com";
export const SIGNALING_PORT: number = Number(env.VITE_SIGNALING_PORT || 8443);
export const SIGNALING_PATH: string = env.VITE_SIGNALING_PATH || "/anima";
export const SIGNALING_KEY: string =
  env.VITE_SIGNALING_KEY || "cf94b4b5bb36430887cb6872b628fe55";
export const SIGNALING_SECURE: boolean =
  (env.VITE_SIGNALING_SECURE ?? "true") !== "false";

export const TURN_REALM: string = env.VITE_TURN_REALM || "turn.jemaos.com";

// Endpoint qui fournit les credentials éphémères (route Vercel par défaut).
const TURN_CREDENTIALS_URL: string =
  env.VITE_TURN_CREDENTIALS_URL || "/api/turn-credentials";

export interface TurnCredentials {
  readonly iceServers: RTCIceServer[];
  readonly expiresAt: number; // timestamp ms
}

let cached: TurnCredentials | null = null;
let inFlight: Promise<TurnCredentials> | null = null;

/**
 * STUN seul, toujours disponible même si l'endpoint credentials est down.
 * Sert de socle / fallback minimal.
 */
function baseStunServers(): RTCIceServer[] {
  return [{ urls: `stun:${TURN_REALM}:3478` }];
}

/**
 * Récupère (et met en cache) des credentials TURN éphémères.
 * Re-fetch automatiquement quand elles approchent de l'expiration.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();

  // Cache valide (avec marge de 60s avant expiration)
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached.iceServers;
  }

  // Dédoublonne les appels concurrents
  if (inFlight) {
    const result = await inFlight;
    return result.iceServers;
  }

  inFlight = fetchCredentials();
  try {
    const result = await inFlight;
    cached = result;
    return result.iceServers;
  } catch {
    // Si l'endpoint échoue, on dégrade proprement vers STUN seul
    // (mieux que rien : les connexions directes resteront possibles).
    return baseStunServers();
  } finally {
    inFlight = null;
  }
}

/**
 * TURN uniquement (mode relay-only) — pour forcer le relais quand l'ICE
 * direct échoue (NAT strict, firewall).
 */
export async function getRelayOnlyIceServers(): Promise<RTCIceServer[]> {
  const servers = await getIceServers();
  return servers.filter((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
  });
}

async function fetchCredentials(): Promise<TurnCredentials> {
  const res = await fetch(TURN_CREDENTIALS_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`turn-credentials HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    iceServers?: RTCIceServer[];
    ttl?: number;
  };

  if (!data.iceServers || data.iceServers.length === 0) {
    throw new Error("turn-credentials: empty iceServers");
  }

  const ttlMs = (data.ttl ?? 3600) * 1000;
  return {
    iceServers: data.iceServers,
    expiresAt: Date.now() + ttlMs,
  };
}

/**
 * Configuration du PeerServer self-hosted à passer au constructeur `new Peer()`.
 */
export function getPeerServerOptions() {
  return {
    host: SIGNALING_HOST,
    port: SIGNALING_PORT,
    path: SIGNALING_PATH,
    key: SIGNALING_KEY,
    secure: SIGNALING_SECURE,
  };
}
