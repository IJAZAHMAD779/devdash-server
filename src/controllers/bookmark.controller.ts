import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  createBookmarkSchema,
  updateBookmarkSchema,
  bookmarkQuerySchema,
  batchCreateBookmarkSchema,
  batchEnrichBookmarkSchema,
  clearBookmarkNotesSchema,
} from "../validators/bookmark.validator";
import { enrichBookmarksBatch } from "../services/ai.service";
import { fetchUrlMetadata } from "../lib/url-metadata";

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

    if (query.favorite !== undefined) {
      whereClause.favorite = query.favorite;
    }

    if (query.category && query.category.toLowerCase() !== "all") {
      whereClause.category = {
        equals: query.category,
        mode: "insensitive",
      };
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

    let finalTitle = input.title;
    let finalCategory = (input.category || "tools").trim().toLowerCase();
    let finalNotes = input.notes || null;

    if (!finalNotes || finalTitle === input.url) {
      try {
        const meta = await fetchUrlMetadata(input.url, 2500);
        if (finalTitle === input.url && meta.title && meta.title !== meta.domain) {
          finalTitle = meta.title;
        }
        if ((!input.category || input.category === "tools") && meta.suggestedCategory && meta.suggestedCategory !== "tools") {
          finalCategory = meta.suggestedCategory;
        }
        if (!finalNotes && meta.description) {
          finalNotes = meta.description;
        }
      } catch {
        // preserve input defaults
      }
    }

    const createData: Prisma.BookmarkUncheckedCreateInput = {
      userId,
      title: finalTitle,
      url: input.url,
      category: finalCategory,
      tags: input.tags,
      notes: finalNotes,
      projectId: input.projectId || null,
      favorite: input.favorite ?? false,
    };

    const bookmark = await prisma.bookmark.create({
      data: createData,
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

    const updateData: Prisma.BookmarkUncheckedUpdateInput = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.category !== undefined && {
        category: input.category.trim().toLowerCase(),
      }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.favorite !== undefined && { favorite: input.favorite }),
    };

    const updated = await prisma.bookmark.update({
      where: { id },
      data: updateData,
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
 * GET /api/v1/bookmarks/preview?url=...
 * Fetches HTML title, description, favicon, and suggested category for a given URL.
 */
export const getBookmarkPreview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "A valid URL query parameter is required",
        },
      });
    }

    const metadata = await fetchUrlMetadata(rawUrl, 4500);

    return res.status(200).json({
      success: true,
      data: {
        title: metadata.title,
        description: metadata.description,
        favicon: metadata.favicon,
        domain: metadata.domain,
        url: metadata.url,
        suggestedCategory: metadata.suggestedCategory,
      },
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

/**
 * POST /api/v1/bookmarks/batch
 * Batch creates up to 250 bookmarks (e.g. from Chrome HTML import) scoped to req.auth.userId.
 */
export const batchCreateBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { bookmarks } = batchCreateBookmarkSchema.parse(req.body);

    const dataToInsert: Prisma.BookmarkCreateManyInput[] = bookmarks.map((b) => ({
      userId,
      title: b.title.trim(),
      url: b.url.trim(),
      category: (b.category || "tools").trim().toLowerCase(),
      tags: b.tags || [],
      notes: b.notes || null,
      projectId: b.projectId || null,
      favorite: b.favorite ?? false,
    }));

    const result = await prisma.bookmark.createMany({
      data: dataToInsert,
    });

    // Record single aggregated activity log entry
    await prisma.activityLog.create({
      data: {
        userId,
        entityType: "BOOKMARK",
        entityId: "batch",
        action: "CREATED",
        title: `Imported ${result.count} bookmarks from browser`,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        count: result.count,
        message: `Successfully imported ${result.count} bookmarks`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/bookmarks/:id/favorite
 * Toggles the favorite status of a bookmark scoped to req.auth.userId.
 */
export const toggleBookmarkFavorite = async (
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

    const updated = await prisma.bookmark.update({
      where: { id },
      data: { favorite: !existing.favorite },
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
 * POST /api/v1/bookmarks/enrich-batch
 * Batch auto-generates developer notes and tags for bookmarks lacking notes.
 */
export const batchEnrichBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const body = batchEnrichBookmarkSchema.parse(req.body);

    const result = await enrichBookmarksBatch(userId, body);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/bookmarks/:id/enrich
 * Generates developer note and tags for a single bookmark.
 */
export const enrichBookmarkById = async (
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

    const result = await enrichBookmarksBatch(userId, {
      bookmarkIds: [id],
    });

    return res.status(200).json({
      success: true,
      data: result.bookmarks[0] || existing,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/bookmarks/clear-notes
 * Clear notes on bookmarks all at once or scoped to a category or list of bookmarkIds.
 * Multi-tenant safe: Strictly scoped to req.auth.userId.
 */
export const clearBookmarkNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const body = clearBookmarkNotesSchema.parse(req.body);

    const whereClause: Prisma.BookmarkWhereInput = {
      userId,
    };

    if (body.bookmarkIds && body.bookmarkIds.length > 0) {
      whereClause.id = { in: body.bookmarkIds };
    } else if (body.category && body.category.toLowerCase() !== "all") {
      whereClause.category = {
        equals: body.category,
        mode: "insensitive",
      };
    }

    // Only target bookmarks that currently have notes
    whereClause.notes = {
      not: null,
    };

    const result = await prisma.bookmark.updateMany({
      where: whereClause,
      data: {
        notes: null,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        entityType: "BOOKMARK",
        entityId: "bulk-clear-notes",
        action: "UPDATED",
        title: `Cleared developer notes on ${result.count} bookmarks`,
      },
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      data: {
        clearedCount: result.count,
      },
    });
  } catch (error) {
    next(error);
  }
};

