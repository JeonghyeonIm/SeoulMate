import { mapClient } from "../../clients/map.client";
import type {
  CandidatePlace,
  RecommendationCourse,
  RecommendationCoursePlace,
  ScoredRecommendationPlace,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

type CourseRole =
  | "cafe"
  | "culture"
  | "walk"
  | "food"
  | "nightlife"
  | "karaoke"
  | "activity"
  | "camping"
  | "amusement"
  | "attraction";

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const NIGHTLIFE_KEYWORDS = [
  "\uc220\uc9d1",
  "2\ucc28",
  "\ud638\ud504\uc9d1",
  "\uc8fc\uc810",
  "\ud638\ud504",
  "\ud3ec\ucc28",
  "\ub9e5\uc8fc",
  "\uc640\uc778",
  "\uce75\ud14c\uc77c",
  "\uc774\uc790\uce74\uc57c",
  "\ud38d",
  "\ud558\uc774\ubcfc",
  "\ub9c9\uac78\ub9ac",
  "\ub9c9\uac78\ub9ac\uc9d1",
  "\uc804\ud1b5\uc8fc\uc810",
  "\ub8e8\ud504\ud0d1\ubc14",
  "\ud63c\uc220",
  "\uac10\uc131\uc8fc\uc810",
  "\ud074\ub7fd",
  "\ub098\uc774\ud2b8",
  "\uc815\uc885/\ub300\ud3ec\uc9d1/\uc18c\uc8fc\ubc29",
  "\ud638\ud504/\ud1b5\ub2ed",
  "club",
  "bar",
  "pub"
];

const CHICKEN_PIZZA_KEYWORDS = [
  "\uce58\ud0a8",
  "\ud1b5\ub2ed",
  "\ud53c\uc790",
  "\ud53c\uc790\uc9d1",
  "chicken",
  "pizza"
];

const KARAOKE_KEYWORDS = [
  "\ub178\ub798\ubc29",
  "\ub178\ub798\uc5f0\uc2b5\uc7a5",
  "\ucf54\uc778\ub178\ub798\ubc29",
  "\ub3d9\uc804\ub178\ub798\uc5f0\uc2b5\uc7a5",
  "karaoke"
];

const ACTIVITY_KEYWORDS = [
  "\ubc29\ud0c8\ucd9c",
  "\ubcf4\ub4dc\uac8c\uc784",
  "\ubcf4\ub4dc\uac8c\uc784\uce74\ud398",
  "\ucc1c\uc9c8\ubc29",
  "\ubcfc\ub9c1",
  "\ub2f9\uad6c",
  "\ub2f9\uad6c\uc7a5",
  "\ub9cc\ud654\uce74\ud398",
  "\uacf5\ubc29",
  "\uc6d0\ub370\uc774\ud074\ub798\uc2a4",
  "\ud5a5\uc218",
  "\ub3c4\uc790\uae30",
  "\ud074\ub77c\uc774\ubc0d",
  "vr",
  "\uc544\ucf00\uc774\ub4dc",
  "\uc2e4\ub0b4\ub180\uac70\ub9ac",
  "\uc561\ud2f0\ube44\ud2f0",
  "\uccb4\ud5d8",
  "\ubcf5\ud569\uc720\ud1b5\uac8c\uc784\uc81c\uacf5\uc5c5",
  "\uccb4\ub825\ub2e8\ub828\uc7a5\uc5c5"
];

const CAMPING_KEYWORDS = [
  "\ucea0\ud551",
  "\ucea0\ud551\uc7a5",
  "\uc57c\uc601",
  "\uae00\ub7a8\ud551",
  "\ubc14\ubca0\ud050",
  "\ud53c\ud06c\ub2c9\uc7a5",
  "\ud53c\ud06c\ub2c9"
];

const AMUSEMENT_KEYWORDS = [
  "\ub180\uc774\uc2dc\uc124",
  "\ub180\uc774\uacf5\uc6d0",
  "\ud14c\ub9c8\ud30c\ud06c",
  "\uc5b4\ud2b8\ub799\uc158",
  "\uc6cc\ud130\ud30c\ud06c",
  "\uc5b4\ub4dc\ubca4\ucc98",
  "\ub86f\ub370\uc6d4\ub4dc",
  "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
  "\ud5c8\uac00\ud14c\ub9c8\ud30c\ud06c\uc5c5"
];

const AMUSEMENT_REGION_HINTS = [
  "\uc7a0\uc2e4",
  "\uc1a1\ud30c",
  "\ub86f\ub370\uc6d4\ub4dc",
  "\uc5b4\ub9b0\uc774\ub300\uacf5\uc6d0",
  "\ub2a5\ub3d9",
  "\uad11\uc9c4",
  "\ubb38\uc815",
  "\ud30c\ud06c\ud558\ube44\uc624",
  "\uc6cc\ud130\ud0b9\ub364"
];

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

  if (includesAny(text, ["카페", "커피", "디저트", "베이커리"])) {
    return 9000;
  }

  if (includesAny(text, ["음식", "식당", "맛집", "restaurant"])) {
    return 15000;
  }

  if (includesAny(text, CHICKEN_PIZZA_KEYWORDS)) {
    return 15000;
  }

  if (includesAny(text, ["문화", "전시", "공연", "박물관"])) {
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
  const text = placeText(place);

  if (role === "nightlife") {
    return includesAny(text, NIGHTLIFE_KEYWORDS);
  }

  if (role === "karaoke") {
    return includesAny(text, KARAOKE_KEYWORDS);
  }

  if (role === "activity") {
    return includesAny(text, ACTIVITY_KEYWORDS);
  }

  if (role === "camping") {
    return includesAny(text, CAMPING_KEYWORDS);
  }

  if (role === "amusement") {
    return includesAny(text, AMUSEMENT_KEYWORDS);
  }

  if (role === "cafe") {
    return includesAny(text, ["카페", "커피", "디저트", "베이커리", "휴게"]);
  }

  if (role === "culture") {
    return includesAny(text, ["문화", "전시", "공연", "박물관", "공간", "attraction"]);
  }

  if (role === "walk") {
    return includesAny(text, ["공원", "산책", "자연", "숲", "한강", "야외"]);
  }

  if (role === "food" && includesAny(text, CHICKEN_PIZZA_KEYWORDS)) {
    return true;
  }

  if (role === "food") {
    return includesAny(text, ["음식", "식당", "맛집", "restaurant", "인허가"]);
  }

  return includesAny(text, ["관광", "명소", "야경", "attraction"]);
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
  typeof place.latitude === "number" && typeof place.longitude === "number";

const isMapVerified = (place: CandidatePlace): boolean => place.mapVerification?.verified === true;

const resolvePlaceCountRange = (durationHours: number): { min: number; max: number } => {
  if (durationHours <= 2) return { min: 1, max: 2 };
  if (durationHours <= 4) return { min: 2, max: 3 };
  if (durationHours <= 6) return { min: 3, max: 4 };
  if (durationHours <= 8) return { min: 4, max: 5 };
  if (durationHours <= 10) return { min: 5, max: 6 };
  if (durationHours <= 12) return { min: 6, max: 7 };
  return { min: 7, max: 8 };
};

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
    nightlife: "\uc220\uc9d1",
    karaoke: "\ub178\ub798\ubc29",
    activity: "\uc2e4\ub0b4\ub180\uac70\ub9ac",
    camping: "\ucea0\ud551\uc7a5",
    amusement: "\ub180\uc774\uc2dc\uc124",
    attraction: fallback
  })[role];

