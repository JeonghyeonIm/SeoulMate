export interface UserProfile {
  id: number;
  email: string;
  nickname: string;
  vibes: string[];
  budget: number | null;
  role: string;
  preferredRegion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserAuthRecord extends UserProfile {
  passwordHash: string;
}

export interface CreateUserProfileInput {
  email: string;
  passwordHash: string;
  nickname: string;
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
