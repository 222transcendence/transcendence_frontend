export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatar: string;
  status: string;
  wins: number;
  losses: number;
}

export type PublicUserProfile = Omit<UserProfile, 'email'>;
