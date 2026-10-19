import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  createNoteSchema,
  updateNoteSchema,
  noteQuerySchema,
} from "../validators/note.validator";

/**
 * GET /api/v1/notes
 * Returns notes scoped to req.auth.userId with optional projectId, tag, favorite, and search filters.
 */
export const getNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const query = noteQuerySchema.parse(req.query);

    const whereClause: any = {
      userId,
    };

    if (query.projectId) {
      whereClause.projectId = query.projectId;
    }

    if (query.tag) {
      whereClause.tags = {
        has: query.tag,
      };
    }

    if (query.favorite !== undefined) {
      whereClause.favorite = query.favorite;
    }

    if (query.search) {
      const searchTerms = query.search.trim();
      whereClause.OR = [
        { title: { contains: searchTerms, mode: "insensitive" } },
        { content: { contains: searchTerms, mode: "insensitive" } },
      ];
    }

    const notes = await prisma.note.findMany({
      where: whereClause,
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/notes
 * Creates a new note scoped to req.auth.userId.
 */
export const createNote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const input = createNoteSchema.parse(req.body);

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId },
      });
      if (!project) {
        return res.status(404).json({
          success: false,
          error: {
            code: "PROJECT_NOT_FOUND",
            message: "Referenced project does not exist or does not belong to you",
          },
        });
      }
    }

    const note = await prisma.note.create({
      data: {
        userId,
        title: input.title,
        content: input.content,
        tags: input.tags,
        favorite: input.favorite ?? false,
        projectId: input.projectId || null,
      },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    // Record activity log
    await prisma.activityLog.create({
      data: {
        userId,
        entityType: "NOTE",
        entityId: note.id,
        action: "CREATED",
        title: `Note created: ${note.title}`,
      },
    });

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/notes/:id
 * Fetches single note by ID scoped to req.auth.userId.
 */
export const getNoteById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const note = await prisma.note.findFirst({
      where: { id, userId },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTE_NOT_FOUND",
          message: "Note not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/notes/:id
 * Updates note scoped to req.auth.userId.
 */
export const updateNote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const input = updateNoteSchema.parse(req.body);

    const existing = await prisma.note.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTE_NOT_FOUND",
          message: "Note not found",
        },
      });
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId },
      });
      if (!project) {
        return res.status(404).json({
          success: false,
          error: {
            code: "PROJECT_NOT_FOUND",
            message: "Referenced project does not exist or does not belong to you",
          },
        });
      }
    }

    const updated = await prisma.note.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.favorite !== undefined && { favorite: input.favorite }),
        ...(input.projectId !== undefined && { projectId: input.projectId }),
      },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/notes/:id
 * Deletes note scoped to req.auth.userId.
 */
export const deleteNote = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.note.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTE_NOT_FOUND",
          message: "Note not found",
        },
      });
    }

    await prisma.note.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      data: { id, message: "Note deleted successfully" },
    });
  } catch (error) {
    next(error);
  }
};
