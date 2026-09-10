const MIN_EXPLORATION_RATIO = 0.1;
const MAX_EXPLORATION_RATIO = 0.3;

/**
 * Convert profile certainty into an exploration budget.
 * Weak profiles explore more; mature profiles exploit more.
 */
export function calculateExplorationRatio(profileStrength) {
  const score = Number(profileStrength?.score);

  if (!Number.isFinite(score)) {
    return MAX_EXPLORATION_RATIO;
  }

  const certainty = Math.min(1, Math.max(0, score));
  const ratio = MAX_EXPLORATION_RATIO -
    certainty * (MAX_EXPLORATION_RATIO - MIN_EXPLORATION_RATIO);

  return Math.min(
    MAX_EXPLORATION_RATIO,
    Math.max(MIN_EXPLORATION_RATIO, ratio),
  );
}

export {
  MIN_EXPLORATION_RATIO,
  MAX_EXPLORATION_RATIO,
};
