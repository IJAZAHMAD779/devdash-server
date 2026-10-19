import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  getReminders,
  createReminder,
  deleteReminder,
  checkDueReminders,
  getReminderHealth,
  retryReminder,
} from "../controllers/reminder.controller";

const router = Router();

router.use(requireAuth);

router.get("/", getReminders);
router.get("/health", getReminderHealth);
router.post("/", createReminder);
router.post("/check", checkDueReminders);
router.post("/:id/retry", retryReminder);
router.delete("/:id", deleteReminder);

export default router;
