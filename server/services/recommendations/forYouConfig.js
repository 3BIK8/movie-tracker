export const FOR_YOU_STATUS_WEIGHTS = Object.freeze({
  watched: 1.0,
  to_watch: 0.2,
  not_sure: 0,
});

export const FOR_YOU_RATING_WEIGHTS = Object.freeze({
  S: 1.0,
  A: 0.6,
  B: 0.3,
  C: 0,
  D: -0.6,
});

export const FOR_YOU_EVENT_WEIGHTS = Object.freeze({
  add: 0.2,
  open: 0.1,
  favorite: 1.5,
  skip: -0.3,
  reject: -1.0,
  undo_reject: 0,
});

export const FOR_YOU_VECTOR_CONFIG = Object.freeze({
  halfLifeDays: 180,
  sessionEta: 0.25,
  sessionResetMinutes: 30,
  statusWeights: FOR_YOU_STATUS_WEIGHTS,
  ratingWeights: FOR_YOU_RATING_WEIGHTS,
  eventWeights: FOR_YOU_EVENT_WEIGHTS,
});
