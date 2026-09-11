import { Router } from "express";
import {
  deleteWatchHistoryItem,
  getWatchHistory,
  getWatchHistoryCount,
  migrateLegacyWatchHistory,
  upsertWatchHistoryItem,
} from "../repositories/watchHistoryRepository.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    history: getWatchHistory(),
    count: getWatchHistoryCount(),
    source: "database",
  });
});

router.put("/item", (req, res) => {
  try {
    const item = upsertWatchHistoryItem(req.body?.item);

    res.status(200).json({
      item,
      source: "database",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Unable to persist watch history item.",
    });
  }
});

router.delete("/item/:type/:id", (req, res) => {
  try {
    deleteWatchHistoryItem(req.params.type, req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      message: error.message || "Unable to delete watch history item.",
    });
  }
});

router.post("/migrate", (req, res) => {
  try {
    const result = migrateLegacyWatchHistory(req.body?.history);
    const status = result.migrated ? 201 : 409;

    res.status(status).json({
      ...result,
      history: getWatchHistory(),
      source: "database",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Unable to migrate watch history.",
    });
  }
});

export default router;
