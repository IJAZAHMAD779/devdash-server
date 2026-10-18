import { z } from "zod";

export const createNoteSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .min(1, "Title cannot be empty")
    .max(200, "Title cannot exceed 200 characters"),
  content: z
    .string({ required_error: "Content is required" })
    .min(1, "Content cannot be empty"),
  tags: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  projectId: z.string().uuid("Invalid project ID").optional().nullable(),
});

export const updateNoteSchema = createNoteSchema.partial();

export const noteQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  tag: z.string().optional(),
  favorite: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  search: z.string().optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
