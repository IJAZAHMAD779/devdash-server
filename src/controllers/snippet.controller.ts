import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  CreateSnippetInput,
  UpdateSnippetInput,
} from "../validators/snippet.validator";

export const getSnippets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { language, tag, projectId, favorite, search } = req.query;

    const snippets = await prisma.snippet.findMany({
      where: {
        userId,
        ...(language && { language: String(language).toLowerCase() }),
        ...(tag && { tags: { has: String(tag) } }),
        ...(projectId && { projectId: String(projectId) }),
        ...(favorite !== undefined && { favorite: favorite === "true" }),
        ...(search && {
          OR: [
            { title: { contains: String(search), mode: "insensitive" } },
            { description: { contains: String(search), mode: "insensitive" } },
            { code: { contains: String(search), mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
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
      data: snippets,
    });
  } catch (error) {
    return next(error);
  }
};

export const createSnippet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const body: CreateSnippetInput = req.body;

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

    const snippet = await prisma.snippet.create({
      data: {
        userId,
        projectId: body.projectId || null,
        title: body.title,
        description: body.description ?? null,
        language: body.language.toLowerCase(),
        code: body.code,
        tags: body.tags ?? [],
        favorite: body.favorite ?? false,
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
          entityType: "SNIPPET",
          entityId: snippet.id,
          action: "CREATED",
          title: `Created snippet: ${snippet.title}`,
        },
      });
    } catch (logError) {
      console.warn("[SnippetController] Failed to record activity log:", logError);
    }

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error) {
    return next(error);
  }
};

export const getSnippetById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const snippet = await prisma.snippet.findFirst({
      where: { id, userId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!snippet) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Snippet not found or you do not have permission to view it.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: snippet,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateSnippet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const body: UpdateSnippetInput = req.body;

    const existing = await prisma.snippet.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Snippet not found or you do not have permission to modify it.",
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

    const updatedSnippet = await prisma.snippet.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.language !== undefined && { language: body.language.toLowerCase() }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.projectId !== undefined && { projectId: body.projectId || null }),
        ...(body.favorite !== undefined && { favorite: body.favorite }),
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
          entityType: "SNIPPET",
          entityId: updatedSnippet.id,
          action: "UPDATED",
          title: `Updated snippet: ${updatedSnippet.title}`,
        },
      });
    } catch (logError) {
      console.warn("[SnippetController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedSnippet,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteSnippet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.snippet.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Snippet not found or you do not have permission to delete it.",
        },
      });
    }

    await prisma.snippet.delete({
      where: { id: existing.id },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "SNIPPET",
          entityId: id,
          action: "DELETED",
          title: `Deleted snippet: ${existing.title}`,
        },
      });
    } catch (logError) {
      console.warn("[SnippetController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Snippet deleted successfully",
      data: { id },
    });
  } catch (error) {
    return next(error);
  }
};
