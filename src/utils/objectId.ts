import mongoose from "mongoose";
import { BadRequestError } from "./errors";

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export function isObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value) && mongoose.Types.ObjectId.isValid(value);
}

export function assertObjectId(value: string, field = "id"): string {
  if (!isObjectId(value)) {
    throw new BadRequestError("Invalid identifier", [{ field, message: "Invalid MongoDB ObjectId" }]);
  }
  return value;
}
