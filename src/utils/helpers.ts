// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

// Cryptographically secure random number generator using Web Crypto API
function getSecureRandomValues(buffer: Uint32Array): void {
  crypto.getRandomValues(buffer);
}

// Generate a cryptographically secure random string
function generateSecureRandomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomValues = new Uint32Array(length);
  getSecureRandomValues(randomValues);
  return Array.from(randomValues, (value) => chars[value % chars.length]).join("");
}

// Generate a cryptographically secure random string in base36
function generateSecureRandomBase36(length: number): string {
  const randomValues = new Uint32Array(length);
  getSecureRandomValues(randomValues);
  return Array.from(randomValues, (value) => value.toString(36)).join("").slice(0, length);
}

// Générer un code de réunion aléatoire (format Google Meet: xxx-yyyy-zzz)
export function generateRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const segment = () => {
    return Array.from(
      { length: 3 },
      () => {
        const buffer = new Uint32Array(1);
        getSecureRandomValues(buffer);
        return chars[buffer[0] % chars.length];
      },
    ).join("");
  };
  return `${segment()}-${segment()}-${segment()}`;
}

// Générer un ID unique
export function generateId(): string {
  return `${Date.now()}-${generateSecureRandomBase36(9)}`;
}

// Valider un code de réunion
export function isValidRoomCode(code: string): boolean {
  return /^[a-z]{3}-[a-z]{3}-[a-z]{3}$/.test(code);
}

// Obtenir les initiales d'un nom
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Formater le temps écoulé
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// Générer une couleur d'avatar aléatoire
export function generateAvatarColor(id: string): string {
  const colors = [
    "#EA4335", // Rouge Google
    "#4285F4", // Bleu Google
    "#34A853", // Vert Google
    "#FBBC04", // Jaune Google
    "#8430CE", // Violet
    "#FF6D00", // Orange
    "#00BFA5", // Turquoise
  ];

  // Utiliser l'ID pour générer un index consistant
  const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// LocalStorage helpers pour l'historique des réunions
export function saveRecentRoom(code: string) {
  const recent = getRecentRooms();
  const updated = [
    { code, timestamp: Date.now() },
    ...recent.filter((r) => r.code !== code),
  ].slice(0, 5); // Garder seulement les 5 plus récentes

  localStorage.setItem("recent-rooms", JSON.stringify(updated));
}

export function getRecentRooms(): Array<{ code: string; timestamp: number }> {
  try {
    const data = localStorage.getItem("recent-rooms");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Supprimer une réunion récente
export function removeRecentRoom(code: string) {
  const recent = getRecentRooms();
  const updated = recent.filter((r) => r.code !== code);
  localStorage.setItem("recent-rooms", JSON.stringify(updated));
}

// Supprimer toutes les réunions récentes
export function clearRecentRooms() {
  localStorage.removeItem("recent-rooms");
}
