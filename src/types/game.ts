export const GamePhase = {
  DRAW: 'DRAW',
  MOVE: 'MOVE',
  ATTACK: 'ATTACK',
  DEFENSE: 'DEFENSE',
  RESULT: 'RESULT',
} as const;
export type GamePhase = typeof GamePhase[keyof typeof GamePhase];

export const RoomStatus = {
  WAITING: 'WAITING',
  IN_GAME: 'IN_GAME',
  FINISHED: 'FINISHED',
} as const;
export type RoomStatus = typeof RoomStatus[keyof typeof RoomStatus];

export const CardType = {
  MOVE: 'MOVE',
  ATK_SWORD: 'ATK_SWORD',
  ATK_GUN: 'ATK_GUN',
  DEF: 'DEF',
  SPECIAL: 'SPECIAL',
} as const;
export type CardType = typeof CardType[keyof typeof CardType];

export interface Card {
  id: number;
  type: CardType;
  valueTop: number;
  valueBottom: number;
}

export type StatusEffectType = 'POISON' | 'PARALYSIS' | 'REGEN' | 'STUN' | 'FIREBALL_BUFF';

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
}

export interface RoomPlayer {
  userId: string;
  nickname: string;
  characterId: number;
  hp: number;
  cardsInHand: number[];
  cardsSubmitted: number[];
}

export interface GameRoom {
  id: string;
  status: RoomStatus;
  phase?: GamePhase;
  host: RoomPlayer;
  guest?: RoomPlayer;
  distance: number;
  currentTurn: number;
  statusEffects: {
    host: StatusEffect[];
    guest: StatusEffect[];
  };
  lastActionLog?: string[];
  winnerId?: string;
}
