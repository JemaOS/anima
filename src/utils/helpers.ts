// Générer un code de réunion aléatoire (format Google Meet: xxx-yyyy-zzz)
export function generateRoomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const segment = () => {
    return Array.from({ length: 3 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  };
  return `${segment()}-${segment()}-${segment()}`;
}

// Générer un ID unique
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Valider un code de réunion
export function isValidRoomCode(code: string): boolean {
  return /^[a-z]{3}-[a-z]{3}-[a-z]{3}$/.test(code);
}

// Obtenir les initiales d'un nom
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Formater le temps écoulé
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Générer une couleur d'avatar aléatoire
export function generateAvatarColor(id: string): string {
  const colors = [
    '#EA4335', // Rouge Google
    '#4285F4', // Bleu Google
    '#34A853', // Vert Google
    '#FBBC04', // Jaune Google
    '#8430CE', // Violet
    '#FF6D00', // Orange
    '#00BFA5', // Turquoise
  ];
  
  // Utiliser l'ID pour générer un index consistant
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// LocalStorage helpers pour l'historique des réunions
export function saveRecentRoom(code: string) {
  const recent = getRecentRooms();
  const updated = [
    { code, timestamp: Date.now() },
    ...recent.filter(r => r.code !== code),
  ].slice(0, 5); // Garder seulement les 5 plus récentes
  
  localStorage.setItem('recent-rooms', JSON.stringify(updated));
}

export function getRecentRooms(): Array<{ code: string; timestamp: number }> {
  try {
    const data = localStorage.getItem('recent-rooms');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
