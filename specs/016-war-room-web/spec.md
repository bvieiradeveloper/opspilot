# Feature Specification: War Room Web Console

**Feature Branch**: `[016-war-room-web]`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "War room web para operações de plantão com chat contextual, auditoria do trace, aprovação humana de ações, configuração da URL da API, suporte a Markdown, tema escuro, acessibilidade e tratamento de erros."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Converse with the on-call agent (Priority: P1)

As an on-call operator, I want to ask the agent questions in a central conversation view so that I can investigate production events without losing the context of the current conversation.

**Why this priority**: The chat is the primary workflow; all other capabilities support understanding or safely acting on its responses.

**Independent Test**: Submit a message to a test chat service, verify the request includes the required conversation context, and verify the returned answer is readable and associated with that conversation.

**Acceptance Scenarios**:

1. **Given** the operator opens the console with no messages, **When** the chat is ready, **Then** an empty state explains how to start a conversation and provides a usable message input.
2. **Given** a valid message and no active conversation, **When** the operator submits it, **Then** the initial chat request includes the `message`, the service applies the installation's configured operator identity, and the returned `conversationId` is used for subsequent messages.
3. **Given** a valid message and an active conversation, **When** the operator submits it, **Then** the chat request includes `conversationId` and `message`, the service applies the same configured operator identity, and the submitted message appears once in the conversation.
4. **Given** the agent is processing a message, **When** the request is pending, **Then** a visible loading state is shown and duplicate submission is prevented.
5. **Given** a successful response containing Markdown, **When** it is displayed, **Then** headings or emphasis, lists, tables, and fenced code blocks remain legible and correctly formatted.
6. **Given** the chat service returns an error or cannot be reached, **When** the request fails, **Then** the operator sees a clear error state and can retry without losing the submitted message or existing conversation, and a retry does not create a duplicate turn or action.

### User Story 2 - Inspect the execution trace (Priority: P2)

As an on-call operator, I want to inspect the reasoning trace for each assistant response so that I can audit which tools were used, with what arguments, and what they returned.

**Why this priority**: Trace visibility helps operators validate agent conclusions before taking operational action.

**Independent Test**: Display a canned assistant response with a mixed trace and verify the operator can open its trace panel and inspect events in their original order.

**Acceptance Scenarios**:

1. **Given** an assistant response with a trace, **When** the operator selects its "Ver raciocínio" action, **Then** an expandable side panel shows that response's trace without obscuring the conversation.
2. **Given** trace events of types thought, action, observation, and answer, **When** the trace is rendered, **Then** each event is visually categorized as thought, action, observation, or response, and event order is preserved.
3. **Given** an action event and a corresponding observation, **When** the operator inspects them, **Then** the tool name, complete arguments, and returned observation are available to read.
4. **Given** a trace includes other supported event types or no events, **When** the panel is opened, **Then** those events are not discarded and an empty trace is clearly indicated.

### User Story 3 - Review and decide on a proposed action (Priority: P2)

As an on-call operator, I want a prominent confirmation card when an action requires my authorization so that I can make an explicit approval or rejection decision.

**Why this priority**: Human authorization is a safety gate for production actions and must be clear before any decision is made.

**Independent Test**: Return a pending-authorization response from a test service, verify the proposed action is displayed, then approve and reject in separate tests and verify the resulting status.

**Acceptance Scenarios**:

1. **Given** a chat submission receives HTTP 202 with one or more proposed actions, **When** the response is displayed, **Then** each action has a prominent card describing it and offering separate "Aprovar" and "Rejeitar" controls.
2. **Given** an authorization decision is being submitted, **When** the request is pending, **Then** the decision controls are disabled to prevent duplicate decisions.
3. **Given** the service confirms an approval or rejection, **When** the result is received, **Then** the card shows the confirmed decision and no longer offers an actionable pending choice.
4. **Given** the decision request fails, **When** the failure is received, **Then** the card remains pending, explains the failure, and permits a retry without implying that the action was approved or rejected.
5. **Given** the agent proposes opening or resolving an incident, **When** it requests the operation, **Then** the service returns a pending authorization and does not change incident state before approval.
6. **Given** the agent uses a read-only investigation tool, **When** it requests the lookup, **Then** the service completes the lookup without asking for approval.
7. **Given** an approved operation fails during execution, **When** the service reports the result, **Then** the card distinguishes execution failure from rejection and does not offer an unsafe duplicate execution.

### User Story 4 - Configure and use the console accessibly (Priority: P3)

