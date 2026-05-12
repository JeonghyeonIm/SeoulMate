import { mapClient } from "../../clients/map.client";
import { isValidSeoulCoordinate } from "../../utils/coordinates";
import {
  ACTIVITY_KEYWORDS,
  AMUSEMENT_KEYWORDS,
  AMUSEMENT_REGION_HINTS,
  ATTRACTION_KEYWORDS,
  CAFE_KEYWORDS,
  CAMPING_KEYWORDS,
  CHICKEN_PIZZA_KEYWORDS,
  CULTURE_KEYWORDS,
  FOOD_KEYWORDS,
  KARAOKE_KEYWORDS,
  NIGHTLIFE_KEYWORDS,
  WALK_KEYWORDS,
  PLACE_FAMILY_TO_ROLE,
  defaultRoleOrder,
  includesAny,
  requestedRolesFromCategories,
  resolvePlaceCountRange,
  type CourseRole
} from "../courseRole";
import type {
  CandidatePlace,
  RecommendationCourse,
  RecommendationCoursePlace,
  ScoredRecommendationPlace,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

const placeText = (place: CandidatePlace): string =>
  [
    place.title,
    place.category,
    place.placeFamily,
    place.placeType,
    place.placeSubtype,
    place.kakaoCategoryName,
    place.kakaoCategoryGroupName,
    place.region,
    place.address,
    place.sourceDataset,
    place.tags?.join(" "),
    JSON.stringify(place.metadata ?? {})
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const normalizePlaceTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");

const estimateCost = (place: CandidatePlace): number => {
  if (typeof place.estimatedCost === "number") {
    return place.estimatedCost;
  }

  const text = placeText(place);

  if (includesAny(text, ["무료", "free", "공원", "산책", "자연"])) {
    return 0;
  }

  if (includesAny(text, CAFE_KEYWORDS)) {
    return 9000;
  }

  if (includesAny(text, FOOD_KEYWORDS) || includesAny(text, CHICKEN_PIZZA_KEYWORDS)) {
    return 15000;
  }

  if (includesAny(text, CULTURE_KEYWORDS)) {
    return 12000;
  }

  if (includesAny(text, NIGHTLIFE_KEYWORDS)) {
    return 18000;
  }

  if (includesAny(text, KARAOKE_KEYWORDS)) {
    return 12000;
  }

  if (includesAny(text, ACTIVITY_KEYWORDS)) {
    return 18000;
  }

  if (includesAny(text, CAMPING_KEYWORDS)) {
    return 20000;
  }

  if (includesAny(text, AMUSEMENT_KEYWORDS)) {
    return 30000;
  }

  return 8000;
};

const roleMatches = (role: CourseRole, place: CandidatePlace): boolean => {
  if (place.placeFamily) {
    const mapped = PLACE_FAMILY_TO_ROLE[place.placeFamily.toLowerCase()];
    if (mapped !== undefined) {
      return mapped === role;
    }
  }

  const text = placeText(place);
  if (role === "nightlife") return includesAny(text, NIGHTLIFE_KEYWORDS);
  if (role === "karaoke") return includesAny(text, KARAOKE_KEYWORDS);
  if (role === "activity") return includesAny(text, ACTIVITY_KEYWORDS);
  if (role === "camping") return includesAny(text, CAMPING_KEYWORDS);
  if (role === "amusement") return includesAny(text, AMUSEMENT_KEYWORDS);
  if (role === "cafe") return includesAny(text, CAFE_KEYWORDS);
  if (role === "culture") return includesAny(text, CULTURE_KEYWORDS);
  if (role === "walk") return includesAny(text, WALK_KEYWORDS);
  if (role === "food") {
    return includesAny(text, FOOD_KEYWORDS) || includesAny(text, CHICKEN_PIZZA_KEYWORDS);
  }
  return includesAny(text, ATTRACTION_KEYWORDS);
};

const inferCourseRole = (place: CandidatePlace): CourseRole => {
  const roles: CourseRole[] = [
    "nightlife",
    "karaoke",
    "activity",
    "camping",
    "amusement",
    "cafe",
    "culture",
    "walk",
    "food",
    "attraction"
  ];
  return roles.find((role) => roleMatches(role, place)) ?? "attraction";
};

const hasCoordinate = (place: CandidatePlace): boolean =>
  isValidSeoulCoordinate(place.latitude, place.longitude);

const isMapVerified = (place: CandidatePlace): boolean => place.mapVerification?.verified === true;

const estimatedTimeByRole = (role: CourseRole, durationHours: number): number => {
  const compactDurations: Record<CourseRole, number> = {
    cafe: 45,
    culture: 55,
    walk: 40,
    food: 55,
    nightlife: 75,
    karaoke: 70,
    activity: 80,
    camping: 180,
    amusement: 180,
    attraction: 45
  };
  const defaultDurations: Record<CourseRole, number> = {
    cafe: 60,
    culture: 80,
    walk: 50,
    food: 70,
    nightlife: 90,
    karaoke: 80,
    activity: 90,
    camping: 210,
    amusement: 210,
    attraction: 60
  };

  return (durationHours <= 2 ? compactDurations : defaultDurations)[role];
};

const roleLabel = (role: CourseRole, fallback: string): string =>
  ({
    cafe: "카페",
    culture: "문화공간",
    walk: "산책",
    food: "음식점",
    nightlife: "술집",
    karaoke: "노래방",
    activity: "실내놀거리",
    camping: "캠핑장",
    amusement: "놀이시설",
    attraction: fallback
  })[role];

const resolveRoles = (state: SeoulMateGraphState): CourseRole[] => {
  const categories = state.parsedRequest?.preferredCategories ?? [];
  const mood = state.parsedRequest?.mood ?? [];
  const region = state.parsedRequest?.region ?? "";
  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const budget = state.parsedRequest?.budget;
  const roles: CourseRole[] = [];
  const roleCounts = new Map<CourseRole, number>();

  const pushRole = (nextRole: CourseRole, allowDuplicate = false): void => {
    const count = roleCounts.get(nextRole) ?? 0;
    if (count === 0 || (allowDuplicate && count < 2)) {
      roles.push(nextRole);
      roleCounts.set(nextRole, count + 1);
    }
  };

  for (const role of requestedRolesFromCategories(categories)) {
    pushRole(role);
  }

  if (
    mood.some((item) => item.includes("활기")) &&
    AMUSEMENT_REGION_HINTS.some((hint) => region.includes(hint)) &&
    durationHours >= 4 &&
    (budget === undefined || budget === 200001 || budget >= 30000)
  ) {
    pushRole("amusement");
  }

  const count = resolvePlaceCountRange(durationHours).max;
  const targetCount = Math.max(count, roles.length);
  while (roles.length < targetCount) {
    const previousLength = roles.length;
    for (const role of defaultRoleOrder(state.parsedRequest?.dateTime)) {
      pushRole(role, true);
      if (roles.length >= targetCount) {
        break;
      }
    }

    if (roles.length === previousLength) {
      break;
    }
  }

  return roles;
};

const estimateMoveTimeMinute = (
  previousPlace: CandidatePlace | undefined,
  nextPlace: CandidatePlace
): number => {
  if (!previousPlace || !hasCoordinate(previousPlace) || !hasCoordinate(nextPlace)) {
    return 0;
  }

  const distanceMeter = mapClient.calculateDistanceMeter(
    {
      latitude: previousPlace.latitude as number,
      longitude: previousPlace.longitude as number
    },
    {
      latitude: nextPlace.latitude as number,
      longitude: nextPlace.longitude as number
    }
  );

  return mapClient.estimateWalkingDurationMinute(distanceMeter);
};

const estimateProjectedDuration = (
  selected: Array<{ role: CourseRole; place: CandidatePlace }>,
  next: { role: CourseRole; place: CandidatePlace },
  durationHours: number
): number =>
  selected.reduce(
    (sum, item, index) =>
      sum +
      estimatedTimeByRole(item.role, durationHours) +
      estimateMoveTimeMinute(selected[index - 1]?.place, item.place),
    0
  ) +
  estimatedTimeByRole(next.role, durationHours) +
  estimateMoveTimeMinute(selected[selected.length - 1]?.place, next.place);

const sortPlacesByScore = (
  places: CandidatePlace[],
  scoredPlaces: ScoredRecommendationPlace[]
): CandidatePlace[] => {
  const scoreById = new Map(scoredPlaces.map((score) => [score.placeId, score.totalScore]));

  return [...places].sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0));
};

