import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CustomError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const code =
    err.code ||
    (statusCode === 404
      ? "NOT_FOUND"
      : statusCode === 401
      ? "UNAUTHORIZED"
      : statusCode === 403
      ? "FORBIDDEN"
      : statusCode === 400
      ? "VALIDATION_ERROR"
      : "INTERNAL_SERVER_ERROR");

  const message = err.message || "An unexpected server error occurred";

  if (process.env.NODE_ENV === "development" && statusCode >= 500) {
    console.error("[ErrorMiddleware]:", err);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  });
};
