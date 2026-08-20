import type { Role } from "../utils/constants";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
      };
      rawBody?: Buffer;
    }
  }
}

export {};
