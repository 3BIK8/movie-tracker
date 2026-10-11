import express from "express";
import cors from "cors";

import discoverRoutes from "./routes/discoverRoutes.js";
import detailsRoutes from "./routes/detailsRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import recommendationsRoutes from "./routes/recommendationsRoutes.js";
import watchHistoryRoutes from "./routes/watchHistoryRoutes.js";
import { requireAuthentication } from "./middleware/authentication.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  }),
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "128kb" }));

app.use("/api/discover", discoverRoutes);
app.use("/api/details", detailsRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/recommendations", requireAuthentication, recommendationsRoutes);
app.use("/api/watch-history", requireAuthentication, watchHistoryRoutes);

export default app;
