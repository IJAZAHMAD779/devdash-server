import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { runAiCommand } from "../services/ai.service";

const aiCommandSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000),
  clientTime: z.string().optional(),
  timezone: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string()
      })
    )
    .optional()
    .default([])
});

/**
 * POST /api/v1/ai/command
 * Process natural language command via Groq Qwen with tool execution
 */
export const executeAiCommand = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.auth!.userId;

    const validated = aiCommandSchema.parse(req.body);

    const result = await runAiCommand(
      userId,
      validated.message,
      validated.clientTime,
      validated.timezone,
      validated.history as any
    );

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.errors[0]?.message || "Invalid input"
        }
      });
    }

    if (error.message?.includes("GROQ_API_KEY is not configured")) {
      return res.status(503).json({
        success: false,
        error: {
          code: "AI_SERVICE_UNCONFIGURED",
          message: "Groq API key is not configured on the server. Please add GROQ_API_KEY to your environment."
        }
      });
    }

    return next(error);
  }
};

/**
 * GET /api/v1/ai/status
 * Check if AI service is ready and configured
 */
export const getAiStatus = async (
  _req: Request,
  res: Response
) => {
  const isConfigured = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0);
  const model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

  return res.status(200).json({
    success: true,
    data: {
      configured: isConfigured,
      model,
      provider: "Groq"
    }
  });
};
