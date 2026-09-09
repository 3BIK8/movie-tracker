import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import discoverRoutes from "./routes/discoverRoutes.js";
import detailsRoutes from "./routes/detailsRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import recommendationsRoutes from "./routes/recommendationsRoutes.js";


dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/discover", discoverRoutes);
app.use("/api/details", detailsRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/recommendations", recommendationsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
