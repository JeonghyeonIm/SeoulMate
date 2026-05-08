import { mapClient } from "../../clients/map.client";
import type {
  CandidatePlace,
  RecommendationCourse,
  RecommendationCoursePlace,
  ScoredRecommendationPlace,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

type CourseRole = "cafe" | "culture" | "walk" | "food" | "attraction";

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const placeText = (place: CandidatePlace): string =>
  [
    place.title,
    place.category,
    place.region,
    place.address,
    place.sourceDataset,
    place.tags?.join(" "),
    JSON.stringify(place.metadata ?? {})
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const estimateCost = (place: CandidatePlace): number => {
  if (typeof place.estimatedCost === "number") {
    return place.estimatedCost;
  }

  const text = placeText(place);

  if (includesAny(text, ["무료", "free", "공원", "산책", "자연"])) {
    return 0;
  }

  if (includesAny(text, ["카페", "커피", "디저트", "베이커리"])) {
    return 9000;
  }

  if (includesAny(text, ["음식", "식당", "맛집", "restaurant"])) {
    return 15000;
  }

  if (includesAny(text, ["문화", "전시", "공연", "박물관"])) {
    return 12000;
  }

  return 8000;
};

const roleMatches = (role: CourseRole, place: CandidatePlace): boolean => {
  const text = placeText(place);

  if (role === "cafe") {
    return includesAny(text, ["카페", "커피", "디저트", "베이커리", "휴게"]);
  }

  if (role === "culture") {
    return includesAny(text, ["문화", "전시", "공연", "박물관", "공간", "attraction"]);
  }

  if (role === "walk") {
    return includesAny(text, ["공원", "산책", "자연", "숲", "한강", "야외"]);
  }

  if (role === "food") {
    return includesAny(text, ["음식", "식당", "맛집", "restaurant", "인허가"]);
  }

  return includesAny(text, ["관광", "명소", "야경", "attraction"]);
};

const hasCoordinate = (place: CandidatePlace): boolean =>
  typeof place.latitude === "number" && typeof place.longitude === "number";

const isMapVerified = (place: CandidatePlace): boolean => place.mapVerification?.verified === true;

const estimatedTimeByRole = (role: CourseRole): number =>
  ({
    cafe: 60,
    culture: 80,
    walk: 50,
    food: 70,
    attraction: 60
  })[role];

const roleLabel = (role: CourseRole, fallback: string): string =>
  ({
    cafe: "카페",
    culture: "문화공간",
    walk: "산책",
    food: "음식점",
    attraction: fallback
  })[role];

const resolveRoles = (state: SeoulMateGraphState): CourseRole[] => {
  const categories = state.parsedRequest?.preferredCategories ?? [];
  const roles: CourseRole[] = [];

  for (const category of categories) {
    if (includesAny(category, ["카페", "커피"])) roles.push("cafe");
    else if (includesAny(category, ["전시", "문화", "공연"])) roles.push("culture");
    else if (includesAny(category, ["실내"])) roles.push("cafe", "culture");
    else if (includesAny(category, ["산책", "공원", "자연"])) roles.push("walk");
    else if (includesAny(category, ["식사", "음식", "맛집"])) roles.push("food");
    else roles.push("attraction");
  }

  const defaults: CourseRole[] = ["cafe", "culture", "walk", "food"];
  for (const role of defaults) {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }

  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const count = durationHours <= 2 ? 2 : durationHours >= 5 ? 4 : 3;

  return roles.slice(0, count);
};

const sortPlacesByScore = (
  places: CandidatePlace[],
  scoredPlaces: ScoredRecommendationPlace[]
): CandidatePlace[] => {
  const scoreById = new Map(scoredPlaces.map((score) => [score.placeId, score.totalScore]));

  return [...places].sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0));
};

const selectPlace = (
  role: CourseRole,
  sortedPlaces: CandidatePlace[],
  usedPlaceIds: Set<number>,
  remainingBudget?: number,
  previousPlace?: CandidatePlace
): CandidatePlace | undefined => {
  const available = sortedPlaces.filter((place) => !usedPlaceIds.has(place.id));
  const roleMatchesPlaces = available.filter((place) => roleMatches(role, place));
  const rawPool = roleMatchesPlaces.length ? roleMatchesPlaces : available;
  const pool =
    previousPlace && hasCoordinate(previousPlace)
      ? [...rawPool].sort((a, b) => {
          const distanceA = hasCoordinate(a)
            ? mapClient.calculateDistanceMeter(
                {
                  latitude: previousPlace.latitude as number,
                  longitude: previousPlace.longitude as number
                },
                { latitude: a.latitude as number, longitude: a.longitude as number }
              )
            : Number.POSITIVE_INFINITY;
          const distanceB = hasCoordinate(b)
            ? mapClient.calculateDistanceMeter(
                {
                  latitude: previousPlace.latitude as number,
                  longitude: previousPlace.longitude as number
                },
                { latitude: b.latitude as number, longitude: b.longitude as number }
              )
            : Number.POSITIVE_INFINITY;

          return distanceA - distanceB;
        })
      : rawPool;

  return (
    pool.find(
      (place) =>
        isMapVerified(place) &&
        hasCoordinate(place) &&
        (remainingBudget === undefined || estimateCost(place) <= remainingBudget)
    ) ??
    pool.find(
      (place) =>
        hasCoordinate(place) && (remainingBudget === undefined || estimateCost(place) <= remainingBudget)
    ) ??
    pool.find(isMapVerified) ??
    pool.find(hasCoordinate) ??
    pool.find((place) => remainingBudget === undefined || estimateCost(place) <= remainingBudget) ??
    pool[0]
  );
};

