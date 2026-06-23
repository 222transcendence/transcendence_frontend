export type MessageType = 'NORMAL' | 'INVITE';

export interface ChatMessage {
  id: string;
  content: string;
  roomId: string | null;
  type: MessageType;
  createdAt: string;
  sender: {
    id: string;
    nickname: string;
    avatar: string;
  };
}

export interface GameInvitePayload {
  roomId: string;
  inviterNickname: string;
}
