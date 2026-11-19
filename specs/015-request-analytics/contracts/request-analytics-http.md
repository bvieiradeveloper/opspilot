# Request Analytics HTTP Contract

## `GET /states`

Returns an overall request summary and independent breakdowns by route and selected model.

### Query parameters

| Name | Required | Format | Default |
|---|---|---|---|
| `since` | No | Positive integer followed by `m`, `h`, or `d`, up to `30d` | `24h` |

Examples: `?since=90m`, `?since=24h`, `?since=7d`.

Malformed, zero, negative, unsupported-unit, repeated, or over-limit values return `400` using the existing validation response format. The endpoint does not silently substitute the default for an invalid value.

### Successful response (`200`)

```json
{
  "since": "24h",
  "evaluatedAt": "2026-11-11T12:00:00.000Z",
  "overall": {
    "totalRequests": 12,
    "errorRequests": 2,
    "tokens": {
      "total": 1530,
      "measuredRequests": 9
    },
    "cost": {
      "currency": "USD",
      "total": 0.0123,
      "measuredRequests": 10,
      "unavailableRequests": 2
    },
    "latency": {
      "sampleCount": 10,
      "p50Ms": 240,
      "p95Ms": 810
    }
  },
  "byRoute": [
    {
      "route": "react",
      "totalRequests": 8,
      "errorRequests": 1,
      "tokens": {
        "total": 1000,
        "measuredRequests": 6
      },
      "cost": {
        "currency": "USD",
        "total": 0.01,
        "measuredRequests": 6,
        "unavailableRequests": 2
      },
      "latency": {
        "sampleCount": 7,
        "p50Ms": 220,
        "p95Ms": 700
      }
    },
    {
      "route": null,
      "totalRequests": 4,
      "errorRequests": 1,
      "tokens": {
        "total": 530,
        "measuredRequests": 3
      },
      "cost": {
        "currency": "USD",
        "total": 0.0023,
        "measuredRequests": 4,
        "unavailableRequests": 0
      },
      "latency": {
        "sampleCount": 3,
        "p50Ms": 300,
        "p95Ms": 810
      }
    }
  ],
  "byModel": [
    {
      "model": "provider/model:free",
      "totalRequests": 5,
      "errorRequests": 0,
      "tokens": {
        "total": 500,
        "measuredRequests": 4
      },
      "cost": {
        "currency": "USD",
        "total": 0,
        "measuredRequests": 5,
        "unavailableRequests": 0
      },
      "latency": {
        "sampleCount": 5,
        "p50Ms": 180,
        "p95Ms": 420
      }
    },
    {
      "model": "provider/model:paid",
      "totalRequests": 5,
      "errorRequests": 0,
      "tokens": {
        "total": 500,
        "measuredRequests": 3
      },
      "cost": {
        "currency": "USD",
        "total": 0.01,
        "measuredRequests": 4,
        "unavailableRequests": 1
      },
      "latency": {
        "sampleCount": 3,
        "p50Ms": 300,
        "p95Ms": 810
      }
    },
    {
      "model": null,
      "totalRequests": 2,
      "errorRequests": 2,
      "tokens": {
        "total": 530,
        "measuredRequests": 2
      },
      "cost": {
        "currency": "USD",
        "total": 0.0023,
        "measuredRequests": 1,
        "unavailableRequests": 1
      },
      "latency": {
        "sampleCount": 2,
        "p50Ms": 300,
        "p95Ms": 810
      }
    }
  ]
}
```

Every group contains the same metric fields as `overall`. Unknown route/model values are represented by `null`. The example is illustrative; group ordering is not significant.

### Metric semantics

- The selected time window is `since` ending at `evaluatedAt`; its start is inclusive and its end is exclusive.
- `totalRequests` includes in-progress requests; `errorRequests` counts only `failed` and `timed_out`.
- Model groups use each request's persisted `modelUsed` value; request-level token and cost metrics are attributed to that model.
- `tokens.total` sums recorded prompt/input tokens only. Missing token values do not contribute to the sum and are excluded from `measuredRequests`.
- `cost.total` assigns zero to model identifiers ending in `:free`, regardless of provider metadata. For other models, it sums provider-reported request costs; missing cost counts as unavailable and contributes nothing to the known subtotal.
- Cost values are in USD. `unavailableRequests > 0` means the known subtotal is incomplete.
- Percentiles use the nearest-rank method over available `latencyMs` values. If no latency sample exists, both percentile fields are `null`.
- Empty windows return zero counts and totals, zero measurement counts, and null percentiles.

### Errors

- Invalid query parameters return `400` and the existing validation response format.
- Unexpected storage or internal failures flow through the existing HTTP error middleware; they are not returned as a successful empty summary.
