import express from "express";
import { getWatchHistory } from "../repositories/watchHistoryRepository.js";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import {
  buildNetwork,
  validateNetworkHistory,
} from "../services/recommendations/networkService.js";
import { normalizeRecommendationFeedback } from "../services/recommendations/feedbackPayload.js";
import { normalizeWatchHistory } from "../utils/mediaIdentity.js";

const router = express.Router();

function isValidationError(error) {
  return error instanceof TypeError || error?.name === "ValidationError";
}

function validateOptionalClientHistory(body, validator) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "history")) {
    return;
  }

  validator(body.history);
}

router.post("/analyze", async (req, res) => {
  try {
    validateOptionalClientHistory(req.body, normalizeWatchHistory);

    const feedback = normalizeRecommendationFeedback(req.body.feedback);
    const history = getWatchHistory();
    const result = await analyzeWatchHistory(history, feedback);

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
    validateOptionalClientHistory(req.body, validateNetworkHistory);

    const history = getWatchHistory();
    const result = await buildNetwork(history);

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
