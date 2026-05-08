CREATE TABLE refresh_token_blacklist (
  id bigserial PRIMARY KEY,
  token_hash varchar(64) NOT NULL UNIQUE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_rtbl_token_hash ON refresh_token_blacklist (token_hash);
CREATE INDEX idx_rtbl_expires_at ON refresh_token_blacklist (expires_at);
