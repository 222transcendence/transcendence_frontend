import type { PublicUserProfile, UserProfile } from '../types/user';

interface ApiEnvelope<T> {
  data: T;
  error: { message?: string } | null;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(path, { ...init, headers });
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || 'Request failed');
  }
  return result.data;
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
