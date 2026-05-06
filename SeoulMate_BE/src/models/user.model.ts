export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  preferredRegion: string | null;
  preferredCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserProfileInput {
  id: string;
  email: string;
  nickname: string;
  preferredRegion?: string | null;
  preferredCategory?: string | null;
}

export interface UpdateUserPreferencesInput {
  preferredRegion?: string | null;
  preferredCategory?: string | null;
}