const resolveRoles = (state: SeoulMateGraphState): CourseRole[] => {
  const categories = state.parsedRequest?.preferredCategories ?? [];
  const mood = state.parsedRequest?.mood ?? [];
  const region = state.parsedRequest?.region ?? "";
  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const budget = state.parsedRequest?.budget;
  const roles: CourseRole[] = [];
  const pushRole = (...nextRoles: CourseRole[]): void => {
    for (const nextRole of nextRoles) {
      if (!roles.includes(nextRole)) {
        roles.push(nextRole);
      }
    }
  };

  for (const category of categories) {
    if (includesAny(category, NIGHTLIFE_KEYWORDS)) pushRole("nightlife");
    else if (includesAny(category, KARAOKE_KEYWORDS)) pushRole("karaoke");
    else if (includesAny(category, ACTIVITY_KEYWORDS)) pushRole("activity");
    else if (includesAny(category, CAMPING_KEYWORDS)) pushRole("camping");
    else if (includesAny(category, AMUSEMENT_KEYWORDS)) pushRole("amusement");
    else if (includesAny(category, ["카페", "커피"])) pushRole("cafe");
    else if (includesAny(category, ["전시", "문화", "공연"])) pushRole("culture");
    else if (includesAny(category, ["실내"])) pushRole("cafe", "culture");
    else if (includesAny(category, ["산책", "공원", "자연"])) pushRole("walk");
    else if (includesAny(category, ["식사", "음식", "맛집"])) pushRole("food");
    else pushRole("attraction");
  }

  if (
    mood.some((item) => item.includes("\ud65c\uae30")) &&
    AMUSEMENT_REGION_HINTS.some((hint) => region.includes(hint)) &&
    durationHours >= 4 &&
    (budget === undefined || budget === 200001 || budget >= 30000)
  ) {
    pushRole("amusement");
  }

  const defaults: CourseRole[] = [
    "cafe",
    "culture",
    "walk",
    "food",
    "attraction",
    "cafe",
    "culture",
    "food"
  ];
  for (const role of defaults) {
    roles.push(role);
  }

  const count = resolvePlaceCountRange(durationHours).max;

  return roles.slice(0, count);
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

const selectPlace = (
  role: CourseRole,
  sortedPlaces: CandidatePlace[],
  usedPlaceIds: Set<number>,
  usedPlaceTitles: Set<string>,
  usedRoles: Set<CourseRole>,
  remainingBudget?: number,
  previousPlace?: CandidatePlace
): CandidatePlace | undefined => {
  const available = sortedPlaces.filter(
    (place) => !usedPlaceIds.has(place.id) && !usedPlaceTitles.has(normalizePlaceTitle(place.title))
  );
  const diverseAvailable = available.filter((place) => !usedRoles.has(inferCourseRole(place)));
  const roleMatchesPlaces = available.filter((place) => roleMatches(role, place));
  const diverseRoleMatches = roleMatchesPlaces.filter(
    (place) => !usedRoles.has(inferCourseRole(place))
  );
  const rawPool = diverseRoleMatches.length
    ? diverseRoleMatches
    : roleMatchesPlaces.length
      ? roleMatchesPlaces
      : diverseAvailable.length
        ? diverseAvailable
        : available;
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
        hasCoordinate(place) &&
        (remainingBudget === undefined || estimateCost(place) <= remainingBudget)
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
  const durationHours = state.parsedRequest?.durationHours ?? 3;
  const scoreById = new Map(scoredPlaces.map((score) => [score.placeId, score.totalScore]));
  const selected: Array<{ role: CourseRole; place: CandidatePlace }> = [];
  const usedPlaceIds = new Set<number>();
  const usedPlaceTitles = new Set<string>();
  const usedRoles = new Set<CourseRole>();
  const placeCountRange = resolvePlaceCountRange(durationHours);
  const maxDurationMinute = durationHours > 12 ? Number.POSITIVE_INFINITY : durationHours * 60;
  let remainingBudget = state.parsedRequest?.budget;

  for (const role of resolveRoles(state)) {
    const place = selectPlace(
      role,
      sortedPlaces,
      usedPlaceIds,
      usedPlaceTitles,
      usedRoles,
      remainingBudget,
      selected[selected.length - 1]?.place
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
    usedRoles.add(inferCourseRole(place));

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
