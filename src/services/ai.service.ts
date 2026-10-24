import { prisma } from "../lib/prisma";
import { Priority, TaskStatus } from "@prisma/client";
import { fetchUrlMetadata } from "../lib/url-metadata";

export interface AiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ExecutedAction {
  type:
    | "TASK"
    | "REMINDER"
    | "NOTE"
    | "SNIPPET"
    | "BOOKMARK"
    | "QUERY"
    | "UPDATE_BOOKMARK"
    | "ENRICH_BOOKMARKS"
    | "UPDATE_TASK"
    | "UPDATE_NOTE";
  title: string;
  id?: string;
  details?: Record<string, any>;
  url?: string;
}

export interface AiExecutionResult {
  reply: string;
  actions: ExecutedAction[];
  modelUsed: string;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const FALLBACK_MODEL = "openai/gpt-oss-20b";

// Groq / OpenAI compatible Tool Definitions
const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new developer task on the Kanban board. Can assign priority, status, due date, and link to a project.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Clear, actionable title of the task" },
          description: { type: "string", description: "Optional technical details, requirements, or markdown checklist" },
          priority: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            description: "Task priority level. Default is MEDIUM."
          },
          status: {
            type: "string",
            enum: ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"],
            description: "Initial status on board. Default is TODO."
          },
          dueDate: {
            type: "string",
            description: "ISO 8601 string for deadline (e.g. 2026-10-22T17:00:00.000Z), accurately computed from user's current date/time."
          },
          projectName: {
            type: "string",
            description: "Optional name of the project this task belongs to (e.g. 'DevDash')"
          }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Schedule a time-based email reminder. Accurately converts natural language times ('tomorrow at 9am', 'at 11:00 am', 'in 3 hours', 'Friday at 2pm') into scheduled reminders.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Subject/topic of the reminder" },
          description: { type: "string", description: "Optional notes or instructions for the reminder" },
          date: {
            type: "string",
            description: "Target local date in YYYY-MM-DD format (e.g. '2026-10-24' for tomorrow, or today's date)"
          },
          time: {
            type: "string",
            description: "Target local time in 24-hour HH:mm format (e.g. '11:00' for 11:00 AM, '09:30' for 9:30 AM, '16:00' for 4:00 PM). Never guess UTC conversion - provide user's requested local time!"
          },
          remindAt: {
            type: "string",
            description: "Alternative exact ISO 8601 date-time string if date and time are not separated"
          },
          taskId: { type: "string", description: "Optional UUID of an associated task" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Write and save a technical note, meeting summary, architectural decision, or scratchpad document with Markdown support.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the note" },
          content: { type: "string", description: "Full Markdown formatted content" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization (e.g. ['architecture', 'api', 'auth'])"
          },
          projectName: { type: "string", description: "Optional project name to associate with" }
        },
        required: ["title", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_snippet",
      description: "Save a code snippet to the developer's syntax-highlighted Snippet Vault.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Descriptive name for the snippet" },
          code: { type: "string", description: "The raw source code" },
          language: {
            type: "string",
            description: "Language identifier (e.g. 'typescript', 'python', 'javascript', 'sql', 'bash', 'css')"
          },
          description: { type: "string", description: "Optional explanation of what the snippet does" },
          tags: { type: "array", items: { type: "string" } },
          projectName: { type: "string", description: "Optional project name" }
        },
        required: ["title", "code", "language"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_bookmark",
      description: "Save a developer resource, documentation, design site, or tool bookmark. Automatically inspects the live webpage to extract the real title, summary notes, and category (e.g. 'design', 'repo', 'docs', 'tools') if not explicitly specified.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full web URL (e.g. 'https://touch-type.runable.site/')" },
          title: { type: "string", description: "Optional title. If omitted, will be extracted automatically from the live page." },
          category: {
            type: "string",
            description: "Optional category: 'design', 'repo', 'docs', 'tools', 'hosting', 'cloud', 'prompts', or custom. If omitted, will be intelligently classified from page content."
          },
          notes: { type: "string", description: "Optional notes. If omitted, will be summarized accurately from the live page." },
          projectName: { type: "string", description: "Optional project name to link this bookmark to" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_workspace",
      description: "Search and query the user's workspace to find bookmarks, notes, tasks, projects, or reminders by title, category, tags, or content.",
      parameters: {
        type: "object",
        properties: {
          entityType: {
            type: "string",
            enum: ["bookmarks", "notes", "tasks", "projects", "reminders"],
            description: "The type of workspace entity to query or search"
          },
          query: {
            type: "string",
            description: "Search keyword, category name, title snippet, or tag (e.g. 'text', 'animation', 'tools', 'react', 'pending')"
          },
          category: {
            type: "string",
            description: "Optional category filter (e.g. 'text', 'tools', 'design', 'repo')"
          },
          limit: { type: "number", description: "Max items to return (default 10, max 25)" }
        },
        required: ["entityType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_bookmark",
      description: "Update an existing bookmark's notes, category, tags, title, or favorite status. Can match the bookmark by URL, title, or ID.",
      parameters: {
        type: "object",
        properties: {
          bookmarkId: { type: "string", description: "UUID of the bookmark if known" },
          url: { type: "string", description: "Full or partial URL of the bookmark to update" },
          searchQuery: { type: "string", description: "Title, domain, or keyword to find the bookmark" },
          notes: { type: "string", description: "Updated developer notes or description. If set to 'auto', notes will be generated from the live page." },
          category: { type: "string", description: "Updated category or folder" },
          tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
          title: { type: "string", description: "Updated title" },
          favorite: { type: "boolean", description: "Mark as favorite" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "enrich_bookmarks",
      description: "Automatically generate descriptive developer notes and tags for bookmarks that currently have empty notes.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Optional category filter (e.g. 'tools', 'repo', 'design', or 'ALL'). Default is ALL."
          },
          limit: {
            type: "number",
            description: "Max number of bookmarks to enrich in this run (default 15, max 30)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's status, priority, title, description, or due date.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "UUID of the task if known" },
          searchQuery: { type: "string", description: "Task title snippet if ID is unknown" },
          status: {
            type: "string",
            enum: ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"],
            description: "New status of the task"
          },
          priority: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            description: "New priority of the task"
          },
          title: { type: "string", description: "Updated title of the task" },
          description: { type: "string", description: "Updated description" },
          dueDate: { type: "string", description: "Updated ISO 8601 UTC date string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "Update an existing developer note's title, Markdown content, or tags.",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string", description: "UUID of the note if known" },
          searchQuery: { type: "string", description: "Note title snippet if ID is unknown" },
          title: { type: "string", description: "Updated title" },
          content: { type: "string", description: "Updated Markdown content" },
          tags: { type: "array", items: { type: "string" }, description: "Updated tags" }
        }
      }
    }
  }
];

/**
 * Execute tool calls requested by Groq/Qwen with strict multi-tenant scoping
 */
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  timezoneOffsetMinutes?: number
): Promise<{ result: string; action?: ExecutedAction }> {
  try {
    switch (toolName) {
      case "create_task": {
        let projectId: string | undefined;
        if (args.projectName) {
          const match = await prisma.project.findFirst({
            where: {
              userId,
              title: { contains: args.projectName, mode: "insensitive" }
            },
            select: { id: true, title: true }
          });
          if (match) projectId = match.id;
        }

        const task = await prisma.task.create({
          data: {
            userId,
            title: args.title,
            description: args.description || null,
            priority: (args.priority as Priority) || Priority.MEDIUM,
            status: (args.status as TaskStatus) || TaskStatus.TODO,
            dueDate: args.dueDate ? new Date(args.dueDate) : null,
            projectId: projectId || null,
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "TASK",
            entityId: task.id,
            action: "CREATED",
            title: `AI created task: ${task.title}`
          }
        }).catch(() => null);

        return {
          result: `Task created successfully: ID ${task.id}, title "${task.title}", priority ${task.priority}, status ${task.status}.`,
          action: {
            type: "TASK",
            id: task.id,
            title: task.title,
            details: { priority: task.priority, status: task.status, dueDate: task.dueDate },
            url: "/tasks"
          }
        };
      }

      case "create_reminder": {
        let remindDate: Date | null = null;

        if (args.date && args.time) {
          const [yearStr, monthStr, dayStr] = String(args.date).split("-");
          const [hoursStr, minutesStr] = String(args.time).split(":");
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10) - 1;
          const day = parseInt(dayStr, 10);
          const hours = parseInt(hoursStr, 10);
          const minutes = parseInt(minutesStr, 10);

          if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hours) && !isNaN(minutes)) {
            if (timezoneOffsetMinutes !== undefined && !isNaN(timezoneOffsetMinutes)) {
              // getTimezoneOffset() is in minutes (e.g. -300 for GMT+5)
              // Date.UTC(...) + (offset * 60 * 1000) converts user's local time directly to UTC timestamp
              const utcMillis = Date.UTC(year, month, day, hours, minutes, 0, 0) + (timezoneOffsetMinutes * 60 * 1000);
              remindDate = new Date(utcMillis);
            } else {
              remindDate = new Date(`${args.date}T${args.time}:00`);
            }
          }
        }

        if (!remindDate || isNaN(remindDate.getTime())) {
          if (args.remindAt) {
            remindDate = new Date(args.remindAt);
          }
        }

        if (!remindDate || isNaN(remindDate.getTime())) {
          return { result: "Error: Could not calculate a valid reminder date and time." };
        }

        const reminder = await prisma.reminder.create({
          data: {
            userId,
            title: args.title,
            description: args.description || null,
            remindAt: remindDate,
            taskId: args.taskId || null,
          }
        });

        return {
          result: `Reminder scheduled successfully: ID ${reminder.id}, title "${reminder.title}", set for ${reminder.remindAt.toISOString()}.`,
          action: {
            type: "REMINDER",
            id: reminder.id,
            title: reminder.title,
            details: { remindAt: reminder.remindAt.toISOString() },
            url: "/reminders"
          }
        };
      }

      case "create_note": {
        let projectId: string | undefined;
        if (args.projectName) {
          const match = await prisma.project.findFirst({
            where: { userId, title: { contains: args.projectName, mode: "insensitive" } },
            select: { id: true }
          });
          if (match) projectId = match.id;
        }

        const note = await prisma.note.create({
          data: {
            userId,
            title: args.title,
            content: args.content,
            tags: Array.isArray(args.tags) ? args.tags : [],
            projectId: projectId || null,
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "NOTE",
            entityId: note.id,
            action: "CREATED",
            title: `AI created note: ${note.title}`
          }
        }).catch(() => null);

        return {
          result: `Note created successfully: ID ${note.id}, title "${note.title}".`,
          action: {
            type: "NOTE",
            id: note.id,
            title: note.title,
            details: { tags: note.tags },
            url: "/resources"
          }
        };
      }

      case "create_snippet": {
        let projectId: string | undefined;
        if (args.projectName) {
          const match = await prisma.project.findFirst({
            where: { userId, title: { contains: args.projectName, mode: "insensitive" } },
            select: { id: true }
          });
          if (match) projectId = match.id;
        }

        const snippet = await prisma.snippet.create({
          data: {
            userId,
            title: args.title,
            code: args.code,
            language: args.language.toLowerCase(),
            description: args.description || null,
            tags: Array.isArray(args.tags) ? args.tags : [],
            projectId: projectId || null,
          }
        });

        return {
          result: `Snippet created successfully: ID ${snippet.id}, title "${snippet.title}", language ${snippet.language}.`,
          action: {
            type: "SNIPPET",
            id: snippet.id,
            title: snippet.title,
            details: { language: snippet.language },
            url: "/snippets"
          }
        };
      }

      case "create_bookmark": {
        let projectId: string | undefined;
        if (args.projectName) {
          const match = await prisma.project.findFirst({
            where: { userId, title: { contains: args.projectName, mode: "insensitive" } },
            select: { id: true }
          });
          if (match) projectId = match.id;
        }

        let title = (args.title || "").trim();
        let category = (args.category || "").trim().toLowerCase();
        let notes = (args.notes || "").trim();

        // Automatically fetch live webpage metadata
        try {
          const meta = await fetchUrlMetadata(args.url, 3500);
          if (!title || title === args.url) {
            title = meta.title;
          }
          if (!category || category === "tools") {
            category = meta.suggestedCategory || "tools";
          }
          if (!notes && meta.description) {
            notes = meta.description;
          }
        } catch {
          // keep fallback
        }

        if (!title) title = args.url;
        if (!category) category = "tools";

        const bookmark = await prisma.bookmark.create({
          data: {
            userId,
            title,
            url: args.url,
            category,
            notes: notes || null,
            projectId: projectId || null,
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "BOOKMARK",
            entityId: bookmark.id,
            action: "CREATED",
            title: `AI created bookmark: ${bookmark.title}`
          }
        }).catch(() => null);

        return {
          result: `Bookmark created successfully: "${bookmark.title}" under category "${bookmark.category}" with notes: "${bookmark.notes || "None"}". URL: ${bookmark.url}`,
          action: {
            type: "BOOKMARK",
            id: bookmark.id,
            title: bookmark.title,
            details: { url: bookmark.url, category: bookmark.category, notes: bookmark.notes },
            url: "/resources"
          }
        };
      }

      case "query_workspace": {
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
        const rawSearch = (args.query || args.search || args.filter || "").trim();
        const categoryFilter = (args.category || "").trim();

        if (args.entityType === "bookmarks") {
          const whereClause: any = { userId };
          if (categoryFilter && categoryFilter.toLowerCase() !== "all") {
            whereClause.category = { equals: categoryFilter, mode: "insensitive" };
          }
          if (rawSearch && rawSearch.toLowerCase() !== "all") {
            whereClause.OR = [
              { title: { contains: rawSearch, mode: "insensitive" } },
              { url: { contains: rawSearch, mode: "insensitive" } },
              { notes: { contains: rawSearch, mode: "insensitive" } },
              { category: { contains: rawSearch, mode: "insensitive" } },
              { tags: { has: rawSearch.toLowerCase() } }
            ];
          }

          const bookmarks = await prisma.bookmark.findMany({
            where: whereClause,
            take: limit,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, url: true, category: true, notes: true, tags: true }
          });

          return {
            result: JSON.stringify({ count: bookmarks.length, bookmarks }),
            action: {
              type: "QUERY",
              title: `Found ${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}`,
              details: { bookmarks }
            }
          };
        } else if (args.entityType === "notes") {
          const whereClause: any = { userId };
          if (rawSearch && rawSearch.toLowerCase() !== "all") {
            whereClause.OR = [
              { title: { contains: rawSearch, mode: "insensitive" } },
              { content: { contains: rawSearch, mode: "insensitive" } },
              { tags: { has: rawSearch.toLowerCase() } }
            ];
          }

          const notes = await prisma.note.findMany({
            where: whereClause,
            take: limit,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, tags: true }
          });

          return {
            result: JSON.stringify({ count: notes.length, notes }),
            action: {
              type: "QUERY",
              title: `Found ${notes.length} note${notes.length === 1 ? "" : "s"}`,
              details: { notes }
            }
          };
        } else if (args.entityType === "tasks") {
          const whereClause: any = { userId };
          if (args.filter === "pending") whereClause.status = { not: "DONE" };
          else if (args.filter === "completed") whereClause.status = "DONE";
          else if (args.filter === "overdue") {
            whereClause.dueDate = { lt: new Date() };
            whereClause.status = { not: "DONE" };
          } else if (rawSearch) {
            whereClause.OR = [
              { title: { contains: rawSearch, mode: "insensitive" } },
              { description: { contains: rawSearch, mode: "insensitive" } }
            ];
          }

          const tasks = await prisma.task.findMany({
            where: whereClause,
            take: limit,
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, priority: true, status: true, dueDate: true }
          });

          return {
            result: JSON.stringify({ count: tasks.length, tasks }),
            action: {
              type: "QUERY",
              title: `Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
              details: { tasks }
            }
          };
        } else if (args.entityType === "projects") {
          const whereClause: any = { userId };
          if (rawSearch) {
            whereClause.OR = [
              { title: { contains: rawSearch, mode: "insensitive" } },
              { description: { contains: rawSearch, mode: "insensitive" } }
            ];
          }
          const projects = await prisma.project.findMany({
            where: whereClause,
            take: limit,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, status: true, techStack: true }
          });
          return {
            result: JSON.stringify({ count: projects.length, projects }),
            action: {
              type: "QUERY",
              title: `Found ${projects.length} project${projects.length === 1 ? "" : "s"}`,
              details: { projects }
            }
          };
        } else {
          // reminders
          const whereClause: any = { userId, isSent: false };
          if (rawSearch) {
            whereClause.title = { contains: rawSearch, mode: "insensitive" };
          }
          const reminders = await prisma.reminder.findMany({
            where: whereClause,
            take: limit,
            orderBy: { remindAt: "asc" },
            select: { id: true, title: true, remindAt: true }
          });
          return {
            result: JSON.stringify({ count: reminders.length, reminders }),
            action: {
              type: "QUERY",
              title: `Found ${reminders.length} upcoming reminders`,
              details: { reminders }
            }
          };
        }
      }

      case "update_bookmark": {
        let bookmark: any = null;
        if (args.bookmarkId) {
          bookmark = await prisma.bookmark.findFirst({
            where: { id: args.bookmarkId, userId }
          });
        }

        const lookupTerm = (args.url || args.searchQuery || args.title || "").trim();
        if (!bookmark && lookupTerm) {
          const cleanTerm = lookupTerm.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
          bookmark = await prisma.bookmark.findFirst({
            where: {
              userId,
              OR: [
                { url: { contains: cleanTerm, mode: "insensitive" } },
                { url: { contains: lookupTerm, mode: "insensitive" } },
                { title: { contains: lookupTerm, mode: "insensitive" } },
                { title: { contains: cleanTerm, mode: "insensitive" } }
              ]
            }
          });
        }

        if (!bookmark) {
          return { result: `Bookmark matching "${lookupTerm || args.bookmarkId}" not found in your workspace.` };
        }

        let newNotes = args.notes !== undefined ? args.notes : undefined;
        let newCategory = args.category !== undefined ? args.category.toLowerCase().trim() : undefined;

        // If user asked to auto-generate or didn't supply notes for an update request, scrape live page
        if (args.notes === "auto" || (newNotes === undefined && !newCategory && !args.title && !args.tags && args.favorite === undefined)) {
          try {
            const meta = await fetchUrlMetadata(bookmark.url, 3500);
            if (meta.description) newNotes = meta.description;
            if (!bookmark.category || bookmark.category === "tools") {
              if (meta.suggestedCategory && meta.suggestedCategory !== "tools") {
                newCategory = meta.suggestedCategory;
              }
            }
          } catch {
            // retain
          }
        }

        const updated = await prisma.bookmark.update({
          where: { id: bookmark.id },
          data: {
            ...(newNotes !== undefined && { notes: newNotes }),
            ...(newCategory !== undefined && { category: newCategory }),
            ...(Array.isArray(args.tags) && { tags: args.tags }),
            ...(args.title !== undefined && { title: args.title }),
            ...(args.favorite !== undefined && { favorite: args.favorite })
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "BOOKMARK",
            entityId: updated.id,
            action: "UPDATED",
            title: `AI updated bookmark: ${updated.title}`
          }
        }).catch(() => null);

        return {
          result: `Bookmark "${updated.title}" updated successfully: notes "${updated.notes || "None"}", category "${updated.category}".`,
          action: {
            type: "UPDATE_BOOKMARK",
            id: updated.id,
            title: updated.title,
            details: { notes: updated.notes, category: updated.category, tags: updated.tags },
            url: "/resources"
          }
        };
      }

      case "enrich_bookmarks": {
        const result = await enrichBookmarksBatch(userId, {
          category: args.category,
          limit: args.limit || 15
        });

        return {
          result: `Successfully enriched ${result.enrichedCount} bookmarks with AI notes and tags.`,
          action: {
            type: "ENRICH_BOOKMARKS",
            title: `AI Enriched ${result.enrichedCount} Bookmarks`,
            details: {
              count: result.enrichedCount,
              sampleTitles: result.bookmarks.slice(0, 5).map(b => b.title)
            },
            url: "/resources"
          }
        };
      }

      case "update_task": {
        let task: any = null;
        if (args.taskId) {
          task = await prisma.task.findFirst({ where: { id: args.taskId, userId } });
        }
        if (!task && args.searchQuery) {
          task = await prisma.task.findFirst({
            where: { userId, title: { contains: args.searchQuery, mode: "insensitive" } }
          });
        }
        if (!task) {
          return { result: `Task matching "${args.taskId || args.searchQuery}" not found.` };
        }

        const updated = await prisma.task.update({
          where: { id: task.id },
          data: {
            ...(args.status && { status: args.status as TaskStatus }),
            ...(args.priority && { priority: args.priority as Priority }),
            ...(args.title && { title: args.title }),
            ...(args.description !== undefined && { description: args.description }),
            ...(args.dueDate && { dueDate: new Date(args.dueDate) })
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "TASK",
            entityId: updated.id,
            action: "UPDATED",
            title: `AI updated task: ${updated.title}`
          }
        }).catch(() => null);

        return {
          result: `Task "${updated.title}" updated: status ${updated.status}, priority ${updated.priority}.`,
          action: {
            type: "UPDATE_TASK",
            id: updated.id,
            title: updated.title,
            details: { status: updated.status, priority: updated.priority },
            url: "/tasks"
          }
        };
      }

      case "update_note": {
        let note: any = null;
        if (args.noteId) {
          note = await prisma.note.findFirst({ where: { id: args.noteId, userId } });
        }
        if (!note && args.searchQuery) {
          note = await prisma.note.findFirst({
            where: { userId, title: { contains: args.searchQuery, mode: "insensitive" } }
          });
        }
        if (!note) {
          return { result: `Note matching "${args.noteId || args.searchQuery}" not found.` };
        }

        const updated = await prisma.note.update({
          where: { id: note.id },
          data: {
            ...(args.title && { title: args.title }),
            ...(args.content !== undefined && { content: args.content }),
            ...(Array.isArray(args.tags) && { tags: args.tags })
          }
        });

        await prisma.activityLog.create({
          data: {
            userId,
            entityType: "NOTE",
            entityId: updated.id,
            action: "UPDATED",
            title: `AI updated note: ${updated.title}`
          }
        }).catch(() => null);

        return {
          result: `Note "${updated.title}" updated successfully.`,
          action: {
            type: "UPDATE_NOTE",
            id: updated.id,
            title: updated.title,
            details: { tags: updated.tags },
            url: "/resources"
          }
        };
      }

      default:
        return { result: `Unknown tool name: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[AiService] Tool execution failed for ${toolName}:`, error);
    return { result: `Error executing ${toolName}: ${error.message || "Unknown error"}` };
  }
}

/**
 * Main AI Copilot runner using Groq Qwen
 */
export async function runAiCommand(
  userId: string,
  userPrompt: string,
  clientTime?: string,
  timezone?: string,
  timezoneOffsetMinutes?: number,
  history: AiChatMessage[] = []
): Promise<AiExecutionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the server");
  }

  // Load user context (active projects for entity resolution)
  const userProjects = await prisma.project.findMany({
    where: { userId },
    select: { id: true, title: true, status: true },
    take: 10
  });

  const now = new Date();
  let todayYmd = now.toISOString().slice(0, 10);
  if (timezoneOffsetMinutes !== undefined && !isNaN(timezoneOffsetMinutes)) {
    const localNow = new Date(now.getTime() - timezoneOffsetMinutes * 60 * 1000);
    todayYmd = localNow.toISOString().slice(0, 10);
  }

  const nowString = clientTime || new Date().toISOString();
  const tzString = timezone || "UTC";

  const systemPrompt = `You are DevDash AI, an elite AI developer workspace assistant powered by Groq.
You are embedded directly inside DevDash, a personal developer workspace platform.

CURRENT CONTEXT:
- Current Local Time: ${nowString} (${tzString})
- Today's Date: ${todayYmd}
- Available Projects in Workspace:
${userProjects.length > 0 ? userProjects.map(p => `  * ${p.title} (${p.status})`).join("\n") : "  (No projects yet)"}

CORE CAPABILITIES & PERMISSIONS:
1. You have FULL PERMISSION to create, edit, update, search, and enrich workspace entities (bookmarks, tasks, notes, snippets, reminders).
2. NEVER tell the user "I only create, I cannot edit or update". You CAN update and query entities using your tools:
   - For querying/listing bookmarks or notes (e.g. "List notes from text category", "List all bookmarks in design", "Search bookmarks for touch-type"): invoke 'query_workspace' with entityType: "bookmarks" or "notes" and search/category parameters.
   - For adding a bookmark: invoke 'create_bookmark' with url. The backend will automatically inspect the live page to extract its real title, description notes, and category.
   - For updating bookmarks (adding notes, changing categories/tags): invoke 'update_bookmark' with url, title, or searchQuery.
   - For auto-generating notes for imported bookmarks: invoke 'enrich_bookmarks'.
   - For updating tasks (status, priority, due date): invoke 'update_task'.
   - For updating notes: invoke 'update_note'.
3. For scheduling reminders:
   - Extract the user's requested date (YYYY-MM-DD) and 24-hour time (HH:mm) directly into 'date' and 'time' parameters of 'create_reminder' (e.g. date: "${todayYmd}", time: "11:00" for 11:00 AM).
   - DO NOT attempt mental UTC subtraction; the server will perform exact mathematical UTC conversion using the user's timezone offset.
4. Be concise, developer-centric, professional, and clear. Avoid fluffy conversational filler.
5. If the user asks you to do something actionable, invoke the appropriate tool.
6. FORMATTING: You are rendered in a compact floating chat window. When listing projects, tasks, or resources, use clean structured bulleted lists with bold titles and status indicators (e.g., "- **DevDash** (🟢 \`IN_PROGRESS\`) - Next.js, TypeScript"). Do NOT output wide multi-column markdown tables, as they cause horizontal distortion in narrow chat interfaces.`;

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6), // Keep last few turns for context
    { role: "user", content: userPrompt }
  ];

  // Try primary model, fallback if needed
  let activeModel = PRIMARY_MODEL;
  let responseData: any;

  try {
    responseData = await callGroq(apiKey, activeModel, messages, true);
  } catch (err: any) {
    console.warn(`[AiService] Primary model ${activeModel} failed: ${err.message}. Retrying with ${FALLBACK_MODEL}`);
    activeModel = FALLBACK_MODEL;
    responseData = await callGroq(apiKey, activeModel, messages, true);
  }

  const choice = responseData?.choices?.[0];
  const message = choice?.message;
  const executedActions: ExecutedAction[] = [];

  // Check if Qwen requested tool calls
  if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    // Add assistant's tool call request to history
    messages.push(message);

    // Execute each tool
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function?.name;
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch {
        args = {};
      }

      const { result, action } = await executeTool(toolName, args, userId, timezoneOffsetMinutes);
      if (action) executedActions.push(action);

      // Append tool result
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: result
      });
    }

    // Call Qwen again without tools to get final conversational summary of the actions
    try {
      const finalRes = await callGroq(apiKey, activeModel, messages, false);
      const finalReply = finalRes?.choices?.[0]?.message?.content || "Actions completed.";
      return {
        reply: finalReply,
        actions: executedActions,
        modelUsed: activeModel
      };
    } catch (err: any) {
      console.error("[AiService] Follow-up Groq completion failed:", err?.message || err);
      // Format a smart conversational summary directly from executedActions
      const actionSummaries = executedActions.map(a => {
        if (a.type === "QUERY") {
          const details = a.details as any;
          if (details?.bookmarks) {
            if (details.bookmarks.length === 0) return "No bookmarks found matching your query in the workspace.";
            return `Found ${details.bookmarks.length} bookmark${details.bookmarks.length === 1 ? "" : "s"}:\n` +
              details.bookmarks.map((b: any) => `• **${b.title}** (${b.url}) — \`${b.category || "tools"}\`${b.notes ? `\n  _${b.notes}_` : ""}`).join("\n");
          }
          if (details?.notes) {
            if (details.notes.length === 0) return "No notes found matching your query in the workspace.";
            return `Found ${details.notes.length} note${details.notes.length === 1 ? "" : "s"}:\n` +
              details.notes.map((n: any) => `• **${n.title}**${n.tags?.length ? ` [${n.tags.join(", ")}]` : ""}`).join("\n");
          }
          if (details?.tasks) {
            if (details.tasks.length === 0) return "No tasks found matching your query in the workspace.";
            return `Found ${details.tasks.length} task${details.tasks.length === 1 ? "" : "s"}:\n` +
              details.tasks.map((t: any) => `• **${t.title}** (\`${t.status}\` | ${t.priority})`).join("\n");
          }
          if (details?.projects) {
            if (details.projects.length === 0) return "No projects found matching your query in the workspace.";
            return `Found ${details.projects.length} project${details.projects.length === 1 ? "" : "s"}:\n` +
              details.projects.map((p: any) => `• **${p.title}** (\`${p.status}\`)`).join("\n");
          }
        }
        if (a.type === "UPDATE_BOOKMARK") {
          return `Updated bookmark **${a.title}**${a.details?.notes ? ` with notes: "${a.details.notes}"` : ""}${a.details?.category ? ` in category \`${a.details.category}\`` : ""}.`;
        }
        if (a.type === "BOOKMARK") {
          return `Saved bookmark **${a.title}** (${a.details?.url}) under \`${a.details?.category || "tools"}\`${a.details?.notes ? ` with notes: "${a.details.notes}"` : ""}.`;
        }
        if (a.type === "ENRICH_BOOKMARKS") {
          return `Enriched ${a.details?.count || 0} bookmarks with AI notes and tags.`;
        }
        return `${a.title}`;
      });

      return {
        reply: actionSummaries.length > 0
          ? actionSummaries.join("\n\n")
          : "Action executed successfully in your workspace.",
        actions: executedActions,
        modelUsed: activeModel
      };
    }
  }

  return {
    reply: message?.content || "I didn't receive a response. How can I help with your projects or tasks?",
    actions: executedActions,
    modelUsed: activeModel
  };
}

