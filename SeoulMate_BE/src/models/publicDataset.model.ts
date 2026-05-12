export interface PublicDataset {
  id: number;
  sourceDataset: string | null;
  sourceRecordId: string | null;
  title: string;
  category: string;
  placeFamily: string | null;
  placeType: string | null;
  placeSubtype: string | null;
  categoryConfidence: number | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
  kakaoPlaceName: string | null;
  kakaoPlaceUrl: string | null;
  kakaoCategoryName: string | null;
  kakaoCategoryGroupName: string | null;
  kakaoMatchConfidence: number | null;
  kakaoMatchedAt: string | null;
  menuPriceFirst: number | null;
  menuNameFirst: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPublicDatasetInput {
  sourceDataset?: string | null;
  sourceRecordId?: string | null;
  title: string;
  category: string;
  placeFamily?: string | null;
  placeType?: string | null;
  placeSubtype?: string | null;
  categoryConfidence?: number | null;
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
