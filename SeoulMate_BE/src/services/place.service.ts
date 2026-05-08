import type { PublicDataset } from "../models/publicDataset.model";
import { publicDataRepository } from "../repositories/publicData.repository";
import { ApiError } from "../utils/ApiError";

interface SearchPlacesInput {
  q?: string;
  region?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface PlaceSummaryResponse {
  id: string;
  name: string;
  category: string;
  address: string | null;
}

export interface PlaceDetailResponse extends PlaceSummaryResponse {
  lat: number | null;
  lng: number | null;
  congestion: string;
  priceMin: number;
  priceMax: number;
  stayDuration: number;
  openHours: string;
  imageUrls: string[];
}

export interface SearchPlacesResponse {
  data: PlaceSummaryResponse[];
  total: number;
}

const extractText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item))
      .filter(Boolean)
      .join(",");
  }

  if (typeof value === "object") {
    return undefined;
  }

  const text = String(value).trim();
  return text || undefined;
};

const parseCost = (value: unknown): number | undefined => {
  const text = extractText(value);
  if (!text) {
    return undefined;
  }

  if (/무료|free|없음|0\s*원/i.test(text)) {
    return 0;
  }

  const won = text.match(/(\d[\d,]*)\s*원/);
  if (won) {
    return Number(won[1].replace(/,/g, ""));
  }

  const numberOnly = text.match(/\b(\d{4,6})\b/);
  return numberOnly ? Number(numberOnly[1]) : undefined;
};

const estimateCost = (place: PublicDataset): number => {
  const metadata = place.metadata ?? {};
  const parsed =
    parseCost(metadata.useFee) ??
    parseCost(metadata.entranceFee) ??
    parseCost(metadata.entrFee) ??
    parseCost(metadata.freeYn) ??
    parseCost(metadata.entranceFree);

  if (typeof parsed === "number") {
    return parsed;
  }

  const text = [place.title, place.category, place.sourceDataset, JSON.stringify(metadata)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/무료|공원|산책|자연/.test(text)) return 0;
  if (/카페|커피|디저트|베이커리/.test(text)) return 9000;
  if (/음식|식당|맛집|restaurant/.test(text)) return 15000;
  if (/문화|전시|공연|박물관/.test(text)) return 12000;
  return 8000;
};

const resolveStayDuration = (place: PublicDataset): number => {
  const text = [place.title, place.category, place.sourceDataset].filter(Boolean).join(" ");
  if (/카페|커피|디저트/.test(text)) return 60;
  if (/음식|식당|맛집/.test(text)) return 70;
  if (/공원|산책|자연/.test(text)) return 50;
  if (/문화|전시|공연|박물관/.test(text)) return 80;
  return 60;
};

const resolveOpenHours = (place: PublicDataset): string => {
  const metadata = place.metadata ?? {};
  return (
    extractText(metadata.openHour) ??
    extractText(metadata.operatingTime) ??
    extractText(metadata.useTime) ??
    extractText(metadata.businessDays) ??
    extractText(metadata.displayDate) ??
    "방문 전 확인 필요"
  );
};

const resolveImageUrls = (place: PublicDataset): string[] => {
  const metadata = place.metadata ?? {};
  const raw = metadata.imageUrls ?? metadata.imageUrl ?? metadata.mainImage ?? metadata.orgLink;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter((item) => item.startsWith("http"));
  }

  const text = extractText(raw);
  return text?.startsWith("http") ? [text] : [];
};

const toSummary = (place: PublicDataset): PlaceSummaryResponse => ({
  id: `plc_${place.id}`,
  name: place.title,
  category: place.category,
  address: place.address
});

const toDetail = (place: PublicDataset): PlaceDetailResponse => {
  const cost = estimateCost(place);

  return {
    ...toSummary(place),
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
    congestion: "unknown",
    priceMin: cost,
    priceMax: cost,
    stayDuration: resolveStayDuration(place),
    openHours: resolveOpenHours(place),
    imageUrls: resolveImageUrls(place)
  };
};

export const placeService = {
  async searchPlaces(input: SearchPlacesInput): Promise<SearchPlacesResponse> {
    const params = {
      keyword: input.q,
      region: input.region,
      category: input.category,
      page: input.page,
      pageSize: input.pageSize
    };
    const [places, total] = await Promise.all([
      publicDataRepository.search(params),
      publicDataRepository.countSearch(params)
    ]);

    return {
      data: places.map(toSummary),
      total
    };
  },

  async getPlace(id: number): Promise<PlaceDetailResponse> {
    const place = await publicDataRepository.getById(id);
    if (!place) {
      throw new ApiError(404, "장소를 찾을 수 없습니다.");
    }

    return toDetail(place);
  }
};
