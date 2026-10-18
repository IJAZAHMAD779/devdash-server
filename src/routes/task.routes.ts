import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createTaskSchema,
  updateTaskSchema,
  patchTaskStatusSchema,
  queryTaskSchema,
} from "../validators/task.validator";
import {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  patchTaskStatus,
  deleteTask,
} from "../controllers/task.controller";

const router = Router();

// Invariant 2: All task routes require authentication and user-scoping
router.use(requireAuth);

router.get("/", validate({ query: queryTaskSchema }), getTasks);
router.post("/", validate({ body: createTaskSchema }), createTask);
router.get("/:id", getTaskById);
router.put("/:id", validate({ body: updateTaskSchema }), updateTask);
router.patch("/:id/status", validate({ body: patchTaskStatusSchema }), patchTaskStatus);
router.delete("/:id", deleteTask);

export default router;
