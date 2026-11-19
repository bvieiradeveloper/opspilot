# Feature Specification: SQLite Operations Persistence

**Feature Branch**: `[003-sqlite-operations-persistence]`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Persistência real da operação: SqliteOpsStore implementa OpsStore via node:sqlite (DatabaseSync), caminho em OPSPILOT_DB (default ./data/opspilot.db); ':memory:' nos testes. Quatro tabelas services, alerts, incidents, runbooks espelhando o domínio atual; incidents ganha resolved_at e summary anuláveis; DDL idempotente; CHECK em todo campo fechado (tier, severity, status). Seed idempotente do cenário Mercadinho do Mock (5 serviços, 6 alertas: 3 firing, 3 resolved; runbooks de checkout/payment/auth). Prepared statement em toda query; sem SQL concatenado. Novas tools list_incidents(status open|resolved|all default open) e consultar_runbooks(service). Revisar descrições das tools pelas seis regras: orientar quando usar open_incident, descrever todos os campos e enumerar opções fechadas. Composição injeta SQLiteOpsStore; mock em memória continua disponível para testes e benchmarks reproduzíveis. Ignorar /data. Testar seed em memória, abrir/listar/resolver incidentes, filtros, CHECKs e tools em memória."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve operational state (Priority: P1)

As an on-call operator, I need alerts and incidents to remain available across application
restarts so that I can continue investigating and resolving production issues without losing
operational history.

**Why this priority**: Durable operational state is the core value of replacing the process-local
store.

**Independent Test**: Start the application against a temporary database, create and resolve an
incident, reopen the application against the same database, and verify that services, alerts, and
the incident retain their expected state.

**Acceptance Scenarios**:

1. **Given** a configured persistent database path, **When** the application starts, **Then**
   operational records are available from the database and remain available after restart.
2. **Given** the database has not yet been initialized, **When** the application starts, **Then**
   the required operational data structures are created without failing.
3. **Given** the initialization and seed have already run, **When** they run again, **Then** the
   database contains one copy of each seeded record and no duplicate seed records.

---

### User Story 2 - Inspect and manage incidents (Priority: P1)

As an on-call operator or agent, I need to open, list, filter, and resolve incidents so that I can
track active work and review completed incidents.

**Why this priority**: Incident lifecycle operations are essential to coordinating a response.

**Independent Test**: Using an isolated in-memory store, open an incident for a known service,
verify the default open-only listing and explicit filters, resolve the incident, and verify its
resolved timestamp and summary fields.

**Acceptance Scenarios**:

1. **Given** a known service, **When** an incident is opened, **Then** it is persisted with open
   status and the supplied title and severity.
2. **Given** open and resolved incidents, **When** `list_incidents` is invoked without a status,
   **Then** only open incidents are returned.
3. **Given** open and resolved incidents, **When** `list_incidents` is invoked with `open`,
   `resolved`, or `all`, **Then** only the requested matching incidents are returned.
4. **Given** an open or mitigated incident, **When** it is resolved, **Then** its status becomes
   resolved, `resolved_at` is set, and `summary` remains null because incident resolution does
   not yet capture a summary.
5. **Given** an unknown service, unknown incident, or already resolved incident, **When** an
   invalid lifecycle operation is attempted, **Then** the established domain error is surfaced
   and no unrelated record is modified.

---

### User Story 3 - Consult seeded operational guidance (Priority: P2)

As an on-call operator or agent, I need to retrieve the runbook for a service so that I can follow
the relevant response guidance while investigating an alert or incident.

**Why this priority**: Runbooks make incident response more consistent, while the service remains
useful for persistence and incident management without them.

**Independent Test**: Query the seeded checkout, payment, and authentication services and verify
   each returns its corresponding runbook; query an unknown service and verify an empty result.

**Acceptance Scenarios**:

1. **Given** a service with a seeded runbook, **When** `consultar_runbooks` is invoked for that
   service, **Then** the associated runbook is returned.
2. **Given** a service without a runbook, **When** `consultar_runbooks` is invoked, **Then** no
   unrelated service's runbook is returned and the result is empty.
3. **Given** the seed has run more than once, **When** runbooks are queried, **Then** each seeded
   runbook is present only once.

---

### User Story 4 - Reproduce operational test scenarios (Priority: P2)

As a developer, I need isolated in-memory scenarios for tests and benchmarks so that persistence
behavior can be verified and benchmark runs can be repeated without modifying real operational
data.

**Why this priority**: Reliable isolated scenarios protect persistent state and make verification
repeatable.

**Independent Test**: Run persistence and tool tests using an in-memory database, then run a
benchmark scenario twice and verify it uses the memory-backed store without changing the
configured persistent database.

**Acceptance Scenarios**:

1. **Given** a test or benchmark requests an in-memory store, **When** the store is initialized,
   **Then** it uses an isolated database and a repeatable scenario.
2. **Given** the existing process-local mock store is requested, **When** tests or benchmarks
   use it, **Then** it remains available and preserves their deterministic behavior.
3. **Given** the persistent database path is configured, **When** in-memory tests run, **Then**
   the persistent database file is not modified.

### Edge Cases

