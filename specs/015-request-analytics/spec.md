# Feature Specification: Request Analytics

**Feature Branch**: `[015-request-analytics]`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Crie GET /states?since=24h sobre requests: total, erros, tokens, custo (:free=0), p50/p95, por rota e modelo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review request health and usage (Priority: P1)

As an on-call operator, I need a summary of requests in a recent time window so that I can quickly assess request volume, errors, token usage, cost, and latency.

**Why this priority**: A reliable aggregate view is the minimum useful operational overview.

**Independent Test**: Populate requests with known timestamps, outcomes, usage, costs, and latencies, then retrieve the summary and compare each aggregate to the known values.

**Acceptance Scenarios**:

1. **Given** requests inside and outside the requested time window, **When** an operator requests `GET /states?since=24h`, **Then** only requests inside the window contribute to the overall totals.
2. **Given** a mixture of successful, failed, and timed-out requests, **When** the summary is returned, **Then** it reports the total request count and the count of failed or timed-out requests separately.
3. **Given** available token usage, provider-reported costs, and latency values, **When** the summary is returned, **Then** it reports token totals, known cost, and p50/p95 latency for requests with latency data.
4. **Given** an omitted `since` parameter, **When** an operator requests the summary, **Then** the endpoint uses the default 24-hour window.

### User Story 2 - Compare routes and models (Priority: P2)

As an on-call operator, I need the same operational metrics grouped by route and by model so that I can identify which strategy or model contributes to errors, usage, cost, and latency.

**Why this priority**: Breakdown makes the overall totals actionable by showing where operational changes may be needed.

**Independent Test**: Create requests spanning multiple routes and models with known measurements, then verify each route and model group independently.

**Acceptance Scenarios**:

1. **Given** requests associated with multiple routes and models, **When** the summary is returned, **Then** each route and each model has its own request, error, token, cost, and latency summary.
2. **Given** requests without an identified route or model, **When** the summary is returned, **Then** those requests are represented in an explicit unknown group rather than omitted.
3. **Given** a model identifier ending in `:free`, **When** the summary is returned, **Then** its cost contribution is zero in overall and grouped totals.

### Edge Cases

- An invalid or unsupported `since` value returns a client error with a clear validation response and does not silently select a different window.
- An empty time window returns zero requests, zero errors and tokens, zero known cost, and null latency percentiles.
- Requests whose token usage or latency is unavailable do not fabricate measurements; the response reports the available-value counts alongside aggregates.
- A paid-model request without a provider-reported cost is excluded from known cost and counted as having unavailable cost, so a partial sum is not presented as complete.
- Percentiles are null when no request in the relevant group has latency data.
- Requests exactly at the start of the selected window are included; requests at the current end boundary or older than the window are excluded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `GET /states` and return request analytics for the selected time window.
- **FR-002**: The `since` query parameter MUST accept a positive duration and default to `24h` when omitted; invalid values MUST receive a client error.
- **FR-003**: The system MUST include an overall summary with total requests, failed or timed-out requests, token usage, known cost, unavailable-cost count, and p50/p95 request latency.
- **FR-004**: The system MUST include separate summaries grouped by route and by model, with the same metrics and explicit unknown groups for missing route or model values.
- **FR-005**: The system MUST include requests whose start time is at or after the window start and strictly before the time at which the summary is evaluated.
- **FR-006**: The system MUST sum recorded token usage only when available and indicate the number of requests with token measurements; unavailable token usage MUST NOT be treated as a measured zero.
- **FR-007**: The system MUST assign zero cost to model identifiers ending in `:free`. For other models, it MUST sum provider-reported request costs when available and count requests without a reported cost as unavailable rather than inventing a charge.
- **FR-008**: The system MUST calculate p50 and p95 from available request latency measurements and return null percentiles when no measurements are available.
- **FR-009**: The system MUST return zero counts and totals, and null percentiles, when the selected window contains no requests.
- **FR-010**: The response MUST be a consistent, machine-readable summary whose overall values reconcile with the route and model breakdowns, including explicit unknown groups.

### Key Entities *(include if feature involves data)*

- **Request**: A persisted chat execution with a start time, outcome, route and model when known, recorded token usage, provider-reported cost when known, and latency when known.
- **Analytics Window**: The duration ending at the time the summary is evaluated, used to select which requests contribute to each aggregate.
- **Request Aggregate**: Counts, available token and cost totals, measurement-availability counts, and latency percentiles for all selected requests or a route/model group.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a test set of requests with known timestamps and values, all overall and grouped counts and totals match the expected values exactly.
- **SC-002**: For groups with known latency samples, reported p50 and p95 match the nearest-rank percentiles of those samples.
- **SC-003**: Requests outside the selected window contribute to none of the overall or grouped metrics, and requests on the start boundary are included.
- **SC-004**: Every missing token or paid cost measurement is reflected as unavailable and is never silently reported as a measured zero.
- **SC-005**: An operator can retrieve the full summary and its route/model breakdowns with a single request to `GET /states`.

## Assumptions

- The default reporting window is the most recent 24 hours; accepted duration syntax and maximum range will be finalized in planning based on the service's existing validation conventions.
- The token metric is the recorded request token usage currently available to the system; this does not imply separate prompt and completion-token counts where those are not recorded.
- Model grouping uses the persisted `modelUsed` value for each request; request-level token and cost metrics are attributed to that recorded model.
- A model is considered free when its identifier ends with the literal suffix `:free`; that classification overrides any reported cost.
- Provider-reported request cost is the source of truth for paid model cost; no price table or estimated cost is introduced by this feature.
- Errors are requests with a terminal failed or timed-out outcome; in-progress and successful requests are not errors.
- Percentiles use the nearest-rank method and are calculated over requests with an available latency measurement.
- Existing request retention determines the maximum history available for aggregation.
