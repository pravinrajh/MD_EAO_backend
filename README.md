# AIBOtBackend — AI Executive Office API

Node.js + Express + MongoDB backend for the MD Management System.

Flutter and WhatsApp are interfaces. This API is the business brain.

## Phase 1 (current)

Foundation only:

- Express app with Helmet, CORS, compression, rate limiting
- MongoDB connection
- Environment validation (Zod)
- Structured logging (Pino, secrets redacted)
- Centralized error handling
- Standard API response format
- Health checks

## Run locally

```bash
cd AIBOtBackend
cp .env.example .env
npm install
npm run dev
```

Requires MongoDB at `mongodb://127.0.0.1:27017/md_ai_office`.

## Health

```http
GET /api/v1/health
GET /api/v1/health/database
```

## Authentication

Public register always creates `EMPLOYEE`. Privileged users (`MD` / `ADMIN`) are created with:

```bash
npm run create-admin
```

or `POST /api/v1/users` after an admin exists.

Access tokens live **15 minutes**. Refresh tokens live **7 days**, are stored hashed in MongoDB, and are **revoked on logout** (not client-only).

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

## Users

MD and ADMIN have full access. MANAGER can list and get. EMPLOYEE cannot manage users.

```http
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
PATCH  /api/v1/users/:id/status
```

DELETE is a soft deactivation (`isActive=false`, `status=INACTIVE`). Password hashes are never returned.

## Employees

Company profile is stored separately from the User account. `userId` is unique. Employee codes (`EMP-000001`) come from an atomic counter, not `countDocuments()`.

```http
GET    /api/v1/employees
POST   /api/v1/employees
GET    /api/v1/employees/:id
PATCH  /api/v1/employees/:id
DELETE /api/v1/employees/:id
PATCH  /api/v1/employees/:id/status
```

MANAGER can list and get employees. MD and ADMIN can create, update, deactivate, and change status.

## Tasks

Work assigned to employees. `assignedTo` references Employee. `createdBy` is always the authenticated user. `projectId` is optional until Project Management (Step 5). Task IDs (`TASK-000001`) use the same atomic counter as employee codes.

Overdue is derived (`status` is open and `dueDate` is in the past), never stored. Today's tasks use `APP_TIMEZONE` (default `Asia/Kolkata`). DELETE is a soft delete.

```http
GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/my
GET    /api/v1/tasks/created-by-me
GET    /api/v1/tasks/overdue
GET    /api/v1/tasks/today
GET    /api/v1/tasks/counts
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id/status
PATCH  /api/v1/tasks/:id/assignee
DELETE /api/v1/tasks/:id
```

MD and ADMIN manage all tasks. MANAGER creates and manages team tasks. EMPLOYEE can view and progress tasks assigned to them, not assign or delete.

## Projects

A Project is a business operation. Tasks link to it with `Task.projectId` — projects do not embed task arrays. `projectId` values (`PROJ-000001`) use the same atomic counter. Money is stored as **integers in whole INR rupees** (no floating-point). `remainingBudget` is derived (`budget - actualExpense`). `actualExpense` is not writable here; Finance will own it later.

```http
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
PATCH  /api/v1/projects/:id/status
PATCH  /api/v1/projects/:id/manager
PATCH  /api/v1/projects/:id/members
GET    /api/v1/projects/:id/tasks
GET    /api/v1/projects/:id/tasks/summary
GET    /api/v1/projects/:id/summary
GET    /api/v1/projects/:id/meetings
```

MD and ADMIN manage all projects. MANAGER can update projects they manage. EMPLOYEE can view projects they manage or belong to.

## Meetings

Scheduled business meetings. `organizerId` and `createdBy` come from the authenticated user. `participants` are Employee ids. Optional `projectId` links to Project without embedding meetings on the project. Meeting ids (`MTG-000001`) use the existing atomic counter. Conflict detection is a MongoDB overlap query, not an in-memory scan.

```http
GET    /api/v1/meetings
POST   /api/v1/meetings
GET    /api/v1/meetings/today
GET    /api/v1/meetings/upcoming
GET    /api/v1/meetings/my
GET    /api/v1/meetings/calendar
GET    /api/v1/meetings/counts
GET    /api/v1/meetings/:id
PATCH  /api/v1/meetings/:id
PATCH  /api/v1/meetings/:id/status
PATCH  /api/v1/meetings/:id/reschedule
PATCH  /api/v1/meetings/:id/cancel
DELETE /api/v1/meetings/:id
```

MD and ADMIN manage all meetings. MANAGER can create meetings and manage those they organize or that belong to projects they manage. EMPLOYEE can view meetings they organize or participate in.

## Sales & CRM

Leads, customers, opportunities, and sales activities. IDs (`LEAD-000001`, `CUST-000001`, `OPP-000001`, `ACT-000001`) use the same atomic counter as employees and tasks. Monetary values (`estimatedValue`, pipeline totals) are **integers in whole INR rupees**, matching Project. Weighted pipeline is computed in MongoDB aggregations and is not stored.

```http
GET    /api/v1/leads
POST   /api/v1/leads
GET    /api/v1/leads/:id
PATCH  /api/v1/leads/:id
PATCH  /api/v1/leads/:id/status
PATCH  /api/v1/leads/:id/follow-up
POST   /api/v1/leads/:id/convert
DELETE /api/v1/leads/:id

GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id
PATCH  /api/v1/customers/:id
PATCH  /api/v1/customers/:id/status
DELETE /api/v1/customers/:id

GET    /api/v1/opportunities
POST   /api/v1/opportunities
GET    /api/v1/opportunities/pipeline
GET    /api/v1/opportunities/forecast
GET    /api/v1/opportunities/:id
PATCH  /api/v1/opportunities/:id
PATCH  /api/v1/opportunities/:id/stage
DELETE /api/v1/opportunities/:id

GET    /api/v1/sales-activities
POST   /api/v1/sales-activities
GET    /api/v1/sales-activities/:id
PATCH  /api/v1/sales-activities/:id
PATCH  /api/v1/sales-activities/:id/status
DELETE /api/v1/sales-activities/:id

GET    /api/v1/sales/summary
GET    /api/v1/sales/my
GET    /api/v1/sales/follow-ups
```

MD and ADMIN have full CRM access. MANAGER manages team sales records. EMPLOYEE can create leads/activities and access records assigned to them. Conversion is idempotent: repeating `POST /leads/:id/convert` does not create a second customer or opportunity.

## Next phases

Finance, dashboard, assistant, WhatsApp, Swagger, Docker.
# MD_EAO_backend
