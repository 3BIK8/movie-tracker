import { verifyToken } from "@clerk/backend";
import { db } from "../db/database.js";

const LEGACY_USER_ID = 1;

function getOrCreateLocalUserId(clerkUserId) {
  const existing = db
    .prepare("SELECT id FROM users WHERE clerk_user_id = ?")
    .get(clerkUserId);

  if (existing) {
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO users (clerk_user_id, created_at)
    VALUES (?, ?)
  `).run(clerkUserId, new Date().toISOString());

  return Number(result.lastInsertRowid);
}

export async function requireAuthentication(req, res, next) {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    req.userId = LEGACY_USER_ID;
    next();
    return;
  }

  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    res.status(401).json({ message: "Authentication is required." });
    return;
  }

  try {
    const claims = await verifyToken(token, { secretKey });
    if (!claims.sub) {
      res.status(401).json({ message: "Authentication token has no user identity." });
      return;
    }

    req.userId = getOrCreateLocalUserId(claims.sub);
    next();
  } catch (error) {
    console.error("Clerk token verification failed.", error);
    res.status(401).json({ message: "Authentication token is invalid or expired." });
  }
}
