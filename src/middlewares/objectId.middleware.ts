import type { NextFunction, Request, Response } from "express";
import { assertObjectId } from "../utils/objectId";

export function validateObjectIdParam(req: Request, _res: Response, next: NextFunction): void {
  assertObjectId(String(req.params.id));
  next();
}
