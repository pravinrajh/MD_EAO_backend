import { randomUUID } from "crypto";
import { logger } from "../config/logger";
import { employeeRepository } from "../repositories/employee.repository";
import { userRepository } from "../repositories/user.repository";
import type { EmployeeStatus, EmploymentType } from "../utils/constants";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { assertObjectId } from "../utils/objectId";
import { buildPaginationMeta, parsePagination } from "../utils/pagination";
import { nextEmployeeCode } from "../utils/sequence";

const MANAGER_CHAIN_LIMIT = 20;

type CreateEmployeeInput = {
  userId: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  phone?: string;
  department?: string;
  designation?: string;
  managerId?: string;
  joiningDate?: Date;
  employmentType: EmploymentType;
  location?: string;
  status?: EmployeeStatus;
  profileImage?: string;
};

type UpdateEmployeeInput = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  department?: string;
  designation?: string;
  managerId?: string | null;
  joiningDate?: Date;
  employmentType?: EmploymentType;
  location?: string;
  status?: EmployeeStatus;
  profileImage?: string;
};

function isDuplicateKey(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return Boolean(keyPattern?.[field] || keyValue?.[field]);
}

async function assertValidManager(managerId: string, employeeId?: string): Promise<void> {
  assertObjectId(managerId, "managerId");

  if (employeeId && managerId === employeeId) {
    throw new BadRequestError("An employee cannot be their own manager");
  }

  const manager = await employeeRepository.findById(managerId);
  if (!manager) {
    throw new BadRequestError("Manager not found", [{ field: "managerId", message: "Manager must be a valid employee" }]);
  }

  if (!employeeId) return;

  let current: string | null = manager.managerId ? String(manager.managerId) : null;
  const seen = new Set<string>([managerId]);

  for (let i = 0; i < MANAGER_CHAIN_LIMIT && current; i += 1) {
    if (current === employeeId) {
      throw new BadRequestError("Circular manager relationship is not allowed");
    }
    if (seen.has(current)) {
      throw new BadRequestError("Circular manager relationship is not allowed");
    }
    seen.add(current);
    const next = await employeeRepository.findById(current);
    current = next?.managerId ? String(next.managerId) : null;
  }
}

export const employeeService = {
  async list(query: Record<string, unknown>) {
    const { page, limit, skip } = parsePagination(query);

    const result = await employeeRepository.list({
      search: typeof query.search === "string" ? query.search : undefined,
      department: typeof query.department === "string" ? query.department : undefined,
      designation: typeof query.designation === "string" ? query.designation : undefined,
      status: query.status as EmployeeStatus | undefined,
      employmentType: query.employmentType as EmploymentType | undefined,
      managerId: typeof query.managerId === "string" ? query.managerId : undefined,
      skip,
      limit,
      sortBy:
        (query.sortBy as "createdAt" | "firstName" | "lastName" | "department" | "designation" | "employeeCode") ??
        "createdAt",
      sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
    });

    return {
      items: result.items,
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getById(id: string) {
    assertObjectId(id);
    const employee = await employeeRepository.findDetailedById(id);
    if (!employee) throw new NotFoundError("Employee not found");
    return employee;
  },

  async create(input: CreateEmployeeInput) {
    assertObjectId(input.userId, "userId");

    const user = await userRepository.findPublicById(input.userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const linked = await employeeRepository.findByUserId(input.userId);
    if (linked) {
      throw new ConflictError("User is already linked to an employee");
    }

    if (input.managerId) {
      await assertValidManager(input.managerId);
    }

    const displayName = input.displayName?.trim() || `${input.firstName} ${input.lastName}`.trim();

    const MAX_CODE_RETRIES = 3;
    let created = null;

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
      try {
        created = await employeeRepository.create({
          employeeId: randomUUID(),
          userId: input.userId,
          employeeCode: await nextEmployeeCode(),
          firstName: input.firstName,
          lastName: input.lastName,
          displayName,
          email: String(user.email),
          phone: input.phone ?? "",
          department: input.department ?? "",
          designation: input.designation ?? "",
          managerId: input.managerId ?? null,
          joiningDate: input.joiningDate ?? null,
          employmentType: input.employmentType,
          location: input.location ?? "",
          status: input.status ?? "ACTIVE",
          profileImage: input.profileImage ?? "",
        });
        break;
      } catch (error) {
        if (isDuplicateKey(error, "userId")) {
          throw new ConflictError("User is already linked to an employee");
        }
        if (isDuplicateKey(error, "employeeCode") && attempt < MAX_CODE_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new ConflictError("Unable to generate a unique employee code");
    }

    logger.info({ employeeId: String(created._id), userId: input.userId }, "Employee created");
    return employeeRepository.findDetailedById(String(created._id));
  },

  async update(id: string, input: UpdateEmployeeInput) {
    assertObjectId(id);
    const existing = await employeeRepository.findById(id);
    if (!existing) throw new NotFoundError("Employee not found");

    if (input.managerId) {
      await assertValidManager(input.managerId, id);
    }

    const patch: Record<string, unknown> = { ...input };
    if (input.firstName || input.lastName) {
      const firstName = input.firstName ?? existing.firstName;
      const lastName = input.lastName ?? existing.lastName;
      if (!input.displayName) {
        patch.displayName = `${firstName} ${lastName}`.trim();
      }
    }

    const updated = await employeeRepository.updateById(id, patch);
    if (!updated) throw new NotFoundError("Employee not found");

    logger.info({ employeeId: id }, "Employee updated");
    return employeeRepository.findDetailedById(id);
  },

  async updateStatus(id: string, status: EmployeeStatus) {
    assertObjectId(id);
    const updated = await employeeRepository.updateById(id, { status });
    if (!updated) throw new NotFoundError("Employee not found");
    logger.info({ employeeId: id, status }, "Employee status updated");
    return employeeRepository.toPublic(updated);
  },

  async remove(id: string) {
    assertObjectId(id);
    const updated = await employeeRepository.updateById(id, { status: "INACTIVE" });
    if (!updated) throw new NotFoundError("Employee not found");
    logger.info({ employeeId: id }, "Employee deactivated");
    return employeeRepository.toPublic(updated);
  },
};
