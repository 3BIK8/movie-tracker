import { Router } from "express";
import {
  getRejectedMediaKeys,
  listRejections,
  recordInteractionEvents,
} from "../repositories/feedbackRepository.js";
import { getCurrentUserId } from "../utils/currentUser.js";

const router = Router();

router.get("/rejections", (req, res) => {
  res.json({ rejections: listRejections(getCurrentUserId(req)) });
});

router.post("/events", (req, res) => {
  try {
    const result = recordInteractionEvents(
      getCurrentUserId(req),
      req.body?.events,
    );
    res.status(202).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to record feedback." });
  }
});

router.post("/rejections/:type/:id/undo", (req, res) => {
  try {
    const result = recordInteractionEvents(getCurrentUserId(req), [{
      mediaType: req.params.type,
      tmdbId: req.params.id,
      eventType: "undo_reject",
      surface: "feedback",
      clientEventId: String(req.body?.clientEventId || `undo:${req.params.type}:${req.params.id}:${Date.now()}`),
    }]);
    res.status(202).json({
      ...result,
      rejections: [...getRejectedMediaKeys(getCurrentUserId(req))],
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to restore rejection." });
  }
});

export default router;
