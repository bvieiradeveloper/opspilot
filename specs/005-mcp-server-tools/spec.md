# Feature Specification: OpsPilot MCP Server Tools

**Feature Branch**: `[005-mcp-server-tools]`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "MCP server do OpsPilot: src/mcp/server.ts com @modelcontextprotocol/sdk. transport stdio, expondo list_alerts, open_incident e resolve_incident - reutilizando o mesmo OpsStore e os mesmos schemas zod das tools existentes (uma única fonte de verdade). Nome do server: opspilot. Script npm: mcp = \"tsx src/mcp/server.ts\" (se precisar de env, alterar o script e carregar elas antes). REGRA CRÍTICA: nenhum console.log no server - no stdio o stdout é o canal do protocolo; diagnostico vai para stderr. Test: sobre o server e valida a list de tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover and inspect operational tools (Priority: P1)

As an operator using an MCP-compatible client, I want to discover OpsPilot's alert and incident tools so that I can use its operational capabilities through the client.

**Why this priority**: Tool discovery is the entry point for every client interaction; without it, none of the exposed operations can be used.

**Independent Test**: Start the server as an MCP client process, complete a connection, and verify the advertised server identity and the three expected tool names.

**Acceptance Scenarios**:

1. **Given** an MCP-compatible client starts the OpsPilot server, **When** it establishes a session and requests the tool list, **Then** the server identifies itself as `opspilot` and advertises `list_alerts`, `open_incident`, and `resolve_incident`.
2. **Given** the client requests tool metadata, **When** the server returns the tool list, **Then** each tool has an input contract consistent with its existing OpsPilot operation.

---

### User Story 2 - Review current alerts (Priority: P1)

As an on-call operator, I want to list current alerts through my MCP client so that I can understand active operational conditions without switching interfaces.

**Why this priority**: Alert visibility is the primary read-only operational workflow and provides immediate value without changing incident state.

**Independent Test**: Invoke `list_alerts` through an MCP client against a controlled OpsPilot store and verify the returned alerts match the store's current alert data.

**Acceptance Scenarios**:

1. **Given** alerts are present in OpsPilot's operational state, **When** the client invokes `list_alerts`, **Then** the result contains the alerts allowed by the existing operation's input and output contract.
2. **Given** no alerts match the request, **When** the client invokes `list_alerts`, **Then** it receives a valid empty result rather than a protocol failure.

---

### User Story 3 - Open or resolve an incident (Priority: P2)

As an on-call operator, I want to open and resolve incidents through my MCP client so that I can carry out incident response actions from the same client where I review alerts.

**Why this priority**: Incident changes complete the operational workflow, while discovery and alert review establish the core usable integration first.

**Independent Test**: Invoke `open_incident` and `resolve_incident` through an MCP client against a controlled operational store, then verify the resulting incident state through the existing OpsPilot operations.

**Acceptance Scenarios**:

1. **Given** a valid request to open an incident, **When** the client invokes `open_incident`, **Then** the incident is created in OpsPilot's authoritative operational state and the client receives the existing operation's result.
2. **Given** an open incident identified by a valid request, **When** the client invokes `resolve_incident`, **Then** that incident is resolved in the same operational state and the client receives the existing operation's result.
3. **Given** an input is invalid or an incident cannot be resolved, **When** the client invokes the corresponding tool, **Then** the client receives an explicit failure and no success-shaped result is returned.

### Edge Cases

- The client starts the server but closes the connection before completing tool discovery; the server must not emit non-protocol text on its protocol output stream.
- A tool receives malformed or incomplete input; it must apply the same validation contract as the existing OpsPilot operation and report a failure through the protocol.
- `list_alerts` has no matching alerts; an empty result remains a successful operation.
- An incident identifier does not exist or is not in a resolvable state; the server reports the operation failure without changing unrelated incidents.
- A required runtime environment value is unavailable; startup must fail visibly through diagnostics on stderr rather than corrupting protocol output.
- Diagnostics are produced during startup or tool execution; they must be sent to stderr, never stdout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an MCP server named `opspilot` that communicates with its client over standard input and standard output.
- **FR-002**: The server MUST advertise exactly the three OpsPilot operations `list_alerts`, `open_incident`, and `resolve_incident`.
- **FR-003**: `list_alerts` MUST return alert data according to the existing OpsPilot operation's input and output contract.
- **FR-004**: `open_incident` MUST create an incident according to the existing OpsPilot operation's validation and domain rules, and return its operation result.
- **FR-005**: `resolve_incident` MUST resolve an eligible incident according to the existing OpsPilot operation's validation and domain rules, and return its operation result.
- **FR-006**: MCP tool calls MUST use the same authoritative operational state and validation contracts as the existing OpsPilot tools. The system MUST NOT introduce an independent incident state or a divergent second definition of those contracts.
- **FR-007**: The server MUST reserve stdout exclusively for MCP protocol messages. All diagnostic output MUST be written to stderr.
- **FR-008**: The project MUST provide an `npm run mcp` command to start the server. If startup requires environment variables, the command MUST load them before starting the server.
- **FR-009**: Automated tests MUST start the server through an MCP client, verify the server identity and advertised tool list, and exercise tool calls without requiring production data or a live external service.

### Key Entities

- **Alert**: An operational alert surfaced by OpsPilot, using the fields and filtering behavior of the existing alert-listing operation.
- **Incident**: An operational record that can be opened and later resolved through OpsPilot's existing incident rules.
- **MCP tool**: A discoverable client operation with a defined input contract and result or explicit failure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every clean-start discovery test, an MCP client identifies the server as `opspilot` and finds all three required tools.
- **SC-002**: In automated tests, 100% of the three advertised operations use the same validation and authoritative state as the corresponding existing OpsPilot operations.
- **SC-003**: For successful test calls, alert listings and incident changes are observable through the existing OpsPilot operations after the MCP call completes.
- **SC-004**: In startup and tool-call tests, zero diagnostic or non-protocol bytes are written to stdout; diagnostics, when emitted, are available on stderr.
- **SC-005**: The MCP client can start the server, list its tools, and invoke each advertised operation in the automated test environment without production data or external-service access.

## Assumptions

- An MCP-compatible client launches and owns the server process lifecycle over stdio.
- Existing OpsPilot alert and incident operations define the authoritative data and behavior; this feature exposes those capabilities rather than introducing new alert or incident semantics.
- The server reuses the application's configured operational store. If that store requires environment values at startup, the `mcp` command is responsible for loading them before launch.
- Authentication and remote network transport are outside this local stdio integration's scope.
