import { z } from "zod";

export const ProjectStatusEnum = z.enum([
  "PLANNING",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
]);

export type ProjectStatusType = z.infer<typeof ProjectStatusEnum>;

export const createProjectSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(100, "Title must be at most 100 characters"),
  description: z.string().trim().optional().nullable(),
  status: ProjectStatusEnum.default("PLANNING"),
  repositoryUrl: z
    .string()
    .trim()
    .url("Repository URL must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
  liveUrl: z
    .string()
    .trim()
    .url("Live URL must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
  techStack: z.array(z.string().trim()).default([]),
  favorite: z.boolean().default(false),
});

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(100, "Title must be at most 100 characters").optional(),
  description: z.string().trim().optional().nullable(),
  status: ProjectStatusEnum.optional(),
  repositoryUrl: z.string().trim().url("Repository URL must be a valid URL").optional().nullable().or(z.literal("")),
  liveUrl: z.string().trim().url("Live URL must be a valid URL").optional().nullable().or(z.literal("")),
  techStack: z.array(z.string().trim()).optional(),
  favorite: z.boolean().optional(),
});

export const queryProjectSchema = z.object({
  status: ProjectStatusEnum.optional(),
  search: z.string().trim().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type QueryProjectInput = z.infer<typeof queryProjectSchema>;
