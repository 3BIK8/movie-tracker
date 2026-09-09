import express from "express";
import {
  discoverMedia,
  discoverPersonCredits,
} from "../services/discoverService.js";
import { sendTmdbError } from "../utils/tmdbErrorHandler.js";

const router = express.Router();

router.get("/person", async (req, res) => {
  try {
    const { personId, role = "actor", page = 1 } = req.query;

    if (!personId || !["actor", "director"].includes(role)) {
      return res.status(400).json({
        message: "Invalid personId or role.",
      });
    }

    const data = await discoverPersonCredits({
      personId,
      role,
      page,
    });

    res.json(data);
  } catch (error) {
    sendTmdbError(res, error, "Unable to load person's credits from TMDB.");
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      type = "movie",
      query = "",
      year = "",
      genre = "",
      language = "",
      minRating = "",
      maxRating = "",
      sort = "popularity",
      page = 1,
    } = req.query;

    if (!["movie", "tv"].includes(type)) {
      return res.status(400).json({
        message: "Invalid media type.",
      });
    }

    const data = await discoverMedia({
      type,
      query,
      year,
      genre,
      language,
      minRating,
      maxRating,
      sort,
      page: Math.max(Number(page) || 1, 1),
    });

    res.json(data);
  } catch (error) {
    sendTmdbError(res, error, "Unable to load media from TMDB.");
  }
});

export default router;
