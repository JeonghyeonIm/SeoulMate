import { db } from "../config/db";
import type {
  PublicDataset,
  PublicDatasetSearchParams,
  UpsertPublicDatasetInput
} from "../models/publicDataset.model";

export interface PublicDataSyncRun {
  id: number;
  source: string;
  status: "started" | "completed" | "failed";
  importedCount: number;
  updatedCount: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const mapPublicDataset = (row: Record<string, unknown>): PublicDataset => ({
  id: Number(row.id),
  sourceDataset: (row.source_dataset as string | null) ?? null,
  sourceRecordId: (row.source_record_id as string | null) ?? null,
  title: String(row.title),
  category: String(row.category),
  region: (row.region as string | null) ?? null,
  address: (row.address as string | null) ?? null,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
  source: (row.source as string | null) ?? null,
  sourceUrl: (row.source_url as string | null) ?? null,
  metadata: (row.metadata as Record<string, unknown> | null) ?? {},
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapPublicDataSyncRun = (row: Record<string, unknown>): PublicDataSyncRun => ({
  id: Number(row.id),
  source: String(row.source),
  status: String(row.status) as PublicDataSyncRun["status"],
  importedCount: Number(row.imported_count),
  updatedCount: Number(row.updated_count),
  errorMessage: (row.error_message as string | null) ?? null,
  startedAt: String(row.started_at),
  finishedAt: (row.finished_at as string | null) ?? null
});

export const publicDataRepository = {
  async getById(id: number): Promise<PublicDataset | null> {
    const result = await db.query(`SELECT * FROM public_data WHERE id = $1`, [id]);
    return result.rowCount ? mapPublicDataset(result.rows[0]) : null;
  },

  async search(params: PublicDatasetSearchParams): Promise<PublicDataset[]> {
    const clauses: string[] = [];
    const values: Array<string | number> = [];

    if (params.keyword) {
      values.push(`%${params.keyword}%`);
      clauses.push(`title ILIKE $${values.length}`);
    }

    if (params.region) {
      values.push(params.region);
      clauses.push(`region = $${values.length}`);
    }

    if (params.category) {
      values.push(params.category);
      clauses.push(`category = $${values.length}`);
    }

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 100));
    values.push(pageSize);
    const limitIndex = values.length;
    values.push((page - 1) * pageSize);
    const offsetIndex = values.length;

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await db.query(
      `SELECT *
         FROM public_data
         ${whereClause}
        ORDER BY updated_at DESC, id DESC
        LIMIT $${limitIndex}
       OFFSET $${offsetIndex}`,
      values
    );

    return result.rows.map(mapPublicDataset);
  },

  async upsertMany(items: UpsertPublicDatasetInput[]): Promise<void> {
    if (!items.length) {
      return;
    }

    const chunkSize = 200;

    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize);
      const values: Array<number | string | null> = [];

      const placeholders = chunk.map((item, rowIndex) => {
        const offset = rowIndex * 11;
        values.push(
          item.sourceDataset ?? null,
          item.sourceRecordId ?? null,
          item.title,
          item.category,
          item.region ?? null,
          item.address ?? null,
          item.latitude ?? null,
          item.longitude ?? null,
          item.source ?? null,
          item.sourceUrl ?? null,
          JSON.stringify(item.metadata ?? {})
        );

        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}::jsonb)`;
      });

      await db.query(
        `
          INSERT INTO public_data (
            source_dataset,
            source_record_id,
            title,
            category,
            region,
            address,
            latitude,
            longitude,
            source,
            source_url,
            metadata
          )
          VALUES ${placeholders.join(", ")}
          ON CONFLICT (source, source_record_id)
          DO UPDATE SET
            source_dataset = EXCLUDED.source_dataset,
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            region = EXCLUDED.region,
            address = EXCLUDED.address,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            source_url = EXCLUDED.source_url,
            metadata = EXCLUDED.metadata,
            updated_at = now()
        `,
        values
      );
    }
  },

  async beginSyncRun(source: string): Promise<PublicDataSyncRun> {
    const result = await db.query(
      `
        INSERT INTO public_data_sync_runs (source, status)
        VALUES ($1, 'started')
        RETURNING *
      `,
      [source]
    );

    return mapPublicDataSyncRun(result.rows[0]);
  },

  async completeSyncRun(id: number, importedCount: number, updatedCount: number): Promise<void> {
    await db.query(
      `
        UPDATE public_data_sync_runs
           SET status = 'completed',
               imported_count = $2,
               updated_count = $3,
               finished_at = now()
         WHERE id = $1
      `,
      [id, importedCount, updatedCount]
    );
  },

  async failSyncRun(id: number, errorMessage: string): Promise<void> {
    await db.query(
      `
        UPDATE public_data_sync_runs
           SET status = 'failed',
               error_message = $2,
               finished_at = now()
         WHERE id = $1
      `,
      [id, errorMessage]
    );
  }
};
