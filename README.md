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

Default HTTP port is **5050**. macOS AirPlay Receiver already binds **5000** and Chrome will show `HTTP ERROR 403` / “Access to localhost was denied” if the API is pointed there.

Swagger UI: [http://localhost:5050/api-docs](http://localhost:5050/api-docs)

Optional Gemini (intent classification and spoken answers only; never MongoDB access):

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TIMEOUT_MS=4000
```

If `GEMINI_API_KEY` is empty, the existing rule-based assistant engines are used.

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

Dummy projects, tasks, and sales (leads / customers / opportunities):

```bash
npm run seed
```

Reads `seed/demo.json` and upserts into the development database (`md_ai_office`). Login examples: `md@office.local`, `admin@office.local`, `raj@office.local` — password `SecurePassword123`. Safe to run more than once. Does not touch production or the performance database.

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

A Project is a business operation. Tasks link to it with `Task.projectId` — projects do not embed task arrays. `projectId` values (`PROJ-000001`) use the same atomic counter. Money is stored as **integers in whole INR rupees** (no floating-point). `remainingBudget` is derived (`budget - actualExpense`). `actualExpense` is owned by Finance: completed project expenses increment it; it is not writable via Project PATCH.

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

## Finance & accounting

Foundation ledger only — not payroll, invoices, payment gateways, GST, or Tally.

**Money:** amounts are **integers in whole INR rupees** (same as Project `budget` and CRM `estimatedValue`). Never JavaScript floats. Every monetary record has `amount` + `currency` (INR). Transaction amounts are always **> 0**; direction comes from `type` (`INCOME` / `EXPENSE` / `TRANSFER`), not a negative sign.

**Balances:** `Account.currentBalance` starts as `openingBalance` and changes **only** through completed transactions (MongoDB `$inc` inside `withTransaction`). PATCH cannot set `currentBalance`, `openingBalance`, `code`, or `accountId`. Insufficient funds returns **409**. Inactive accounts cannot receive transactions.

**IDs:** `ACC-000001`, `CAT-000001`, `TXN-000001`, `BUD-000001` from the existing atomic counter — never `countDocuments() + 1`.

**Idempotency:** `Idempotency-Key` on income, expense, and transfer. The same key returns the existing transaction; it is unique when non-empty.

**Immutability:** `COMPLETED` transactions are historical records. Allowed status moves: `PENDING → COMPLETED | CANCELLED`. Completing twice does not credit the account twice (`findOneAndUpdate` claims `PENDING` first).

**Reports:** MongoDB aggregations only (no loading the collection into Node). Monthly grouping uses `APP_TIMEZONE` (default `Asia/Kolkata`). Customer finance is **recorded** income/expense, not accounts receivable.

**Authorization:** MD/ADMIN — full finance. MANAGER — accounts/categories list; post income/expense and budgets only for projects they manage; no transfers and no company-wide reports without a project they can access. EMPLOYEE — no chart of accounts; view project finance only when they belong to the project.

```http
GET    /api/v1/finance/accounts
POST   /api/v1/finance/accounts
GET    /api/v1/finance/accounts/:id
PATCH  /api/v1/finance/accounts/:id

GET    /api/v1/finance/categories
POST   /api/v1/finance/categories
GET    /api/v1/finance/categories/:id
PATCH  /api/v1/finance/categories/:id
DELETE /api/v1/finance/categories/:id

GET    /api/v1/finance/transactions
POST   /api/v1/finance/transactions/income
POST   /api/v1/finance/transactions/expense
POST   /api/v1/finance/transactions/transfer
GET    /api/v1/finance/transactions/:id
PATCH  /api/v1/finance/transactions/:id/status

GET    /api/v1/finance/budgets
POST   /api/v1/finance/budgets
GET    /api/v1/finance/budgets/:id
PATCH  /api/v1/finance/budgets/:id
DELETE /api/v1/finance/budgets/:id
GET    /api/v1/finance/budgets/:id/summary

GET    /api/v1/finance/summary
GET    /api/v1/finance/reports/monthly
GET    /api/v1/finance/reports/expenses-by-category
GET    /api/v1/finance/projects/:id/summary
GET    /api/v1/finance/customers/:id/summary
```

Generic `externalReference`, `referenceType`, and `referenceId` are reserved for a future Invoice or Tally connector. Do not add Tally-specific fields to the core models.

## Executive dashboard

Live MD dashboard. Values come from MongoDB aggregations over Tasks, Meetings, Projects, CRM, and Finance. Nothing is hardcoded. Money stays **integers in whole INR rupees**. Timezone is `APP_TIMEZONE` (default `Asia/Kolkata`).

MD/ADMIN see the company dashboard. MANAGER sees team/project-scoped data. EMPLOYEE sees only assigned work; company finance is not returned.

```http
GET /api/v1/dashboard
GET /api/v1/dashboard/md
GET /api/v1/dashboard/me
GET /api/v1/dashboard/attention
GET /api/v1/dashboard/project-health
GET /api/v1/dashboard/weekly-financial-requirement
GET /api/v1/dashboard/upcoming-meetings
GET /api/v1/dashboard/activity
GET /api/v1/dashboard/morning-report
```

Optional query: `date=YYYY-MM-DD`, `from`, `to`. Project health supports `page`, `limit` (max 50), `status`, `health` (`GREEN` / `YELLOW` / `RED`).

Project health is the existing `HEALTHY` / `ATTENTION` / `CRITICAL` rules, mapped to GREEN / YELLOW / RED for Flutter. Weekly cash need uses **completed and pending** finance transactions dated this week — payables/invoices are not invented.

There is no AuditLog yet; recent activity is a bounded merge of module timestamps. DashboardService methods are reusable for a later Assistant and WhatsApp layer. Redis is not required; cache key helpers exist for a later cache.

Optional large-data seed (not run automatically):

```bash
npm run seed:performance
```

## Assistant Query API

Read-only natural-language queries over live MongoDB data. The assistant never creates, updates, or deletes business records. The only write is `AssistantQuery` history (`QRY-000001`). Intent routing uses `RuleBasedQueryEngine`, with optional Gemini (`GEMINI_API_KEY`) as a classifier and response phrasing provider. Gemini never queries MongoDB or bypasses RBAC.

```http
POST /api/v1/assistant/query
POST /api/v1/ai/query
GET  /api/v1/assistant/history
```

`POST /query` is authenticated and rate-limited. Identify the user from `req.user.id` only — never from the body. History is the current user's queries only.

```json
{ "message": "What tasks are pending?", "conversationId": "CONV-001" }
```

Response `data` includes `queryId`, `intent`, `answer`, structured `data`, `sources`, and `confidence`. Flutter should use `data`, not parse the sentence.

Unsupported questions (for example weather) return intent `UNSUPPORTED` with confidence `0`. Write requests such as "create a task" remain unsupported on the Query API — use the Action API instead.

## Assistant Action API

Authenticated write path for the assistant. Natural language is never authorization and never a MongoDB command. Every action is: intent → entity resolution → module RBAC → whitelist DTO → existing business service.

```http
POST /api/v1/assistant/action
POST /api/v1/ai/action
POST /api/v1/assistant/action/:actionId/confirm
GET  /api/v1/assistant/actions/history
```

Identify the user from `req.user.id` only. Optional `Idempotency-Key` (max 128) returns the stored result and does not repeat the business write. Action IDs are `ACT-000001` from the `assistantActionId` counter (separate from CRM sales activity IDs).

Supported intents: create/update/assign/complete task; create/update/cancel meeting; create/update project; create/update lead, opportunity, and customer; create reminder. Finance writes, bulk deletes, and other destructive operations return `UNSUPPORTED`.

Cancel meeting (and completing/cancelling a project) returns `REQUIRES_CONFIRMATION`. Confirm is bound to `actionId` + current user; another user cannot confirm it. Query API stays read-only.

## Reminders and notifications

In-app reminders and notifications for tasks, meetings, CRM follow-ups, projects, and custom alerts. IDs are `REM-000001` and `NOTIF-000001` from atomic counters. A single interval worker claims due reminders with `findOneAndUpdate` so only one instance processes each row.

```http
GET    /api/v1/reminders
POST   /api/v1/reminders
GET    /api/v1/reminders/today
GET    /api/v1/reminders/upcoming
GET    /api/v1/reminders/:id
PATCH  /api/v1/reminders/:id
PATCH  /api/v1/reminders/:id/complete
PATCH  /api/v1/reminders/:id/cancel
PATCH  /api/v1/reminders/:id/snooze

GET    /api/v1/notifications
GET    /api/v1/notifications/unread-count
GET    /api/v1/notifications/:id
PATCH  /api/v1/notifications/:id/read
PATCH  /api/v1/notifications/:id/unread
PATCH  /api/v1/notifications/read-all
DELETE /api/v1/notifications/:id

GET    /api/v1/notification-preferences
PATCH  /api/v1/notification-preferences
```

`userId` / `recipientId` always come from `req.user.id`. In-app is the default channel. Email/SMS/push remain interfaces. WhatsApp can deliver proactive notifications when the user has linked an identity and `channels.whatsapp = true`. Recurring reminders keep one document and advance `nextRunAt`.

## WhatsApp Webhook API

WhatsApp is a transport, not a second AI. Incoming text is normalized, mapped to a linked user, then passed to the existing Assistant Query or Action services. No JWT is minted for the webhook; Meta signature + verify token are used instead.

```http
GET  /api/v1/webhooks/whatsapp
POST /api/v1/webhooks/whatsapp
POST /api/v1/whatsapp/link-code
DELETE /api/v1/whatsapp/link-code
```

Linking is explicit: authenticated users create a 6-digit code, then send `LINK 123456` from WhatsApp. Unknown numbers never receive company data.

## Swagger / OpenAPI

Interactive docs (disabled in production unless `SWAGGER_ENABLED=true`):

```http
GET /api-docs
GET /api-docs.json
```

Use the Authorize button with a JWT from `POST /api/v1/auth/login`. WhatsApp webhooks are documented as provider-signed, not JWT.

```bash
npm run swagger:validate
```

Set `SWAGGER_SERVER_URL` to the public origin in non-local environments. Never put secrets in the spec.

## Testing

Jest + Supertest. Automated suites use **MongoMemoryServer**, not the developer or production database. `.env.test` documents `ai_md_test` for any runner that points at a real MongoDB.

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:security
npm run test:coverage
npm run swagger:validate
```

`npm test` does not seed performance data and does not run k6.

## Performance testing

Dedicated database only (name must contain `performance`, example `ai_md_performance`). See `performance/README.md`.

```bash
PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run seed:performance -- --scale=small
PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run perf:explain
npm run test:performance
CONFIRM_PERF_CLEANUP=YES PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run perf:cleanup
```

Large seeds require `CONFIRM_PERF_SEED=YES`. Load tests need the k6 binary and a running API. Unrun jobs are recorded as **NOT EXECUTED** — numbers are never invented.

## Next phase

Step 16 — production hardening + Docker. Not implemented yet.
