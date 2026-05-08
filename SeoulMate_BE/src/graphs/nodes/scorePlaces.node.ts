import { scoringService } from "../../services/scoring.service";
import type { SeoulMateGraphState, SeoulMateGraphUpdate } from "../recommendation.state";

export const scorePlacesNode = async (
  state: SeoulMateGraphState
): Promise<SeoulMateGraphUpdate> => ({
  scoredPlaces: scoringService.scorePlaces({
    request: state.parsedRequest,
    places: state.candidatePlaces ?? [],
    context: state.contextData
  })
});
