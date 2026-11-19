# Data Model: OpsPilot MCP Server Tools

The MCP adapter introduces no new persisted entities. It exposes existing `OpsStore` data and uses the same input contracts as the current agent tools.

## Alert

- **Purpose**: Operational alert returned by `list_alerts`.
- **Fields**: `id`, `serviceId`, `title`, `status`, `severity`, `createdAt`, optional nullable `resolvedAt`.
- **Validation**: Existing `alertSchema`; status values are `firing` or `resolved`, and severity values are `sev1`, `sev2`, or `sev3`.
- **Query input**: `status` is `firing`, `resolved`, or `all`; it defaults to `firing`.
- **Persistence**: Read from the configured `OpsStore`; the MCP adapter creates no alert records.

## Incident

- **Purpose**: Operational incident created or transitioned by the two incident tools.
- **Fields**: `id`, `title`, `serviceId`, `severity`, `status`, `createdAt`, nullable `resolvedAt`, nullable `summary`.
- **Validation**: Existing `incidentSchema`; severity values are `sev1`, `sev2`, or `sev3`; status values are `open`, `mitigated`, or `resolved`.
- **Open input**: `title` and `service` are trimmed non-empty strings; `severity` uses the shared severity schema. The store requires the service to exist.
- **Resolve input**: `id` is a trimmed non-empty string. The store rejects unknown or already-resolved incidents.
- **State transitions**: `open_incident` creates an `open` incident. `resolve_incident` changes an eligible incident to `resolved` and sets `resolvedAt`; it does not change unrelated incidents.
- **Persistence**: Read and modified through the same configured `OpsStore` as the existing application operations.

## MCP tool invocation

- **Purpose**: Client request routed to an exposed operation.
- **Fields**: tool name, validated input object, and a result or explicit error.
- **Validation**: The input contract is the corresponding existing Zod schema, reused for MCP registration rather than copied.
- **State relationship**: Tool calls are operations over the shared `OpsStore`, not independently persisted entities.
- **Transport constraint**: Protocol messages use stdout; diagnostics use stderr.
