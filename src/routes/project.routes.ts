import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createProjectSchema,
  updateProjectSchema,
  queryProjectSchema,
} from "../validators/project.validator";
import {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectUrlPreview,
  getGitHubStats,
} from "../controllers/project.controller";

const router = Router();

// Invariant 2: All Project routes require authentication and tenant scoping
router.use(requireAuth);

router.get("/", validate({ query: queryProjectSchema }), getProjects);
router.post("/", validate({ body: createProjectSchema }), createProject);

// Metadata & Telemetry endpoints (placed before /:id)
router.get("/preview", getProjectUrlPreview);
router.get("/github-stats", getGitHubStats);

router.get("/:id", getProjectById);
router.put("/:id", validate({ body: updateProjectSchema }), updateProject);
router.delete("/:id", deleteProject);

export default router;
