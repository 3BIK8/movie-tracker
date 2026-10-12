import { Router } from "express";
import { readForYouFeed, recordFeedEvents, rescoreQueuedFeed } from "../services/forYou/feedService.js";
import { getCurrentUserId } from "../utils/currentUser.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const items = await readForYouFeed(getCurrentUserId(req), req.query.limit);
    res.json({ items });
  } catch (error) {
    console.error("For You feed read failed.", error);
    res.status(500).json({ message: "Unable to load the For You feed." });
  }
});

router.post("/events", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const result = await recordFeedEvents(userId, req.body?.events);
    await rescoreQueuedFeed(userId);
    res.status(202).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to record feed events." });
  }
});

export default router;
