import type { SeoulMateGraphState, SeoulMateGraphUpdate } from "../recommendation.state";

export const formatRecommendationResultNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => ({
  finalRecommendation: {
    request: {
      rawInput: state.rawInput,
      parsed: state.parsedRequest
    },
    course: state.course,
    explanation: state.aiExplanation,
    context: state.contextData,
    validation: state.validation,
    riskNotices: state.riskNotices ?? [],
    candidateCount: state.candidatePlaces?.length ?? 0
  }
});
