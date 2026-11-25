# Data Model: Agent Team Mode

This feature adds transient coordination state and a public trace event. It does not add a persistent database entity.

## Team Run

One team-mode execution for a chat request.

| Field | Type | Validation / meaning |
|---|---|---|
| request | string | Non-empty incident request validated at the chat boundary |
| currentRole | role or null | Role currently assigned, or null before start/after completion |
| handoffCount | integer | Starts at zero; increments exactly once per emitted handoff; maximum eight |
| blackboard | Incident Blackboard | Shared only by roles in this run |
| answer | string | User-facing completion or bounded-stop result |
| outcome | `completed` / `handoff_limit` / `blocked` | Distinguishes normal completion from bounded or permission-related stopping |

## Incident Blackboard

Transient shared context for the team.

| Field | Type | Validation / meaning |
|---|---|---|
| request | string | Original incident request |
| findings | list of findings | Analyst observations with source/evidence and uncertainty preserved |
| plan | list of proposed incident steps | Planner output; contains proposals, not executed tool calls |
| executionResults | list of outcomes | Executor results, including approval-pending, completed, and blocked states |
| openQuestions | list of strings | Missing or conflicting facts that remain unresolved |

## Role Assignment

| Field | Type | Validation / meaning |
|---|---|---|
| role | `analyst` / `planner` / `executor` | Identifies the next specialist |
| brief | non-empty string | Concise assignment context for the receiving role |

The supervisor decision is validated before dispatch. It contains `next` (one specialist role or a terminal value) and `brief`. A terminal choice ends coordination and does not create a handoff event.

## Role Capability Matrix

| Role | Reads shared board | Read-only incident tools | Proposes plan | Incident mutation tools |
|---|---:|---:|---:|---:|
| Analyst | Yes | Yes | No | No |
| Planner | Yes | No | Yes | No |
| Executor | Yes | No | No | Yes, incident-scoped and approval-aware |

Capabilities are enforced by the tools supplied to a role, not by prompt wording alone.

## Handoff Trace Event

| Field | Type | Validation / meaning |
|---|---|---|
| type | literal `handoff` | Identifies a role transition |
| node | literal `team` | Identifies the coordinating feature |
| from | `supervisor` / specialist role | Role or coordinator handing off responsibility |
| to | specialist role | Receiving role |
| brief | non-empty string | Assignment context shown in the trace panel |

Events remain in trace order, are validated by the HTTP response schema, and are persisted using the existing request-trace store. They contain no private internal reasoning.

## State Transitions

1. A team run starts with an empty board and zero handoffs.
2. The supervisor selects a specialist and supplies a brief; emit one handoff and increment the count before dispatching that specialist.
3. The specialist updates only the board fields allowed by its role.
4. The supervisor either selects another specialist (if fewer than eight handoffs have occurred) or ends the run.
5. If another handoff is requested after the eighth, do not emit or execute it; return an explicit bounded outcome.
6. If an executor action is denied or requires approval, record the result and never retry it through an unguarded tool path.
