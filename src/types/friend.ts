export type UserStatus = 'ONLINE' | 'OFFLINE' | 'IN_GAME';

export interface User {
  id: string;
  nickname: string;
  status: UserStatus;
  avatar?: string;
}

export type FriendStatus = 'PENDING' | 'ACCEPTED';

export interface Friend {
  id: string;
  nickname: string;
  status: UserStatus;
}