const calculateDistanceFromOrigin = (
  origin: { latitude: number; longitude: number } | undefined,
  place: CandidatePlace
): number | undefined => {
  if (!origin || !hasCoordinate(place)) {
    return undefined;
  }

  return mapClient.calculateDistanceMeter(origin, {
    latitude: place.latitude as number,
    longitude: place.longitude as number
  });
};

const movementPenalty = (distanceMeter?: number): number => {
  if (distanceMeter === undefined) {
    return 6;
  }

  if (distanceMeter <= 600) {
    return 0;
  }

  if (distanceMeter <= 1200) {
    return 3;
  }

  if (distanceMeter <= 2200) {
    return 8;
  }

  if (distanceMeter <= 3500) {
    return 14;
  }

  return 22;
};

const selectPlace = (
  role: CourseRole,
  sortedPlaces: CandidatePlace[],
  scoreById: Map<number, number>,
  usedPlaceIds: Set<number>,
  usedPlaceTitles: Set<string>,
  usedRoleCounts: Map<CourseRole, number>,
  remainingBudget?: number,
  previousPlace?: CandidatePlace,
  referenceCoordinate?: { latitude: number; longitude: number }
): CandidatePlace | undefined => {
  const available = sortedPlaces.filter(
    (place) =>
      !usedPlaceIds.has(place.id) &&
      !usedPlaceTitles.has(normalizePlaceTitle(place.title)) &&
      (usedRoleCounts.get(inferCourseRole(place)) ?? 0) < 2 &&
      (remainingBudget === undefined || estimateCost(place) <= remainingBudget)
  );
  const diverseAvailable = available.filter(
    (place) => (usedRoleCounts.get(inferCourseRole(place)) ?? 0) === 0
  );
  const roleMatchesPlaces = available.filter((place) => roleMatches(role, place));
  const diverseRoleMatches = roleMatchesPlaces.filter(
    (place) => (usedRoleCounts.get(inferCourseRole(place)) ?? 0) === 0
  );
  const rawPool = diverseRoleMatches.length
    ? diverseRoleMatches
    : roleMatchesPlaces.length
      ? roleMatchesPlaces
      : diverseAvailable.length
        ? diverseAvailable
        : available;
  const origin =
    previousPlace && hasCoordinate(previousPlace)
      ? {
          latitude: previousPlace.latitude as number,
          longitude: previousPlace.longitude as number
        }
      : referenceCoordinate;
  const pool = [...rawPool].sort((a, b) => {
    const distanceA = calculateDistanceFromOrigin(origin, a);
    const distanceB = calculateDistanceFromOrigin(origin, b);
    const effectiveScoreA = (scoreById.get(a.id) ?? 0) - movementPenalty(distanceA);
    const effectiveScoreB = (scoreById.get(b.id) ?? 0) - movementPenalty(distanceB);

    if (effectiveScoreB !== effectiveScoreA) {
      return effectiveScoreB - effectiveScoreA;
    }

    if (isMapVerified(a) !== isMapVerified(b)) {
      return Number(isMapVerified(b)) - Number(isMapVerified(a));
    }

    if (hasCoordinate(a) !== hasCoordinate(b)) {
      return Number(hasCoordinate(b)) - Number(hasCoordinate(a));
    }

    if ((distanceA ?? Number.POSITIVE_INFINITY) !== (distanceB ?? Number.POSITIVE_INFINITY)) {
      return (distanceA ?? Number.POSITIVE_INFINITY) - (distanceB ?? Number.POSITIVE_INFINITY);
    }

    return (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
  });

  return pool[0];
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
  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const scoreById = new Map(scoredPlaces.map((score) => [score.placeId, score.totalScore]));
  const referenceCoordinate = state.contextData?.referenceCoordinate
    ? {
        latitude: state.contextData.referenceCoordinate.latitude,
        longitude: state.contextData.referenceCoordinate.longitude
      }
    : undefined;
  const selected: Array<{ role: CourseRole; place: CandidatePlace }> = [];
  const usedPlaceIds = new Set<number>();
  const usedPlaceTitles = new Set<string>();
  const usedRoleCounts = new Map<CourseRole, number>();
  const placeCountRange = resolvePlaceCountRange(durationHours);
  const maxDurationMinute = durationHours > 12 ? Number.POSITIVE_INFINITY : durationHours * 60;
  let remainingBudget = state.parsedRequest?.budget;

  for (const role of resolveRoles(state)) {
    const place = selectPlace(
      role,
      sortedPlaces,
      scoreById,
      usedPlaceIds,
      usedPlaceTitles,
      usedRoleCounts,
      remainingBudget,
      selected[selected.length - 1]?.place,
      referenceCoordinate
    );
    if (!place) {
      continue;
    }

    const projectedDuration = estimateProjectedDuration(selected, { role, place }, durationHours);
    if (selected.length >= placeCountRange.min && projectedDuration > maxDurationMinute) {
      break;
    }

    selected.push({ role, place });
    usedPlaceIds.add(place.id);
    usedPlaceTitles.add(normalizePlaceTitle(place.title));
    const inferredRole = inferCourseRole(place);
    usedRoleCounts.set(inferredRole, (usedRoleCounts.get(inferredRole) ?? 0) + 1);

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
    estimatedTimeMinute: roleMatches(role, place)
      ? estimatedTimeByRole(role, durationHours)
      : estimatedTimeByRole("attraction", durationHours),
    estimatedCost: estimateCost(place),
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude
  }));

  const routePoints = coursePlaces
    .filter((place) => typeof place.latitude === "number" && typeof place.longitude === "number")
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
