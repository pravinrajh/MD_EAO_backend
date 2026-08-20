# Test reports

Generated artifacts live here and are gitignored except this README.

| File | Source |
| --- | --- |
| `integration-results.json` | `npm run test:coverage` (Jest `--json`) |
| `coverage/` | `npm run test:coverage` |
| `mongodb-explain-results.json` | `npm run perf:explain` |
| `performance-results.json` | `npm run test:performance` |

Unit, integration, security, and e2e results also appear in the Jest JSON when those suites run.

Do not commit seed dumps or 1M-document datasets.
