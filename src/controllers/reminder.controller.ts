import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { processDueReminders } from "../services/reminder-scheduler.service";

const createReminderSchema = z.object({
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().max(1000).optional(),
  remindAt: z.string().datetime({ message: "Valid ISO date-time string required" }),
  taskId: z.string().uuid("Invalid taskId format").optional().nullable(),
  recipientEmail: z.string().email("Invalid recipient email").optional(),
});

/**
 * GET /api/v1/reminders
 * Retrieves all reminders for the authenticated user
 */
export const getReminders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;

    const reminders = await prisma.reminder.findMany({
      where: { userId },
      orderBy: { remindAt: "asc" },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reminders
 * Schedules a new email reminder with specific time
 */
export const createReminder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const body = createReminderSchema.parse(req.body);

    // If recipient email is passed, persist it in the user's profile
    if (body.recipientEmail) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { email: body.recipientEmail },
        });
      } catch (userUpdateErr) {
        console.warn("[ReminderController] Could not update user email:", userUpdateErr);
      }
    }

    const scheduledDate = new Date(body.remindAt);

    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        remindAt: scheduledDate,
        taskId: body.taskId || null,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    // If the scheduled time is now or in the past (e.g. within 10s), process immediately
    if (scheduledDate.getTime() <= Date.now() + 10000) {
      setTimeout(() => {
        processDueReminders().catch((err) =>
          console.error("[ReminderController] Immediate trigger error:", err)
        );
      }, 500);
    }

    return res.status(201).json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/reminders/:id
 * Deletes an existing reminder
 */
export const deleteReminder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.reminder.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Reminder not found or unauthorized",
        },
      });
    }

    await prisma.reminder.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      data: { id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reminders/check
 * Manually triggers a check for due reminders
 */
export const checkDueReminders = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const processedCount = await processDueReminders();
    return res.status(200).json({
      success: true,
      data: { processed: processedCount },
    });
  } catch (error) {
    next(error);
  }
};
