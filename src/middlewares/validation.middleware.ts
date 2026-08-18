import type { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

type RequestPart = "body" | "query" | "params";

export function validate(schema: ZodSchema, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req[part]);
    req[part] = parsed as typeof req[typeof part];
    next();
  };
}