async function callGroq(apiKey: string, model: string, messages: AiChatMessage[], withTools = true): Promise<any> {
  const payload: any = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 1024
  };

  if (withTools) {
    payload.tools = AI_TOOLS;
    payload.tool_choice = "auto";
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API responded with status ${res.status}: ${errorText}`);
  }

  return res.json();
}

/**
 * Call Groq to generate developer notes and tags for a list of bookmarks with real page context
 */
export async function generateNotesForBookmarks(
  bookmarks: Array<{ id: string; title: string; url: string; pageDescription?: string; category?: string | null }>,
  apiKey: string
): Promise<Array<{ id: string; notes: string; tags: string[]; category?: string }>> {
  if (!bookmarks.length) return [];

  const prompt = `You are a developer workspace intelligence system. For each bookmark below (with live title, url, scraped page description, and category), generate:
1. "notes": A crisp, highly accurate 1-2 sentence developer summary explaining what this tool, resource, website, or library does and why developers use it. Base your summary on the provided page description and features. DO NOT output generic phrases like "Developer bookmark for..." or "Tool to...".
2. "tags": 2-4 lowercase relevant developer tags (e.g. ["typography", "animation", "canvas"], ["react", "ui", "tailwind"], ["database", "postgresql", "orm"]).
3. "category": Suggested folder/category (e.g. "design", "tools", "repo", "docs", "hosting", "prompts").

Bookmarks to enrich:
${JSON.stringify(
  bookmarks.map(b => ({
    id: b.id,
    title: b.title,
    url: b.url,
    pageDescription: b.pageDescription || "Not available",
    category: b.category || "tools"
  }))
)}

OUTPUT INSTRUCTION:
Return ONLY a valid JSON array of objects with keys: "id", "notes", "tags", "category".
Example:
[{"id": "...", "notes": "...", "tags": ["tag1", "tag2"], "category": "design"}]`;

  const model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You output only valid JSON arrays." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2048
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq enrichment failed (${res.status}): ${errorText}`);
  }

  const data: any = await res.json();
  const rawContent = data?.choices?.[0]?.message?.content || "";

  let parsed: any[] = [];
  try {
    const match = rawContent.match(/\[[\s\S]*\]/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      parsed = JSON.parse(rawContent);
    }
  } catch (err: any) {
    console.warn("[AiService] Failed to parse JSON from Groq response:", rawContent);
    throw err;
  }

  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Batch enrich bookmarks for a user, using live metadata scraping + Groq AI with clean fallback heuristics
 */
