import type { SeoulMateGraphState, SeoulMateGraphUpdate } from "../recommendation.state";

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

export const generateRiskNoticeNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  const notices: string[] = [];
  const totalMoveTime = state.contextData?.route?.totalDurationMinute ?? 0;
  const crowdLevel = state.contextData?.cityData?.crowdLevel ?? "";
  const rainProbability = state.contextData?.weather?.rainProbability ?? 0;
  const skyStatus = state.contextData?.weather?.skyStatus ?? "";

  if (totalMoveTime >= 45) {
    notices.push("총 이동 시간이 45분 이상이라 첫 만남에는 다소 피로할 수 있습니다.");
  }

  if (includesAny(crowdLevel, ["붐", "혼잡"])) {
    notices.push("현재 주변 혼잡도가 높아 대기 시간이나 이동 불편이 생길 수 있습니다.");
  }

  if (rainProbability >= 60 || includesAny(skyStatus, ["비", "눈", "rain"])) {
    notices.push("비 또는 눈 가능성이 있어 야외 코스는 실내 대체 장소를 준비하는 것이 좋습니다.");
  }

  if (
    state.parsedRequest?.budget !== undefined &&
    state.course &&
    state.course.estimatedBudget > state.parsedRequest.budget
  ) {
    notices.push("예상 비용이 입력한 예산을 넘을 수 있어 일부 장소 변경을 권장합니다.");
  }

  for (const warning of state.validation?.warnings ?? []) {
    if (!notices.includes(warning)) {
      notices.push(warning);
    }
  }

  return {
    riskNotices: notices
  };
};
