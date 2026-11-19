# OpsStore and Agent Tool Contracts

These contracts describe the application-level behavior shared by the in-memory mock and
SQLite-backed implementation. All returned operational values are serialized from validated
domain records.

## OpsStore

The explicit store interface is synchronous to match `DatabaseSync` and the current mock.

| Operation | Input | Result and behavior |
|---|---|---|
| `listServices` | none | All services, ordered deterministically |
| `listAlerts` | optional `firing \| resolved \| all` status | Matching alerts; omitted status preserves the existing mock default |
| `listIncidents` | optional `open \| mitigated \| resolved \| all` filter | Matching incidents; omitted filter returns all for existing benchmark callers |
| `openIncident` | `{ title, service, severity }` | Persist/create an open incident; accepts the existing service's name or ID and rejects empty values, unknown service, and unsupported severity |
| `resolveIncident` | incident ID | Resolve an open or mitigated incident and set `resolvedAt`; rejects unknown or already-resolved IDs |
| `listRunbooks` | service name or ID | Matching runbooks in a deterministic array; empty when none match |
| `close` | none | Close the SQLite connection; the mock may implement a no-op if needed by shared lifecycle wiring |

`severity` accepts only `sev1`, `sev2`, or `sev3`. The store preserves domain error classes for
expected invalid operations. SQL errors not representing a domain violation remain explicit
storage failures and are not converted into success-shaped results.

## Agent Tools

All tool arguments are Zod-validated. Every input field has a `.describe()` explanation. Tool
descriptions cover six aspects: purpose, when to use, when not to use, meaning of every input,
allowed enum values/defaults, and preconditions or side effects.

| Tool | Input | Contract |
|---|---|---|
| `list_alerts` | `status`: `firing \| resolved \| all`, default `firing` | Returns alerts matching the status. Use to inspect monitor signals, not to create or resolve an incident. |
| `open_incident` | `title`: non-empty incident title; `service`: existing service name or ID; `severity`: `sev1 \| sev2 \| sev3` | Creates an open incident only when an alert or operational condition requires tracked response. Do not use for informational questions or to record a condition without an actionable incident. |
| `resolve_incident` | `id`: non-empty incident ID | Resolves an existing open incident; this is a state-changing operation and fails for unknown/already resolved IDs. |
| `list_incidents` | `status`: `open \| mitigated \| resolved \| all`, default `open` | Lists open incidents by default; explicitly choose mitigated, resolved, or all when reviewing other incident states. |
| `consultar_runbooks` | `service`: non-empty service name or ID | Returns runbooks for that service only; an empty list means no matching runbook is available. |

The status and severity field descriptions enumerate every valid value. Descriptions must not
claim that a read-only tool changes state.

## Persistence and Initialization

- `OPSPILOT_DB` selects the file-backed database; the default is `./data/opspilot.db`.
- `:memory:` creates an isolated, in-process database for tests.
- DDL is static and idempotent. All data statements use prepared SQL with bound parameters.
- Seed writes are transactional and use stable conflict keys with `ON CONFLICT ... DO NOTHING`.
- Database CHECK and foreign-key constraints are authoritative in addition to Zod validation.
