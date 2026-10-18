import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { previewDigest, sendDigest } from "../controllers/digest.controller";

const router = Router();

// Invariant 2: Authentication and multi-tenant scoping
router.use(requireAuth);

router.get("/preview", previewDigest);
router.post("/send", sendDigest);

export default router;
