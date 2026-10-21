import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { executeAiCommand, getAiStatus } from "../controllers/ai.controller";

const router = Router();

// Public status probe to check if AI provider is configured
router.get("/status", getAiStatus);

// Invariant 2: AI command execution requires authenticated user context
router.post("/command", requireAuth, executeAiCommand);

export default router;
