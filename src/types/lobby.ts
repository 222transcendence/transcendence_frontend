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
  hostUserId: string;
  maxPlayers: number;
  players: RoomPlayer[];
  status: RoomStatus;
  createdAt: string;
}

export interface LobbyServerMessage {
  ROOM_LIST: { rooms: Room[] };
  ROOM_UPDATED: { room: Room };
  ROOM_CLOSED: { roomId: string };
  GAME_START: { roomId: string };
  ACTION_REJECTED: { message: string };
  /** 관전 가능한(IN_GAME) 방 목록 — deploy#70 */
  SPECTATABLE_ROOM_LIST: { rooms: Room[] };
}

export interface LobbyClientMessage {
  LIST_ROOMS: Record<string, never>;
  CREATE_ROOM: { maxPlayers?: number };
  JOIN_ROOM: { roomId: string; characterId?: number };
  GET_ROOM: { roomId: string };
  LEAVE_ROOM: { roomId: string };
  SET_READY: { roomId: string; ready: boolean };
  /** 관전 가능한(IN_GAME) 방 목록 요청 — deploy#70 */
  LIST_SPECTATABLE_ROOMS: Record<string, never>;
}
