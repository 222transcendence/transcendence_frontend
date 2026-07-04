import type { GamePhase, RoomStatus, StatusEffect } from './game';

// ─── Payload shapes emitted by the server ────────────────────────────────────

export interface PlayerSocketInfo {
  userId: string;
  nickname: string;
  characterId: number;
  hp: number;
  cardsInHand: number[];
}

export interface DiceDetail {
  count: number;
  successes: number;
  details: boolean[];
}

export interface DiceResults {
  hostAtk?: DiceDetail;
  guestAtk?: DiceDetail;
  hostDef?: DiceDetail;
  guestDef?: DiceDetail;
}

export interface GameStartPayload {
  roomId: string;
  host: PlayerSocketInfo;
  guest: PlayerSocketInfo | null;
  phase: GamePhase;
  distance: number;
  currentTurn: number;
}

export interface PhaseUpdatePayload {
  roomId: string;
  status: RoomStatus;
  currentPhase: GamePhase | null;
  initiative: 'host' | 'guest' | null;
  distance: number;
  currentTurn: number;
  hostHp: number;
  guestHp: number;
  hostCardsInHand: number[];
  guestCardsInHand: number[];
  statusEffects: { host: StatusEffect[]; guest: StatusEffect[] };
  diceResults: DiceResults | null;
  skillsTriggered: string[];
  winnerId: string | null;
}

export interface CardsAcceptedPayload {
  roomId: string;
}

export interface PlayerLeftPayload {
  userId: string;
  nickname: string;
}

// ─── Server-to-client event map ───────────────────────────────────────────────

export interface ServerToClientEvents {
  game_start: (data: { type: 'GAME_START'; payload: GameStartPayload; seq: number }) => void;
  phase_update: (data: { type: 'PHASE_UPDATE'; payload: PhaseUpdatePayload; seq: number }) => void;
  cards_accepted: (data: { type: 'CARDS_ACCEPTED'; payload: CardsAcceptedPayload; seq: number }) => void;
  player_left: (data: { type: 'PLAYER_LEFT'; payload: PlayerLeftPayload; seq: number }) => void;
}

// ─── Client-to-server event map ───────────────────────────────────────────────

export interface ClientToServerEvents {
  join_room: (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  leave_room: (payload: { roomId: string }, callback?: (res: { event: string; data: unknown }) => void) => void;
  submit_cards: (payload: { roomId: string; cardIds: number[] }, callback?: (res: { event: string; data: unknown }) => void) => void;
}
