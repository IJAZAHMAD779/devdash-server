import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { searchGlobal } from "../controllers/search.controller";

const router = Router();

// Invariant 2: Authentication and multi-tenant scoping
router.use(requireAuth);

router.get("/", searchGlobal);

export default router;
