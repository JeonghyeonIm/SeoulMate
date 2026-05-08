import { db } from "../config/db";

export interface LivingPopulationUpsertInput {
  dongCode: string;
  dayOfWeek: number;
  hourCode: number;
  avgPopulation: number;
  sampleMonths: number;
}

export interface LivingPopulationStats {
  dongCode: string;
  dayOfWeek: number;
  hourCode: number;
  avgPopulation: number;
}

const BATCH_SIZE = 500;

export const livingPopulationRepository = {
  async upsertMany(items: LivingPopulationUpsertInput[]): Promise<void> {
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const values: (string | number)[] = [];

      const placeholders = batch
        .map((item, j) => {
          const o = j * 5;
          values.push(
            item.dongCode,
            item.dayOfWeek,
            item.hourCode,
            item.avgPopulation,
            item.sampleMonths
          );
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, now())`;
        })
        .join(", ");

      await db.query(
        `INSERT INTO living_population_stats
           (dong_code, day_of_week, hour_code, avg_population, sample_months, updated_at)
         VALUES ${placeholders}
         ON CONFLICT (dong_code, day_of_week, hour_code)
         DO UPDATE SET
           avg_population = EXCLUDED.avg_population,
           sample_months  = EXCLUDED.sample_months,
           updated_at     = now()`,
        values
      );
    }
  },

  async findByDongCodes(
    dongCodes: string[],
    dayOfWeek: number,
    hourCode: number
  ): Promise<LivingPopulationStats[]> {
    if (dongCodes.length === 0) return [];

    const result = await db.query<{
      dong_code: string;
      day_of_week: number;
      hour_code: number;
      avg_population: number;
    }>(
      `SELECT dong_code, day_of_week, hour_code, avg_population
         FROM living_population_stats
        WHERE dong_code = ANY($1)
          AND day_of_week = $2
          AND hour_code = $3`,
      [dongCodes, dayOfWeek, hourCode]
    );

    return result.rows.map((row) => ({
      dongCode: row.dong_code,
      dayOfWeek: row.day_of_week,
      hourCode: row.hour_code,
      avgPopulation: row.avg_population
    }));
  },

  async findAvgByGuCode(
    guCode: string,
    dayOfWeek: number,
    hourCode: number
  ): Promise<number | null> {
    const result = await db.query<{ avg: string | null }>(
      `SELECT AVG(avg_population)::integer AS avg
         FROM living_population_stats
        WHERE left(dong_code, 5) = $1
          AND day_of_week = $2
          AND hour_code = $3`,
      [guCode, dayOfWeek, hourCode]
    );

    const avg = result.rows[0]?.avg;
    return avg !== null && avg !== undefined ? parseInt(avg, 10) : null;
  }
};
