export interface Character {
  id: number;
  name: string;
}

export interface RoomPlayer {
  userId: string;
  nickname: string;
  characterId?: number;
  ready: boolean;
}

export type RoomStatus = 'WAITING' | 'IN_GAME';

export interface Room {
  id: string;
  host: RoomPlayer;
  guest: RoomPlayer | null;
  status: RoomStatus;
  createdAt: string;
}

export interface LobbyServerMessage {
  ROOM_LIST: { rooms: Room[] };
  ROOM_UPDATED: { room: Room };
  ROOM_CLOSED: { roomId: string };
  GAME_START: { roomId: string };
  ACTION_REJECTED: { message: string };
}

export interface LobbyClientMessage {
  LIST_ROOMS: Record<string, never>;
  CREATE_ROOM: Record<string, never>;
  JOIN_ROOM: { roomId: string };
  GET_ROOM: { roomId: string };
  LEAVE_ROOM: { roomId: string };
  SET_READY: { roomId: string; ready: boolean };
}
