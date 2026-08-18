import type { Request, Response } from "express";
import { projectService } from "../services/project.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const projectController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await projectService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Projects fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.getById(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Project fetched successfully",
      data: project,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.create(req.body, actor(req));
    return sendSuccess({
      res,
      statusCode: 201,
      message: "Project created successfully",
      data: project,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({
      res,
      message: "Project updated successfully",
      data: project,
    });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.updateStatus(String(req.params.id), req.body.status, actor(req));
    return sendSuccess({
      res,
      message: "Project status updated successfully",
      data: project,
    });
  }),

  updateManager: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.updateManager(String(req.params.id), req.body.managerId, actor(req));
    return sendSuccess({
      res,
      message: "Project manager updated successfully",
      data: project,
    });
  }),

  updateMembers: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.updateMembers(String(req.params.id), req.body.members, actor(req));
    return sendSuccess({
      res,
      message: "Project members updated successfully",
      data: project,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.remove(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Project deleted successfully",
      data: project,
    });
  }),

  listTasks: asyncHandler(async (req: Request, res: Response) => {
    const result = await projectService.listTasks(
      String(req.params.id),
      req.query as Record<string, unknown>,
      actor(req),
    );
    return sendSuccess({
      res,
      message: "Project tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  taskSummary: asyncHandler(async (req: Request, res: Response) => {
    const data = await projectService.taskSummary(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Project task summary fetched successfully",
      data,
    });
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    const data = await projectService.summary(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Project summary fetched successfully",
      data,
    });
  }),
};
