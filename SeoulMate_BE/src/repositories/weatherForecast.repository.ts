import { db } from "../config/db";
import type { UpsertWeatherForecastInput, WeatherForecast } from "../models/weatherForecast.model";

const toForecastDate = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const mapRow = (row: Record<string, unknown>): WeatherForecast => ({
  id: Number(row.id),
  regionCode: String(row.region_code),
  regionName: (row.region_name as string | null) ?? null,
  forecastDate: toForecastDate(row.forecast_date),
  tempMin: row.temp_min === null ? null : Number(row.temp_min),
  tempMax: row.temp_max === null ? null : Number(row.temp_max),
  rainProbAm: row.rain_prob_am === null ? null : Number(row.rain_prob_am),
  rainProbPm: row.rain_prob_pm === null ? null : Number(row.rain_prob_pm),
  weatherAm: (row.weather_am as string | null) ?? null,
  weatherPm: (row.weather_pm as string | null) ?? null,
  baseTime: String(row.base_time),
  fetchedAt: String(row.fetched_at)
});

export const weatherForecastRepository = {
  async upsertMany(items: UpsertWeatherForecastInput[]): Promise<void> {
    if (!items.length) return;

    for (const item of items) {
      await db.query(
        `INSERT INTO weather_forecasts
           (region_code, region_name, forecast_date, temp_min, temp_max,
            rain_prob_am, rain_prob_pm, weather_am, weather_pm, base_time, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         ON CONFLICT (region_code, forecast_date)
         DO UPDATE SET
           region_name  = EXCLUDED.region_name,
           temp_min     = COALESCE(EXCLUDED.temp_min,     weather_forecasts.temp_min),
           temp_max     = COALESCE(EXCLUDED.temp_max,     weather_forecasts.temp_max),
           rain_prob_am = COALESCE(EXCLUDED.rain_prob_am, weather_forecasts.rain_prob_am),
           rain_prob_pm = COALESCE(EXCLUDED.rain_prob_pm, weather_forecasts.rain_prob_pm),
           weather_am   = COALESCE(EXCLUDED.weather_am,   weather_forecasts.weather_am),
           weather_pm   = COALESCE(EXCLUDED.weather_pm,   weather_forecasts.weather_pm),
           base_time    = EXCLUDED.base_time,
           fetched_at   = now()`,
        [
          item.regionCode,
          item.regionName ?? null,
          item.forecastDate,
          item.tempMin ?? null,
          item.tempMax ?? null,
          item.rainProbAm ?? null,
          item.rainProbPm ?? null,
          item.weatherAm ?? null,
          item.weatherPm ?? null,
          item.baseTime
        ]
      );
    }
  },

  async findByRegionFromDate(regionCode: string, fromDate: string): Promise<WeatherForecast[]> {
    const result = await db.query(
      `SELECT * FROM weather_forecasts
        WHERE region_code = $1 AND forecast_date >= $2
        ORDER BY forecast_date`,
      [regionCode, fromDate]
    );
    return result.rows.map(mapRow);
  },

  async deleteOlderThan(date: string): Promise<void> {
    await db.query(`DELETE FROM weather_forecasts WHERE forecast_date < $1`, [date]);
  }
};
