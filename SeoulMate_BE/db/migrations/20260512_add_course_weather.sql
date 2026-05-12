ALTER TABLE recommendation_requests
  ADD COLUMN IF NOT EXISTS course_weather jsonb;
