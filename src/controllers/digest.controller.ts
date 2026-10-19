import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  sendWeeklyDigestEmail,
  buildWeeklyDigestHtml,
  DigestStats,
} from "../services/email.service";

/**
 * Gathers user activity stats for the past 7 days
 */
async function gatherUserDigestStats(userId: string): Promise<DigestStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Completed tasks in the last 7 days
  const completedTasks = await prisma.task.findMany({
    where: {
      userId,
      status: "DONE",
      OR: [
        { completedAt: { gte: weekAgo } },
        { updatedAt: { gte: weekAgo } },
      ],
    },
    select: {
      id: true,
      title: true,
      completedAt: true,
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  // 2. Pending tasks count
  const pendingTasksCount = await prisma.task.count({
    where: {
      userId,
      status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW"] },
    },
  });

  // 3. Active projects
  const activeProjects = await prisma.project.findMany({
    where: {
      userId,
      status: { in: ["PLANNING", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
    },
    take: 5,
  });

  // 4. Vault assets created in last 7 days
  const newSnippetsCount = await prisma.snippet.count({
    where: {
      userId,
      createdAt: { gte: weekAgo },
    },
  });

  const newComponentsCount = await prisma.uIComponent.count({
    where: {
      userId,
      createdAt: { gte: weekAgo },
    },
  });

  return {
    completedTasks,
    pendingTasksCount,
    activeProjects,
    newSnippetsCount,
    newComponentsCount,
    weekStart: weekAgo,
    weekEnd: now,
  };
}

/**
 * GET /api/v1/digest/preview
 * Renders the weekly digest HTML for in-browser preview.
 */
export const previewDigest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const userName = user?.name || "Developer";
    const stats = await gatherUserDigestStats(userId);
    const html = buildWeeklyDigestHtml(userName, stats);

    if (req.headers.accept?.includes("text/html")) {
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }

    return res.status(200).json({
      success: true,
      data: {
        html,
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

import { z } from "zod";

const sendDigestSchema = z.object({
  recipientEmail: z.string().email("Invalid email format").optional(),
});

/**
 * POST /api/v1/digest/send
 * Dispatches the weekly developer digest email to user's registered or provided email via Resend.
 */
export const sendDigest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { recipientEmail } = sendDigestSchema.parse(req.body || {});

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const targetEmail = recipientEmail || user?.email;

    if (!targetEmail || targetEmail.endsWith("@devdash.local")) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALID_EMAIL_REQUIRED",
          message:
            "Please provide a valid recipient email address to receive your weekly digest.",
        },
      });
    }

    // If a new real email was provided, persist it in the user profile for future digests and reminders
    if (recipientEmail && user && user.email !== recipientEmail) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { email: recipientEmail },
        });
      } catch (updateErr) {
        console.warn("[DigestController] Could not update user email:", updateErr);
      }
    }

    const stats = await gatherUserDigestStats(userId);
    const result = await sendWeeklyDigestEmail(
      targetEmail,
      user?.name || "Developer",
      stats
    );

    return res.status(200).json({
      success: true,
      message: "Weekly developer digest email dispatched successfully via Resend",
      data: {
        recipient: targetEmail,
        deliveredAt: new Date().toISOString(),
        mode: result.mode,
        emailId: result.id,
      },
    });
  } catch (error) {
    next(error);
  }
};
