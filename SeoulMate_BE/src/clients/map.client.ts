import { env } from "../config/env";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export type RouteProvider = "kakaoWalking" | "estimated";

export interface RouteLeg {
  from: Coordinate;
  to: Coordinate;
  distanceMeter: number;
  durationMinute: number;
  provider: RouteProvider;
  isFallback: boolean;
}

export interface RouteSummary {
  totalDistanceMeter: number;
  totalDurationMinute: number;
  legs: RouteLeg[];
  provider: RouteProvider;
  isFallback: boolean;
}

export interface KakaoLocalPlace {
  id: string;
  placeName: string;
  categoryName?: string;
  categoryGroupName?: string;
  phone?: string;
  addressName?: string;
  roadAddressName?: string;
  longitude: number;
  latitude: number;
  placeUrl?: string;
  distanceMeter?: number;
}

interface KakaoWalkingRoute {
  result_code?: number;
  result_message?: string;
  summary?: {
    distance?: number;
    duration?: number;
  };
}

interface KakaoWalkingDirectionsResponse {
  routes?: KakaoWalkingRoute[];
}

interface KakaoKeywordDocument {
  id?: string;
  place_name?: string;
  category_name?: string;
  category_group_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  place_url?: string;
  distance?: string;
}

interface KakaoKeywordSearchResponse {
  documents?: KakaoKeywordDocument[];
}

const KAKAO_WALKING_DIRECTIONS_URL =
  "https://apis-navi.kakaomobility.com/affiliate/walking/v1/directions";
const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const EARTH_RADIUS_METER = 6371000;
const WALKING_SPEED_METER_PER_MINUTE = 67;
const WALKING_ROUTE_FACTOR = 1.25;
let kakaoLocalSearchDisabled = false;

const toRadians = (degree: number): number => (degree * Math.PI) / 180;

const toKakaoPoint = (coordinate: Coordinate): string =>
  `${coordinate.longitude},${coordinate.latitude}`;

const secondsToMinutes = (seconds: number): number => Math.max(1, Math.round(seconds / 60));

const estimateWalkingLeg = (from: Coordinate, to: Coordinate): RouteLeg => {
  const distanceMeter = mapClient.calculateDistanceMeter(from, to);

  return {
    from,
    to,
    distanceMeter,
    durationMinute: mapClient.estimateWalkingDurationMinute(distanceMeter),
    provider: "estimated",
    isFallback: true
  };
};

const fetchKakaoWalkingLeg = async (from: Coordinate, to: Coordinate): Promise<RouteLeg | null> => {
  if (!env.KAKAO_REST_API_KEY) {
    return null;
  }

  const qs = new URLSearchParams({
    origin: toKakaoPoint(from),
    destination: toKakaoPoint(to),
    priority: "DISTANCE",
    summary: "true"
  });

  const response = await fetch(`${KAKAO_WALKING_DIRECTIONS_URL}?${qs}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}`,
      "Content-Type": "application/json",
      service: env.KAKAO_MOBILITY_SERVICE
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as KakaoWalkingDirectionsResponse;
  const route = payload.routes?.[0];
  const distanceMeter = route?.summary?.distance;
  const durationSecond = route?.summary?.duration;

  if (
    route?.result_code !== 0 ||
    typeof distanceMeter !== "number" ||
    typeof durationSecond !== "number"
  ) {
    return null;
  }

  return {
    from,
    to,
    distanceMeter,
    durationMinute: secondsToMinutes(durationSecond),
    provider: "kakaoWalking",
    isFallback: false
  };
};

const toLocalPlace = (document: KakaoKeywordDocument): KakaoLocalPlace | null => {
  const latitude = Number(document.y);
  const longitude = Number(document.x);

  if (!document.id || !document.place_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    id: document.id,
    placeName: document.place_name,
    categoryName: document.category_name,
    categoryGroupName: document.category_group_name,
    phone: document.phone,
    addressName: document.address_name,
    roadAddressName: document.road_address_name,
    latitude,
    longitude,
    placeUrl: document.place_url,
    distanceMeter: document.distance ? Number(document.distance) : undefined
  };
};

export const mapClient = {
  calculateDistanceMeter(from: Coordinate, to: Coordinate): number {
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(EARTH_RADIUS_METER * c * WALKING_ROUTE_FACTOR);
  },

  estimateWalkingDurationMinute(distanceMeter: number): number {
    return Math.max(1, Math.round(distanceMeter / WALKING_SPEED_METER_PER_MINUTE));
  },

  estimateWalkingLeg,

  async getWalkingLeg(from: Coordinate, to: Coordinate): Promise<RouteLeg> {
    try {
      return (await fetchKakaoWalkingLeg(from, to)) ?? estimateWalkingLeg(from, to);
    } catch {
      return estimateWalkingLeg(from, to);
    }
  },

  estimateWalkingRoute(points: Coordinate[]): RouteSummary {
    const legs = points.slice(1).map((point, index) => estimateWalkingLeg(points[index], point));

    return {
      totalDistanceMeter: legs.reduce((sum, leg) => sum + leg.distanceMeter, 0),
      totalDurationMinute: legs.reduce((sum, leg) => sum + leg.durationMinute, 0),
      legs,
      provider: "estimated",
      isFallback: true
    };
  },

  async buildWalkingRoute(points: Coordinate[]): Promise<RouteSummary> {
    const legs = await Promise.all(
      points.slice(1).map((point, index) => this.getWalkingLeg(points[index], point))
    );

    return {
      totalDistanceMeter: legs.reduce((sum, leg) => sum + leg.distanceMeter, 0),
      totalDurationMinute: legs.reduce((sum, leg) => sum + leg.durationMinute, 0),
      legs,
      provider: legs.some((leg) => leg.provider === "kakaoWalking") ? "kakaoWalking" : "estimated",
      isFallback: legs.every((leg) => leg.isFallback)
    };
  },

  async searchPlacesByKeyword(
    query: string,
    options: { coordinate?: Coordinate; radiusMeter?: number; size?: number } = {}
  ): Promise<KakaoLocalPlace[]> {
    const normalizedQuery = query.trim();
    if (!env.KAKAO_REST_API_KEY || kakaoLocalSearchDisabled || !normalizedQuery) {
      return [];
    }

    const qs = new URLSearchParams({
      query: normalizedQuery,
      size: String(Math.max(1, Math.min(options.size ?? 5, 15)))
    });

    if (options.coordinate) {
      qs.set("x", String(options.coordinate.longitude));
      qs.set("y", String(options.coordinate.latitude));
      qs.set("radius", String(Math.max(1, Math.min(options.radiusMeter ?? 2000, 20000))));
      qs.set("sort", "distance");
    }

    const response = await fetch(`${KAKAO_KEYWORD_SEARCH_URL}?${qs}`, {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        kakaoLocalSearchDisabled = true;
      }

      return [];
    }

    const payload = (await response.json()) as KakaoKeywordSearchResponse;
    return (payload.documents ?? [])
      .map(toLocalPlace)
      .filter((place): place is KakaoLocalPlace => place !== null);
  }
};
