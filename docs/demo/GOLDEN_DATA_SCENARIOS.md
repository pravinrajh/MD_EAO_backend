# ArchNova Golden Demo Scenarios

Demo company: **ArchNova Technologies LLP**  
Password (all ArchNova users): `ArchNovaDemo@2026`

## Golden identities

| Role | Email | Notes |
|---|---|---|
| MD | `md@archnova.com` | Venkatesh Menon |
| Admin | `admin@archnova.com` | |
| Sathish | `sathish@archnova.com` | Site Engineer; Construction |

Employee codes:

- Sathish: `AN-E-SATHISH` / `AN-EMP-SATHISH`

## Golden projects

| Scenario | projectId | code | Expected story |
|---|---|---|---|
| Healthy Chennai | `AN-PROJ-GOLDEN-VILLA` | `AN-CHN-VILLA` | Chennai Villa, ~₹2.5 Cr, ~78%, ACTIVE |
| At-risk OMR | `AN-PROJ-GOLDEN-OMR` | `AN-OMR-COMM` | OMR Commercial, ~₹8 Cr, ~42%, AT_RISK, overdue tasks |
| Cost-risk Coimbatore | `AN-PROJ-GOLDEN-CBE` | `AN-CBE-INT` | Interior, ₹80L budget, ~₹74L expense, ~55% |

Customers / leads / opportunities:

- Villa: `AN-CUST-GOLDEN-VILLA` / `AN-LEAD-GOLDEN-VILLA` / `AN-OPP-GOLDEN-VILLA`
- OMR: `AN-CUST-GOLDEN-OMR` / `AN-LEAD-GOLDEN-OMR` / `AN-OPP-GOLDEN-OMR`
- CBE: `AN-CUST-GOLDEN-CBE` / `AN-LEAD-GOLDEN-CBE` / `AN-OPP-GOLDEN-CBE`

## Sathish daily status fixtures

| Kind | ID |
|---|---|
| Today pending | `AN-TASK-GOLDEN-SATHISH-TODAY-PENDING` |
| Today completed | `AN-TASK-GOLDEN-SATHISH-TODAY-DONE` |
| Overdue | `AN-TASK-GOLDEN-SATHISH-OVERDUE` |
| In progress | `AN-TASK-GOLDEN-SATHISH-INPROG` |
| Today meeting | `AN-MTG-GOLDEN-SATHISH-TODAY` |

Linked project: `AN-PROJ-GOLDEN-OMR`

## Suggested demo questions (data-backed)

1. How is the Chennai Villa project?
2. How is the OMR Commercial project?
3. What needs attention today?
4. What is Sathish’s status today? *(tasks/meetings — no attendance model)*
5. What tasks are pending for Sathish?
6. Does Sathish have overdue tasks?
7. What meetings does Sathish have today?
8. How is sales performing / pipeline?
9. Which projects have financial risk?
10. Give me today’s / morning report.

## Create-task scenario

Use assistant action `CREATE_TASK` against live APIs (no hard-coded answers). Assignee search should resolve `Sathish`.
