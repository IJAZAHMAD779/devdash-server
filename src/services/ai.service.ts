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
  type: "TASK" | "REMINDER" | "NOTE" | "SNIPPET" | "BOOKMARK" | "QUERY";
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

  const systemPrompt = `You are DevDash Copilot, an elite AI developer workspace assistant powered by Qwen on Groq.
You are embedded directly inside DevDash, a personal developer workspace platform.

CURRENT CONTEXT:
- Current Local Time: ${nowString} (${tzString})
- Available Projects in Workspace:
${userProjects.length > 0 ? userProjects.map(p => `  * ${p.title} (${p.status})`).join("\n") : "  (No projects yet)"}

CORE OBJECTIVES:
1. Boost developer productivity by turning natural language into immediate workspace actions.
2. Use tool calling to schedule reminders, add tasks, write notes, save snippets, and bookmark links.
3. For dates and relative times (e.g. "tomorrow at 9:00 AM", "in 2 hours", "next Monday"):
   - Always calculate the exact ISO 8601 UTC timestamp from the Current Local Time: ${nowString}.
4. Be concise, developer-centric, professional, and clear. Avoid fluffy conversational filler.
5. If the user asks you to do something actionable, invoke the appropriate tool.`;

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
