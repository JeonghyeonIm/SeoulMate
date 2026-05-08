export interface UserProfile {
  id: number;
  email: string;
  nickname: string;
  vibes: string[];
  budget: number | null;
  role: string;
  provider: string;
  oauthId: string | null;
  preferredRegion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserAuthRecord extends UserProfile {
  passwordHash: string | null;
}

export interface CreateUserProfileInput {
  email: string;
  passwordHash: string | null;
  nickname: string;
  provider?: string;
  oauthId?: string | null;
  vibes?: string[];
  budget?: number | null;
  preferredRegion?: string | null;
}

export interface UpdateUserPreferencesInput {
  preferredRegion?: string | null;
  vibes?: string[];
  budget?: number;
}

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
}
