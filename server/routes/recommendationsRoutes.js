import express from "express";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import { buildNetwork } from "../services/recommendations/networkService.js";
import { normalizeRecommendationFeedback } from "../services/recommendations/feedbackPayload.js";

const router = express.Router();

function isValidationError(error) {
  return error instanceof TypeError || error?.name === "ValidationError";
}

router.post("/analyze", async (req, res) => {
  try {
    const feedback = normalizeRecommendationFeedback(req.body.feedback);
    const result = await analyzeWatchHistory(req.body.history, feedback);

    res.json(result);
  } catch (error) {
    console.error(error);

    if (isValidationError(error)) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
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

    if (isValidationError(error)) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to build watch-history network.",
    });
  }
});

export default router;
