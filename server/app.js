import express from "express";
import cors from "cors";

import discoverRoutes from "./routes/discoverRoutes.js";
import detailsRoutes from "./routes/detailsRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import recommendationsRoutes from "./routes/recommendationsRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/discover", discoverRoutes);
app.use("/api/details", detailsRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/recommendations", recommendationsRoutes);

export default app;
