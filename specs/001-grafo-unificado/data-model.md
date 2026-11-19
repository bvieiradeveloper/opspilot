# Phase 1 Data Model: Grafo Unificado

## ChatRequest

Input fields already accepted or added:

| Field | Validation | Required | Behavior |
|---|---|---:|---|
| `message` | Trimmed, non-empty string | Yes | User request |
| `userId` | Trimmed, non-empty string | Yes | Memory and conversation identity |
| `conversationId` | Trimmed, non-empty string | No | Existing or new conversation |
| `strategy` | Supported route enum | No | Explicit override |
| `reflect` | Boolean | No | Compatibility switch mapping to the reflection route |

## PreparedContext

Request-scoped bounded context containing:

- Original message
- Fitted summary
- Fitted history entries
- Fitted relevant memories
- Context token budgets and breakdown
- Optional abort signal

## RoutingDecision

- `route`: exactly one supported strategy route
- `reason`: concise explanation
- `node`: always `router`
- `source`: `automatic` or `override`

## StrategyStage

A distinct graph node that executes an existing strategy and returns:

- Answer text
- Strategy-specific trace events
- Model/tool call metrics

## TraceEvent

Every event has:

- `type`: routing or existing strategy event type
- `node`: non-empty graph node identifier
- Payload fields specific to that event type

The routing event is represented as:

```text
{
  type: "route",
  node: "router",
  route: "react" | "plan-and-execute" | "reflect:react",
  reason: string
}
```

## ChatResponse

- `conversationId`
- `answer`
- Unified `trace` with node attribution
- Existing metrics, including call count, latency, prompt tokens, context breakdown, and history count

## Relationships

- One chat request creates one prepared context.
- One prepared context produces one routing decision.
- One routing decision selects one strategy stage.
- One strategy stage contributes zero or more strategy events plus a final answer.
- Every completed request produces one response node entry in the trace lifecycle.
