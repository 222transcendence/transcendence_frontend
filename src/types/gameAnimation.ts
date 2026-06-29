export type GamePhase = 'DRAW' | 'MOVE' | 'ATTACK' | 'DEFENSE' | 'RESULT';

export interface DiceRollResult {
  rolled: number;
  success: number;
}

export interface DamagePopup {
  id: string;
  target: 'host' | 'guest';
  amount: number;
}

export interface SkillEffectTrigger {
  id: string;
  source: 'host' | 'guest';
  label: string;
}

export interface MatchSummary {
  winnerNickname: string;
  loserNickname: string;
  turnsPlayed: number;
  finalHostHp: number;
  finalGuestHp: number;
}