As an on-call operator, I want to configure the backend address and use a readable interface across screen sizes and color preferences so that I can operate the console in my environment.

**Why this priority**: A configurable service connection and accessible presentation make the primary workflow usable across deployment environments and operator needs.

**Independent Test**: Change the API base URL in settings, reload the console, and verify it uses the saved address; verify the main controls can be used by keyboard in both light and dark themes.

**Acceptance Scenarios**:

1. **Given** the operator opens settings from the gear control, **When** they enter and save a valid API base URL, **Then** subsequent chat and decision requests use that URL.
2. **Given** the operator saves a URL, **When** they reload the console, **Then** the saved URL remains selected; an invalid URL is rejected with a clear explanation.
3. **Given** the operator changes the theme or has a system color preference, **When** the console is displayed, **Then** the selected light or dark presentation is readable and the preference is respected.
4. **Given** the operator uses a narrow viewport or keyboard navigation, **When** they move through the conversation, settings, trace, and approval controls, **Then** the content remains usable, controls have visible focus, and status changes are announced accessibly.

### Edge Cases

- The first message omits `conversationId` so the existing service can create a conversation and return its identifier; all follow-up messages include that identifier.
- A response has HTTP 202 but omits or malforms its proposed-action description or authorization reference; the interface must not invent an action or imply a valid pending decision.
- Multiple assistant responses have separate pending authorization cards; a decision on one must not change another.
- The API base URL is empty, malformed, or uses an unsupported scheme; saving it must not silently revert to an unrelated service.
- The backend is unavailable, the browser reports a CORS/network failure, or the response body is invalid; the operator must receive a useful error rather than a success-shaped response.
- A trace has an unknown event type or large argument/result values; the event remains identifiable and its data stays readable without disrupting the rest of the panel.
- A response contains raw HTML or unsafe Markdown content; it must not execute active content in the operator's browser.
- The viewport is narrow or text is enlarged; the chat and audit content remain usable without requiring horizontal scrolling for ordinary content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The console MUST send a non-empty `message` with every chat submission. The first request in a new conversation MUST omit `conversationId` so the service can create it; every subsequent request MUST include the identifier returned by the service. For this single-operator deployment, the service MUST associate every chat with one stable operator `userId` configured server-side; the console MUST NOT prompt for or accept an operator identity.
- **FR-002**: The console MUST submit chat messages to `POST /chat` using the configured API base URL and MUST associate each response with the conversation identifier returned or used by the service.
- **FR-003**: The console MUST display the submitted message, assistant response, processing state, and a clear retryable error state for failed requests without duplicating submissions.
- **FR-004**: The console MUST render assistant content as rich Markdown, including tables, lists, emphasis, and formatted code, while preventing embedded content from executing in the browser.
- **FR-005**: The console MUST provide a "Ver raciocínio" action for each assistant response and an expandable audit panel that preserves trace event order.
- **FR-006**: The audit panel MUST visually distinguish thought, action, observation, and response events; map the service's `answer` event to the response category; and retain other supported event types under an identifiable category.
- **FR-007**: For action and observation events, the audit panel MUST expose the tool name, complete arguments, and returned result in a readable form.
- **FR-008**: For an HTTP 202 response, the service MUST provide one or more unique pending authorization identifiers and proposed-action descriptions; the console MUST show each in a prominent card with approval and rejection controls.
- **FR-009**: The console MUST submit a decision to `POST /approvals/{approvalId}` with a decision of `approve` or `reject`. The service MUST associate the decision with the configured installation identity, only confirm a decision for a pending authorization, and prevent any proposed action from executing before approval is confirmed.
- **FR-010**: The console MUST show the confirmed authorization decision only after the service confirms it; while a decision is pending, controls MUST prevent duplicate submissions, and a failed network request MUST remain safely retryable without implying success. An execution failure after approval MUST be shown as distinct from rejection and MUST NOT be retried as a fresh action.
- **FR-011**: The console MUST provide settings to enter, validate, and save the API base URL, and use the saved URL for supported service requests after reload.
- **FR-012**: The console MUST support light and dark presentations, adapt to narrow viewports, and make all primary controls keyboard operable with visible focus and accessible status feedback.
- **FR-013**: The console MUST provide clear empty, loading, invalid-configuration, connection-failure, and malformed-response states.
- **FR-014**: Every configured service request MUST use the backend's required CORS-enabled connection; connection and CORS failures MUST be presented as actionable service errors, not hidden.
- **FR-015**: The console MUST be reachable under the `/opspilot/` base path, including when a user opens or reloads a supported view directly.
- **FR-016**: The API base URL settings MUST be reachable through a gear control and presented as a modal or menu that can be dismissed without losing unsaved chat content.
- **FR-017**: For War Room requests, the service MUST require operator approval before executing operational state-changing tools, including opening or resolving an incident; read-only investigation tools MUST remain automatic. The service MUST persist the proposed action and its status so a decision can be safely applied once. Existing MCP, CLI, and legacy HTTP calls without the War Room idempotency header MUST preserve their tested behavior.
- **FR-018**: Each War Room chat submission MUST have a stable idempotency key reused for retries. Repeating the same key and payload MUST return the original result without appending another conversation turn or creating another operational action; reusing the key with a different payload MUST be rejected.

