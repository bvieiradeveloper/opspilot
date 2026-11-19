# Quickstart: Validate SQLite Operations Persistence

## Prerequisites

- Use the project-supported Node.js 22 LTS runtime or a newer supported runtime.
- Install repository dependencies with `npm install` if they are not already present.
- For the persistent-store smoke test, set `OPSPILOT_DB` to a disposable database file path.

## Validation

1. Run the focused SQLite and tool tests:

   ```powershell
   node --import tsx --test src/store/sqlite-ops-store.test.ts src/agents/tools.test.ts
   ```

   Expected: in-memory initialization, idempotent seed, service/alert/runbook reads, incident
   open/list/filter/resolve behavior, closed-value rejection, and all operational tool cases
   pass without external network access.

2. Run the complete test suite and typecheck:

   ```powershell
   npm run test
   npm run typecheck
   ```

   Expected: existing deterministic agent and benchmark tests still pass, and TypeScript reports
   no errors.

3. Verify file-backed persistence using a temporary path:

   ```powershell
   $db = "$env:TEMP\opspilot-validation-$PID.db"
   $env:OPSPILOT_DB = $db
   npm run seed
   npm run seed
   Remove-Item Env:OPSPILOT_DB
   Remove-Item -LiteralPath $db
   ```

   Expected: each run reports five services and six alerts (three firing, three resolved),
   proving the configured store creates the file-backed schema and does not duplicate seeded
   records. The store tests separately verify isolated `:memory:` behavior and file-backed
   reopening.

4. Check the persistent database seed and closed-value constraints using the store tests. The
   tests should initialize the same temporary database twice and verify unchanged seed counts,
   then use a second connection to verify invalid `tier`, `severity`, and `status` values fail
   at the SQLite constraint boundary.

5. Confirm benchmark reproducibility:

   ```powershell
   npm run bench -- --scenario C1,C2,C3
   ```

   Expected: scenarios use the retained process-local mock, including its `catalog-api`
   fixture. The benchmark unit tests validate this behavior without network access; running the
   command interactively may require the model-provider environment configured for this project.

Refer to [data-model.md](./data-model.md) for the entities and
[contracts/ops-store-and-tools.md](./contracts/ops-store-and-tools.md) for tool/store contracts.
