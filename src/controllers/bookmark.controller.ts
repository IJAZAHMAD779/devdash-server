import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  createBookmarkSchema,
  updateBookmarkSchema,
  bookmarkQuerySchema,
  batchCreateBookmarkSchema,
} from "../validators/bookmark.validator";

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

    const createData: Prisma.BookmarkUncheckedCreateInput = {
      userId,
      title: input.title,
      url: input.url,
      category: (input.category || "tools").trim().toLowerCase(),
      tags: input.tags,
      notes: input.notes || null,
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
 * Fetches HTML title, description, and favicon for a given URL with timeout and fallback.
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

    let parsedUrl: URL;
    try {
      let formatted = rawUrl.trim();
      if (!/^https?:\/\//i.test(formatted)) {
        formatted = `https://${formatted}`;
      }
      parsedUrl = new URL(formatted);
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "Could not parse provided URL",
        },
      });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    let title = domain;
    let description = "";
    let favicon = fallbackFavicon;

    try {
      const response = await fetch(parsedUrl.href, {
        signal: AbortSignal.timeout(4500),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (response.ok) {
        const text = await response.text();
        const headHtml = text.slice(0, 150000);

        // Extract og:title or title tag
        const ogTitleMatch =
          headHtml.match(
            /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
          );
        const titleTagMatch = headHtml.match(/<title[^>]*>([^<]+)<\/title>/i);

        if (ogTitleMatch && ogTitleMatch[1]) {
          title = ogTitleMatch[1].trim();
        } else if (titleTagMatch && titleTagMatch[1]) {
          title = titleTagMatch[1].trim();
        }

        // Clean HTML entities from title
        title = title
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&ndash;/g, "–")
          .replace(/&mdash;/g, "—")
          .trim();

        // Extract description
        const ogDescMatch =
          headHtml.match(
            /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i
          );

        if (ogDescMatch && ogDescMatch[1]) {
          description = ogDescMatch[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        }

        // Extract favicon link
        const iconMatch =
          headHtml.match(
            /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i
          );

        if (iconMatch && iconMatch[1]) {
          try {
            favicon = new URL(iconMatch[1], parsedUrl.origin).href;
          } catch {
            favicon = fallbackFavicon;
          }
        }
      }
    } catch {
      // Fallback values retained
    }

    return res.status(200).json({
      success: true,
      data: {
        title,
        description,
        favicon,
        domain,
        url: parsedUrl.href,
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
