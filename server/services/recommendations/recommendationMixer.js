const DEFAULT_EXPLORATION_RATIO = 0.2;

export function mixRecommendationPools(
  exploitation,
  exploration,
  limit,
  explorationRatio = DEFAULT_EXPLORATION_RATIO,
) {
  if (!Array.isArray(exploitation) || !Array.isArray(exploration)) {
    throw new TypeError("Recommendation pools must be arrays.");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Recommendation mix limit must be a positive integer.");
  }

  if (explorationRatio < 0 || explorationRatio > 1) {
    throw new RangeError("Exploration ratio must be between 0 and 1.");
  }

  const explorationLimit = Math.floor(limit * explorationRatio);
  const selectedExploitation = exploitation.slice(0, limit - explorationLimit);
  const selectedExploration = exploration.slice(0, explorationLimit);

  const output = [];
  let exploitationIndex = 0;
  let explorationIndex = 0;

  while (
    output.length < limit &&
    exploitationIndex < selectedExploitation.length
  ) {
    for (let count = 0; count < 4 && output.length < limit; count += 1) {
      if (exploitationIndex >= selectedExploitation.length) break;
      output.push(selectedExploitation[exploitationIndex]);
      exploitationIndex += 1;
    }

    if (
      explorationIndex < selectedExploration.length &&
      output.length < limit
    ) {
      output.push(selectedExploration[explorationIndex]);
      explorationIndex += 1;
    }
  }

  return output;
}

export { DEFAULT_EXPLORATION_RATIO };
