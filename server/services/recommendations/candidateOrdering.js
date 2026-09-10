import { createMediaKey } from "../../utils/mediaIdentity.js";

export function compareCandidatesByEvidence(a, b) {
  if (b.sourceEvidence !== a.sourceEvidence) {
    return b.sourceEvidence - a.sourceEvidence;
  }

  if (b.sourceCount !== a.sourceCount) {
    return b.sourceCount - a.sourceCount;
  }

  const aKey = createMediaKey(a.type, a.id);
  const bKey = createMediaKey(b.type, b.id);

  return aKey.localeCompare(bKey);
}
