import type { Request, Response } from "express";
import { employeeService } from "../services/employee.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const employeeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await employeeService.list(req.query as Record<string, unknown>);
    return sendSuccess({
      res,
      message: "Employees fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const employee = await employeeService.getById(String(req.params.id));
    return sendSuccess({
      res,
      message: "Employee fetched successfully",
      data: employee,
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const employee = await employeeService.create(req.body);
    return sendSuccess({
      res,
      statusCode: 201,
      message: "Employee created successfully",
      data: employee,
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const employee = await employeeService.update(String(req.params.id), req.body);
    return sendSuccess({
      res,
      message: "Employee updated successfully",
      data: employee,
    });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const employee = await employeeService.updateStatus(String(req.params.id), req.body.status);
    return sendSuccess({
      res,
      message: "Employee status updated successfully",
      data: employee,
    });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const employee = await employeeService.remove(String(req.params.id));
    return sendSuccess({
      res,
      message: "Employee deactivated successfully",
      data: employee,
    });
  }),
};
