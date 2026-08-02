import type { PublicUserProfile, UserProfile } from '../types/user';
import type { ChatMessage } from '../types/chat';

interface ApiEnvelope<T> {
  data: T;
  error: { message?: string } | null;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || 'Request failed');
  }
  return result.data;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const result = (await response.json()) as ApiEnvelope<{ accessToken: string }>;
    if (response.ok && !result.error && result.data?.accessToken) {
      localStorage.setItem('accessToken', result.data.accessToken);
      return result.data.accessToken;
    }
  } catch {
    // network error — fall through
  }
  return null;
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem('accessToken');
  try {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // ignore — clear local state regardless
  } finally {
    localStorage.clear();
  }
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return fetch(path, { ...init, headers: retryHeaders });
    }
    // Refresh failed — redirect to login
    localStorage.clear();
    window.location.replace('/login');
    return response;
  }

  return response;
}

export async function fetchMyProfile(): Promise<UserProfile> {
  const response = await authorizedFetch('/api/users/me');
  return parseEnvelope<UserProfile>(response);
}

export async function fetchUserProfile(userId: string): Promise<PublicUserProfile> {
  const response = await authorizedFetch(`/api/users/${userId}`);
  return parseEnvelope<PublicUserProfile>(response);
}

export async function updateMyProfile(nickname: string): Promise<UserProfile> {
  const response = await authorizedFetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  return parseEnvelope<UserProfile>(response);
}

export async function deleteMyAvatar(): Promise<UserProfile> {
  const response = await authorizedFetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: null }),
  });
  return parseEnvelope<UserProfile>(response);
}

export async function uploadMyAvatar(file: File): Promise<UserProfile> {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await authorizedFetch('/api/users/me/avatar', {
    method: 'POST',
    body: formData,
  });
  return parseEnvelope<UserProfile>(response);
}

export async function sendFriendRequest(userId: string): Promise<void> {
  const response = await authorizedFetch(`/api/friends/${userId}`, {
    method: 'POST',
  });
  await parseEnvelope<unknown>(response);
}

export async function sendFriendRequestByNickname(nickname: string): Promise<void> {
  const response = await authorizedFetch(`/api/friends/by-nickname/${encodeURIComponent(nickname)}`, {
    method: 'POST',
  });
  await parseEnvelope<unknown>(response);
}

export async function getFriends(): Promise<import('../types/friend').Friend[]> {
  const response = await authorizedFetch('/api/friends');
  return parseEnvelope<import('../types/friend').Friend[]>(response);
}

export async function removeFriend(friendId: string): Promise<void> {
  await authorizedFetch(`/api/friends/${friendId}`, { method: 'DELETE' });
}

export interface PendingRequest {
  id: string;
  requester: { id: string; nickname: string; status: string; avatar: string | null };
  createdAt: string;
}

export async function getPendingRequests(): Promise<PendingRequest[]> {
  const response = await authorizedFetch('/api/friends/requests');
  return parseEnvelope<PendingRequest[]>(response);
}

export async function respondFriendRequest(
  requestId: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const response = await authorizedFetch(`/api/friends/${requestId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  await parseEnvelope<unknown>(response);
}

export async function fetchChatHistory(): Promise<ChatMessage[]> {
  const response = await authorizedFetch('/api/chat/history');
  return parseEnvelope<ChatMessage[]>(response);
}

export interface CardInfo {
  id: number;
  type: 'MOVE' | 'ATK_SWORD' | 'ATK_GUN' | 'DEF' | 'SPECIAL';
  valueTop: number;
  valueBottom: number;
}

export async function fetchAllCards(): Promise<CardInfo[]> {
  const response = await authorizedFetch('/api/game/cards');
  return parseEnvelope<CardInfo[]>(response);
}
