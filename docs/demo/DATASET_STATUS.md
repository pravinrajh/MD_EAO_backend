# ArchNova Demo Dataset Status

Product / Assistant: **ViyanBuild / Viyan**  
Demo company narrative: **ArchNova Technologies LLP**

## Target database

- URI (default): `mongodb://127.0.0.1:27017/md_ai_office`
- Database name: `md_ai_office`
- Mode: upsert by ArchNova IDs / `@archnova.com` emails
- Does **not** overwrite `@office.local` or `SEED-*` identities
- Does **not** drop collections or delete unrelated data

## Commands

```bash
npm run seed:archnova
npm run seed:archnova:validate
python3 database/seed/verify_api_demo_data.py
```

Shared synthetic password for all ArchNova users: `ArchNovaDemo@2026`

Key logins:

- `md@archnova.com`
- `admin@archnova.com`
- `sathish@archnova.com`

## Domain readiness

| Domain | Model exists | Seeded | Notes |
|---|---|---|---|
| Users | YES | YES | Roles: MD / ADMIN / MANAGER / EMPLOYEE |
| Employees | YES | YES | `managerId` hierarchy; department string |
| Customers | YES | YES | Connected to leads/projects |
| Leads | YES | YES | Backend statuses only |
| Opportunities | YES | YES | Stages; optional project link |
| Sales Activities | YES | YES | |
| Projects | YES | YES | Existing projectType/status enums |
| Tasks | YES | YES | Overdue via dueDate + open status |
| Meetings | YES | YES | Action items via Task.meetingId |
| Accounts | YES | YES | opening/currentBalance consistent |
| Finance Categories | YES | YES | Land/Material/Labour/... as category docs |
| Finance Transactions | YES | YES | INCOME/EXPENSE/TRANSFER |
| Budgets | YES | YES | Linked to project + category |
| Notifications | YES | YES | |
| Reminders | YES | YES | |
| Collections/Invoices | NO | NO | **COLLECTIONS MODEL NOT AVAILABLE** |
| Vendors | NO | NO | Not available |
| Land parcels | NO | NO | Use `LAND_DEVELOPMENT` projects only |
| MD Notes | NO | NO | Not available |
| Attendance | NO | NO | Not available |
| Leave | NO | NO | Only `Employee.status=ON_LEAVE` possible later |

## Finance consistency rule

- `Project.actualExpense` = sum of **COMPLETED EXPENSE** transactions for that project
- `Account.currentBalance` = `openingBalance` + completed income − completed expense ± transfers

## AI employee daily status

`EMPLOYEE_DAILY_STATUS` intent is **not** implemented in backend.  
Sathish’s demo readiness is via existing tasks/meetings/projects data only (no attendance/leave).

## Limitations vs uploaded specification

- Spec company name NexoraFlow replaced by ArchNova per product instruction
- Spec lead statuses Site Visit/Proposal/Negotiation mapped via Opportunity + SalesActivity
- Collections, Vendors, Land, MD Notes, Attendance, Leave not seeded (no models)
