import { z } from "zod";

export const createSnippetSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(120, "Title must be at most 120 characters"),
  description: z.string().trim().optional().nullable(),
  language: z
    .string({ required_error: "Language is required" })
    .trim()
    .min(1, "Language cannot be empty")
    .toLowerCase(),
  code: z
    .string({ required_error: "Code is required" })
    .min(1, "Code cannot be empty"),
  tags: z.array(z.string().trim()).default([]),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  favorite: z.boolean().default(false),
});

export const updateSnippetSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().optional().nullable(),
  language: z.string().trim().min(1).toLowerCase().optional(),
  code: z.string().min(1).optional(),
  tags: z.array(z.string().trim()).optional(),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  favorite: z.boolean().optional(),
});

export const querySnippetSchema = z.object({
  language: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  projectId: z.string().optional(),
  favorite: z.enum(["true", "false"]).optional(),
  search: z.string().trim().optional(),
});

export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;
export type UpdateSnippetInput = z.infer<typeof updateSnippetSchema>;
export type QuerySnippetInput = z.infer<typeof querySnippetSchema>;
