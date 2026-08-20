# Performance testing

These jobs are **opt-in**. `npm test` never seeds 1M documents and never starts k6.

Test assumptions (not claimed production traffic):

| Scenario | Concurrent VUs |
| --- | --- |
| A | 100 |
| B | 500 |
| C | 1000 |
| D | 2000 |

Mixed mix: 30% dashboard, 20% tasks, 10% projects, 10% meetings, 10% CRM, 5% finance, 5% assistant query, 5% notifications, 5% reminders.

## Dedicated database

Use a database whose name contains `performance`, for example `ai_md_performance`.

Do **not** point this at `md_ai_office`, `ai_md_test`, or production.

```bash
export PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance
npm run seed:performance -- --scale=small
npm run seed:performance -- --scale=medium
CONFIRM_PERF_SEED=YES npm run seed:performance -- --scale=large
```

Environment overrides: `PERF_USERS`, `PERF_TASKS`, `PERF_PROJECTS`, `PERF_MEETINGS`, `PERF_LEADS`, `PERF_OPPORTUNITIES`, `PERF_NOTIFICATIONS`, `PERF_REMINDERS`, `PERF_TRANSACTIONS`.

Default login after seed: `perf.user1@example.com` / `PerfPassword123!`

## Explain / indexes

```bash
PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run perf:explain
```

Writes `test-report/mongodb-explain-results.json`. Unexpected `COLLSCAN` is reported; indexes are not added blindly.

## Load tests (k6)

Install k6 separately (`brew install k6`). Start the API against the performance database, then:

```bash
TOKEN=<access token> k6 run -e BASE_URL=http://localhost:5000 -e VUS=100 -e DURATION=30s performance/load/mixed.load.js
```

Other files: `dashboard.load.js`, `tasks.load.js`, `assistant.load.js`, `notifications.load.js`, `whatsapp.load.js`.

```bash
npm run test:performance
```

records **executed / not_executed** in `test-report/performance-results.json`. It does not invent P95 numbers.

## Cleanup

```bash
CONFIRM_PERF_CLEANUP=YES PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run perf:cleanup
```

Refuses production, `md_ai_office`, and any database whose name does not contain `performance`.
