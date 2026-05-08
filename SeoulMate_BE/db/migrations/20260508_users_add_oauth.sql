-- users: OAuth 지원을 위한 provider, oauth_id 컬럼 추가
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'local'
    CHECK (provider IN ('local', 'kakao', 'google')),
  ADD COLUMN IF NOT EXISTS oauth_id varchar(255);

-- OAuth 사용자는 비밀번호가 없으므로 password_hash nullable로 변경
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- (provider, oauth_id) 유니크 인덱스 - oauth_id가 있을 때만 적용
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_provider_oauth
  ON users (provider, oauth_id)
  WHERE oauth_id IS NOT NULL;
