# Data Model: Chat API

## ChatRequest

Represents one caller request to process a message.

| Field | Type | Required | Validation / Default |
|-------|------|----------|----------------------|
| `message` | string | Yes | Trimmed and non-empty |
| `strategy` | string | No | Must resolve to a registered base strategy; omitted means `react` |
| `reflect` | boolean | No | Omitted means `false` |

The parsed request is passed to one selected strategy. The HTTP adapter supplies an internal abort signal for the request deadline; it is not part of the JSON body.

## ReasoningStrategy

Represents a registered named strategy that processes one `ReasoningInput` and produces a `ReasoningResult`.

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | Stable registry key such as `react` or `plan-and-execute` |
| `run(input)` | async operation | Produces an answer, trace, and metrics; receives the optional cancellation signal |

The shared registry contains base strategies. Reflection is composed around the selected base strategy only when requested.

## ChatResponse

The successful result returned to the caller.

| Field | Type | Validation |
|-------|------|------------|
| `answer` | string | Required |
| `trace` | `TraceEvent[]` | Required; events follow the existing reasoning trace variants |
| `metrics` | `Metrics` | Required; `IICalls` is a non-negative integer and `latencyMs` is finite and non-negative |

The HTTP boundary validates the result shape before sending it. Invalid internal output becomes a generic server error rather than a malformed success response.

## Request Lifecycle

1. Express parses the JSON body.
2. The request schema validates `message`, optional `strategy`, and optional `reflect`.
3. The API resolves the base strategy name; an unknown name fails before strategy execution.
4. The API optionally applies `withReflection`, then invokes the effective strategy with an abort signal.
5. A successful result is validated and serialized. A validation, unknown-strategy, timeout, or unexpected failure is translated at the HTTP boundary.

## Error Outcomes

| Condition | HTTP status | Response data |
|-----------|-------------|---------------|
| Invalid request body | `400` | Zod `issues` for schema validation failures |
| Unknown strategy | `422` | Stable error code and safe message |
| Request deadline reached | `504` | Stable timeout error code and safe message |
| Unexpected failure or invalid internal result | `500` | Generic error code and safe message |

Malformed JSON is handled as a client error by the HTTP boundary; parser internals are not returned to the caller. No model or provider exception details are included in error responses.