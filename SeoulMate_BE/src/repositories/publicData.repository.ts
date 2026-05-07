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

export interface RecommendationCandidateSearchParams {
  region?: string;
  districts?: string[];
  regionAliases?: string[];
  includeTitleRegionMatch?: boolean;
  sourceDatasets?: string[];
  keywords?: string[];
  pageSize?: number;
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

  buildSearchWhere(params: PublicDatasetSearchParams): {
    whereClause: string;
    values: Array<string | number | string[]>;
  } {
    const clauses: string[] = [];
    const values: Array<string | number | string[]> = [];

    if (params.keyword) {
      values.push(`%${params.keyword}%`);
      const placeholder = `$${values.length}`;
      clauses.push(
        `(title ILIKE ${placeholder} OR category ILIKE ${placeholder} OR address ILIKE ${placeholder})`
      );
    }

    if (params.region) {
      values.push(`%${params.region}%`);
      const placeholder = `$${values.length}`;
      clauses.push(
        `(region ILIKE ${placeholder} OR address ILIKE ${placeholder} OR title ILIKE ${placeholder})`
      );
    }

    if (params.category) {
      const categoryAliases: Record<string, string[]> = {
        카페: ["카페", "커피", "디저트", "베이커리", "휴게"],
        음식점: ["음식", "식당", "맛집", "레스토랑", "restaurant"],
        문화공간: ["문화", "전시", "공연", "박물관", "미술관"],
        산책: ["산책", "공원", "자연", "숲"],
        공원: ["공원", "산책", "자연", "숲"],
        관광명소: ["관광", "명소", "야경"]
      };
      const aliases = categoryAliases[params.category] ?? [params.category];
      values.push(aliases.map((alias) => `%${alias}%`));
      const placeholder = `$${values.length}`;
      clauses.push(
        `(category ILIKE ANY(${placeholder}) OR title ILIKE ANY(${placeholder}) OR address ILIKE ANY(${placeholder}) OR metadata::text ILIKE ANY(${placeholder}))`
      );
    }

    return {
      whereClause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
      values
    };
  },

  async countSearch(params: PublicDatasetSearchParams): Promise<number> {
    const { whereClause, values } = this.buildSearchWhere(params);
    const result = await db.query(
      `SELECT count(*)::int AS total
         FROM public_data
         ${whereClause}`,
      values
    );

    return Number(result.rows[0]?.total ?? 0);
  },

