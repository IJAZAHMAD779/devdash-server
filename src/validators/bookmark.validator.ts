import { z } from "zod";

export const createBookmarkSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .min(1, "Title cannot be empty")
    .max(200, "Title cannot exceed 200 characters"),
  url: z
    .string({ required_error: "URL is required" })
    .url("Must be a valid URL"),
  category: z.string().min(1, "Category cannot be empty").max(50).default("tools"),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  projectId: z.string().uuid("Invalid project ID").optional().nullable(),
});

export const updateBookmarkSchema = createBookmarkSchema.partial();

export const bookmarkQuerySchema = z.object({
  category: z.string().optional(),
  projectId: z.string().uuid().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
