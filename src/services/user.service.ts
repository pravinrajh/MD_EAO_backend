import bcrypt from "bcrypt";
import { logger } from "../config/logger";
import { userRepository } from "../repositories/user.repository";
import type { Role, UserStatus } from "../utils/constants";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";

const SALT_ROUNDS = 12;

type Actor = {
  id: string;
  role: Role;
};

function assertCanAssignRole(actor: Actor, targetUserId: string | null, newRole: Role | undefined): void {
  if (!newRole) return;

  if (targetUserId && actor.id === targetUserId) {
    throw new ForbiddenError("You cannot change your own role");
  }

  if (actor.role === "ADMIN" && newRole === "MD") {
    throw new ForbiddenError("Only MD can assign the MD role");
  }
}

export const userService = {
  async list(query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);

    const result = await userRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      role: query.role as Role | undefined,
      status: query.status as UserStatus | undefined,
      skip,
      limit,
      sortBy: (query.sortBy as "createdAt" | "name" | "email" | "role") ?? "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: result.items,
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string) {
    assertObjectId(id);
    const user = await userRepository.findPublicById(id);
    if (!user) throw new NotFoundError("User not found");
    return userRepository.toPublic(user);
  },

  async create(
    input: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      role: Role;
      status?: UserStatus;
    },
    actor: Actor,
  ) {
    assertCanAssignRole(actor, null, input.role);

    const email = input.email.toLowerCase().trim();
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError("Email is already registered");
    }

    const user = await userRepository.create({
      name: input.name,
      email,
      phone: input.phone ?? "",
      passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
      role: input.role,
      status: input.status,
    });

    logger.info({ userId: String(user._id), role: user.role }, "User created");
    return userRepository.toPublic(user);
  },

  async update(
    id: string,
    input: {
      name?: string;
      phone?: string;
      role?: Role;
      status?: UserStatus;
      isActive?: boolean;
    },
    actor: Actor,
  ) {
    assertObjectId(id);
    const existing = await userRepository.findPublicById(id);
    if (!existing) throw new NotFoundError("User not found");

    assertCanAssignRole(actor, id, input.role);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.role !== undefined) patch.role = input.role;
    if (input.status !== undefined) patch.status = input.status;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (input.status === "INACTIVE" || input.status === "SUSPENDED") {
      patch.isActive = false;
    }
    if (input.status === "ACTIVE") {
      patch.isActive = true;
    }
    if (input.isActive === false && input.status === undefined) {
      patch.status = "INACTIVE";
    }

    const updated = await userRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("User not found");

    logger.info({ userId: id }, "User updated");
    return userRepository.toPublic(updated);
  },

  async updateStatus(id: string, status: UserStatus, actor: Actor) {
    assertObjectId(id);
    if (actor.id === id && status !== "ACTIVE") {
      throw new ForbiddenError("You cannot deactivate your own account");
    }
    return this.update(id, { status }, actor);
  },

  async remove(id: string, actor: Actor) {
    assertObjectId(id);
    if (actor.id === id) {
      throw new ForbiddenError("You cannot deactivate your own account");
    }

    const updated = await userRepository.updateById(id, {
      isActive: false,
      status: "INACTIVE",
    });
    if (!updated) throw new NotFoundError("User not found");
    logger.info({ userId: id }, "User deactivated");
    return userRepository.toPublic(updated);
  },
};
