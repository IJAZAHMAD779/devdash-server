import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  getReminders,
  createReminder,
  deleteReminder,
  checkDueReminders,
} from "../controllers/reminder.controller";

const router = Router();

router.use(requireAuth);

router.get("/", getReminders);
router.post("/", createReminder);
router.delete("/:id", deleteReminder);
router.post("/check", checkDueReminders);

export default router;
