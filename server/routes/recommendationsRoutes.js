import express from "express";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import { buildNetwork } from "../services/recommendations/networkService.js";

const router = express.Router();

router.post("/analyze", async (req, res) => {
  try {
    const result = await analyzeWatchHistory(req.body.history);

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to analyze watch history.",
    });
  }
});

router.post("/network", async (req, res) => {
  try {
    const result = await buildNetwork(req.body.history);

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to build watch-history network.",
    });
  }
});

export default router;
