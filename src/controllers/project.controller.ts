import { Request, Response, NextFunction } from "express";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CreateProjectInput, UpdateProjectInput } from "../validators/project.validator";

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { status, search } = req.query;

    const projects = await prisma.project.findMany({
      where: {
        userId,
        ...(status && { status: status as ProjectStatus }),
        ...(search && {
          OR: [
            { title: { contains: String(search), mode: "insensitive" } },
            { description: { contains: String(search), mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    return next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const body: CreateProjectInput = req.body;

    const project = await prisma.project.create({
      data: {
        userId,
        title: body.title,
        description: body.description ?? null,
        status: body.status as ProjectStatus,
        repositoryUrl: body.repositoryUrl ?? null,
        liveUrl: body.liveUrl ?? null,
        techStack: body.techStack ?? [],
        favorite: body.favorite ?? false,
      },
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: project.id,
          action: "CREATED",
          title: `Created project: ${project.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    return next(error);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        tasks: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        snippets: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        components: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        notes: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        bookmarks: {
          where: { userId },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission to access it.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;
    const body: UpdateProjectInput = req.body;

    const existing = await prisma.project.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission to modify it.",
        },
      });
    }

    const updatedProject = await prisma.project.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status as ProjectStatus }),
        ...(body.repositoryUrl !== undefined && { repositoryUrl: body.repositoryUrl }),
        ...(body.liveUrl !== undefined && { liveUrl: body.liveUrl }),
        ...(body.techStack !== undefined && { techStack: body.techStack }),
        ...(body.favorite !== undefined && { favorite: body.favorite }),
      },
      include: {
        _count: {
          select: {
            tasks: true,
            snippets: true,
            components: true,
            notes: true,
            bookmarks: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: updatedProject.id,
          action: "UPDATED",
          title: `Updated project: ${updatedProject.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      data: updatedProject,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.userId;
    const { id } = req.params;

    const existing = await prisma.project.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission to delete it.",
        },
      });
    }

    await prisma.project.delete({
      where: {
        id: existing.id,
      },
    });

    // Log activity
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          entityType: "PROJECT",
          entityId: id,
          action: "DELETED",
          title: `Deleted project: ${existing.title}`,
        },
      });
    } catch (logError) {
      console.warn("[ProjectController] Failed to record activity log:", logError);
    }

    return res.status(200).json({
      success: true,
      message: "Project deleted successfully",
      data: {
        id,
      },
    });
  } catch (error) {
    return next(error);
  }
};
