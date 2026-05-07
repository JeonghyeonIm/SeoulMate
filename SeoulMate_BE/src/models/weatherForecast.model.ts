export interface WeatherForecast {
  id: number;
  regionCode: string;
  regionName: string | null;
  forecastDate: string; // ISO date string (YYYY-MM-DD)
  tempMin: number | null;
  tempMax: number | null;
  rainProbAm: number | null;
  rainProbPm: number | null;
  weatherAm: string | null;
  weatherPm: string | null;
  baseTime: string; // e.g. '202605070600'
  fetchedAt: string;
}

export interface UpsertWeatherForecastInput {
  regionCode: string;
  regionName?: string;
  forecastDate: string; // YYYY-MM-DD
  tempMin?: number | null;
  tempMax?: number | null;
  rainProbAm?: number | null;
  rainProbPm?: number | null;
  weatherAm?: string | null;
  weatherPm?: string | null;
  baseTime: string;
}
