# Data Model: Request Analytics

## Request metric record

The existing persisted request remains the source row for analytics.

| Field | Type | Rules |
|---|---|---|
| `requestId` | string | Existing unique request identifier |
| `startedAt` | ISO datetime | Selects the request into or out of the analytics window |
| `status` | enum | `in_progress`, `succeeded`, `failed`, or `timed_out` |
| `route` | supported route or null | Null is grouped as unknown |
| `modelUsed` | non-empty string or null | Null is grouped as unknown |
| `promptTokens` | non-negative integer or null | Null means unavailable, not zero |
| `providerCost` | finite non-negative number or null | Ignored for a `:free` model; otherwise null means unavailable |
| `latencyMs` | finite non-negative number or null | Used only when present |

Existing records without `providerCost` remain valid and are treated as having unavailable cost unless the selected model ends in `:free`. Every `:free` model contributes a measured cost of zero even if a provider cost was recorded.

## Analytics window

| Field | Type | Rules |
|---|---|---|
| `since` | duration string | Positive integer plus `m`, `h`, or `d`; defaults to `24h`; maximum `30d` |
| `evaluatedAt` | ISO datetime | Captured once per summary |
| `startsAt` | ISO datetime | `evaluatedAt - since`, inclusive |

Selected requests satisfy `startedAt >= startsAt` and `startedAt < evaluatedAt`.

## Aggregate summary

The same aggregate shape is returned overall and for each route/model group.

| Field | Type | Meaning |
|---|---|---|
| `totalRequests` | non-negative integer | All selected requests, including in-progress requests |
| `errorRequests` | non-negative integer | Selected requests in `failed` or `timed_out` status |
| `tokens.total` | non-negative integer | Sum of available prompt/input-token measurements |
| `tokens.measuredRequests` | non-negative integer | Requests with an available token measurement |
| `cost.total` | finite non-negative number | Sum of provider-reported cost and measured `:free` zero cost, in USD |
| `cost.measuredRequests` | non-negative integer | Requests with reported cost or a known `:free` zero cost |
| `cost.unavailableRequests` | non-negative integer | Requests with no provider-reported cost that cannot be classified as free |
| `latency.sampleCount` | non-negative integer | Requests with an available latency measurement |
| `latency.p50Ms` | finite non-negative number or null | Nearest-rank 50th percentile, null without samples |
| `latency.p95Ms` | finite non-negative number or null | Nearest-rank 95th percentile, null without samples |

`cost.total` is a known subtotal when `cost.unavailableRequests` is nonzero; consumers can determine whether it is complete from that count.

## Group keys

- Route groups use the persisted route name; a null route is returned as `route: null`.
- Model groups use the persisted selected model identifier; all request-level metrics are attributed to this `modelUsed` value, and a null model is returned as `model: null`.
- Every selected request belongs to exactly one route group and exactly one model group.
- Group totals reconcile with the overall totals, including unknown groups.
