import { END, START, StateGraph } from "@langchain/langgraph";

import { buildAlternativeCourseNode } from "./nodes/buildAlternativeCourse.node";
import { buildCourseNode } from "./nodes/buildCourse.node";
import { fetchCandidatePlacesNode } from "./nodes/fetchCandidatePlaces.node";
import { fetchContextDataNode } from "./nodes/fetchContextData.node";
import { formatRecommendationResultNode } from "./nodes/formatRecommendationResult.node";
import { generateAiExplanationNode } from "./nodes/generateAiExplanation.node";
import { generateRiskNoticeNode } from "./nodes/generateRiskNotice.node";
import { parseUserRequestNode } from "./nodes/parseUserRequest.node";
import { scorePlacesNode } from "./nodes/scorePlaces.node";
import { validateRecommendationNode } from "./nodes/validateRecommendation.node";
import { verifyCandidatePlacesNode } from "./nodes/verifyCandidatePlaces.node";
import {
  RecommendationStateAnnotation,
  type ParsedRecommendationRequest,
  type SeoulMateGraphState
} from "./recommendation.state";

const graph = new StateGraph(RecommendationStateAnnotation)
  .addNode("parseUserRequest", parseUserRequestNode)
  .addNode("fetchCandidatePlaces", fetchCandidatePlacesNode)
  .addNode("verifyCandidatePlaces", verifyCandidatePlacesNode)
  .addNode("fetchContextData", fetchContextDataNode)
  .addNode("scorePlaces", scorePlacesNode)
  .addNode("buildCourse", buildCourseNode)
  .addNode("validateRecommendation", validateRecommendationNode)
  .addNode("buildAlternativeCourse", buildAlternativeCourseNode)
  .addNode("validateRecommendationFinal", validateRecommendationNode)
  .addNode("generateAiExplanation", generateAiExplanationNode)
  .addNode("generateRiskNotice", generateRiskNoticeNode)
  .addNode("formatRecommendationResult", formatRecommendationResultNode)
  .addEdge(START, "parseUserRequest")
  .addEdge("parseUserRequest", "fetchCandidatePlaces")
  .addEdge("fetchCandidatePlaces", "verifyCandidatePlaces")
  .addEdge("verifyCandidatePlaces", "fetchContextData")
  .addEdge("fetchContextData", "scorePlaces")
  .addEdge("scorePlaces", "buildCourse")
  .addEdge("buildCourse", "validateRecommendation")
  .addEdge("validateRecommendation", "buildAlternativeCourse")
  .addEdge("buildAlternativeCourse", "validateRecommendationFinal")
  .addEdge("validateRecommendationFinal", "generateAiExplanation")
  .addEdge("generateAiExplanation", "generateRiskNotice")
  .addEdge("generateRiskNotice", "formatRecommendationResult")
  .addEdge("formatRecommendationResult", END)
  .compile();

export const runRecommendationGraph = async (
  input: string,
  parsedRequest?: ParsedRecommendationRequest
): Promise<SeoulMateGraphState> =>
  graph.invoke({
    rawInput: input,
    parsedRequest,
    warnings: [],
    errors: []
  });
