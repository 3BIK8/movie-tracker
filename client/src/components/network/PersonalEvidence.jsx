const STATE_LABELS = {
  positive: "Positive taste signal",
  negative: "Negative taste signal",
  neutral: "Neutral taste signal",
  unknown: "Not enough evidence",
};

function formatConfidence(value) {
  return `${Math.round(value * 100)}%`;
}

function PersonalEvidence({ evidence }) {
  if (!evidence) {
    return null;
  }

  const state = evidence.state || "unknown";
  const hasEvidence = state !== "unknown";

  return (
    <section className="network-details-section">
      <h3>Personal significance</h3>

      <p>
        <strong>{STATE_LABELS[state] || STATE_LABELS.unknown}</strong>
      </p>

      {hasEvidence ? (
        <>
          <p>
            Evidence: {evidence.evidenceScore.toFixed(2)} · Confidence: {formatConfidence(evidence.confidence)} · Rated titles: {evidence.appearances}
          </p>
          <p>
            This connection is supported by {evidence.appearances} rated {evidence.appearances === 1 ? "title" : "titles"} in your history.
          </p>
        </>
      ) : (
        <p>
          The connection exists in your history, but your rated evidence is not strong enough to classify it as a preference.
        </p>
      )}
    </section>
  );
}

export default PersonalEvidence;
