UPDATE public_data
   SET latitude = NULL,
       longitude = NULL,
       updated_at = now()
 WHERE (latitude = 0 AND longitude = 0)
    OR (latitude = 33.4777213 AND longitude = 124.8464315)
    OR (
      latitude IS NOT NULL AND
      longitude IS NOT NULL AND
      NOT (latitude BETWEEN 37.413 AND 37.716 AND longitude BETWEEN 126.734 AND 127.269)
    );
