import type { FilterQuery } from "mongoose";
import { Employee, type EmployeeDocument } from "../models/Employee";
import { USER_SAFE_FIELDS, EMPLOYEE_SAFE_FIELDS, type EmployeeStatus, type EmploymentType } from "../utils/constants";
import { escapeRegex } from "../utils/pagination";
import { userRepository } from "./user.repository";

export type EmployeeListFilters = {
  search?: string;
  department?: string;
  designation?: string;
  status?: EmployeeStatus;
  employmentType?: EmploymentType;
  managerId?: string;
  skip: number;
  limit: number;
  sortBy: "createdAt" | "firstName" | "lastName" | "department" | "designation" | "employeeCode";
  sortOrder: "asc" | "desc";
};

const EMPLOYEE_UPDATE_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "phone",
  "department",
  "designation",
  "managerId",
  "joiningDate",
  "employmentType",
  "location",
  "status",
  "profileImage",
] as const;

const MANAGER_SAFE_FIELDS = "employeeCode firstName lastName displayName designation department status";

function pickEmployeeUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of EMPLOYEE_UPDATE_FIELDS) {
    if (input[field] !== undefined) {
      update[field] = input[field];
    }
  }
  return update;
}

function toPublic(employee: EmployeeDocument | Record<string, unknown>) {
  if (typeof (employee as EmployeeDocument).toJSON === "function") {
    const json = (employee as EmployeeDocument).toJSON() as Record<string, unknown>;
    if (json.userId) json.userId = String(json.userId);
    if (json.managerId) json.managerId = String(json.managerId);
    return json;
  }

  const record = { ...(employee as Record<string, unknown>) };
  record.id = String(record._id ?? record.id);
  if (record.userId) record.userId = String(record.userId);
  if (record.managerId) record.managerId = String(record.managerId);
  delete record._id;
  delete record.__v;
  return record;
}

export const employeeRepository = {
  findById(id: string) {
    return Employee.findById(id).select(EMPLOYEE_SAFE_FIELDS).lean();
  },

  findByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
    if (unique.length === 0) return Promise.resolve([]);
    return Employee.find({ _id: { $in: unique } }).select(EMPLOYEE_SAFE_FIELDS).lean();
  },

  findByUserId(userId: string) {
    return Employee.findOne({ userId }).select(EMPLOYEE_SAFE_FIELDS).lean();
  },

  findByCode(employeeCode: string) {
    return Employee.findOne({ employeeCode }).select(EMPLOYEE_SAFE_FIELDS).lean();
  },

  async findDetailedById(id: string) {
    const employee = await Employee.findById(id)
      .select(EMPLOYEE_SAFE_FIELDS)
      .populate({ path: "userId", select: USER_SAFE_FIELDS })
      .populate({ path: "managerId", select: MANAGER_SAFE_FIELDS })
      .lean();

    if (!employee) return null;

    const userDoc = employee.userId as unknown as Record<string, unknown> | null;
    const managerDoc = employee.managerId as unknown as Record<string, unknown> | null;

    return {
      ...toPublic({
        ...employee,
        userId: userDoc?._id ?? userDoc?.id,
        managerId: managerDoc?._id ?? managerDoc?.id ?? null,
      }),
      user: userDoc ? userRepository.toPublic(userDoc) : null,
      manager: managerDoc ? toPublic(managerDoc) : null,
    };
  },

  create(data: Record<string, unknown>) {
    return Employee.create(data);
  },

  async list(filters: EmployeeListFilters) {
    const query: FilterQuery<EmployeeDocument> = {};

    if (filters.department) query.department = filters.department;
    if (filters.designation) query.designation = filters.designation;
    if (filters.status) query.status = filters.status;
    if (filters.employmentType) query.employmentType = filters.employmentType;
    if (filters.managerId) query.managerId = filters.managerId;

    // Bounded regex search. Input is escaped and capped. Prefix match on email/employeeCode
    // can use indexes; unanchored name/phone scans cannot. Swap to Atlas Search later
    // without changing the API contract.
    if (filters.search) {
      const term = escapeRegex(filters.search);
      query.$or = [
        { firstName: { $regex: term, $options: "i" } },
        { lastName: { $regex: term, $options: "i" } },
        { displayName: { $regex: term, $options: "i" } },
        { email: { $regex: `^${term}`, $options: "i" } },
        { phone: { $regex: term } },
        { employeeCode: { $regex: `^${term}`, $options: "i" } },
      ];
    }

    const sort: Record<string, 1 | -1> = {
      [filters.sortBy]: filters.sortOrder === "asc" ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      Employee.find(query)
        .select(EMPLOYEE_SAFE_FIELDS)
        .sort(sort)
        .skip(filters.skip)
        .limit(filters.limit)
        .lean(),
      Employee.countDocuments(query),
    ]);

    return { items: items.map((item) => toPublic(item)), total };
  },

  updateById(id: string, input: Record<string, unknown>) {
    const update = pickEmployeeUpdate(input);
    return Employee.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
      },
    ).select(EMPLOYEE_SAFE_FIELDS);
  },

  exists(id: string) {
    return Employee.exists({ _id: id });
  },

  findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return Employee.find({ _id: { $in: ids } })
      .select("displayName firstName lastName employeeCode userId status")
      .lean();
  },

  findReportIds(managerEmployeeId: string) {
    return Employee.find({ managerId: managerEmployeeId }).select("_id").lean();
  },

  toPublic,
};
