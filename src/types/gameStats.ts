export interface UserStats {
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export interface MatchHistoryItem {
  id: string;
  hostUser: { id: string; nickname: string; avatar: string } | null;
  guestUser: { id: string; nickname: string; avatar: string } | null;
  winner: { id: string; nickname: string } | null;
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
