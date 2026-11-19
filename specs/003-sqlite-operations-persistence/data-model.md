# Data Model: SQLite Operations Persistence

The SQLite store persists the five canonical services and six canonical alerts in the feature
seed. The deterministic process-local mock remains available to tests and benchmarks; it
retains a benchmark-only `catalog-api` fixture so the existing catalog scenario remains
independent of the persistent seed.

## Service

Represents a monitored application or subsystem.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable non-empty primary key |
| `name` | string | Non-empty and unique |
| `description` | string | Human-readable operational context |
| `tier` | `sev1 \| sev2 \| sev3` | Required closed set enforced by the database |

Canonical persistent seed:

| ID | Name | Tier |
|---|---|---|
| `svc-payments` | `payments-api` | `sev1` |
| `svc-checkout` | `checkout-api` | `sev1` |
| `svc-identity` | `identity-service` | `sev1` |
| `svc-inventory` | `inventory-worker` | `sev2` |
| `svc-notifications` | `notification-service` | `sev3` |

## Alert

Represents a monitor signal associated with one service.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable non-empty primary key |
| `serviceId` | string | Required foreign key to `services.id` |
| `title` | string | Required non-empty summary |
| `status` | `firing \| resolved` | Closed set enforced by the database |
| `severity` | `sev1 \| sev2 \| sev3` | Required closed set enforced by the database |
| `createdAt` | ISO timestamp text | Required; stable timestamp for seed records |
| `resolvedAt` | ISO timestamp text or null | Null while firing; set for resolved seed records |

The seed contains exactly six alerts: three firing and three resolved. Existing severity labels
map to the chosen closed set as `critical -> sev1`, `high -> sev2`, and `medium -> sev3`.

## Incident

Represents an operator or agent response record for one service.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique ID generated for the persistent store; returned unchanged by operations |
| `title` | string | Required, trimmed, non-empty |
| `serviceId` | string | Required foreign key to an existing service |
| `severity` | `sev1 \| sev2 \| sev3` | Required closed set enforced by the database |
| `status` | `open \| mitigated \| resolved` | New incidents are open; open or mitigated incidents may be resolved |
| `createdAt` | ISO timestamp text | Required; set at creation |
| `resolvedAt` | ISO timestamp text or null | Null while open; set when resolved |
| `summary` | string or null | Null on creation and after resolution in this feature; resolution does not collect a summary |

Resolving an unknown or already resolved incident preserves the existing domain-error behavior.
`mitigated` is a valid persisted and filterable state; a mitigation-transition operation is out
of scope.
The default no-filter `OpsStore.listIncidents()` behavior remains an all-incidents listing for
existing benchmark callers; the `list_incidents` tool applies the `open` default explicitly.

## Runbook

Represents operational guidance for a service.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable non-empty primary key |
| `serviceId` | string | Required unique foreign key to `services.id`; at most one seeded runbook per service |
| `title` | string | Required non-empty operational topic |
| `content` | string | Required human-readable response guidance |

Seeded runbooks cover checkout (`svc-checkout`), payment (`svc-payments`), and authentication
(`svc-identity`). Looking up an unknown service or a service without a runbook returns an empty
list.

## Relationships and Database Constraints

- `services.id`, `alerts.id`, `incidents.id`, and `runbooks.id` are primary keys.
- `services.name` is unique.
- `alerts.service_id`, `incidents.service_id`, and `runbooks.service_id` reference
  `services.id`; runbook service IDs are unique.
- Service tiers and alert/incident severities accept only `sev1`, `sev2`, or `sev3`.
- Alert statuses accept only `firing` or `resolved`; incident statuses accept only `open`,
  `mitigated`, or `resolved`.
- Nullable columns are stored as SQL `NULL` and mapped into the domain's nullable/optional
  representation.
- All timestamps use ISO-8601 UTC text to match the current domain representation.

## Seed Invariants

- Exactly five canonical persistent services and six canonical alerts exist after seed.
- The six alerts comprise exactly three `firing` and three `resolved`.
- Each alert, incident, and runbook references an existing service.
- Exactly three seeded runbooks cover checkout, payment, and authentication.
- Seed IDs are stable; repeated initialization does not duplicate or overwrite records.
