import { Request, Response, NextFunction } from "express";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { prisma } from "../lib/prisma";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Bearer token missing.",
        },
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication token is empty.",
        },
      });
    }

    let userId: string;
    const secretKey = process.env.CLERK_SECRET_KEY;
    const isPlaceholderSecret = !secretKey || secretKey.startsWith("sk_test_placeholder");

    // Development bypass for test tokens (e.g. Bearer dev_user_xxx or Bearer test_user_xxx)
    if (
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      (token.startsWith("dev_") || token.startsWith("test_") || isPlaceholderSecret)
    ) {
      userId = token.startsWith("dev_") || token.startsWith("test_") ? token : "user_devdash_dev";
    } else {
      try {
        const payload = await verifyToken(token, {
          secretKey,
          jwtKey: process.env.CLERK_JWT_KEY,
        });

        if (!payload || !payload.sub) {
          return res.status(401).json({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid token payload.",
            },
          });
        }
        userId = payload.sub;
      } catch (verifyError: any) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Token verification failed.",
            details: process.env.NODE_ENV === "development" ? verifyError.message : undefined,
          },
        });
      }
    }

    // Invariant 2 & ADR 005: Just-In-Time (JIT) Clerk User Synchronization
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        let email = `${userId}@devdash.local`;
        let name: string | null = null;
        let avatarUrl: string | null = null;

        if (secretKey && !isPlaceholderSecret) {
          try {
            const clerk = createClerkClient({ secretKey });
            const clerkUser = await clerk.users.getUser(userId);
            email = clerkUser.emailAddresses?.[0]?.emailAddress || email;
            name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
            avatarUrl = clerkUser.imageUrl || null;
          } catch {
            // Fallback silently if Clerk user fetch fails
          }
        }

        await prisma.user.upsert({
          where: { id: userId },
          update: {},
          create: {
            id: userId,
            email,
            name,
            avatarUrl,
          },
        });
      }
    } catch (upsertError) {
      console.error("[AuthMiddleware] JIT User Upsert Warning:", upsertError);
    }

    req.auth = { userId };
    return next();
  } catch (error) {
    return next(error);
  }
};
