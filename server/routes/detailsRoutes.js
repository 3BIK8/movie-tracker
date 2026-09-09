import express from "express";

import { getMediaDetails } from "../services/detailsService.js";
import { sendTmdbError } from "../utils/tmdbErrorHandler.js";
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { type, id } = req.query;

    if (!id || !["movie", "tv"].includes(type)) {
      return res.status(400).json({
        message: "Invalid type or id",
      });
    }

    const data = await getMediaDetails(type, id);

    res.json(data);
  } catch (error) {
    sendTmdbError(res, error, "Unable to load media details from TMDB.");
  }
});

export default router;
