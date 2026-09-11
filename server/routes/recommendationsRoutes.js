import express from "express";
import { getWatchHistory, getWatchHistoryCount } from "../repositories/watchHistoryRepository.js";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import {
  buildNetwork,
  validateNetworkHistory,
} from "../services/recommendations/networkService.js";
import { normalizeRecommendationFeedback } from "../services/recommendations/feedbackPayload.js";
import { normalizeWatchHistory } from "../utils/mediaIdentity.js";

const router = express.Router();
const DEFAULT_NETWORK_WINDOW = 150;
const MAX_NETWORK_WINDOW = 200;

function isValidationError(error) {
  return error instanceof TypeError || error?.name === "ValidationError";
}

function validateOptionalClientHistory(body, validator) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "history")) {
    return;
  }

  validator(body.history);
}

function parseNetworkWindow(value) {
  if (value === undefined) {
    return DEFAULT_NETWORK_WINDOW;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_NETWORK_WINDOW) {
    throw new TypeError(
      `Network window must be an integer between 1 and ${MAX_NETWORK_WINDOW}.`,
    );
  }

  return parsed;
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
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to analyze watch history.",
    });
  }
});

router.post("/network", async (req, res) => {
  try {
    validateOptionalClientHistory(req.body, validateNetworkHistory);

    const limit = parseNetworkWindow(req.query.limit);
    const history = getWatchHistory();
    const totalHistory = getWatchHistoryCount();
    const networkHistory = history.slice(0, limit);
    const result = await buildNetwork(networkHistory);

    res.json({
      ...result,
      meta: {
        ...result.meta,
        totalHistory,
        networkWindow: limit,
        hasMoreHistory: limit < totalHistory,
      },
    });
  } catch (error) {
    console.error(error);

    if (isValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to build watch-history network.",
    });
  }
});

export default router;
