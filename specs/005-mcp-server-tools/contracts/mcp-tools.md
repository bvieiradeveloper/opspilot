# MCP Tools Contract

The server identifies itself as `opspilot` and uses the MCP stdio transport. It advertises exactly the following three tools. The listed schemas describe the existing input contracts; implementation must reuse the corresponding Zod schemas rather than maintain another definition.

## `list_alerts`

- **Description**: Inspect monitor alerts; use for current or historical alert state, not to change incident state.
- **Input**:

| Field | Type | Required | Default | Constraints |
|---|---|---:|---|---|
| `status` | string enum | No | `firing` | `firing`, `resolved`, or `all` |

- **Success result**: Text content containing the JSON serialization of the matching alerts. An empty list is a successful result.
- **Failure result**: Explicit MCP tool failure if the input is invalid or the store operation fails.

## `open_incident`

- **Description**: Create a tracked incident for an actionable production condition requiring investigation or coordinated response.
- **Input**:

| Field | Type | Required | Constraints |
|---|---|---:|---|
| `title` | string | Yes | Trimmed, non-empty |
| `service` | string | Yes | Trimmed, non-empty identifier or name of an existing service |
| `severity` | string enum | Yes | `sev1`, `sev2`, or `sev3` |

- **Success result**: Text content containing the JSON serialization of the created incident.
- **Failure result**: Explicit MCP tool failure for invalid input or a domain failure such as an unknown service. No incident is created on failure.

## `resolve_incident`

- **Description**: Resolve an existing open or mitigated incident after its actionable impact has been addressed and verified.
- **Input**:

| Field | Type | Required | Constraints |
|---|---|---:|---|
| `id` | string | Yes | Trimmed, non-empty existing incident identifier |

- **Success result**: Text content containing the JSON serialization of the resolved incident.
- **Failure result**: Explicit MCP tool failure for invalid input, an unknown incident, or an already-resolved incident. No unrelated incident is changed.

## Transport and error behavior

- The client launches the server process and communicates using MCP over stdin/stdout.
- stdout contains only valid MCP protocol messages; no startup banner, diagnostic, or log output is written there.
- Diagnostics are sent to stderr.
- Tool results use MCP text content. Expected domain and input failures are represented as explicit tool errors, not successful-looking payloads.