export async function enrichBookmarksBatch(
  userId: string,
  options: {
    category?: string;
    limit?: number;
    bookmarkIds?: string[];
  } = {}
): Promise<{ enrichedCount: number; bookmarks: any[] }> {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);

  // Target bookmarks with no notes OR with the legacy boilerplate template
  const whereClause: any = {
    userId,
    OR: [
      { notes: null },
      { notes: "" },
      { notes: { startsWith: "Developer bookmark for" } }
    ]
  };

  if (options.bookmarkIds && options.bookmarkIds.length > 0) {
    whereClause.id = { in: options.bookmarkIds };
    delete whereClause.OR;
  } else if (options.category && options.category.toLowerCase() !== "all") {
    whereClause.category = { equals: options.category, mode: "insensitive" };
  }

  const targets = await prisma.bookmark.findMany({
    where: whereClause,
    take: limit,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, url: true, category: true, tags: true }
  });

  if (targets.length === 0) {
    return { enrichedCount: 0, bookmarks: [] };
  }

  // Scrape live metadata for all targets in parallel (3s timeout)
  const metadataResults = await Promise.allSettled(
    targets.map(b => fetchUrlMetadata(b.url, 3000))
  );

  const targetsWithMeta = targets.map((b, idx) => {
    const metaRes = metadataResults[idx];
    const meta = metaRes.status === "fulfilled" ? metaRes.value : null;
    return {
      ...b,
      title: meta?.title && meta.title !== meta.domain ? meta.title : b.title,
      pageDescription: meta?.description || "",
      suggestedCategory: meta?.suggestedCategory || b.category || "tools"
    };
  });

  const apiKey = process.env.GROQ_API_KEY;
  let enrichedData: Array<{ id: string; notes: string; tags: string[]; category?: string }> = [];

  if (apiKey && apiKey !== "your_groq_api_key_here") {
    try {
      enrichedData = await generateNotesForBookmarks(targetsWithMeta, apiKey);
    } catch (err: any) {
      console.warn("[AiService] Groq batch enrichment failed, falling back to scraped page descriptions:", err.message);
    }
  }

  const finalUpdates: any[] = [];
  for (const b of targetsWithMeta) {
    const existingResult = enrichedData.find(item => item.id === b.id);
    let noteText = existingResult?.notes?.trim();
    let tagsList = Array.isArray(existingResult?.tags) ? existingResult.tags : [];
    let finalCategory = existingResult?.category || b.category || b.suggestedCategory || "tools";

    // If Groq didn't return a note, use the scraped page description or smart domain summary
    if (!noteText) {
      if (b.pageDescription && b.pageDescription.length > 10) {
        noteText = b.pageDescription;
      } else {
        let domain = "";
        try {
          domain = new URL(b.url).hostname.replace(/^www\./, "");
        } catch {
          domain = "web resource";
        }
        noteText = `${b.title || domain} - Web resource and developer utility.`;
      }
      tagsList = [finalCategory, (b.title || "").split(" ")[0].toLowerCase()].filter(Boolean);
    }

    const updated = await prisma.bookmark.update({
      where: { id: b.id },
      data: {
        title: b.title,
        notes: noteText,
        category: finalCategory.toLowerCase().trim(),
        tags: Array.from(new Set([...(b.tags || []), ...tagsList]))
      },
      include: {
        project: { select: { id: true, title: true } }
      }
    });

    finalUpdates.push(updated);
  }

  await prisma.activityLog.create({
    data: {
      userId,
      entityType: "BOOKMARK",
      entityId: "batch-ai",
      action: "UPDATED",
      title: `AI enriched ${finalUpdates.length} bookmarks with accurate notes`
    }
  }).catch(() => null);

  return {
    enrichedCount: finalUpdates.length,
    bookmarks: finalUpdates
  };
}
