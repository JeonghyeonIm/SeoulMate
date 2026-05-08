import { mapClient } from "../../clients/map.client";
import type {
  CandidatePlace,
  RecommendationCourse,
  RecommendationCoursePlace,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const placeText = (place?: CandidatePlace): string =>
  place
    ? [
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
        .toLowerCase()
    : "";

const isOutdoor = (place?: CandidatePlace): boolean =>
  includesAny(placeText(place), ["공원", "산책", "자연", "야외", "숲", "한강"]);

const isIndoorAlternative = (place?: CandidatePlace): boolean =>
  includesAny(placeText(place), ["카페", "전시", "문화", "공간", "식당", "음식", "박물관"]);

const estimateCost = (place: CandidatePlace): number => {
  if (typeof place.estimatedCost === "number") {
    return place.estimatedCost;
  }

  const text = placeText(place);
  if (includesAny(text, ["무료", "공원", "산책"])) return 0;
  if (includesAny(text, ["카페", "커피", "디저트"])) return 9000;
  if (includesAny(text, ["음식", "식당", "맛집"])) return 15000;
  if (includesAny(text, ["전시", "문화", "공연", "박물관"])) return 12000;
  return 8000;
};

const routeCourse = async (
  coursePlaces: RecommendationCoursePlace[]
): Promise<{
  coursePlaces: RecommendationCoursePlace[];
  route: NonNullable<SeoulMateGraphState["contextData"]>["route"];
}> => {
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

  return {
    coursePlaces: coursePlaces.map((place, index) => {
      const leg = routeSummary.legs[index - 1];
      if (!leg) {
        return place;
      }

      return {
        ...place,
        moveTimeMinute: leg.durationMinute,
        moveDistanceMeter: leg.distanceMeter,
        routeProvider: leg.provider,
        routeFallback: leg.isFallback
      };
    }),
    route: {
      totalDistanceMeter: routeSummary.totalDistanceMeter,
      totalDurationMinute: routeSummary.totalDurationMinute,
      provider: routeSummary.provider,
      isFallback: routeSummary.isFallback
    }
  };
};

const shouldBuildAlternative = (state: SeoulMateGraphState): boolean => {
  const rainProbability = state.contextData?.weather?.rainProbability ?? 0;
  const skyStatus = state.contextData?.weather?.skyStatus ?? "";
  const crowdLevel = state.contextData?.cityData?.crowdLevel ?? "";

  return (
    rainProbability >= 60 ||
    includesAny(skyStatus, ["비", "눈", "rain"]) ||
    includesAny(crowdLevel, ["붐", "혼잡"]) ||
    Boolean(state.validation?.errors.length)
  );
};

export const buildAlternativeCourseNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  if (!state.course || !shouldBuildAlternative(state)) {
    return {};
  }

  const candidateById = new Map((state.candidatePlaces ?? []).map((place) => [place.id, place]));
  const usedPlaceIds = new Set(state.course.places.map((place) => place.placeId));
  let replaced = false;

  const alternativePlaces = state.course.places.map((coursePlace) => {
    const original = candidateById.get(coursePlace.placeId);
    if (!isOutdoor(original)) {
      return coursePlace;
    }

    const replacement = (state.candidatePlaces ?? []).find(
      (place) => !usedPlaceIds.has(place.id) && isIndoorAlternative(place)
    );

    if (!replacement) {
      return coursePlace;
    }

    usedPlaceIds.add(replacement.id);
    replaced = true;

    return {
      ...coursePlace,
      placeId: replacement.id,
      title: replacement.title,
      category: replacement.category,
      estimatedCost: estimateCost(replacement),
      address: replacement.address,
      latitude: replacement.latitude,
      longitude: replacement.longitude
    };
  });

  if (!replaced) {
    return {};
  }

  const routed = await routeCourse(alternativePlaces);
  const course: RecommendationCourse = {
    ...state.course,
    title: `${state.course.title} 대체 코스`,
    places: routed.coursePlaces,
    estimatedBudget: routed.coursePlaces.reduce((sum, place) => sum + (place.estimatedCost ?? 0), 0)
  };

  return {
    course,
    contextData: {
      ...state.contextData,
      route: routed.route
    }
  };
};
