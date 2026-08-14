export interface RoomPlayer {
  userId: string;
  nickname: string;
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

export type AiDifficulty = 'BEGINNER' | 'NORMAL' | 'HARD';

export interface AiParticipant {
  participantId: string;
  userId?: string;
  nickname: string;
  type: 'HUMAN' | 'AI';
  aiDifficulty?: AiDifficulty;
}

export interface AiPracticeCreatedPayload {
  roomId: string;
  mode: 'AI_PRACTICE';
  difficulty: AiDifficulty;
  participants: AiParticipant[];
  expiresAt: string;
}

export interface LobbyServerMessage {
  ROOM_LIST: { rooms: Room[] };
  ROOM_UPDATED: { room: Room };
  ROOM_CLOSED: { roomId: string };
  GAME_START: { roomId: string };
  ACTION_REJECTED: { message: string };
  /** 관전 가능한(IN_GAME) 방 목록 — deploy#70 */
  SPECTATABLE_ROOM_LIST: { rooms: Room[] };
  /** AI 연습전 세션 생성 완료 (#76) */
  AI_PRACTICE_CREATED: AiPracticeCreatedPayload;
  /** AI 연습전 세션 생성/조회 실패 (#76) */
  AI_PRACTICE_REJECTED: { code: string; message: string };
  /** AI 연습전 세션 취소 완료 (#76) */
  AI_PRACTICE_CANCELLED: { roomId: string };
}

export interface LobbyClientMessage {
  LIST_ROOMS: Record<string, never>;
  CREATE_ROOM: { maxPlayers?: number };
  JOIN_ROOM: { roomId: string };
  GET_ROOM: { roomId: string };
  LEAVE_ROOM: { roomId: string };
  SET_READY: { roomId: string; ready: boolean };
  /** 관전 가능한(IN_GAME) 방 목록 요청 — deploy#70 */
  LIST_SPECTATABLE_ROOMS: Record<string, never>;
  /** AI 연습전 세션 생성 요청 (#76) */
  CREATE_AI_PRACTICE: { requestId: string; difficulty: AiDifficulty };
  /** 진행 중인 AI 연습전 세션 조회 (#76) */
  GET_ACTIVE_AI_PRACTICE: Record<string, never>;
  /** AI 연습전 세션 취소 (#76) */
  CANCEL_AI_PRACTICE: { roomId?: string };
}
