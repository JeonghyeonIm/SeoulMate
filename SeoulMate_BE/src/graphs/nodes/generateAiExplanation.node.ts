import { openaiClient } from "../../clients/openai.client";
import type {
  AiExplanation,
  SeoulMateGraphState,
  SeoulMateGraphUpdate
} from "../recommendation.state";

type AiExplanationResponse = {
  summary: string;
  reason: string;
  riskNotice: string;
  alternativeSuggestion: string;
};

const explanationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    reason: { type: "string" },
    riskNotice: { type: "string" },
    alternativeSuggestion: { type: "string" }
  },
  required: ["summary", "reason", "riskNotice", "alternativeSuggestion"]
};

const explanationInstructions = `서울 데이트 코스 추천 결과를 한국어로 설명하세요.
- 내부적으로만 코스가 조건에 맞는지 점검하고, 추론 과정은 출력하지 마세요.
- 제공된 course 안의 장소만 언급하고, AI가 임의 장소를 추가하지 마세요.
- 카페만 반복하거나 전시만 반복하는 느낌이 나지 않도록, 카페/문화/산책/식사 등 서로 다른 역할의 흐름을 강조하세요.
- 장소 순서와 이동 동선을 반드시 함께 고려하세요. 이동 시간이 짧거나 같은 생활권 안에서 자연스럽게 이어지는 이유를 설명하고, 동선이 긴 경우에는 부담 또는 대체 필요성을 알려주세요.
- 첫 만남 적합도, 날씨/혼잡도 반영, 예산 적합성, 대체 안내를 짧고 자연스럽게 포함하세요.
- summary와 reason은 사용자가 바로 이해할 수 있게 구체적으로 쓰되 과장하지 마세요.

예시 1
입력 코스: 카페 -> 문화공간 -> 산책, 각 이동 10분 이내
좋은 설명: "가벼운 대화로 시작한 뒤 가까운 전시와 짧은 산책으로 이어져 이동 부담이 낮고 첫 만남에도 흐름이 자연스럽습니다."
나쁜 설명: "카페를 여러 곳 돌며 분위기를 즐길 수 있습니다."

예시 2
입력 코스: 카페 -> 실내 전시 -> 음식점, 비 예보 있음, 이동 시간이 짧음
좋은 설명: "비 예보를 고려해 야외 비중을 줄이고, 가까운 실내 장소 위주로 이어져 날씨와 이동 피로 부담을 함께 낮춘 코스입니다."
나쁜 설명: "날씨와 상관없이 야외 산책을 길게 추천합니다."`;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const compact = (value: string): string | undefined => {
  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const fallbackExplanation = (state: SeoulMateGraphState): AiExplanation => {
  const region = state.parsedRequest?.region ?? "서울";
  const budget = state.parsedRequest?.budget;
  const crowdLevel = state.contextData?.cityData?.crowdLevel;
  const weather = state.contextData?.weather;
  const estimatedBudget = state.course?.estimatedBudget ?? 0;
  const courseNames =
    state.course?.places.map((place) => place.title).join(" → ") || "추천 후보 없음";

  return {
    summary: `${region} 조건에 맞춰 ${courseNames} 순서의 코스를 구성했습니다.`,
    reason: `공공데이터 후보 중 지역, 예산, 분위기, 이동 부담을 함께 반영해 점수가 높은 장소를 조합했습니다.${
      budget !== undefined
        ? ` 예상 비용은 약 ${estimatedBudget.toLocaleString("ko-KR")}원으로 요청 예산 ${
            budget === 200001 ? "200,000원 초과" : `${budget.toLocaleString("ko-KR")}원 이하`
          }를 기준으로 확인했습니다.`
        : ""
    }`,
    riskNotice: [
      crowdLevel ? `현재 혼잡도 정보: ${crowdLevel}` : "",
      weather?.skyStatus ? `날씨 반영: ${weather.skyStatus}` : "",
      weather?.weatherAlert ?? ""
    ]
      .filter(Boolean)
      .join(" / "),
    alternativeSuggestion:
      weather?.rainProbability && weather.rainProbability >= 60
        ? "비 예보가 있어 야외 산책 비중이 큰 장소는 실내 문화공간이나 카페로 바꾸는 것을 권장합니다."
        : "혼잡도가 높게 나오면 같은 지역의 실내 문화공간 또는 카페 중심 코스로 조정할 수 있습니다."
  };
};

export const generateAiExplanationNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => {
  try {
    const response = await openaiClient.createJsonResponse<AiExplanationResponse>({
      schemaName: "seoulmate_ai_explanation",
      schema: explanationSchema,
      instructions: explanationInstructions,
      input: JSON.stringify({
        request: state.parsedRequest,
        course: state.course,
        context: state.contextData,
        scoredPlaces: state.scoredPlaces?.slice(0, 8)
      }),
      maxOutputTokens: 900
    });

    return {
      aiExplanation: {
        summary: response.summary,
        reason: response.reason,
        riskNotice: compact(response.riskNotice),
        alternativeSuggestion: compact(response.alternativeSuggestion)
      }
    };
  } catch (error) {
    return {
      aiExplanation: fallbackExplanation(state),
      errors: [`generateAiExplanation fallback used: ${getErrorMessage(error)}`]
    };
  }
};
