import { Request, Response, NextFunction } from "express";
import { ComponentFramework, ComponentStyling } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  CreateComponentInput,
  UpdateComponentInput,
} from "../validators/component.validator";

export const getComponents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { framework, styling, projectId, favorite, search, category } = req.query;

    const components = await prisma.uIComponent.findMany({
      where: {
        userId,
        ...(framework && { framework: framework as ComponentFramework }),
        ...(styling && { styling: styling as ComponentStyling }),
        ...(category && { category: String(category) }),
        ...(projectId && { projectId: String(projectId) }),
        ...(favorite !== undefined && { favorite: favorite === "true" }),
        ...(search && {
          OR: [
            { name: { contains: String(search), mode: "insensitive" } },
            { description: { contains: String(search), mode: "insensitive" } },
            { code: { contains: String(search), mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: components,
    });
  } catch (error) {
    return next(error);
  }
};

export const createComponent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const body: CreateComponentInput = req.body;

    if (body.projectId) {
      const projectExists = await prisma.project.findFirst({
        where: { id: body.projectId, userId },
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Project does not exist or is not accessible.",
          },
        });
      }
    }

    const component = await prisma.uIComponent.create({
      data: {
        userId,
        projectId: body.projectId || null,
        name: body.name,
        description: body.description ?? null,
        framework: (body.framework as ComponentFramework) || "REACT",
        styling: (body.styling as ComponentStyling) || "TAILWIND",
        code: body.code,
        previewCode: body.previewCode ?? null,
        category: body.category || "general",
        tags: body.tags ?? [],
        favorite: body.favorite ?? false,
        aiAgentPrompt: body.aiAgentPrompt ?? null,
        howToUse: body.howToUse ?? null,
        dependencies: body.dependencies ?? [],
        propsSchema: body.propsSchema ?? undefined,
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "COMPONENT",
          entityId: component.id,
          action: "CREATED",
          title: `Created component: ${component.name}`,
        },
      });
    } catch (logError) {
      console.warn("[ComponentController] Failed to record activity log:", logError);
    }

    return res.status(201).json({
      success: true,
      data: component,
    });
  } catch (error) {
    return next(error);
  }
};

export const getComponentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const component = await prisma.uIComponent.findFirst({
      where: { id, userId },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!component) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "UI component not found or you do not have permission to view it.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: component,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateComponent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const body: UpdateComponentInput = req.body;

    const existing = await prisma.uIComponent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "UI component not found or you do not have permission to modify it.",
        },
      });
    }

    if (body.projectId) {
      const projectExists = await prisma.project.findFirst({
        where: { id: body.projectId, userId },
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Project does not exist or is not accessible.",
          },
        });
      }
    }

    const updatedComponent = await prisma.uIComponent.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.framework !== undefined && {
          framework: body.framework as ComponentFramework,
        }),
        ...(body.styling !== undefined && {
          styling: body.styling as ComponentStyling,
        }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.previewCode !== undefined && { previewCode: body.previewCode }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.projectId !== undefined && { projectId: body.projectId || null }),
        ...(body.favorite !== undefined && { favorite: body.favorite }),
        ...(body.aiAgentPrompt !== undefined && { aiAgentPrompt: body.aiAgentPrompt }),
        ...(body.howToUse !== undefined && { howToUse: body.howToUse }),
        ...(body.dependencies !== undefined && { dependencies: body.dependencies }),
        ...(body.propsSchema !== undefined && { propsSchema: body.propsSchema }),
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "COMPONENT",
          entityId: updatedComponent.id,
          action: "UPDATED",
          title: `Updated component: ${updatedComponent.name}`,
        },
      });
    } catch (logError) {
      console.warn("[ComponentController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedComponent,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteComponent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.uIComponent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "UI component not found or you do not have permission to delete it.",
        },
      });
    }

    await prisma.uIComponent.delete({
      where: { id: existing.id },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "COMPONENT",
          entityId: id,
          action: "DELETED",
          title: `Deleted component: ${existing.name}`,
        },
      });
    } catch (logError) {
      console.warn("[ComponentController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "UI component deleted successfully",
      data: { id },
    });
  } catch (error) {
    return next(error);
  }
};
