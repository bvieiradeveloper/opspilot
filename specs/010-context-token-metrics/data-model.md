# Data Model: Context Token Metrics

All measurements are transient and scoped to one `/chat` request; they are not stored in the conversation database.

## Prompt Usage

Represents provider-reported input usage for model invocations made during one chat request.

| Field | Type | Validation | Meaning |
|---|---|---|---|
| `promptTokens` | non-negative integer or `null` | Integer when known; otherwise null | Sum of reported input-token counts, or unavailable when there are no observed model calls or any observed model call lacks a usable actual input count |
| `modelCalls` | non-negative integer | Integer >= 0 | Number of model completion events observed by the request collector; internal accounting value, not required in the HTTP response |
| `complete` | boolean | True only when at least one model call was observed and all observed calls reported usable usage | Whether the aggregate represents a complete actual total |

When there are no observed model calls, actual usage is unavailable (`null`), not an inferred zero. A reported input count of zero is a valid actual value.

## Context Source Estimate

Represents the estimated size of text attributed to a prompt source during one or more model calls.

| Field | Type | Validation | Meaning |
|---|---|---|---|
| `source` | string key | One of `request`, `history`, `memories`, `toolResults`, or `reflection` | Application-attributed context category |
| `estimatedTokens` | non-negative integer | `Math.floor(includedText.length / 4)` for each inclusion, summed by source | Heuristic estimate; not actual provider usage |

Only sources with included text are present. An included empty text may yield zero. Repeated source text included in distinct model calls contributes once for each inclusion. Framework-generated instructions, serialization overhead, and tool schemas are excluded.

## Chat Turn Metrics

Extends the existing successful chat metrics. Existing `IICalls`, `latencyMs`, and `historyMessages` remain unchanged.

| Field | Type | Meaning |
|---|---|---|
| `promptTokens` | non-negative integer or `null` | Complete actual prompt-input total for all observed model calls in this request, or null |
| `contextBreakdown` | map of source key to non-negative integer | Estimated input size attributed to application context sources |

No relationships or persistent lifecycle apply; one chat response contains one metrics snapshot.
