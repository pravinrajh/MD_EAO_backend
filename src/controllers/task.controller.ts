import type { Request, Response } from "express";
import { taskService } from "../services/task.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const taskController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  myTasks: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.myTasks(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "My tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  createdByMe: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.createdByMe(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Created tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  overdue: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.overdue(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Overdue tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  today: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.today(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({
      res,
      message: "Today's tasks fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  counts: asyncHandler(async (req: Request, res: Response) => {
    const data = await taskService.counts(actor(req));
    return sendSuccess({
      res,
      message: "Task counts fetched successfully",
      data,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.getById(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Task fetched successfully",
      data: task,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.create(req.body, actor(req));
    return sendSuccess({
      res,
      statusCode: 201,
      message: "Task created successfully",
      data: task,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({
      res,
      message: "Task updated successfully",
      data: task,
    });
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.assign(String(req.params.id), req.body.assignedTo, actor(req));
    return sendSuccess({
      res,
      message: "Task assigned successfully",
      data: task,
    });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.updateStatus(String(req.params.id), req.body, actor(req));
    return sendSuccess({
      res,
      message: "Task status updated successfully",
      data: task,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.remove(String(req.params.id), actor(req));
    return sendSuccess({
      res,
      message: "Task deleted successfully",
      data: task,
    });
  }),
};
