import { Request, Response, NextFunction } from "express";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CreateProjectInput, UpdateProjectInput } from "../validators/project.validator";

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { status, search } = req.query;

    const projects = await prisma.project.findMany({
      where: {
        userId,
        ...(status && { status: status as ProjectStatus }),
        ...(search && {
          OR: [
            { title: { contains: String(search), mode: "insensitive" } },
            { description: { contains: String(search), mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    return next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const body: CreateProjectInput = req.body;

    const project = await prisma.project.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        status: body.status as ProjectStatus,
        repositoryUrl: body.repositoryUrl ?? null,
        liveUrl: body.liveUrl ?? null,
        techStack: body.techStack ?? [],
        favorite: body.favorite ?? false,
      },
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: project.id,
          action: "CREATED",
          title: `Created project: ${project.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    return next(error);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        tasks: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        snippets: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        components: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        notes: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        bookmarks: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission to access it.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const body: UpdateProjectInput = req.body;

    const existing = await prisma.project.findFirst({
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
          message: "Project not found or you do not have permission to modify it.",
        },
      });
    }

    const updatedProject = await prisma.project.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status as ProjectStatus }),
        ...(body.repositoryUrl !== undefined && { repositoryUrl: body.repositoryUrl }),
        ...(body.liveUrl !== undefined && { liveUrl: body.liveUrl }),
        ...(body.techStack !== undefined && { techStack: body.techStack }),
        ...(body.favorite !== undefined && { favorite: body.favorite }),
      },
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: updatedProject.id,
          action: "UPDATED",
          title: `Updated project: ${updatedProject.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedProject,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.project.findFirst({
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
          message: "Project not found or you do not have permission to delete it.",
        },
      });
    }

    await prisma.project.delete({
      where: {
        id: existing.id,
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: id,
          action: "DELETED",
          title: `Deleted project: ${existing.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Project deleted successfully",
      data: {
        id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// -------------------------------------------------------------
// METADATA & TELEMETRY ENGINE
// -------------------------------------------------------------

interface PreviewCacheItem {
  data: {
    title: string;
    description: string;
    image: string | null;
    favicon: string;
    domain: string;
    url: string;
  };
  expiresAt: number;
}

const previewCache = new Map<string, PreviewCacheItem>();

/**
 * GET /api/v1/projects/preview?url=...
 * Extracts OpenGraph metadata (og:image, og:title, og:description, favicon) with 6-hour caching.
 */
export const getProjectUrlPreview = async (
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

    const forceRefresh = req.query.refresh === "true";
    const cached = previewCache.get(parsedUrl.href);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return res.status(200).json({
        success: true,
        data: cached.data,
      });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    let title = domain;
    let description = "";
    let image: string | null = null;
    let favicon = fallbackFavicon;

    try {
      const response = await fetch(parsedUrl.href, {
        signal: AbortSignal.timeout(6000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      // Parse HTML even for status codes < 500 (e.g. 404, 401, 403 pages often contain full OG tags)
      if (response.status < 500) {
        const text = await response.text();
        const headHtml = text.slice(0, 200000);

        // Extract og:title, twitter:title, or <title>
        const ogTitleMatch =
          headHtml.match(
            /<meta[^>]*property=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:title|twitter:title)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*name=["'](?:twitter:title|title)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["'](?:twitter:title|title)["']/i
          );
        const titleTagMatch = headHtml.match(/<title[^>]*>([^<]+)<\/title>/i);

        if (ogTitleMatch && ogTitleMatch[1]) {
          title = ogTitleMatch[1].trim();
        } else if (titleTagMatch && titleTagMatch[1]) {
          title = titleTagMatch[1].trim();
        }

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
            /<meta[^>]*property=["'](?:og:description|twitter:description)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:description|twitter:description)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*name=["'](?:description|twitter:description)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["'](?:description|twitter:description)["']/i
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

        // Extract og:image
        const ogImageMatch =
          headHtml.match(
            /<meta[^>]*property=["'](?:og:image|og:image:url|og:image:secure_url)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:image|og:image:url|og:image:secure_url)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*name=["'](?:twitter:image|twitter:image:src|og:image)["'][^>]*content=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*name=["'](?:twitter:image|twitter:image:src|og:image)["']/i
          );

        if (ogImageMatch && ogImageMatch[1]) {
          try {
            image = new URL(ogImageMatch[1].trim(), parsedUrl.origin).href;
          } catch {
            image = ogImageMatch[1].trim();
          }
        }

        // Extract favicon link
        const iconMatch =
          headHtml.match(
            /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i
          ) ||
          headHtml.match(
            /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i
          ) ||
          headHtml.match(
            /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i
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
      // Retain fallback values
    }

    // Secondary fallback: Probe static origin favicon paths if not found in HTML
    if (favicon === fallbackFavicon) {
      const iconCandidates = ["/icon.svg", "/favicon.svg", "/favicon.ico"];
      for (const ic of iconCandidates) {
        try {
          const probeIconUrl = `${parsedUrl.origin}${ic}`;
          const probeIconRes = await fetch(probeIconUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(2000),
          });
          if (probeIconRes.ok) {
            favicon = probeIconUrl;
            break;
          }
        } catch {
          // ignore candidate error
        }
      }
    }

    // Secondary fallback: Probe standard static OG paths if image not found in HTML
    if (!image) {
      const candidatePaths = ["/opengraph-image.png", "/og.png", "/opengraph-image.jpg"];
      for (const p of candidatePaths) {
        try {
          const probeUrl = `${parsedUrl.origin}${p}`;
          const probeRes = await fetch(probeUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(2000),
          });
          if (probeRes.ok) {
            image = probeUrl;
            break;
          }
        } catch {
          // ignore candidate error
        }
      }
    }

    const previewData = {
      title,
      description,
      image,
      favicon,
      domain,
      url: parsedUrl.href,
    };

    // Cache successful previews for 6h; cache empty/null images for only 60 seconds
    const ttl = image ? 6 * 60 * 60 * 1000 : 60 * 1000;
    previewCache.set(parsedUrl.href, {
      data: previewData,
      expiresAt: Date.now() + ttl,
    });

    return res.status(200).json({
      success: true,
      data: previewData,
    });
  } catch (error) {
    return next(error);
  }
};

interface GitHubCacheItem {
  data: {
    owner: string;
    repo: string;
    fullName: string;
    stars: number;
    openIssues: number;
    forks: number;
    language: string | null;
    pushedAt: string | null;
    defaultBranch: string;
    description: string | null;
    htmlUrl: string;
  };
  expiresAt: number;
}

const githubCache = new Map<string, GitHubCacheItem>();

/**
 * GET /api/v1/projects/github-stats?repoUrl=...
 * Queries GitHub API for repo statistics with 1-hour in-memory caching to avoid rate-limiting.
 */
export const getGitHubStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawRepoUrl = req.query.repoUrl as string;
    if (!rawRepoUrl || typeof rawRepoUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_URL",
          message: "A valid GitHub repoUrl query parameter is required",
        },
      });
    }

    const match = rawRepoUrl.match(
      /github\.com\/([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)/i
    );
    if (!match) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_GITHUB_URL",
          message: "URL is not a recognized GitHub repository URL format",
        },
      });
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/i, "");
    const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

    const cached = githubCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json({
        success: true,
        data: cached.data,
      });
    }

    const headers: Record<string, string> = {
      "User-Agent": "DevDash-App/1.0",
      Accept: "application/vnd.github.v3+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers,
        signal: AbortSignal.timeout(4500),
      }
    );

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        success: false,
        error: {
          code: "GITHUB_API_ERROR",
          message: `GitHub API responded with status ${response.status}`,
        },
      });
    }

    const data = (await response.json()) as any;
    const stats = {
      owner,
      repo,
      fullName: data.full_name || `${owner}/${repo}`,
      stars: data.stargazers_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      forks: data.forks_count ?? 0,
      language: data.language ?? null,
      pushedAt: data.pushed_at ?? null,
      defaultBranch: data.default_branch || "main",
      description: data.description ?? null,
      htmlUrl: data.html_url || `https://github.com/${owner}/${repo}`,
    };

    githubCache.set(cacheKey, {
      data: stats,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: {
          code: "TIMEOUT",
          message: "GitHub API request timed out",
        },
      });
    }
    return next(error);
  }
};