const buildTitle = (state: SeoulMateGraphState): string => {
  const region = state.parsedRequest?.region ?? "서울";
  const mood = state.parsedRequest?.mood?.[0] ? `${state.parsedRequest.mood[0]} ` : "";
  const purpose = state.parsedRequest?.purpose ?? "데이트";

  return `${region} ${mood}${purpose} 코스`;
};

export const buildCourseNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const candidatePlaces = state.candidatePlaces ?? [];
  const scoredPlaces = state.scoredPlaces ?? [];

  if (!candidatePlaces.length) {
    return {
      course: {
        title: buildTitle(state),
        places: [],
        totalScore: 0,
        estimatedBudget: 0
      },
      errors: ["Course could not be built because candidate places are empty"]
    };
  }

  const sortedPlaces = sortPlacesByScore(candidatePlaces, scoredPlaces);
  const scoreById = new Map(scoredPlaces.map((score) => [score.placeId, score.totalScore]));
  const selected: Array<{ role: CourseRole; place: CandidatePlace }> = [];
  const usedPlaceIds = new Set<number>();
  let remainingBudget = state.parsedRequest?.budget;

  for (const role of resolveRoles(state)) {
    const place = selectPlace(
      role,
      sortedPlaces,
      usedPlaceIds,
      remainingBudget,
      selected[selected.length - 1]?.place
    );
    if (!place) {
      continue;
    }

    selected.push({ role, place });
    usedPlaceIds.add(place.id);

    if (remainingBudget !== undefined) {
      remainingBudget -= estimateCost(place);
    }
  }

  if (!selected.length) {
    const topPlace = sortedPlaces[0];
    selected.push({ role: "attraction", place: topPlace });
  }

  const coursePlaces: RecommendationCoursePlace[] = selected.map(({ role, place }, index) => ({
    order: index + 1,
    placeId: place.id,
    title: place.title,
    category: roleMatches(role, place) ? roleLabel(role, place.category) : place.category,
    estimatedTimeMinute: roleMatches(role, place) ? estimatedTimeByRole(role) : 60,
    estimatedCost: estimateCost(place),
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude
  }));

  const routePoints = coursePlaces
    .filter(
      (place) => typeof place.latitude === "number" && typeof place.longitude === "number"
    )
    .map((place) => ({
      latitude: place.latitude as number,
      longitude: place.longitude as number
    }));
  const routeSummary =
    routePoints.length === coursePlaces.length && routePoints.length >= 2
      ? await mapClient.buildWalkingRoute(routePoints)
      : {
          totalDistanceMeter: 0,
          totalDurationMinute: 0,
          legs: [],
          provider: "estimated" as const,
          isFallback: true
        };

  for (let index = 1; index < coursePlaces.length; index += 1) {
    const leg = routeSummary.legs[index - 1];
    if (!leg) {
      continue;
    }

    coursePlaces[index].moveTimeMinute = leg.durationMinute;
    coursePlaces[index].moveDistanceMeter = leg.distanceMeter;
    coursePlaces[index].routeProvider = leg.provider;
    coursePlaces[index].routeFallback = leg.isFallback;
  }

  const totalScore =
    selected.reduce((sum, item) => sum + (scoreById.get(item.place.id) ?? 0), 0) / selected.length;

  const course: RecommendationCourse = {
    title: buildTitle(state),
    places: coursePlaces,
    totalScore: Number(totalScore.toFixed(2)),
    estimatedBudget: coursePlaces.reduce((sum, place) => sum + (place.estimatedCost ?? 0), 0)
  };

  return {
    course,
    contextData: {
      ...state.contextData,
      route: {
        totalDistanceMeter: routeSummary.totalDistanceMeter,
        totalDurationMinute: routeSummary.totalDurationMinute,
        provider: routeSummary.provider,
        isFallback: routeSummary.isFallback
      }
    }
  };
};