### Key Entities *(include if feature involves data)*

- **Operator identity**: A stable identifier configured server-side for this single-operator installation and associated with all chat requests, memory, and authorization decisions.
- **Conversation**: An ordered sequence of operator messages and assistant responses associated with a stable conversation identifier.
- **Assistant response**: The agent's user-facing Markdown answer and its ordered execution trace.
- **Trace event**: A typed audit entry describing a thought, tool action, observation, response, or other supported execution event.
- **Pending authorization**: A proposed action awaiting an operator decision, identified by a unique authorization ID and associated with its description, request status, and confirmed outcome.
- **API connection setting**: The base URL used by the console for backend requests and saved for future visits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all valid chat test cases, every outgoing request contains the message, every follow-up also contains the service-issued conversation identifier, the service consistently applies the configured installation identity, and each successful response is associated with the correct conversation.
- **SC-002**: In a test set containing tables, lists, emphasis, and code blocks, all four Markdown forms are legible, and no embedded active content executes.
- **SC-003**: In all trace test cases, every supported event appears once and in source order; all tool actions expose their names and arguments, and observations expose their results.
- **SC-004**: In all pending-authorization test cases, the proposed description is visible before a decision, duplicate decisions cannot be submitted concurrently, no action runs before approval is confirmed, and the displayed final state matches the service-confirmed decision.
- **SC-005**: After a valid API URL is saved and the page reloaded, 100% of subsequent supported requests use the saved URL; invalid values are rejected before use.
- **SC-006**: Operators can complete the primary chat, trace-inspection, and approval flows using keyboard-only navigation at both wide and narrow viewport sizes.
- **SC-007**: Connection failures, invalid responses, and empty states are explicitly communicated; none is presented as a successful assistant response.
- **SC-008**: The console and its supported views load successfully from the `/opspilot/` base path, including after a direct navigation and reload.
- **SC-009**: Retrying a chat submission with the same idempotency key produces no additional conversation turn or operational action.

## Assumptions

- The primary users are authorized on-call operators using a browser-based console deployed under `/opspilot/`.
- The existing backend provides `POST /chat`, returns an assistant answer and typed trace, and will use a server-configured operator identity; CORS must be configured for the console's origin.
- A normal successful chat response returns the conversation identifier and trace event types documented by the existing service. Its `answer` trace event is presented as a response.
- The on-call operator can use Markdown-formatted assistant answers to review operational information; the console does not add a separate incident dashboard or execute operational tools itself.
- The light/dark theme follows the operating system by default, with an explicit user choice taking precedence.
- This feature targets one operator per installation. The deployment configures one stable operator `userId` on the server; the console displays only the message input and does not ask the operator to identify themselves. Multi-operator access and per-user authorization are out of scope.
- The backend will use that configured identity for chat and memory, and support decisions through `POST /approvals/{approvalId}` with `{ "decision": "approve" | "reject" }`. A pending HTTP 202 response includes its authorization ID and proposed-action description; the service confirms the decision before any action runs.
- The web console is an adapter to the existing agent behavior. Approval-aware tools, configured identity, and idempotent retries are selected only for War Room requests; existing MCP, CLI, and legacy HTTP callers retain their established tool path. A pending HTTP 202 response includes its authorization ID and proposed-action description; the service confirms the decision before any action runs.
- The autonomy matrix for this version classifies opening and resolving incidents as approval-required mutations; read-only lookups remain autonomous. Explicitly requested memory operations retain their existing user-scoped behavior.
- The service is not an authentication system. Deployments must restrict API access to the trusted operator environment; CORS is a browser policy, not an authorization boundary.
