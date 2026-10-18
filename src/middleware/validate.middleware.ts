import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

interface RequestValidationSchema {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

export const validate = (schema: RequestValidationSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as any;
      }
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join("."),
          issue: err.message,
        }));

        const firstMessage = error.errors[0]?.message || "Request validation failed";

        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: firstMessage,
            details,
          },
        });
      }
      return next(error);
    }
  };
};
