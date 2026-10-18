import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createSnippetSchema,
  updateSnippetSchema,
  querySnippetSchema,
} from "../validators/snippet.validator";
import {
  getSnippets,
  createSnippet,
  getSnippetById,
  updateSnippet,
  deleteSnippet,
} from "../controllers/snippet.controller";

const router = Router();

// Invariant 2: Authentication and tenant-scoping
router.use(requireAuth);

router.get("/", validate({ query: querySnippetSchema }), getSnippets);
router.post("/", validate({ body: createSnippetSchema }), createSnippet);
router.get("/:id", getSnippetById);
router.put("/:id", validate({ body: updateSnippetSchema }), updateSnippet);
router.delete("/:id", deleteSnippet);

export default router;
