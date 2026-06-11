import crypto from "node:crypto";

/**
 * Génère des credentials TURN éphémères (mécanisme HMAC de coturn `use-auth-secret`).
 *
 * Le secret HMAC n'est JAMAIS exposé au client : il reste dans la variable
 * d'environnement Vercel TURN_SECRET. Le client reçoit seulement un couple
 * username/credential valable un temps limité (TTL).
 *
 * Format coturn (time-limited credentials) :
 *   username   = <timestamp_expiration>:<id optionnel>
 *   credential = base64( HMAC-SHA1( secret, username ) )
 */
export default function handler(req, res) {
  // CORS : autorise l'app (et les previews) à appeler cette route.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const secret = process.env.TURN_SECRET;
  if (!secret) {
    res.status(500).json({ error: "TURN_SECRET not configured" });
    return;
  }

  const realm = process.env.TURN_REALM || "turn.jemaos.com";
  const ttlSeconds = Number(process.env.TURN_TTL || 3600); // 1h par défaut

  // username = timestamp d'expiration (UNIX). coturn vérifie qu'il n'est pas dépassé.
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}`;

  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  // Pas de cache : chaque appel doit donner une credential fraîche.
  res.setHeader("Cache-Control", "no-store");

  res.status(200).json({
    username,
    credential,
    ttl: ttlSeconds,
    realm,
    iceServers: [
      { urls: `stun:${realm}:3478` },
      {
        urls: [
          `turn:${realm}:3478?transport=udp`,
          `turn:${realm}:3478?transport=tcp`,
          `turns:${realm}:5349?transport=tcp`,
        ],
        username,
        credential,
      },
    ],
  });
}
