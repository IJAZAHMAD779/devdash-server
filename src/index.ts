import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import projectRoutes from "./routes/project.routes";
import taskRoutes from "./routes/task.routes";
import snippetRoutes from "./routes/snippet.routes";
import componentRoutes from "./routes/component.routes";
import bookmarkRoutes from "./routes/bookmark.routes";
import noteRoutes from "./routes/note.routes";
import searchRoutes from "./routes/search.routes";
import digestRoutes from "./routes/digest.routes";
import { errorHandler } from "./middleware/error.middleware";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all client origins (Vercel deployments, custom domains, localhost)
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
app.use(express.json({ limit: "5mb" }));

// Section 2: Public System Endpoints (Render keep-alive & cold-start probe)
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Section 4: Projects REST API
app.use("/api/v1/projects", projectRoutes);

// Section 5: Tasks REST API
app.use("/api/v1/tasks", taskRoutes);

// Section 6: Code Snippets REST API
app.use("/api/v1/snippets", snippetRoutes);

// Section 7: UI Components REST API
app.use("/api/v1/components", componentRoutes);

// Section 8: Bookmarks & Notes REST API
app.use("/api/v1/bookmarks", bookmarkRoutes);
app.use("/api/v1/notes", noteRoutes);

// Section 9: Global Search API
app.use("/api/v1/search", searchRoutes);

// Section 10: Weekly Digest API
app.use("/api/v1/digest", digestRoutes);

// Catch-all 404 for unhandled API routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// Global Error Handling Envelope (Invariant 3)
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[DevDash Server] REST API listening on http://localhost:${PORT}`);
    console.log(`[DevDash Server] Healthcheck available at http://localhost:${PORT}/health`);
  });
}

export default app;
