# Research: Request Analytics

## Request and model metric flow

- **Decision**: Add an optional provider-reported cost value to the existing model/request metrics flow and persist it on each finalized request. Extract only a finite, non-negative numeric cost from provider usage metadata; do not infer a price from tokens.
- **Rationale**: Request records already persist the actual selected model, prompt-token usage, latency, and outcome. The selected provider is OpenRouter, and the feature explicitly requires provider-reported paid-model cost. Keeping the cost alongside its request makes historical aggregation reproducible.
- **Alternatives considered**: Derive cost from a local price catalog; rejected because prices change and no catalog is currently part of the application. Treat every missing cost as zero; rejected because it hides missing paid usage.

## Free model cost

- **Decision**: If the selected model identifier ends in `:free`, assign a measured cost of zero regardless of provider metadata. Otherwise, sum a valid provider-reported cost or count it as unavailable.
- **Rationale**: This follows the requested `:free=0` rule literally while keeping unknown paid charges visible.
- **Alternatives considered**: Let a provider-reported amount override the `:free` classification; rejected because it contradicts the explicit free-model rule.

## Token aggregation

- **Decision**: Sum the recorded `promptTokens` value, expose it as input-token usage, and count only requests whose usage is available. Preserve unavailable counts instead of converting missing values to zero.
- **Rationale**: The current callback and request schema record input/prompt tokens only. Presenting that metric as total input-plus-output tokens would overstate what the system measures.
- **Alternatives considered**: Estimate output tokens or label prompt tokens as total tokens; rejected because neither is supported by current persisted data.

## Request selection and grouping

- **Decision**: Capture one evaluation timestamp per summary, select requests with `started_at >= evaluationTime - since` and `started_at < evaluationTime`, and cap the duration at 30 days. Default to 24 hours. Return separate route and model groups, using a null key for unknown values.
- **Rationale**: A bounded, explicit window avoids accidental unbounded scans and produces consistent boundary behavior. Model groups use the persisted `modelUsed` request value, and request-level metrics are attributed to that value. Null distinguishes absent values from any literal route/model name.
- **Alternatives considered**: Default to all retained history; rejected because the endpoint is intended for operational recent-state summaries. Represent missing keys with a string such as `"unknown"`; rejected because it can collide with a real identifier.

## Aggregate calculations

- **Decision**: Count total requests and failed/timed-out requests; calculate nearest-rank p50 and p95 from available latency values; return null percentiles when there are no latency samples. Include availability counts for token and cost measures.
- **Rationale**: The algorithm is deterministic for small operational request sets and can be verified without a database-specific percentile extension. Availability counts make partial sums explicit.
- **Alternatives considered**: Interpolated percentiles; rejected in favor of the explicitly specified nearest-rank rule. Treat missing latency as zero; rejected because it biases latency downward.

## Persistence and HTTP integration

- **Decision**: Extend the existing SQLite request store interface with a prepared, parameterized read for request metrics in a start-time range; keep aggregation in a service and expose a Zod-validated Express endpoint. Preserve old records with a nullable cost value.
- **Rationale**: This reuses the established request persistence and controller/service/store boundaries, avoids loading trace payloads, and remains compatible with existing databases.
- **Alternatives considered**: Read all requests through individual lookup operations; rejected because it would be inefficient and needlessly deserialize traces. Add a separate analytics database; rejected because request metrics already reside in SQLite.
