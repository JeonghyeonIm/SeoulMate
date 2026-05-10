import { mapClient, type KakaoLocalPlace } from "../../clients/map.client";
import type {
  CandidatePlace,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

const MAX_VERIFICATION_REQUESTS = 4;
const MIN_VERIFIED_CANDIDATES = 8;
const CONCURRENCY = 4;
const ENABLE_KAKAO_PLACE_VERIFICATION = process.env.SEOULMATE_ENABLE_KAKAO_VERIFY === "true";

const TRUSTED_SOURCE_DATASETS = new Set([
  "culturalSpaceInfo",
  "TbVwAttractions",
  "TbVwNature",
  "SearchParkInfoService",
  "TbVwRestaurants",
  "viewNightSpot"
]);

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/서울특별시|서울시|서울|마포구|성동구|강남구|종로구|중구|용산구|송파구|서초구/g, " ")
    .replace(/[^0-9a-z가-힣]/g, "")
    .trim();

const hasCoordinate = (place: CandidatePlace): boolean =>
  typeof place.latitude === "number" && typeof place.longitude === "number";

const isTrustedPlace = (place: CandidatePlace): boolean =>
  Boolean(place.sourceDataset && TRUSTED_SOURCE_DATASETS.has(place.sourceDataset));

const looksLikeEvent = (place: CandidatePlace): boolean =>
  place.sourceDataset === "culturalEventInfo" ||
  /행사|축제|페스티벌|공연|전시/.test(place.category);

const simplifyAddress = (address?: string): string | undefined => {
  const cleaned = address
    ?.replace(/\([^)]*\)/g, " ")
    .split(/[,\n]/)[0]
    ?.trim();

  if (!cleaned || cleaned.length < 2) {
    return undefined;
  }

  return cleaned;
};

const buildQueries = (place: CandidatePlace, region?: string): string[] => {
  const queries = looksLikeEvent(place)
    ? [
        simplifyAddress(place.address),
        place.title,
        `${simplifyAddress(place.address) ?? ""} ${region ?? ""}`
      ]
    : [
        place.title,
        `${place.title} ${region ?? place.region ?? ""}`,
        simplifyAddress(place.address)
      ];

  return [
    ...new Set(
      queries.map((query) => query?.trim()).filter((query): query is string => Boolean(query))
    )
  ].slice(0, 2);
};

const stringScore = (candidate: string, kakao: string): number => {
  const left = normalize(candidate);
  const right = normalize(kakao);

  if (!left || !right) {
    return 0;
  }

  if (left === right) return 45;
  if (left.includes(right) || right.includes(left)) return 35;

  const leftTokens = candidate
    .split(/\s+/)
    .map(normalize)
    .filter((token) => token.length >= 2);
  const matches = leftTokens.filter((token) => right.includes(token)).length;
  return Math.min(25, matches * 8);
};

const scoreMatch = (place: CandidatePlace, kakaoPlace: KakaoLocalPlace): number => {
  let score = stringScore(place.title, kakaoPlace.placeName);
  const kakaoAddress = `${kakaoPlace.roadAddressName ?? ""} ${kakaoPlace.addressName ?? ""}`;

  if (place.address) {
    score += stringScore(place.address, kakaoAddress);
  }

  if (place.region && kakaoAddress.includes(place.region)) {
    score += 12;
  }

  if (place.category && kakaoPlace.categoryName) {
    score += stringScore(place.category, kakaoPlace.categoryName) * 0.4;
  }

  if (typeof kakaoPlace.distanceMeter === "number") {
    if (kakaoPlace.distanceMeter <= 150) score += 30;
    else if (kakaoPlace.distanceMeter <= 500) score += 22;
    else if (kakaoPlace.distanceMeter <= 1200) score += 12;
  }

  if (kakaoPlace.phone) {
    score += 4;
  }

  return Math.round(score);
};

const verifyPlace = async (place: CandidatePlace, region?: string): Promise<CandidatePlace> => {
  const coordinate = hasCoordinate(place)
    ? { latitude: place.latitude as number, longitude: place.longitude as number }
    : undefined;

  const matches: Array<KakaoLocalPlace & { confidence: number }> = [];
  for (const query of buildQueries(place, region)) {
    const results = await mapClient.searchPlacesByKeyword(query, {
      coordinate,
      radiusMeter: coordinate ? 2500 : undefined,
      size: 5
    });

    matches.push(
      ...results.map((result) => ({
        ...result,
        confidence: scoreMatch(place, result)
      }))
    );
  }

  const best = matches.sort((left, right) => right.confidence - left.confidence)[0];
  if (!best || best.confidence < 45) {
    return {
      ...place,
      mapVerification: {
        provider: "kakaoLocal",
        verified: false,
        confidence: best?.confidence ?? 0
      }
    };
  }

  return {
    ...place,
    title: best.placeName || place.title,
    address: best.roadAddressName || best.addressName || place.address,
    latitude: best.latitude,
    longitude: best.longitude,
    tags: [...(place.tags ?? []), "카카오검증"],
    metadata: {
      ...place.metadata,
      kakaoLocal: {
        placeId: best.id,
        placeName: best.placeName,
        placeUrl: best.placeUrl,
        categoryName: best.categoryName,
        phone: best.phone,
        confidence: best.confidence,
        distanceMeter: best.distanceMeter
      }
    },
    mapVerification: {
      provider: "kakaoLocal",
      verified: true,
      placeId: best.id,
      placeName: best.placeName,
      placeUrl: best.placeUrl,
      categoryName: best.categoryName,
      phone: best.phone,
      confidence: best.confidence,
      distanceMeter: best.distanceMeter
    }
  };
};

const verifyInBatches = async (
  places: CandidatePlace[],
  region?: string
): Promise<CandidatePlace[]> => {
  const verified: CandidatePlace[] = [];

  for (let index = 0; index < places.length; index += CONCURRENCY) {
    const batch = places.slice(index, index + CONCURRENCY);
    verified.push(...(await Promise.all(batch.map((place) => verifyPlace(place, region)))));
  }

  return verified;
};

export const verifyCandidatePlacesNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const candidatePlaces = state.candidatePlaces ?? [];
  if (!candidatePlaces.length) {
    return {};
  }

  if (!ENABLE_KAKAO_PLACE_VERIFICATION) {
    return {
      candidatePlaces
    };
  }

  const verificationTargets = candidatePlaces
    .filter((place) => hasCoordinate(place) || isTrustedPlace(place))
    .slice(0, MAX_VERIFICATION_REQUESTS);
  const skipped = candidatePlaces.filter(
    (place) => !verificationTargets.some((target) => target.id === place.id)
  );
  const verifiedTargets = await verifyInBatches(verificationTargets, state.parsedRequest?.region);
  const verified = verifiedTargets.filter((place) => place.mapVerification?.verified);
  const trustedFallback = verifiedTargets.filter(
    (place) => !place.mapVerification?.verified && hasCoordinate(place) && isTrustedPlace(place)
  );
  const coordinateFallback = verifiedTargets.filter(
    (place) => !place.mapVerification?.verified && hasCoordinate(place) && !isTrustedPlace(place)
  );

  const ranked =
    verified.length >= MIN_VERIFIED_CANDIDATES
      ? [...verified, ...trustedFallback, ...coordinateFallback, ...skipped]
      : [...verified, ...trustedFallback, ...coordinateFallback, ...skipped];

  const errors = verified.length
    ? []
    : [
        "Kakao Local place verification found no confident matches; using DB candidates with coordinates."
      ];

  return {
    candidatePlaces: ranked,
    errors
  };
};
