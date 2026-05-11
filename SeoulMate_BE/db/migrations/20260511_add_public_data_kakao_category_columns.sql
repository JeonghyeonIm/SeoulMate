ALTER TABLE public_data
  ADD COLUMN IF NOT EXISTS kakao_place_name varchar(255),
  ADD COLUMN IF NOT EXISTS kakao_place_url text,
  ADD COLUMN IF NOT EXISTS kakao_category_name varchar(255),
  ADD COLUMN IF NOT EXISTS kakao_category_group_name varchar(100),
  ADD COLUMN IF NOT EXISTS kakao_match_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS kakao_matched_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS kakao_checked_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS kakao_match_status varchar(20);

CREATE INDEX IF NOT EXISTS idx_public_data_kakao_category_group_name
  ON public_data(kakao_category_group_name);

CREATE INDEX IF NOT EXISTS idx_public_data_kakao_category_name
  ON public_data(kakao_category_name);

CREATE INDEX IF NOT EXISTS idx_public_data_kakao_checked_at
  ON public_data(kakao_checked_at);

CREATE INDEX IF NOT EXISTS idx_public_data_kakao_match_status
  ON public_data(kakao_match_status);
