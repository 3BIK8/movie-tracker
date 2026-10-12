export function getCurrentUserId(req) {
  if (!Number.isInteger(req?.userId) || req.userId < 1) {
    throw new Error("Authenticated user context is required.");
  }

  return req.userId;
}
