import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  createBookmarkSchema,
  updateBookmarkSchema,
  bookmarkQuerySchema,
} from "../validators/bookmark.validator";
import { BookmarkCategory } from "@prisma/client";

/**
 * GET /api/v1/bookmarks
 * Returns bookmarks scoped to req.auth.userId with optional category, projectId, tag, and search filters.
 */
export const getBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const query = bookmarkQuerySchema.parse(req.query);

    const whereClause: any = {
      userId,
    };

    if (query.category) {
      whereClause.category = query.category as BookmarkCategory;
    }

    if (query.projectId) {
      whereClause.projectId = query.projectId;
    }

    if (query.tag) {
      whereClause.tags = {
        has: query.tag,
      };
    }

    if (query.search) {
      const searchTerms = query.search.trim();
      whereClause.OR = [
        { title: { contains: searchTerms, mode: "insensitive" } },
        { notes: { contains: searchTerms, mode: "insensitive" } },
        { url: { contains: searchTerms, mode: "insensitive" } },
      ];
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: bookmarks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/bookmarks
 * Creates a new bookmark scoped to req.auth.userId.
 */
export const createBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const input = createBookmarkSchema.parse(req.body);

    // If projectId is provided, verify it belongs to user
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

    const bookmark = await prisma.bookmark.create({
      data: {
        userId,
        title: input.title,
        url: input.url,
        category: (input.category as BookmarkCategory) || "DOCS",
        tags: input.tags,
        notes: input.notes || null,
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
        entityType: "BOOKMARK",
        entityId: bookmark.id,
        action: "CREATED",
        title: `Bookmarked: ${bookmark.title}`,
      },
    });

    return res.status(201).json({
      success: true,
      data: bookmark,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/bookmarks/:id
 * Fetches single bookmark by ID scoped to req.auth.userId.
 */
export const getBookmarkById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    if (!bookmark) {
      return res.status(404).json({
        success: false,
        error: {
          code: "BOOKMARK_NOT_FOUND",
          message: "Bookmark not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: bookmark,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/bookmarks/:id
 * Updates bookmark scoped to req.auth.userId.
 */
export const updateBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const input = updateBookmarkSchema.parse(req.body);

    const existing = await prisma.bookmark.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "BOOKMARK_NOT_FOUND",
          message: "Bookmark not found",
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

    const updated = await prisma.bookmark.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.category !== undefined && {
          category: input.category as BookmarkCategory,
        }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.notes !== undefined && { notes: input.notes }),
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
 * DELETE /api/v1/bookmarks/:id
 * Deletes bookmark scoped to req.auth.userId.
 */
export const deleteBookmark = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.bookmark.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "BOOKMARK_NOT_FOUND",
          message: "Bookmark not found",
        },
      });
    }

    await prisma.bookmark.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      data: { id, message: "Bookmark deleted successfully" },
    });
  } catch (error) {
    next(error);
  }
};
