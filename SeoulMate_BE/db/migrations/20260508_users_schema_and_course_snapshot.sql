-- users: vibes 배열 컬럼, budget, role 추가
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vibes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget integer CHECK (budget IS NULL OR budget >= 0),
  ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin'));

-- 기존 preferred_category CSV 값을 vibes 배열로 마이그레이션
UPDATE users
SET vibes = string_to_array(preferred_category, ',')
WHERE preferred_category IS NOT NULL AND preferred_category <> '';

-- recommendation_requests: 추천 당시 코스 snapshot 컬럼 추가
ALTER TABLE recommendation_requests
  ADD COLUMN IF NOT EXISTS course_title varchar(255),
  ADD COLUMN IF NOT EXISTS course_duration_minutes integer
    CHECK (course_duration_minutes IS NULL OR course_duration_minutes >= 0),
  ADD COLUMN IF NOT EXISTS course_congestion varchar(20),
  ADD COLUMN IF NOT EXISTS course_description text,
  ADD COLUMN IF NOT EXISTS course_estimated_budget integer
    CHECK (course_estimated_budget IS NULL OR course_estimated_budget >= 0);
