import { env } from "../config/env";

const KAKAO_AUTH_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me";

export interface KakaoUserInfo {
  id: number;
  kakao_account?: {
    email?: string;
    email_needs_agreement?: boolean;
    profile?: {
      nickname?: string;
    };
  };
}

export const kakaoOAuthClient = {
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: env.KAKAO_REST_API_KEY,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      response_type: "code",
      scope: "profile_nickname account_email"
    });
    return `${KAKAO_AUTH_URL}?${params}`;
  },

  async getAccessToken(code: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.KAKAO_REST_API_KEY,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      code
    });
    if (env.KAKAO_CLIENT_SECRET) {
      body.set("client_secret", env.KAKAO_CLIENT_SECRET);
    }

    const response = await fetch(KAKAO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kakao token request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  },

  async getUserInfo(accessToken: string): Promise<KakaoUserInfo> {
    const response = await fetch(KAKAO_USER_INFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error(`Kakao user info request failed (${response.status})`);
    }

    return response.json() as Promise<KakaoUserInfo>;
  }
};
