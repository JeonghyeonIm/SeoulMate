export interface PublicDataset {
  id: number;
  sourceDataset: string | null;
  sourceRecordId: string | null;
  title: string;
  category: string;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPublicDatasetInput {
  sourceDataset?: string | null;
  sourceRecordId?: string | null;
  title: string;
  category: string;
  region?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PublicDatasetSearchParams {
  keyword?: string;
  region?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}
