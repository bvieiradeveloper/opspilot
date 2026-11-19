# Research: SQLite Operations Persistence

## Node.js `node:sqlite` compatibility

- **Decision**: Use the requested `DatabaseSync` class and declare Node.js 22 LTS as the minimum
  runtime, subject to the API version available in the supported Node 22 release.
- **Rationale**: The project constitution fixes the runtime baseline at Node.js 22, and the
  feature explicitly requires `DatabaseSync`. The current local validation runtime is Node.js
  24.12.0. The API and TypeScript declarations must be checked against the project's minimum
  runtime rather than assuming current Node documentation applies unchanged.
- **Alternatives considered**: Moving the project to Node 26 and using its newer `Database`
  spelling was rejected because it would violate the current runtime constraint and the
  requested API.
- **References**: [Node.js releases](https://nodejs.org/en/about/previous-releases),
  [Node 24 SQLite API](https://nodejs.org/download/release/v24.21.0/docs/api/sqlite.html),
  [Node SQLite API history](https://github.com/nodejs/node/blob/main/doc/api/sqlite.md).

## Prepared statements and parameter binding

- **Decision**: Prepare all data-select and data-mutation statements with `db.prepare()` and
  bind user/domain values through positional or named parameters. Keep the schema DDL static
  and execute it with `db.exec()`.
- **Rationale**: `StatementSync.get()` suits a single row, `.all()` suits bounded result sets,
  and `.run()` suits writes. Binding prevents SQL values from being interpreted as SQL.
  Prepared statements also permit stable query shapes for status filters without dynamic
  concatenation.
- **Alternatives considered**: Constructing a query string from a status was rejected even when
  the status is an enum; always use static statements and bound values.
- **References**: [Node SQLite statements](https://nodejs.org/api/sqlite.html#class-statementsync),
  [SQLite prepared statements](https://www.sqlite.org/c3ref/stmt.html).

## Schema constraints and relationships

- **Decision**: Express identifiers and relationships with primary keys, unique constraints,
  and foreign keys; enforce closed values with `CHECK` constraints. Enable foreign keys
  explicitly on each connection. Keep columns using SQLite-compatible scalar types and map
  returned rows into validated domain objects.
- **Rationale**: Database constraints protect persisted records independently of the callers.
  Foreign-key enforcement should be explicit per connection. Strict tables can improve type
  checks but are not required for this feature's contract.
- **Alternatives considered**: Relying only on Zod validation was rejected because direct SQL
  writes could otherwise persist invalid closed-domain values.
- **References**: [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html),
  [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html),
  [SQLite STRICT tables](https://www.sqlite.org/stricttables.html).

## Idempotent initialization and seed

- **Decision**: Create tables with `CREATE TABLE IF NOT EXISTS`; use stable seed IDs protected
  by uniqueness and targeted `ON CONFLICT(id) DO NOTHING` inserts. Run the multi-row seed in a
  transaction.
- **Rationale**: Repeated startup must not duplicate seed rows or overwrite operational
  changes. Targeted conflict handling ignores only duplicate seed identities, unlike broad
  `OR IGNORE`; a transaction prevents partially applied seed data.
- **Alternatives considered**: `INSERT OR REPLACE` was rejected because it deletes/replaces an
  existing conflicting row; `INSERT OR IGNORE` was rejected because it can mask unrelated
  constraint failures. `CREATE TABLE IF NOT EXISTS` is not a migration mechanism.
- **References**: [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html),
  [SQLite conflict resolution](https://www.sqlite.org/lang_conflict.html),
  [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html).

## File paths, memory mode, and transaction scope

- **Decision**: For a file-backed path, create its parent directory recursively before opening
  `DatabaseSync`; skip directory creation for `:memory:`. Wrap seed initialization in a short
  transaction, and expose an explicit close operation for the opened database.
- **Rationale**: SQLite accepts a filename but does not create missing parent directories.
  In-memory mode should not touch the filesystem. Transactions keep related seed writes
  atomic.
- **Alternatives considered**: Unconditional directory creation was rejected because
  `:memory:` is a SQLite special name and has no parent directory. `BEGIN IMMEDIATE` is not
  required for the initial seed because the default transaction is sufficient for this
  single-process synchronous application; contention can be revisited if concurrent writers
  become a measured concern.
- **References**: [Node fs mkdir](https://nodejs.org/api/fs.html#fspromisesmkdirpath-options),
  [Node SQLite constructor](https://nodejs.org/api/sqlite.html#new-databasepath-options),
  [SQLite transactions](https://www.sqlite.org/lang_transaction.html).

## Synchronous API and TypeScript

- **Decision**: Keep synchronous calls short and local, and map each query row explicitly to a
  Zod-validated domain object. Confirm `node:sqlite` declarations against the supported Node
  baseline during implementation.
- **Rationale**: `DatabaseSync` blocks the event loop. This feature is bounded to small local
  operations; explicit mapping avoids treating driver rows as already type-safe domain values.
  Runtime support and `@types/node` declarations are separate compatibility concerns.
- **Alternatives considered**: An asynchronous client or worker-thread design is unnecessary
  unless measurements show blocking or concurrency problems.
- **References**: [Node SQLite API](https://nodejs.org/api/sqlite.html),
  [DefinitelyTyped SQLite declarations](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/node/sqlite.d.ts).

## Repository findings and design consequences

- The current repository has no exported `OpsStore` interface; `src/agents/store.ts` returns a
  structurally typed object. Add a shared explicit contract rather than importing a nonexistent
  interface.
- The current mock source includes six services, including `catalog-api`, while the
  versioned domain model and feature request define five canonical seeded services. Keep
  `catalog-api` as a benchmark-only mock fixture; seed only the five canonical services in the
  persistent store.
- Current alerts use `critical`, `high`, and `medium`; benchmark incidents use `sev2`. The
  user selected one closed scale, `sev1 | sev2 | sev3`, so migrate seeded severities and
  benchmark expectations consistently. The mock remains the benchmark backing store.
- The existing agent strategy registry is constructed with default tools at module scope.
  Production composition must instead create its strategies with the configured SQLite store.
- No existing runbook model or table exists. Add a small runbook domain record keyed to one
  service, with stable seed IDs for checkout, payments, and authentication.
