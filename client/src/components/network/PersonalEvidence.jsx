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
    <section className="network-personal-evidence">
      <div className={`network-evidence-state network-evidence-${state}`}>
        <span className="network-evidence-dot" aria-hidden="true" />
        <span>{STATE_LABELS[state] || STATE_LABELS.unknown}</span>
      </div>

      {hasEvidence ? (
        <>
          <div className="network-evidence-metrics">
            <div>
              <span>Evidence</span>
              <strong>{evidence.evidenceScore.toFixed(2)}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{formatConfidence(evidence.confidence)}</strong>
            </div>
            <div>
              <span>Titles</span>
              <strong>{evidence.appearances}</strong>
            </div>
          </div>

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
