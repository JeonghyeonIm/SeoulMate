export interface UserProfile {
  id: number;
  email: string;
  nickname: string;
  preferredRegion: string | null;
  preferredCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserProfileInput {
  email: string;
  passwordHash: string;
  nickname: string;
  preferredRegion?: string | null;
  preferredCategory?: string | null;
}

export interface UpdateUserPreferencesInput {
  preferredRegion?: string | null;
  preferredCategory?: string | null;
}
