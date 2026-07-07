import type { UserStats, MatchHistoryResponse, LeaderboardEntry } from '../types/gameStats';

interface ApiEnvelope<T> {
  data: T;
  error: { message?: string } | null;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.error) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
  return result.data;
}

function authorizedHeaders(): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = localStorage.getItem('accessToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  const response = await fetch(`/api/game/users/${userId}/stats`, {
    headers: authorizedHeaders(),
  });
  return parseEnvelope<UserStats>(response);
}

export async function fetchUserMatches(
  userId: string,
  page = 1,
  limit = 10,
): Promise<MatchHistoryResponse> {
  const response = await fetch(
    `/api/game/users/${userId}/matches?page=${page}&limit=${limit}`,
    { headers: authorizedHeaders() },
  );
  return parseEnvelope<MatchHistoryResponse>(response);
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/game/leaderboard', {
    headers: authorizedHeaders(),
  });
  return parseEnvelope<LeaderboardEntry[]>(response);
}
