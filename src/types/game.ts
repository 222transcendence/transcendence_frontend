export type RoomStatus = 'WAITING' | 'READY' | 'IN_GAME' | 'FINISHED';

export type GamePhase = 'DRAW' | 'MOVE' | 'ATTACK' | 'DEFENSE' | 'RESULT';

export type CardType = 'MOVE' | 'ATK_SWORD' | 'ATK_GUN' | 'DEF' | 'SPECIAL';

export interface StatusEffect {
  type: 'POISON' | 'REGEN' | 'CONFUSE' | 'STUN';
  duration: number;
}
