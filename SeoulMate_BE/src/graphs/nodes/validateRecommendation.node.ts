import type {
  CandidatePlace,
  RecommendationValidation,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

const placeText = (place?: CandidatePlace): string =>
  place
    ? [
        place.title,
        place.category,
        place.region,
        place.address,
        place.sourceDataset,
        JSON.stringify(place.metadata ?? {})
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    : "";

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const hasOperatingHour = (place?: CandidatePlace): boolean => {
  const metadata = place?.metadata ?? {};
  return Boolean(
    metadata.openHour ??
    metadata.operatingTime ??
    metadata.useTime ??
    metadata.businessDays ??
    metadata.displayDate
  );
};

const isOutdoor = (place?: CandidatePlace): boolean =>
  includesAny(placeText(place), ["공원", "산책", "자연", "야외", "숲", "한강"]);

export const validateRecommendationNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const course = state.course;
  const candidateById = new Map((state.candidatePlaces ?? []).map((place) => [place.id, place]));

  const minimumPlaceCount = (state.parsedRequest?.durationHours ?? 3) <= 2 ? 1 : 2;
  if (!course || course.places.length < minimumPlaceCount) {
    errors.push("추천 장소 개수가 부족합니다.");
  }

  if (
    state.parsedRequest?.budget !== undefined &&
    course &&
    course.estimatedBudget > state.parsedRequest.budget
  ) {
    errors.push("예상 비용이 요청 예산을 초과했습니다.");
  }

  if (state.parsedRequest?.region && course?.places.length) {
    const region = state.parsedRequest.region.toLowerCase();
    const matched = course.places.some((coursePlace) =>
      placeText(candidateById.get(coursePlace.placeId)).includes(region)
    );

    if (!matched) {
      errors.push("추천 코스가 요청 지역 조건과 충분히 맞지 않습니다.");
    }
  }

  const missingOperatingHours =
    course?.places.filter(
      (coursePlace) => !hasOperatingHour(candidateById.get(coursePlace.placeId))
    ) ?? [];

  if (missingOperatingHours.length) {
    warnings.push("일부 장소의 운영시간 데이터가 없어 방문 전 확인이 필요합니다.");
  }

  const moveTimeTooLong = course?.places.some((place) => (place.moveTimeMinute ?? 0) >= 45);
  if (moveTimeTooLong) {
    warnings.push("장소 간 이동 시간이 45분 이상인 구간이 있어 피로도가 높을 수 있습니다.");
  }

  const rainProbability = state.contextData?.weather?.rainProbability ?? 0;
  const skyStatus = state.contextData?.weather?.skyStatus ?? "";
  const rainy = rainProbability >= 60 || includesAny(skyStatus, ["비", "눈", "rain"]);

  if (
    rainy &&
    course?.places.some((coursePlace) => isOutdoor(candidateById.get(coursePlace.placeId)))
  ) {
    warnings.push("비 또는 눈 가능성이 있어 야외 코스는 실내 대체 장소를 준비하는 것이 좋습니다.");
  }

  if (state.contextData?.weather?.source === "unavailable") {
    warnings.push(
      "요청 날짜가 기상청 예보 범위를 벗어나 날씨를 점수에 충분히 반영하지 못했습니다."
    );
  }

  const validation: RecommendationValidation = {
    isValid: errors.length === 0,
    errors,
    warnings
  };

  return {
    validation
  };
};
