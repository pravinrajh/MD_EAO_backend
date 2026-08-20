import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  MEETING_STATUSES,
  MEETING_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  USER_STATUSES,
} from "../utils/constants";
import {
  JWT,
  PUBLIC,
  created,
  idParam,
  item,
  jsonBody,
  jwtReadErrors,
  jwtWriteErrors,
  list,
  op,
  pageQuery,
  queryDateTime,
  queryEnum,
  queryObjectId,
  queryString,
  searchQuery,
  sortBy,
  sortOrder,
  success,
  type OperationObject,
  type ParameterObject,
} from "./helpers";

type PathItem = Partial<Record<"get" | "post" | "patch" | "put" | "delete", OperationObject>>;

function jwtOp(
  method: string,
  tag: string,
  summary: string,
  extra: Omit<OperationObject, "tags" | "summary" | "operationId" | "security"> & {
    roles?: string;
    public?: boolean;
    operationId?: string;
  },
): OperationObject {
  const description = [extra.description, extra.roles ? `Authorization: ${extra.roles}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return op({
    tags: [tag],
    summary,
    description: description || undefined,
    operationId: extra.operationId ?? `${method}_${tag}_${summary}`.replace(/[^A-Za-z0-9]+/g, "_"),
    security: extra.public ? PUBLIC : JWT,
    parameters: extra.parameters,
    requestBody: extra.requestBody,
    responses: extra.responses,
  });
}

function mergePaths(...groups: Record<string, PathItem>[]): Record<string, PathItem> {
  return Object.assign({}, ...groups);
}

const health: Record<string, PathItem> = {
  "/api/v1/health": {
    get: jwtOp("get", "Health", "API liveness", {
      public: true,
      description: "Does not expose secrets, MongoDB URIs, or environment values.",
      responses: { "200": item("Health", { example: { success: true, message: "API is healthy", data: { timestamp: "2026-08-21T10:00:00.000Z" } } }) },
    }),
  },
  "/api/v1/health/database": {
    get: jwtOp("get", "Health", "Database connectivity", {
      public: true,
      description: "Returns connected=true when MongoDB is reachable. Never returns the connection string.",
      responses: {
        "200": item("DatabaseHealth"),
        "503": { $ref: "#/components/responses/ServiceUnavailable" },
      },
    }),
  },
};

const auth: Record<string, PathItem> = {
  "/api/v1/auth/register": {
    post: jwtOp("post", "Authentication", "Register an employee account", {
      public: true,
      description: "Always creates role EMPLOYEE. Privileged users are created via POST /users or npm run create-admin.",
      requestBody: jsonBody("RegisterRequest", {
        name: "Priya Sharma",
        email: "priya@example.com",
        phone: "9876500801",
        password: "SecurePassword123",
      }),
      responses: {
        "201": created("AuthTokens"),
        "409": { $ref: "#/components/responses/Conflict" },
        "422": { $ref: "#/components/responses/ValidationError" },
        "429": { $ref: "#/components/responses/TooManyRequests" },
      },
    }),
  },
  "/api/v1/auth/login": {
    post: jwtOp("post", "Authentication", "Login", {
      public: true,
      requestBody: jsonBody("LoginRequest"),
      responses: {
        "200": item("AuthTokens", {
          example: {
            success: true,
            message: "Logged in successfully",
            data: {
              user: { id: "64f0c2a1b8e4d12a9c7f0011", name: "Priya Sharma", email: "priya@example.com", role: "ADMIN", status: "ACTIVE", isActive: true },
              accessToken: "<jwt>",
              refreshToken: "<refresh-token>",
            },
          },
        }),
        "401": { $ref: "#/components/responses/Unauthorized" },
        "422": { $ref: "#/components/responses/ValidationError" },
        "429": { $ref: "#/components/responses/TooManyRequests" },
      },
    }),
  },
  "/api/v1/auth/refresh": {
    post: jwtOp("post", "Authentication", "Refresh access token", {
      public: true,
      requestBody: jsonBody("RefreshRequest"),
      responses: {
        "200": item("AuthTokens"),
        "401": { $ref: "#/components/responses/Unauthorized" },
        "422": { $ref: "#/components/responses/ValidationError" },
        "429": { $ref: "#/components/responses/TooManyRequests" },
      },
    }),
  },
  "/api/v1/auth/me": {
    get: jwtOp("get", "Authentication", "Current user profile", {
      responses: { "200": item("User"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Authentication", "Update own profile (name, phone)", {
      requestBody: jsonBody("UpdateProfileRequest"),
      responses: { "200": item("User"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/auth/logout": {
    post: jwtOp("post", "Authentication", "Logout and revoke refresh token", {
      requestBody: jsonBody("LogoutRequest", undefined, false),
      responses: { "200": success(null), ...jwtWriteErrors },
    }),
  },
};

const users: Record<string, PathItem> = {
  "/api/v1/users": {
    get: jwtOp("get", "Users", "List users", {
      roles: "MD, ADMIN, MANAGER. EMPLOYEE cannot list users.",
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("role", ROLES),
        queryEnum("status", USER_STATUSES),
        sortBy(["createdAt", "name", "email", "role"]),
        sortOrder,
      ],
      responses: { "200": list("User"), ...jwtReadErrors },
    }),
    post: jwtOp("post", "Users", "Create user", {
      roles: "MD or ADMIN.",
      requestBody: jsonBody("CreateUserRequest"),
      responses: { "201": created("User"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/users/{id}/status": {
    patch: jwtOp("patch", "Users", "Update user status", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateUserStatusRequest"),
      responses: { "200": item("User"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/users/{id}": {
    get: jwtOp("get", "Users", "Get user", {
      roles: "MD, ADMIN, MANAGER.",
      parameters: [idParam],
      responses: { "200": item("User"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Users", "Update user", {
      roles: "MD or ADMIN. Password hashes are never returned.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateUserRequest"),
      responses: { "200": item("User"), ...jwtWriteErrors },
    }),
    delete: jwtOp("delete", "Users", "Deactivate user", {
      roles: "MD or ADMIN. Soft deactivation (isActive=false, status=INACTIVE).",
      parameters: [idParam],
      responses: { "200": item("User"), ...jwtWriteErrors },
    }),
  },
};

const employees: Record<string, PathItem> = {
  "/api/v1/employees": {
    get: jwtOp("get", "Employees", "List employees", {
      roles: "MD, ADMIN, MANAGER.",
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryString("department"),
        queryString("designation"),
        queryEnum("status", EMPLOYEE_STATUSES),
        queryEnum("employmentType", EMPLOYMENT_TYPES),
        queryObjectId("managerId"),
        sortBy(["createdAt", "firstName", "lastName", "department", "designation", "employeeCode"]),
        sortOrder,
      ],
      responses: { "200": list("Employee"), ...jwtReadErrors },
    }),
    post: jwtOp("post", "Employees", "Create employee profile", {
      roles: "MD or ADMIN. Links to an existing User via userId.",
      requestBody: jsonBody("CreateEmployeeRequest"),
      responses: { "201": created("Employee"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/employees/{id}/status": {
    patch: jwtOp("patch", "Employees", "Update employee status", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateEmployeeStatusRequest"),
      responses: { "200": item("Employee"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/employees/{id}": {
    get: jwtOp("get", "Employees", "Get employee", {
      roles: "MD, ADMIN, MANAGER.",
      parameters: [idParam],
      responses: { "200": item("Employee"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Employees", "Update employee", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateEmployeeRequest"),
      responses: { "200": item("Employee"), ...jwtWriteErrors },
    }),
    delete: jwtOp("delete", "Employees", "Remove employee", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("Employee"), ...jwtWriteErrors },
    }),
  },
};

const taskListQuery: ParameterObject[] = [
  ...pageQuery,
  searchQuery(),
  queryEnum("status", TASK_STATUSES),
  queryEnum("priority", TASK_PRIORITIES),
  queryObjectId("assignedTo"),
  queryObjectId("createdBy"),
  queryObjectId("projectId"),
  queryObjectId("customerId"),
  queryObjectId("meetingId"),
  queryDateTime("dueFrom"),
  queryDateTime("dueTo"),
  { name: "overdue", in: "query", schema: { type: "boolean" } },
  { name: "includeDeleted", in: "query", schema: { type: "boolean" } },
  sortBy(["createdAt", "dueDate", "priority", "status", "taskId", "title"]),
  sortOrder,
];

const myTaskQuery: ParameterObject[] = [
  ...pageQuery,
  queryEnum("status", TASK_STATUSES),
  queryEnum("priority", TASK_PRIORITIES),
  { name: "overdue", in: "query", schema: { type: "boolean" } },
  sortBy(["createdAt", "dueDate", "priority", "status", "taskId"]),
  sortOrder,
];

const tasks: Record<string, PathItem> = {
  "/api/v1/tasks/my": {
    get: jwtOp("get", "Tasks", "Tasks assigned to current user", {
      parameters: myTaskQuery,
      responses: { "200": list("Task"), ...jwtReadErrors },
    }),
  },
  "/api/v1/tasks/created-by-me": {
    get: jwtOp("get", "Tasks", "Tasks created by current user", {
      parameters: taskListQuery,
      responses: { "200": list("Task"), ...jwtReadErrors },
    }),
  },
  "/api/v1/tasks/overdue": {
    get: jwtOp("get", "Tasks", "Overdue tasks in caller scope", {
      parameters: taskListQuery,
      responses: { "200": list("Task"), ...jwtReadErrors },
    }),
  },
  "/api/v1/tasks/today": {
    get: jwtOp("get", "Tasks", "Tasks due today", {
      parameters: myTaskQuery,
      responses: { "200": list("Task"), ...jwtReadErrors },
    }),
  },
  "/api/v1/tasks/counts": {
    get: jwtOp("get", "Tasks", "Task counts for caller scope", {
      responses: { "200": item("TaskCounts"), ...jwtReadErrors },
    }),
  },
  "/api/v1/tasks": {
    get: jwtOp("get", "Tasks", "List tasks", {
      description: "Employees see assigned work. Managers see team/project scope. MD/ADMIN see company-wide.",
      parameters: taskListQuery,
      responses: {
        "200": list("Task", {
          example: {
            success: true,
            message: "Tasks fetched successfully",
            data: [{ taskId: "TASK-000001", title: "Call ABC Industries", priority: "HIGH", status: "PENDING" }],
            meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
          },
        }),
        ...jwtReadErrors,
      },
    }),
    post: jwtOp("post", "Tasks", "Create task", {
      roles: "MD, ADMIN, or MANAGER.",
      requestBody: jsonBody("CreateTaskRequest", {
        title: "Call ABC Industries",
        priority: "HIGH",
        assignedTo: "64f0c2a1b8e4d12a9c7f0011",
        dueDate: "2026-08-21T10:00:00.000Z",
      }),
      responses: { "201": created("Task"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/tasks/{id}/status": {
    patch: jwtOp("patch", "Tasks", "Update task status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateTaskStatusRequest"),
      responses: { "200": item("Task"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/tasks/{id}/assignee": {
    patch: jwtOp("patch", "Tasks", "Assign task", {
      roles: "MD, ADMIN, or MANAGER.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateTaskAssigneeRequest"),
      responses: { "200": item("Task"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/tasks/{id}": {
    get: jwtOp("get", "Tasks", "Get task", {
      parameters: [idParam],
      responses: { "200": item("Task"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Tasks", "Update task", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateTaskRequest"),
      responses: { "200": item("Task"), ...jwtWriteErrors },
    }),
    delete: jwtOp("delete", "Tasks", "Delete task", {
      roles: "MD or ADMIN. Soft delete.",
      parameters: [idParam],
      responses: { "200": item("Task"), ...jwtWriteErrors },
    }),
  },
};

const meetingListQuery: ParameterObject[] = [
  ...pageQuery,
  searchQuery(),
  queryEnum("status", MEETING_STATUSES),
  queryEnum("meetingType", MEETING_TYPES),
  queryObjectId("organizerId"),
  queryObjectId("participantId"),
  queryObjectId("projectId"),
  queryObjectId("customerId"),
  queryDateTime("from"),
  queryDateTime("to"),
  sortBy(["startTime", "endTime", "createdAt", "title", "status"]),
  sortOrder,
];

const projects: Record<string, PathItem> = {
  "/api/v1/projects": {
    get: jwtOp("get", "Projects", "List projects", {
      parameters: [
        ...pageQuery,
        searchQuery(),
        queryEnum("status", PROJECT_STATUSES),
        queryEnum("projectType", PROJECT_TYPES),
        queryObjectId("managerId"),
        queryObjectId("customerId"),
        queryString("location"),
        sortBy(["createdAt", "name", "status", "progress", "startDate", "expectedEndDate"]),
        sortOrder,
      ],
      responses: { "200": list("Project"), ...jwtReadErrors },
    }),
    post: jwtOp("post", "Projects", "Create project", {
      roles: "MD or ADMIN. Budget is whole INR integers.",
      requestBody: jsonBody("CreateProjectRequest"),
      responses: { "201": created("Project"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/projects/{id}/tasks/summary": {
    get: jwtOp("get", "Projects", "Project task summary", {
      parameters: [idParam],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/projects/{id}/tasks": {
    get: jwtOp("get", "Projects", "List project tasks", {
      parameters: [idParam, ...taskListQuery],
      responses: { "200": list("Task"), ...jwtReadErrors },
    }),
  },
  "/api/v1/projects/{id}/summary": {
    get: jwtOp("get", "Projects", "Project summary including health", {
      parameters: [idParam],
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/projects/{id}/meetings": {
    get: jwtOp("get", "Projects", "List project meetings", {
      parameters: [idParam, ...meetingListQuery],
      responses: { "200": list("Meeting"), ...jwtReadErrors },
    }),
  },
  "/api/v1/projects/{id}/status": {
    patch: jwtOp("patch", "Projects", "Update project status", {
      roles: "MD, ADMIN, or MANAGER.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateProjectStatusRequest"),
      responses: { "200": item("Project"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/projects/{id}/manager": {
    patch: jwtOp("patch", "Projects", "Change project manager", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateProjectManagerRequest"),
      responses: { "200": item("Project"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/projects/{id}/members": {
    patch: jwtOp("patch", "Projects", "Replace project members", {
      roles: "MD, ADMIN, or MANAGER. Maximum 50 members.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateProjectMembersRequest"),
      responses: { "200": item("Project"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/projects/{id}": {
    get: jwtOp("get", "Projects", "Get project", {
      parameters: [idParam],
      responses: { "200": item("Project"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Projects", "Update project", {
      roles: "MD, ADMIN, or MANAGER.",
      parameters: [idParam],
      requestBody: jsonBody("UpdateProjectRequest"),
      responses: { "200": item("Project"), ...jwtWriteErrors },
    }),
    delete: jwtOp("delete", "Projects", "Delete project", {
      roles: "MD or ADMIN. Soft delete.",
      parameters: [idParam],
      responses: { "200": item("Project"), ...jwtWriteErrors },
    }),
  },
};

const meetings: Record<string, PathItem> = {
  "/api/v1/meetings/today": {
    get: jwtOp("get", "Meetings", "Today's meetings", {
      parameters: meetingListQuery,
      responses: { "200": list("Meeting"), ...jwtReadErrors },
    }),
  },
  "/api/v1/meetings/upcoming": {
    get: jwtOp("get", "Meetings", "Upcoming meetings", {
      parameters: [...meetingListQuery, { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 90 } }],
      responses: { "200": list("Meeting"), ...jwtReadErrors },
    }),
  },
  "/api/v1/meetings/my": {
    get: jwtOp("get", "Meetings", "Meetings for current user", {
      parameters: meetingListQuery,
      responses: { "200": list("Meeting"), ...jwtReadErrors },
    }),
  },
  "/api/v1/meetings/calendar": {
    get: jwtOp("get", "Meetings", "Calendar range", {
      description: "`from` and `to` accept YYYY-MM-DD (APP_TIMEZONE day bounds) or ISO date-time. Maximum range is 93 days. Overlapping meetings are rejected on create/reschedule.",
      parameters: [
        { name: "from", in: "query", required: true, schema: { type: "string", example: "2026-08-01" } },
        { name: "to", in: "query", required: true, schema: { type: "string", example: "2026-08-31" } },
      ],
      responses: { "200": success({ type: "array", items: { $ref: "#/components/schemas/Meeting" } }), ...jwtReadErrors },
    }),
  },
  "/api/v1/meetings/counts": {
    get: jwtOp("get", "Meetings", "Meeting counts", {
      responses: { "200": success({ type: "object", additionalProperties: true }), ...jwtReadErrors },
    }),
  },
  "/api/v1/meetings": {
    get: jwtOp("get", "Meetings", "List meetings", {
      parameters: meetingListQuery,
      responses: { "200": list("Meeting"), ...jwtReadErrors },
    }),
    post: jwtOp("post", "Meetings", "Create meeting", {
      roles: "MD, ADMIN, or MANAGER. Times are stored as UTC; timezone is IANA (default APP_TIMEZONE).",
      requestBody: jsonBody("CreateMeetingRequest"),
      responses: { "201": created("Meeting"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/meetings/{id}/status": {
    patch: jwtOp("patch", "Meetings", "Update meeting status", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateMeetingStatusRequest"),
      responses: { "200": item("Meeting"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/meetings/{id}/reschedule": {
    patch: jwtOp("patch", "Meetings", "Reschedule meeting", {
      parameters: [idParam],
      requestBody: jsonBody("RescheduleMeetingRequest"),
      responses: { "200": item("Meeting"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/meetings/{id}/cancel": {
    patch: jwtOp("patch", "Meetings", "Cancel meeting", {
      parameters: [idParam],
      requestBody: jsonBody("CancelMeetingRequest"),
      responses: { "200": item("Meeting"), ...jwtWriteErrors },
    }),
  },
  "/api/v1/meetings/{id}": {
    get: jwtOp("get", "Meetings", "Get meeting", {
      parameters: [idParam],
      responses: { "200": item("Meeting"), ...jwtReadErrors },
    }),
    patch: jwtOp("patch", "Meetings", "Update meeting", {
      parameters: [idParam],
      requestBody: jsonBody("UpdateMeetingRequest"),
      responses: { "200": item("Meeting"), ...jwtWriteErrors },
    }),
    delete: jwtOp("delete", "Meetings", "Delete meeting", {
      roles: "MD or ADMIN.",
      parameters: [idParam],
      responses: { "200": item("Meeting"), ...jwtWriteErrors },
    }),
  },
};

export const corePaths = mergePaths(health, auth, users, employees, tasks, projects, meetings);
