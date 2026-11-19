# Research: Persisted Request Tracing

## SQLite request and trace persistence

**Decision**: Use SQLite as the durable source of truth via Node.js built-in `node:sqlite` and prepared statements. Persist each trace event with an explicit positive sequence number unique within its request. Retrieve with an explicit ascending `ORDER BY sequence`; do not infer order from timestamps, row IDs, or insertion order.

**Rationale**: SQLite only guarantees result order when an `ORDER BY` clause specifies it. An explicit per-request sequence captures execution order directly and makes the API's ordered trace contract deterministic. The built-in synchronous API matches the existing stores and avoids a new runtime dependency.

**Transaction boundaries**: Keep write transactions short and limited to related persistence changes. Persist the initial request before agent execution, without holding a transaction while the agent runs. When a trace event and request-state update are coupled, commit them atomically. Finalize request status and completion metadata in a short transaction. On a failed multi-statement write, roll back. Tests use an isolated in-memory database and reopen a temporary file-backed database to verify durability.

**Alternatives considered**:

- Ordering by event timestamps or SQLite row IDs: rejected because timestamps may tie and SQLite does not guarantee implicit result order.
- Holding one transaction for the full chat operation: rejected because it would keep a write lock open during potentially long agent/model work.
- Writing only JSON Lines: rejected because it does not provide transactional request lookup and structured request/trace retrieval.

Sources:

- [Node.js `node:sqlite`](https://nodejs.org/api/sqlite.html)
- [SQLite `SELECT` and `ORDER BY`](https://www.sqlite.org/lang_select.html#orderby)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite AUTOINCREMENT](https://www.sqlite.org/autoinc.html)

## Metadata-only JSON Lines logging

**Decision**: Emit one serialized JSON object followed by a newline per log event. Construct each record from an explicit metadata allowlist, including an opaque request ID where available; do not spread arbitrary event objects or serialize trace/request objects.

**Rationale**: JSON serialization preserves valid line structure without manual escaping. An allowlist makes it clear which values may leave the application through logs and prevents payload, prompt, answer, tool arguments/results, secrets, or raw exception messages from being copied into operational output. Logs supplement rather than replace the persistent trace.

**Alternatives considered**:

- Serializing complete trace events and redacting known sensitive fields: rejected because future fields could accidentally carry content; allowlisting metadata is safer.
- Manually concatenating JSON strings: rejected because escaping and line correctness are error-prone.
- Using logs as the source of truth: rejected because log output cannot be transactionally coupled to persisted request state.

Sources:

- [JSON Lines format](https://jsonlines.org/)
- [OWASP Logging Cheat Sheet: event attributes](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#event-attributes)
- [OWASP Logging Cheat Sheet: data to exclude](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)
