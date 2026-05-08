-- 행정동×요일×시간대별 평균 생활인구수 (서울시 생활인구 OA-14991 집계)
CREATE TABLE living_population_stats (
  id bigserial PRIMARY KEY,
  dong_code varchar(10) NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  hour_code smallint NOT NULL CHECK (hour_code BETWEEN 0 AND 23),
  avg_population integer NOT NULL,
  sample_months smallint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (dong_code, day_of_week, hour_code)
);

CREATE INDEX idx_living_population_stats_lookup
  ON living_population_stats (dong_code, day_of_week, hour_code);
