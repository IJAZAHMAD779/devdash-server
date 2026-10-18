import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";

const searchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Query string is required"),
  type: z
    .enum([
      "ALL",
      "PROJECT",
      "TASK",
      "SNIPPET",
      "COMPONENT",
      "NOTE",
      "BOOKMARK",
    ])
    .default("ALL"),
});

export interface SearchResultItem {
  type: "PROJECT" | "TASK" | "SNIPPET" | "COMPONENT" | "NOTE" | "BOOKMARK";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

/**
 * GET /api/v1/search
 * Global search across all user resources (Projects, Tasks, Snippets, Components, Notes, Bookmarks).
 * Always scoped strictly to req.auth.userId.
 */
export const searchGlobal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;
    const { q, type } = searchQuerySchema.parse(req.query);

    const term = q.trim();
    if (term.length < 2) {
      return res.status(200).json({
        success: true,
        data: {
          query: term,
          results: [],
        },
      });
    }

    const results: SearchResultItem[] = [];

    // Parallelize queries across models according to requested type
    const tasksToRun: Promise<void>[] = [];

    // 1. Projects
    if (type === "ALL" || type === "PROJECT") {
      tasksToRun.push(
        prisma.project
          .findMany({
            where: {
              userId,
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
                { techStack: { has: term } },
              ],
            },
            take: 8,
          })
          .then((projects) => {
            for (const p of projects) {
              results.push({
                type: "PROJECT",
                id: p.id,
                title: p.title,
                subtitle: p.description
                  ? p.description.slice(0, 70)
                  : `Status: ${p.status}`,
                url: `/projects`,
              });
            }
          })
      );
    }

    // 2. Tasks
    if (type === "ALL" || type === "TASK") {
      tasksToRun.push(
        prisma.task
          .findMany({
            where: {
              userId,
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
              ],
            },
            take: 8,
          })
          .then((tasks) => {
            for (const t of tasks) {
              results.push({
                type: "TASK",
                id: t.id,
                title: t.title,
                subtitle: `Status: ${t.status} • Priority: ${t.priority}`,
                url: `/tasks`,
              });
            }
          })
      );
    }

    // 3. Snippets
    if (type === "ALL" || type === "SNIPPET") {
      tasksToRun.push(
        prisma.snippet
          .findMany({
            where: {
              userId,
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
                { code: { contains: term, mode: "insensitive" } },
                { tags: { has: term } },
              ],
            },
            take: 8,
          })
          .then((snippets) => {
            for (const s of snippets) {
              results.push({
                type: "SNIPPET",
                id: s.id,
                title: s.title,
                subtitle: `Language: ${s.language}${s.tags.length ? ` • #${s.tags.join(" #")}` : ""}`,
                url: `/snippets`,
              });
            }
          })
      );
    }

    // 4. Components
    if (type === "ALL" || type === "COMPONENT") {
      tasksToRun.push(
        prisma.uIComponent
          .findMany({
            where: {
              userId,
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { description: { contains: term, mode: "insensitive" } },
                { code: { contains: term, mode: "insensitive" } },
                { tags: { has: term } },
              ],
            },
            take: 8,
          })
          .then((comps) => {
            for (const c of comps) {
              results.push({
                type: "COMPONENT",
                id: c.id,
                title: c.name,
                subtitle: `${c.framework} • ${c.styling}`,
                url: `/components`,
              });
            }
          })
      );
    }

    // 5. Notes
    if (type === "ALL" || type === "NOTE") {
      tasksToRun.push(
        prisma.note
          .findMany({
            where: {
              userId,
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { content: { contains: term, mode: "insensitive" } },
                { tags: { has: term } },
              ],
            },
            take: 8,
          })
          .then((notes) => {
            for (const n of notes) {
              results.push({
                type: "NOTE",
                id: n.id,
                title: n.title,
                subtitle: n.tags.length ? `Tags: ${n.tags.join(", ")}` : "Markdown Note",
                url: `/resources?tab=notes&noteId=${n.id}`,
              });
            }
          })
      );
    }

    // 6. Bookmarks
    if (type === "ALL" || type === "BOOKMARK") {
      tasksToRun.push(
        prisma.bookmark
          .findMany({
            where: {
              userId,
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { notes: { contains: term, mode: "insensitive" } },
                { url: { contains: term, mode: "insensitive" } },
                { tags: { has: term } },
              ],
            },
            take: 8,
          })
          .then((bookmarks) => {
            for (const b of bookmarks) {
              results.push({
                type: "BOOKMARK",
                id: b.id,
                title: b.title,
                subtitle: `Category: ${b.category} • ${b.url}`,
                url: `/resources?tab=bookmarks`,
              });
            }
          })
      );
    }

    await Promise.all(tasksToRun);

    return res.status(200).json({
      success: true,
      data: {
        query: term,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};
