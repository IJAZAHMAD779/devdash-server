import { z } from "zod";

export const ComponentFrameworkEnum = z.enum([
  "REACT",
  "NEXTJS",
  "VUE",
  "SVELTE",
  "HTML_CSS",
]);

export const ComponentStylingEnum = z.enum([
  "TAILWIND",
  "CSS_MODULES",
  "VANILLA_CSS",
  "STYLED_COMPONENTS",
]);

export type ComponentFrameworkType = z.infer<typeof ComponentFrameworkEnum>;
export type ComponentStylingType = z.infer<typeof ComponentStylingEnum>;

export const createComponentSchema = z.object({
  name: z
    .string({ required_error: "Component name is required" })
    .trim()
    .min(1, "Component name cannot be empty")
    .max(120, "Component name must be at most 120 characters"),
  description: z.string().trim().optional().nullable(),
  framework: ComponentFrameworkEnum.default("REACT"),
  styling: ComponentStylingEnum.default("TAILWIND"),
  code: z
    .string({ required_error: "Component code is required" })
    .min(1, "Component code cannot be empty"),
  previewCode: z.string().trim().optional().nullable(),
  category: z.string().trim().default("general"),
  tags: z.array(z.string().trim()).default([]),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  favorite: z.boolean().default(false),
  aiAgentPrompt: z.string().trim().optional().nullable(),
  howToUse: z.string().trim().optional().nullable(),
  dependencies: z.array(z.string().trim()).default([]).optional(),
  propsSchema: z.any().optional().nullable(),
});

export const updateComponentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().optional().nullable(),
  framework: ComponentFrameworkEnum.optional(),
  styling: ComponentStylingEnum.optional(),
  code: z.string().min(1).optional(),
  previewCode: z.string().trim().optional().nullable(),
  category: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional().nullable(),
  favorite: z.boolean().optional(),
  aiAgentPrompt: z.string().trim().optional().nullable(),
  howToUse: z.string().trim().optional().nullable(),
  dependencies: z.array(z.string().trim()).optional(),
  propsSchema: z.any().optional().nullable(),
});

export const queryComponentSchema = z.object({
  framework: ComponentFrameworkEnum.optional(),
  styling: ComponentStylingEnum.optional(),
  category: z.string().trim().optional(),
  projectId: z.string().optional(),
  favorite: z.enum(["true", "false"]).optional(),
  search: z.string().trim().optional(),
});

export const synthesizeComponentSchema = z.object({
  code: z
    .string({ required_error: "Component code is required to synthesize" })
    .min(5, "Code snippet is too short to analyze"),
  targetFramework: z.enum(["REACT", "NEXTJS", "HTML_CSS"]).optional(),
  styling: z.enum(["TAILWIND", "VANILLA_CSS"]).optional(),
});

export const generateComponentSchema = z.object({
  prompt: z
    .string({ required_error: "Component prompt is required" })
    .min(3, "Prompt must be at least 3 characters"),
  category: z.string().trim().optional(),
  framework: z.enum(["REACT", "NEXTJS", "HTML_CSS"]).optional(),
  styling: z.enum(["TAILWIND", "VANILLA_CSS"]).optional(),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
export type QueryComponentInput = z.infer<typeof queryComponentSchema>;
export type SynthesizeComponentInput = z.infer<typeof synthesizeComponentSchema>;
export type GenerateComponentInput = z.infer<typeof generateComponentSchema>;

