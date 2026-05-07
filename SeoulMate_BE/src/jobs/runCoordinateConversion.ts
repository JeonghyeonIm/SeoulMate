import { db } from "../config/db";
import { epsg5174ToWgs84 } from "../utils/coordinates";

const BATCH_SIZE = 1000;
const TARGET_DATASETS = ["LOCALDATA_072404", "LOCALDATA_072405"];

const run = async (): Promise<void> => {
  const { rows } = await db.query<{
    id: string;
    x: string;
    y: string;
  }>(
    `SELECT id,
            metadata->>'coordinateX5174' AS x,
            metadata->>'coordinateY5174' AS y
       FROM public_data
      WHERE source_dataset = ANY($1)
        AND latitude IS NULL
        AND metadata->>'coordinateX5174' IS NOT NULL
        AND metadata->>'coordinateX5174' != ''`,
    [TARGET_DATASETS]
  );

  console.log(`Found ${rows.length} records to convert`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const updates: Array<{ id: number; lat: number; lng: number }> = [];
    for (const row of batch) {
      const x = Number(row.x);
      const y = Number(row.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        skipped += 1;
        continue;
      }
      const wgs84 = epsg5174ToWgs84(x, y);
      if (!wgs84) {
        skipped += 1;
        continue;
      }
      updates.push({ id: Number(row.id), lat: wgs84.lat, lng: wgs84.lng });
    }

    if (updates.length === 0) continue;

    const ids = updates.map((u) => u.id);
    const lats = updates.map((u) => u.lat);
    const lngs = updates.map((u) => u.lng);

    await db.query(
      `UPDATE public_data AS pd
          SET latitude  = v.lat,
              longitude = v.lng
         FROM (
           SELECT unnest($1::bigint[]) AS id,
                  unnest($2::numeric[]) AS lat,
                  unnest($3::numeric[]) AS lng
         ) AS v
        WHERE pd.id = v.id`,
      [ids, lats, lngs]
    );

    updated += updates.length;
    console.log(`Converted ${updated} / ${rows.length}`);
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
  await db.end();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
