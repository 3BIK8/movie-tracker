import express from "express";
import { getWatchHistory, getWatchHistoryCount } from "../repositories/watchHistoryRepository.js";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import {
  buildNetwork,
  validateNetworkHistory,
} from "../services/recommendations/networkService.js";
import { normalizeRecommendationFeedback } from "../services/recommendations/feedbackPayload.js";
import { normalizeWatchHistory } from "../utils/mediaIdentity.js";
import {
  getRecommendationFeedback,
  recordRecommendationFeedback,
} from "../repositories/recommendationExposureRepository.js";
import {
  getRejectedMediaKeys,
  recordLegacyRecommendationRejections,
} from "../repositories/feedbackRepository.js";
import { getCurrentUserId } from "../utils/currentUser.js";

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

    const userId = getCurrentUserId(req);
    const submittedFeedback = normalizeRecommendationFeedback(req.body.feedback);
    if (submittedFeedback) {
      recordRecommendationFeedback(submittedFeedback, userId);
    }
    const feedback = submittedFeedback || getRecommendationFeedback(null, userId);
    recordLegacyRecommendationRejections(userId, feedback);
    const historyReadStartedAt = Date.now();
    const history = getWatchHistory(userId);
    const historyReadMs = Date.now() - historyReadStartedAt;
    const result = await analyzeWatchHistory(history, feedback, {
      rejectedKeys: getRejectedMediaKeys(userId),
    });

    result.recommendationDiagnostics = {
      ...result.recommendationDiagnostics,
      timingMs: {
        ...result.recommendationDiagnostics.timingMs,
        databaseHistoryRead: historyReadMs,
        requestTotal: Date.now() - historyReadStartedAt,
      },
    };

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

    const historyReadStartedAt = Date.now();
    const history = getWatchHistory(req.userId);
    const totalHistory = getWatchHistoryCount(req.userId);
    const databaseReadMs = Date.now() - historyReadStartedAt;
    const result = await buildNetwork(history);

    res.json({
      ...result,
      meta: {
        ...result.meta,
        totalHistory,
        networkWindow: totalHistory,
        hasMoreHistory: false,
        timingMs: {
          ...result.meta.timingMs,
          databaseRead: databaseReadMs,
          requestTotal: Date.now() - historyReadStartedAt,
        },
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
