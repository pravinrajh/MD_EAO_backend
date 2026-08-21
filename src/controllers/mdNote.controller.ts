import type { Request, Response } from "express";
import { mdNoteService } from "../services/mdNote.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const mdNoteController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await mdNoteService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Notes fetched successfully", data: result.items, meta: result.meta });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    const note = await mdNoteService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Note fetched successfully", data: note });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const note = await mdNoteService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Note created successfully", data: note });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const note = await mdNoteService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Note updated successfully", data: note });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    const note = await mdNoteService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Note deleted successfully", data: note });
  }),
};
