import type { Request, Response } from "express";
import { invoiceService } from "../services/invoice.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function actor(req: Request) {
  return req.user!;
}

export const invoiceController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await invoiceService.list(req.query as Record<string, unknown>, actor(req));
    return sendSuccess({ res, message: "Invoices fetched successfully", data: result.items, meta: result.meta });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.getById(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Invoice fetched successfully", data: invoice });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.create(req.body, actor(req));
    return sendSuccess({ res, statusCode: 201, message: "Invoice created successfully", data: invoice });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.update(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Invoice updated successfully", data: invoice });
  }),
  recordPayment: asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.recordPayment(String(req.params.id), req.body, actor(req));
    return sendSuccess({ res, message: "Payment recorded successfully", data: invoice });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    const invoice = await invoiceService.remove(String(req.params.id), actor(req));
    return sendSuccess({ res, message: "Invoice deleted successfully", data: invoice });
  }),
};
