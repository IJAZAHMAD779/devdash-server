import { Request, Response, NextFunction } from "express";
import { TaskStatus, Priority } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  CreateTaskInput,
  UpdateTaskInput,
  PatchTaskStatusInput,
} from "../validators/task.validator";

export const getTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { projectId, status, priority, search } = req.query;

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        ...(projectId && { projectId: String(projectId) }),
        ...(status && { status: status as TaskStatus }),
        ...(priority && { priority: priority as Priority }),
        ...(search && {
          OR: [
            { title: { contains: String(search), mode: "insensitive" } },
            { description: { contains: String(search), mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [
        { priority: "desc" },
        { dueDate: "asc" },
        { updatedAt: "desc" },
      ],
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    return next(error);
  }
};

export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const body: CreateTaskInput = req.body;

    if (body.projectId) {
      const projectExists = await prisma.project.findFirst({
        where: { id: body.projectId, userId },
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Project does not exist or is not accessible.",
          },
        });
      }
    }

    const completedAt = body.status === "DONE" ? new Date() : null;

    const task = await prisma.task.create({
      data: {
        userId,
        projectId: body.projectId || null,
        title: body.title,
        description: body.description ?? null,
        status: (body.status as TaskStatus) || "TODO",
        priority: (body.priority as Priority) || "MEDIUM",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        completedAt,
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "TASK",
          entityId: task.id,
          action: "CREATED",
          title: `Created task: ${task.title}`,
        },
      });
    } catch (logError) {
      console.warn("[TaskController] Failed to record activity log:", logError);
    }

    return res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    return next(error);
  }
};

export const getTaskById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Task not found or you do not have permission to view it.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const body: UpdateTaskInput = req.body;

    const existing = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Task not found or you do not have permission to modify it.",
        },
      });
    }

    if (body.projectId) {
      const projectExists = await prisma.project.findFirst({
        where: { id: body.projectId, userId },
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Project does not exist or is not accessible.",
          },
        });
      }
    }

    let completedAt = existing.completedAt;
    if (body.status !== undefined) {
      if (body.status === "DONE" && existing.status !== "DONE") {
        completedAt = new Date();
      } else if (body.status !== "DONE") {
        completedAt = null;
      }
    }
    if (body.completedAt !== undefined) {
      completedAt = body.completedAt ? new Date(body.completedAt) : null;
    }

    const updatedTask = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.projectId !== undefined && { projectId: body.projectId || null }),
        ...(body.status !== undefined && { status: body.status as TaskStatus }),
        ...(body.priority !== undefined && { priority: body.priority as Priority }),
        ...(body.dueDate !== undefined && {
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
        }),
        completedAt,
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "TASK",
          entityId: updatedTask.id,
          action: "UPDATED",
          title: `Updated task: ${updatedTask.title}`,
        },
      });
    } catch (logError) {
      console.warn("[TaskController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedTask,
    });
  } catch (error) {
    return next(error);
  }
};

export const patchTaskStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const { status }: PatchTaskStatusInput = req.body;

    const existing = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Task not found or you do not have permission to modify it.",
        },
      });
    }

    const completedAt = status === "DONE" ? new Date() : null;

    const updatedTask = await prisma.task.update({
      where: { id: existing.id },
      data: {
        status: status as TaskStatus,
        completedAt,
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "TASK",
          entityId: updatedTask.id,
          action: status === "DONE" ? "COMPLETED" : "UPDATED",
          title:
            status === "DONE"
              ? `Completed task: ${updatedTask.title}`
              : `Moved task to ${status}: ${updatedTask.title}`,
        },
      });
    } catch (logError) {
      console.warn("[TaskController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedTask,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Task not found or you do not have permission to delete it.",
        },
      });
    }

    await prisma.task.delete({
      where: { id: existing.id },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "TASK",
          entityId: id,
          action: "DELETED",
          title: `Deleted task: ${existing.title}`,
        },
      });
    } catch (logError) {
      console.warn("[TaskController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      data: { id },
    });
  } catch (error) {
    return next(error);
  }
};
