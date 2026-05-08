export type AuthProvider = "local" | "kakao" | "google";

export type Vibe =
  | "조용한"
  | "힙한"
  | "낭만적인"
  | "활기찬"
  | "고즈넉한"
  | "현대적인"
  | "감성적인"
  | "자연친화적";

export interface SignupPreferences {
  vibes: Vibe[] | null;
}

export interface SignupRequestBody {
  email: string;
  password: string;
  nickname: string;
  preferences?: SignupPreferences | null;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface RefreshRequestBody {
  refreshToken: string;
}

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
}

export interface AuthResponseBody {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface RefreshRequestBody {
  refreshToken: string;
}

export interface AuthResponseBody {
  user: {
    id: number;
    email: string;
    nickname: string;
  };
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface ValidatedSignupPayload {
  email: string;
  password: string;
  nickname: string;
  preferences: SignupPreferences | null;
}

// 아래는 하위 호환용 — inMemoryDatabase 제거 이후 미사용
export interface UserRecord {
  id: string;
  email: string;
  password: string | null;
  nickname: string;
  provider: AuthProvider;
  createdAt: string;
}

export interface PreferenceRecord {
  userId: string;
  vibes: Vibe[];
}

export interface CreateUserParams {
  id: string;
  email: string;
  password: string | null;
  nickname: string;
  provider: AuthProvider;
  createdAt: string;
}

export interface CreatePreferenceParams {
  userId: string;
  vibes: Vibe[];
}