  async search(params: PublicDatasetSearchParams): Promise<PublicDataset[]> {
    const { whereClause, values } = this.buildSearchWhere(params);
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 20, 100));
    values.push(pageSize);
    const limitIndex = values.length;
    values.push((page - 1) * pageSize);
    const offsetIndex = values.length;

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

  async findRecommendationCandidates(
    params: RecommendationCandidateSearchParams
  ): Promise<PublicDataset[]> {
    const clauses: string[] = [];
    const values: Array<string | number | string[]> = [];
    const orderCases: string[] = [];

    const normalizeList = (items?: string[]): string[] =>
      [...new Set((items ?? []).map((item) => item.trim()).filter(Boolean))];

    const toLikePatterns = (items: string[]): string[] => items.map((item) => `%${item}%`);

    const pushTextMatch = (columns: string[], value: string): string => {
      values.push(`%${value}%`);
      const placeholder = `$${values.length}`;
      return `(${columns.map((column) => `${column} ILIKE ${placeholder}`).join(" OR ")})`;
    };

    const districts = normalizeList(params.districts);
    const regionAliases = normalizeList(params.regionAliases);

    let districtClause: string | undefined;
    if (districts.length) {
      values.push(districts);
      const exactDistrictPlaceholder = `$${values.length}`;
      const exactDistrictClause = `region = ANY(${exactDistrictPlaceholder})`;

      values.push(toLikePatterns(districts));
      const districtPatternPlaceholder = `$${values.length}`;
      const districtPatternClause = `(region ILIKE ANY(${districtPatternPlaceholder}) OR address ILIKE ANY(${districtPatternPlaceholder}))`;

      districtClause = `(${exactDistrictClause} OR ${districtPatternClause})`;
      orderCases.push(`WHEN ${exactDistrictClause} THEN 1`);
    }

    let regionAliasClause: string | undefined;
    if (regionAliases.length) {
      values.push(toLikePatterns(regionAliases));
      const aliasPlaceholder = `$${values.length}`;
      const aliasColumns = params.includeTitleRegionMatch
        ? ["region", "address", "title"]
        : ["region", "address"];
      regionAliasClause = `(${aliasColumns
        .map((column) => `${column} ILIKE ANY(${aliasPlaceholder})`)
        .join(" OR ")})`;
      orderCases.unshift(`WHEN ${regionAliasClause} THEN 0`);
    }

    if (districtClause) {
      clauses.push(districtClause);
    } else if (regionAliasClause) {
      clauses.push(regionAliasClause);
    } else if (params.region) {
      const regionClause = pushTextMatch(["region", "address"], params.region);
      clauses.push(regionClause);
      orderCases.push(`WHEN ${regionClause} THEN 0`);
    }

    if (params.sourceDatasets?.length) {
      values.push(params.sourceDatasets);
      clauses.push(`source_dataset = ANY($${values.length})`);
    }

    const normalizedKeywords = (params.keywords ?? [])
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);

    if (normalizedKeywords.length) {
      values.push(normalizedKeywords.map((keyword) => `%${keyword}%`));
      const placeholder = `$${values.length}`;
      clauses.push(
        `(title ILIKE ANY(${placeholder}) OR category ILIKE ANY(${placeholder}) OR address ILIKE ANY(${placeholder}) OR metadata::text ILIKE ANY(${placeholder}))`
      );
    }

    const pageSize = Math.max(1, Math.min(params.pageSize ?? 60, 120));
    values.push(pageSize);
    const limitIndex = values.length;

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const orderClause = orderCases.length
      ? `CASE ${orderCases.join(" ")} ELSE 1 END, updated_at DESC, id DESC`
      : "updated_at DESC, id DESC";

    const result = await db.query(
      `SELECT *
         FROM public_data
         ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${limitIndex}`,
      values
    );

    return result.rows.map(mapPublicDataset);
  },

  async replaceDataset(sourceDataset: string, items: UpsertPublicDatasetInput[]): Promise<void> {
    const seen = new Map<string, UpsertPublicDatasetInput>();
    for (const item of items) {
      seen.set(`${item.sourceDataset ?? ""}\0${item.sourceRecordId ?? ""}`, item);
    }
    const deduped = [...seen.values()];

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM public_data WHERE source_dataset = $1", [sourceDataset]);

      const chunkSize = 200;
      for (let index = 0; index < deduped.length; index += chunkSize) {
        const chunk = deduped.slice(index, index + chunkSize);
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

        await client.query(
          `INSERT INTO public_data (
            source_dataset, source_record_id, title, category, region, address,
            latitude, longitude, source, source_url, metadata
          ) VALUES ${placeholders.join(", ")}`,
          values
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async upsertMany(items: UpsertPublicDatasetInput[]): Promise<void> {
    if (!items.length) {
      return;
    }

    const chunkSize = 200;

    for (let index = 0; index < items.length; index += chunkSize) {
      const rawChunk = items.slice(index, index + chunkSize);
      const seen = new Map<string, UpsertPublicDatasetInput>();
      for (const item of rawChunk) {
        seen.set(`${item.sourceDataset ?? ""}\0${item.sourceRecordId ?? ""}`, item);
      }
      const chunk = [...seen.values()];
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
          ON CONFLICT (source_dataset, source_record_id)
          DO UPDATE SET
            source = EXCLUDED.source,
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
