import { prisma } from "../lib/prisma";
import { Priority, TaskStatus } from "@prisma/client";

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
      description: "Schedule a time-based email reminder. Accurately converts natural language times ('tomorrow at 9am', 'in 3 hours', 'Friday at 2pm') into an ISO timestamp based on the provided current time.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Subject/topic of the reminder" },
          description: { type: "string", description: "Optional notes or instructions for the reminder" },
          remindAt: {
            type: "string",
            description: "Exact ISO 8601 UTC date-time string when the reminder should trigger (e.g. 2026-10-22T09:00:00.000Z)"
          },
          taskId: { type: "string", description: "Optional UUID of an associated task" }
        },
        required: ["title", "remindAt"]
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
      description: "Save a developer resource, documentation, or tool bookmark.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the bookmark or site" },
          url: { type: "string", description: "Full web URL" },
          category: {
            type: "string",
            description: "Category: 'tools', 'repo', 'design', 'hosting', 'prompts', 'cloud', 'docs'"
          },
          notes: { type: "string", description: "Optional notes about why this resource is useful" },
          projectName: { type: "string", description: "Optional project name" }
        },
        required: ["title", "url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_workspace",
      description: "Query the user's workspace to retrieve active projects, pending/overdue tasks, upcoming reminders, or recent notes.",
      parameters: {
        type: "object",
        properties: {
          entityType: {
            type: "string",
            enum: ["tasks", "projects", "reminders", "notes"],
            description: "The type of workspace entity to query"
          },
          filter: {
            type: "string",
            description: "Optional filter: 'pending', 'completed', 'overdue', 'recent', or a search term"
          },
          limit: { type: "number", description: "Max items to return (default 5, max 15)" }
        },
        required: ["entityType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_bookmark",
      description: "Update an existing bookmark's notes, category, tags, title, or favorite status.",
      parameters: {
        type: "object",
        properties: {
          bookmarkId: { type: "string", description: "UUID of the bookmark if known" },
          searchQuery: { type: "string", description: "Title or URL snippet to find the bookmark if ID is unknown" },
          notes: { type: "string", description: "Updated developer notes or summary" },
          category: { type: "string", description: "Category/folder for the bookmark" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for the bookmark" },
          title: { type: "string", description: "Updated title" },
          favorite: { type: "boolean", description: "Mark as favorite/starred" }
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
  userId: string
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
        const remindDate = new Date(args.remindAt);
        if (isNaN(remindDate.getTime())) {
          return { result: "Error: Invalid date format provided for remindAt." };
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

        const bookmark = await prisma.bookmark.create({
          data: {
            userId,
            title: args.title,
            url: args.url,
            category: args.category || "tools",
            notes: args.notes || null,
            projectId: projectId || null,
          }
        });

        return {
          result: `Bookmark created successfully: ID ${bookmark.id}, title "${bookmark.title}", URL "${bookmark.url}".`,
          action: {
            type: "BOOKMARK",
            id: bookmark.id,
            title: bookmark.title,
            details: { url: bookmark.url, category: bookmark.category },
            url: "/resources"
          }
        };
      }

      case "query_workspace": {
        const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 15);
        if (args.entityType === "tasks") {
          const whereClause: any = { userId };
          if (args.filter === "pending") whereClause.status = { not: "DONE" };
          if (args.filter === "completed") whereClause.status = "DONE";
          if (args.filter === "overdue") {
            whereClause.dueDate = { lt: new Date() };
            whereClause.status = { not: "DONE" };
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
              title: `Found ${tasks.length} tasks`,
              details: { tasks }
            }
          };
        } else if (args.entityType === "projects") {
          const projects = await prisma.project.findMany({
            where: { userId },
            take: limit,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, status: true, techStack: true }
          });
          return {
            result: JSON.stringify({ count: projects.length, projects }),
            action: {
              type: "QUERY",
              title: `Found ${projects.length} projects`,
              details: { projects }
            }
          };
        } else if (args.entityType === "reminders") {
          const reminders = await prisma.reminder.findMany({
            where: { userId, isSent: false },
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
        } else {
          const notes = await prisma.note.findMany({
            where: { userId },
            take: limit,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, tags: true }
          });
          return {
            result: JSON.stringify({ count: notes.length, notes }),
            action: {
              type: "QUERY",
              title: `Found ${notes.length} notes`,
              details: { notes }
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
        if (!bookmark && args.searchQuery) {
          bookmark = await prisma.bookmark.findFirst({
            where: {
              userId,
              OR: [
                { title: { contains: args.searchQuery, mode: "insensitive" } },
                { url: { contains: args.searchQuery, mode: "insensitive" } }
              ]
            }
          });
        }

        if (!bookmark) {
          return { result: `Bookmark matching "${args.bookmarkId || args.searchQuery}" not found.` };
        }

        const updated = await prisma.bookmark.update({
          where: { id: bookmark.id },
          data: {
            ...(args.notes !== undefined && { notes: args.notes }),
            ...(args.category !== undefined && { category: args.category.toLowerCase().trim() }),
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
          result: `Bookmark "${updated.title}" updated successfully with notes: "${updated.notes || "None"}".`,
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

  const nowString = clientTime || new Date().toISOString();
  const tzString = timezone || "UTC";

  const systemPrompt = `You are DevDash AI, an elite AI developer workspace assistant powered by Groq.
You are embedded directly inside DevDash, a personal developer workspace platform.

CURRENT CONTEXT:
- Current Local Time: ${nowString} (${tzString})
- Available Projects in Workspace:
${userProjects.length > 0 ? userProjects.map(p => `  * ${p.title} (${p.status})`).join("\n") : "  (No projects yet)"}

CORE CAPABILITIES & PERMISSIONS:
1. You have FULL PERMISSION to create, edit, update, and enrich workspace entities (bookmarks, tasks, notes, snippets, reminders).
2. NEVER tell the user "I only create, I cannot edit or update". You CAN update entities using your tools:
   - For updating bookmarks (adding notes, changing categories/tags): invoke 'update_bookmark' or 'enrich_bookmarks'.
   - For auto-generating notes for imported bookmarks: invoke 'enrich_bookmarks'.
   - For updating tasks (status, priority, due date): invoke 'update_task'.
   - For updating notes: invoke 'update_note'.
3. For dates and relative times (e.g. "tomorrow at 9:00 AM", "in 2 hours", "next Monday"):
   - Always calculate the exact ISO 8601 UTC timestamp from the Current Local Time: ${nowString}.
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
    responseData = await callGroq(apiKey, activeModel, messages);
  } catch (err: any) {
    console.warn(`[AiService] Primary model ${activeModel} failed: ${err.message}. Retrying with ${FALLBACK_MODEL}`);
    activeModel = FALLBACK_MODEL;
    responseData = await callGroq(apiKey, activeModel, messages);
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

      const { result, action } = await executeTool(toolName, args, userId);
      if (action) executedActions.push(action);

      // Append tool result
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: result
      });
    }

    // Call Qwen again to get final conversational summary of the actions
    try {
      const finalRes = await callGroq(apiKey, activeModel, messages);
      const finalReply = finalRes?.choices?.[0]?.message?.content || "Actions completed.";
      return {
        reply: finalReply,
        actions: executedActions,
        modelUsed: activeModel
      };
    } catch {
      return {
        reply: "Requested actions have been executed successfully in your workspace.",
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

async function callGroq(apiKey: string, model: string, messages: AiChatMessage[]): Promise<any> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      tools: AI_TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1024
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API responded with status ${res.status}: ${errorText}`);
  }

  return res.json();
}

/**
 * Call Groq to generate developer notes and tags for a list of bookmarks
 */
export async function generateNotesForBookmarks(
  bookmarks: Array<{ id: string; title: string; url: string; category?: string | null }>,
  apiKey: string
): Promise<Array<{ id: string; notes: string; tags: string[] }>> {
  if (!bookmarks.length) return [];

  const prompt = `You are a developer workspace intelligence system. For each developer bookmark below (given title, url, category), produce:
1. "notes": A crisp, high-value 1-2 sentence developer summary explaining what this tool, documentation, library, or website is and why developers use it.
2. "tags": 2-4 lowercase relevant developer tags (e.g., ["react", "ui", "tailwind"], ["database", "postgresql", "orm"]).

Bookmarks to enrich:
${JSON.stringify(bookmarks.map(b => ({ id: b.id, title: b.title, url: b.url, category: b.category })))}

OUTPUT INSTRUCTION:
Return ONLY a valid JSON array of objects with keys: "id", "notes", "tags".
Example:
[{"id": "...", "notes": "...", "tags": ["tag1", "tag2"]}]`;

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
 * Batch enrich bookmarks for a user, using Groq AI with clean fallback heuristics
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

  const whereClause: any = {
    userId,
    OR: [
      { notes: null },
      { notes: "" }
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

  const apiKey = process.env.GROQ_API_KEY;
  let enrichedData: Array<{ id: string; notes: string; tags: string[] }> = [];

  if (apiKey && apiKey !== "your_groq_api_key_here") {
    try {
      enrichedData = await generateNotesForBookmarks(targets, apiKey);
    } catch (err: any) {
      console.warn("[AiService] Groq batch enrichment failed, falling back to heuristic generator:", err.message);
    }
  }

  const finalUpdates: any[] = [];
  for (const b of targets) {
    const existingResult = enrichedData.find(item => item.id === b.id);
    let noteText = existingResult?.notes?.trim();
    let tagsList = Array.isArray(existingResult?.tags) ? existingResult.tags : [];

    if (!noteText) {
      let domain = "";
      try {
        domain = new URL(b.url).hostname.replace(/^www\./, "");
      } catch {
        domain = "web resource";
      }
      noteText = `Developer bookmark for ${b.title || domain} (${b.category || "tools"}).`;
      tagsList = [b.category || "tools", domain.split(".")[0]].filter(Boolean);
    }

    const updated = await prisma.bookmark.update({
      where: { id: b.id },
      data: {
        notes: noteText,
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
      title: `AI generated notes for ${finalUpdates.length} bookmarks`
    }
  }).catch(() => null);

  return {
    enrichedCount: finalUpdates.length,
    bookmarks: finalUpdates
  };
}
