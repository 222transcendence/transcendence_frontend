export enum UserStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  IN_GAME = 'IN_GAME',
}

export interface User {
  id: string;
  nickname: string;
  status: UserStatus;
  avatar?: string;
}

export enum FriendStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
}

export interface Friend {
  id: string;
  nickname: string;
  status: UserStatus;
}
