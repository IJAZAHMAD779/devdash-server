import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createComponentSchema,
  updateComponentSchema,
  queryComponentSchema,
  synthesizeComponentSchema,
  generateComponentSchema,
} from "../validators/component.validator";
import {
  getComponents,
  createComponent,
  getComponentById,
  updateComponent,
  deleteComponent,
} from "../controllers/component.controller";
import {
  synthesizeComponent,
  generateComponent,
} from "../controllers/component-ai.controller";

const router = Router();

// Invariant 2: Authentication and tenant-scoping
router.use(requireAuth);

// AI Synthesizer & Generator routes (must be before /:id)
router.post(
  "/ai-synthesize",
  validate({ body: synthesizeComponentSchema }),
  synthesizeComponent
);
router.post(
  "/ai-generate",
  validate({ body: generateComponentSchema }),
  generateComponent
);

router.get("/", validate({ query: queryComponentSchema }), getComponents);
router.post("/", validate({ body: createComponentSchema }), createComponent);
router.get("/:id", getComponentById);
router.put("/:id", validate({ body: updateComponentSchema }), updateComponent);
router.delete("/:id", deleteComponent);


export default router;
