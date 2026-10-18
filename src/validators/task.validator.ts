import { z } from "zod";

export const TaskStatusEnum = z.enum([
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
]);

export const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export type TaskStatusType = z.infer<typeof TaskStatusEnum>;
export type PriorityType = z.infer<typeof PriorityEnum>;

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(150, "Title must be at most 150 characters"),
  description: z.string().trim().optional().nullable(),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  status: TaskStatusEnum.default("TODO"),
  priority: PriorityEnum.default("MEDIUM"),
  dueDate: z
    .string()
    .datetime({ message: "Due date must be a valid ISO datetime string" })
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(150, "Title must be at most 150 characters").optional(),
  description: z.string().trim().optional().nullable(),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  status: TaskStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  dueDate: z
    .string()
    .datetime({ message: "Due date must be a valid ISO datetime string" })
    .optional()
    .nullable()
    .or(z.literal("")),
  completedAt: z
    .string()
    .datetime({ message: "Completed at must be a valid ISO datetime string" })
    .optional()
    .nullable(),
});

export const patchTaskStatusSchema = z.object({
  status: TaskStatusEnum,
});

export const queryTaskSchema = z.object({
  projectId: z.string().optional(),
  status: TaskStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  search: z.string().trim().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type PatchTaskStatusInput = z.infer<typeof patchTaskStatusSchema>;
export type QueryTaskInput = z.infer<typeof queryTaskSchema>;
