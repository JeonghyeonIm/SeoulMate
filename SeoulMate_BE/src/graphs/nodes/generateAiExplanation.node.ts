import { openaiClient } from "../../clients/openai.client";
import type { AiExplanation, SeoulMateGraphState, SeoulMateGraphUpdate } from "../recommendation.state";

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
  const courseNames = state.course?.places.map((place) => place.title).join(" → ") || "추천 후보 없음";

  return {
    summary: `${region} 조건에 맞춰 ${courseNames} 순서의 코스를 구성했습니다.`,
    reason: `공공데이터 후보 중 지역, 예산, 분위기, 이동 부담을 함께 반영해 점수가 높은 장소를 조합했습니다.${
      budget ? ` 예상 비용은 약 ${estimatedBudget.toLocaleString("ko-KR")}원으로 요청 예산 ${budget.toLocaleString("ko-KR")}원을 기준으로 확인했습니다.` : ""
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
      instructions:
        "서울 데이트 코스 추천 결과를 한국어로 설명하세요. 제공된 course 안의 장소만 언급하고, AI가 임의 장소를 추가하지 마세요. 첫 만남 적합도, 날씨/혼잡도 반영, 예산 적합성, 대체 안내를 짧고 자연스럽게 포함하세요.",
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
