# Data Model: Model Fallback Resilience

This feature adds no persisted records. The following values exist only for a model invocation or
chat response.

## Configured Model

| Field | Type | Rules |
|-------|------|-------|
| role | `primary` or `fallback` | Exactly one primary; fallback is optional. |
| modelId | non-empty string | Primary comes from `OPENROUTER_MODEL`; fallback comes from `OPENROUTER_MODEL_FALLBACK`. |
| apiKey | non-empty secret | Reuses the configured OpenRouter key; never returned or traced. |
| attempts | positive integer | Each configured model permits two total attempts. |

## Model Run Metrics

| Field | Type | Rules |
|-------|------|-------|
| modelUsed | string | Configured model ID for the candidate whose invocation most recently completed successfully and contributed to the returned strategy result. Must not be inferred from a failed attempt. |
| IICalls | non-negative integer | Counts model starts, including retries and fallback starts, following existing metric semantics. |
| latencyMs | non-negative number | Existing per-run elapsed time; includes retry and failover time. |

`modelUsed` is run-local and merged according to the final successful model output in the returned
result. Strategies that do not invoke a model may omit it.

## Fallback Trace Event

| Field | Type | Rules |
|-------|------|-------|
| type | literal `fallback` | Identifies a successful switch from primary to fallback. |
| node | existing trace node identifier | Identifies the strategy or system component whose invocation failed over. |
| from | model ID | Configured primary that exhausted its attempts. |
| to | model ID | Fallback that produced the usable output. |

Emit the event only after the fallback produces usable output. Do not include raw errors, API
keys, prompts, or provider response bodies.

## Model Unavailable Failure

| Field | Type | Rules |
|-------|------|-------|
| type | `ModelUnavailableError` | Raised only after all configured model candidates fail to produce usable output. |
| message | safe internal message | Must not contain credentials or raw provider payloads. |

The HTTP layer maps this domain failure to a 503 `MODEL_UNAVAILABLE` response. It is not persisted
or included in successful trace data.
