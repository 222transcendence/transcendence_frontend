export interface UserStats {
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export interface MatchParticipantItem {
  user: { id: string; nickname: string; avatar: string } | null;
  finalHp: number;
  rank: number;
}

export interface MatchHistoryItem {
  id: string;
  hostUser: { id: string; nickname: string; avatar: string } | null;
  guestUser: { id: string; nickname: string; avatar: string } | null;
  winner: { id: string; nickname: string } | null;
  /** N인 매치 참가자 목록(backend#157) — 2인 매치는 hostUser/guestUser로도 충분하지만
   *  3~4인 매치는 이 배열이 있어야 전원이 보인다. */
  participants: MatchParticipantItem[];
  turnsPlayed: number;
  createdAt: string;
}

export interface MatchHistoryResponse {
  matches: MatchHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  avatar: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}