- A missing database-path setting uses `./data/opspilot.db`; a supplied path selects the
  configured persistent database.
- The persistent data directory does not exist when the application starts.
- The same seed is applied multiple times, including after application restarts.
- An invalid value is supplied for any closed domain field, including status, severity, or tier.
- An incident's `resolved_at` and `summary` are null before resolution; resolution sets
  `resolved_at` while `summary` remains null.
- Incident status accepts `open`, `mitigated`, or `resolved`; listing also accepts `all`.
- A runbook is requested for an unknown service or for a service without a runbook.
- User-provided values contain SQL syntax or delimiter characters.
- Independent in-memory stores are initialized in the same process and must not share records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST persist services, alerts, incidents, and runbooks in SQLite
  through the existing `OpsStore` contract, using Node.js `node:sqlite` and `DatabaseSync`.
- **FR-002**: The persistent database location MUST be configurable using `OPSPILOT_DB`; when
  unset, the application MUST use `./data/opspilot.db`.
- **FR-003**: Tests and benchmarks MUST be able to use an isolated SQLite in-memory database;
  the existing in-memory mock store MUST remain available for repeatable tests and benchmarks.
- **FR-004**: Initialization MUST create exactly the four required tables (`services`,
  `alerts`, `incidents`, and `runbooks`) and MUST be safe to run repeatedly.
- **FR-005**: The stored records MUST reflect the current service, alert, and incident domain
  fields; incidents MUST include nullable `resolved_at` and `summary` fields. Runbooks MUST be
  associated with a service.
- **FR-006**: Database constraints MUST reject values outside the defined closed sets for
  `tier`, `severity`, and each domain `status`. The closed values are: `tier` and `severity` =
  `sev1 | sev2 | sev3`; alert status = `firing | resolved`; incident status =
  `open | mitigated | resolved`.
- **FR-007**: The initial seed MUST be idempotent and MUST provide the Mercadinho do Mock
  scenario: five services, six alerts with exactly three `firing` and three `resolved`, and
  runbooks for checkout, payment, and authentication.
- **FR-008**: Every database query MUST use a prepared statement, and user-supplied values MUST
  NOT be concatenated into SQL statements.
- **FR-009**: The application composition MUST inject the SQLite-backed store where persistent
  operation is required.
- **FR-010**: The `list_incidents` tool MUST accept `open`, `mitigated`, `resolved`, or `all`,
  default to `open`, and return only incidents matching the requested filter.
- **FR-011**: The `consultar_runbooks` tool MUST retrieve runbook guidance for the requested
  service without returning guidance for unrelated services.
- **FR-012**: Tool descriptions MUST state when each tool is appropriate, describe every input
  field, and explicitly document the allowed values for closed-enum inputs. The `open_incident`
  description MUST explain when an incident should be opened.
- **FR-013**: The `/data` directory MUST be excluded from version control.
- **FR-014**: Persistence tests MUST cover in-memory initialization and seeding, opening,
  listing, filtering, and resolving incidents, closed-value constraints, and idempotence.
- **FR-015**: Existing tool tests MUST run against an isolated SQLite in-memory database and
  continue to pass.
- **FR-016**: Existing benchmark scenarios MUST remain reproducible using the in-memory mock
  store.

### Key Entities *(include if feature involves data)*

- **Service**: A monitored operation or system with an identifier, name, description, and a
  closed-set tier.
- **Alert**: A service-associated signal with an identifier, title, closed-set severity and
  status, creation time, and optional resolution time.
- **Incident**: A service-associated response record with an identifier, title, closed-set
  severity and status, creation time, nullable resolution time, and nullable summary.
- **Runbook**: Operational response guidance associated with a service, including the seeded
  checkout, payment, and authentication guidance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all persistence contract tests, every service, alert, incident, and runbook
  created before a restart remains available afterward.
- **SC-002**: Repeating initialization and seed any number of times leaves exactly five seeded
  services, six seeded alerts, and one copy of each seeded runbook.
- **SC-003**: All incident-list scenarios return the correct records for the default, `open`,
  `resolved`, and `all` filters.
- **SC-004**: All invalid values tested for closed domain fields are rejected, and valid values
  remain usable in their corresponding operations.
- **SC-005**: All three seeded service categories return the correct runbook, and no test
  returns a runbook for a different service.
- **SC-006**: Running the persistence and tool test suites leaves the configured persistent
  database unchanged when the tests use an in-memory store.

## Assumptions

- The new persistent store will preserve the existing domain error behavior and `OpsStore`
  contract unless a current contract gap prevents an explicitly requested capability.
- The established Mercadinho do Mock seed contains exactly five services; the existing
  six-alert scenario is retained with its three firing and three resolved alerts.
- The canonical SQLite in-memory database identifier is `:memory:`.
- The `data` directory is application data and is not committed to version control.
- Service tier, alert severity, and incident severity use the closed set `sev1`, `sev2`, and
  `sev3`. Existing alert seed severities and test scenarios will be migrated to this scale.
- The persistent SQLite seed contains the five services specified by the existing data-model
  document. The benchmark-only in-memory mock retains its existing `catalog-api` fixture to
  preserve benchmark scenarios that exercise that service.
