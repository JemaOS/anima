// Connection quality type for network indicators
export type ConnectionQuality = 'good' | 'medium' | 'poor';

export interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  audioLevel?: number; // 0-1 for active speaker detection
  connectionQuality?: ConnectionQuality; // Network quality indicator
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  participants: Map<string, Participant>;
}

export interface MediaSettings {
  audioDeviceId?: string;
  videoDeviceId?: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
