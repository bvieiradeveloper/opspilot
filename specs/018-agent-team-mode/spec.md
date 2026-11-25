# Feature Specification: Agent Team Mode

**Feature Branch**: `[018-agent-team-mode]`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/; supervisor com withStructuredOutput{{ next, brief}} sobre um blackboard no estado. Papéis: analista ( só leitura, não propõe), planejador ( sem tools), executor (incidentes, sem bypass). Evento "handoff" no trace, renderizado no "ver raciocínio". Rota "team", teto 8"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coordinate an incident response (Priority: P1)

As an on-call operator, I want to request team mode for an incident so that a coordinated set of specialized roles can analyze the situation, plan a response, and carry out permitted incident actions using the same incident context.

**Why this priority**: Coordinated incident handling is the core value of this feature.

**Independent Test**: Submit an incident through the team route and verify that the response reflects the shared incident context and the work of the assigned roles.

**Acceptance Scenarios**:

1. **Given** a valid incident request, **When** the operator selects the team route, **Then** the system coordinates the analyst, planner, and executor roles and returns an incident response.
2. **Given** an incident context with findings from an earlier role, **When** another role is assigned, **Then** that role receives the shared context and a concise brief describing its assignment.
3. **Given** a request that is not an incident task, **When** the operator selects the team route, **Then** the system declines incident execution and clearly explains the supported scope.

---

### User Story 2 - Review team handoffs (Priority: P2)

As an on-call operator reviewing the team's work, I want to see when responsibility passes between roles and why each handoff occurred so that I can understand the progress without exposing private internal reasoning.

**Why this priority**: Visible transitions make the multi-role response understandable and auditable.

**Independent Test**: Run a request that requires at least one role transition and verify the corresponding handoff appears in the reasoning view with its source, destination, and brief.

**Acceptance Scenarios**:

1. **Given** a team run with a role transition, **When** the operator opens "ver raciocínio", **Then** a "handoff" event is shown with the departing role, receiving role, and concise assignment brief.
2. **Given** a team run with no role transition, **When** the operator reviews its trace, **Then** no handoff event is shown.
3. **Given** a handoff brief, **When** it is displayed to the operator, **Then** it contains the assignment context and not hidden internal reasoning.

---

### User Story 3 - Keep role actions within limits (Priority: P1)

As an on-call operator, I want each role to stay within its assigned permissions and the team run to stop after at most eight coordination steps so that incident actions remain controlled and bounded.

**Why this priority**: Role boundaries and a strict limit prevent unsafe or runaway incident handling.

**Independent Test**: Exercise role-specific permitted and forbidden actions, and a run that reaches the coordination limit; verify that no role bypasses its permissions and no ninth handoff occurs.

**Acceptance Scenarios**:

1. **Given** an analyst reviewing an incident, **When** it returns its result, **Then** it may report observations but may not propose an action or perform a tool action.
2. **Given** a planner assigned to an incident, **When** it prepares a response, **Then** it may propose a plan but may not perform tool actions.
3. **Given** an executor assigned an incident action, **When** the action is outside the allowed incident operations or is blocked by a permission check, **Then** the action is not performed and the restriction is reported.
4. **Given** a run that has already made eight coordination handoffs, **When** another handoff would be requested, **Then** the system stops coordination without making a ninth handoff and returns the available result or a clear limit notice.

## Edge Cases

- The incident context is incomplete or contains conflicting findings; the team identifies the uncertainty rather than inventing missing facts.
- A role has no useful next assignment; the team ends with the findings and plan already available.
- A role attempts an action outside its permissions; the action is blocked, recorded, and does not trigger a bypass or reassignment that evades the restriction.
- The coordination limit is reached before the executor can complete an action; the system stops and clearly reports what remains incomplete.
- A team handoff cannot be displayed because its brief is unavailable; the trace still indicates the transition and reports that the brief is missing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a distinct team route that operators can select for incident requests.
- **FR-002**: The system MUST coordinate an analyst, planner, and executor as distinct roles, using shared incident context and a concise assignment brief at each handoff.
- **FR-003**: The analyst MUST be limited to read-only incident review and MUST report findings without proposing actions or performing tool actions.
- **FR-004**: The planner MUST be able to propose an incident response plan and MUST NOT perform tool actions.
- **FR-005**: The executor MUST be limited to permitted incident operations and MUST NOT bypass role permissions, policy checks, or blocked-action outcomes.
- **FR-006**: The system MUST stop team coordination after no more than eight handoffs in a single run and MUST NOT emit a ninth handoff.
- **FR-007**: Each role transition MUST produce a trace event named "handoff" that identifies the source role, destination role, and concise assignment brief.
- **FR-008**: The "ver raciocínio" view MUST render each available handoff event and its assignment brief without displaying hidden internal reasoning.
- **FR-009**: When coordination stops because of the limit or a blocked action, the system MUST communicate the stopping reason and distinguish completed work from incomplete work.
- **FR-010**: The system MUST reject requests outside incident-response scope when submitted through the team route and explain the supported scope.

### Key Entities

- **Team run**: One coordinated response to an incident, including its selected route, progress, and stopping outcome.
- **Incident context**: Shared facts, findings, and constraints used by the roles throughout a team run.
- **Role assignment**: A role's current responsibility and concise brief within the team run.
- **Handoff**: A recorded transfer of responsibility from one role to another, with the brief needed by the receiving role.
- **Incident operation**: An action the executor may attempt, subject to the applicable permission and policy checks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of team runs stop after eight or fewer handoffs, with no ninth handoff emitted.
- **SC-002**: 100% of analyst and planner attempts to perform tool actions are prevented; 100% of executor actions that fail permission checks are prevented without bypass.
- **SC-003**: 100% of role transitions in a completed trace appear as "handoff" events in "ver raciocínio" with the available source role, destination role, and brief.
- **SC-004**: In usability validation, at least 90% of on-call operators can identify the current or final responsible role and the reason for its assignment from the displayed handoff trace.

## Assumptions

- The limit of eight applies to supervisor-directed handoffs in one team run; each directed handoff counts as one coordination step.
- "Ver raciocínio" is the existing operator-facing reasoning/trace view; only role transitions and concise assignment briefs are exposed, not private internal reasoning.
- The executor's permitted operations are the incident operations already authorized by the product; this feature does not expand that permission set.
- The team route is a selectable route for incident handling and does not replace existing non-team routes.
