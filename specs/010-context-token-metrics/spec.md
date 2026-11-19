# Feature Specification: Context Token Metrics

**Feature Branch**: `[010-context-token-metrics]`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Instrumentar contexto de conversas com contagem de tokens reais, estimativas por fonte, exposição das métricas no chat e impressão por turno no roteiro de conversa longa, acompanhados de testes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect actual prompt usage (Priority: P1)

A caller reviewing a chat result can distinguish the actual number of input tokens used by the model from approximate context measurements.

**Why this priority**: Actual usage helps operators understand and compare the cost and size of agent requests.

**Independent Test**: Exercise a chat request with a deterministic model adapter that reports known usage and verify the response reports the same total for that request.

**Acceptance Scenarios**:

1. **Given** a chat request whose model calls all report input-token usage, **When** the request completes, **Then** its metrics report the sum of those actual input-token counts as `promptTokens`.
2. **Given** a chat request with one or more model calls that do not report input-token usage, **When** the request completes, **Then** `promptTokens` is `null` rather than an estimate or a partial total.
3. **Given** either usage outcome, **When** the result is returned, **Then** existing chat metrics and response fields remain available.

### User Story 2 - Understand estimated context sources (Priority: P1)

A caller can inspect which context sources contribute to a chat prompt and see approximate token counts for each source.

**Why this priority**: Source-level estimates help operators identify which context categories account for prompt growth without confusing estimates with provider-reported usage.

**Independent Test**: Submit a request with known text in multiple context sources and verify that each source has a non-negative estimate calculated from its character count.

**Acceptance Scenarios**:

1. **Given** a request with multiple sources included in model prompts, **When** the request completes, **Then** `contextBreakdown` reports an estimated token count for each contributing source.
2. **Given** a source containing a known number of characters, **When** its estimate is reported, **Then** the estimate is the character count divided by four and rounded down.
3. **Given** the same source is included in multiple model calls during one request, **When** the breakdown is reported, **Then** each inclusion contributes to that source's request-level estimate.
4. **Given** actual model usage is unavailable, **When** the response includes `contextBreakdown`, **Then** the estimates remain labeled and separate from `promptTokens`.

### User Story 3 - Review usage across a long conversation (Priority: P2)

An operator running the long-conversation exercise can see the actual prompt-token usage associated with each successful turn.

**Why this priority**: Per-turn output makes it possible to spot context growth and verify that measurements remain meaningful over follow-up messages.

**Independent Test**: Run the conversation script against a local deterministic chat service and verify its output includes the actual prompt-token value for each successful turn.

**Acceptance Scenarios**:

1. **Given** a successful turn with reported prompt usage, **When** the script prints that turn, **Then** the line includes the response's `promptTokens` value.
2. **Given** a successful turn whose prompt usage is unavailable, **When** the script prints that turn, **Then** it indicates that the value is unavailable rather than displaying a fabricated estimate.
3. **Given** a failed chat request, **When** the script processes the response, **Then** it retains its existing failure behavior and does not report the failed request as a successful measured turn.

### Edge Cases

- A model call reports zero input tokens; zero is retained as a valid actual value.
- A request makes multiple model calls; actual usage and per-source estimates are accumulated across those calls.
- Only some model calls report actual usage; the request-level `promptTokens` is unavailable because a complete actual total cannot be established.
- A context source is empty; it has a zero estimate if included in the breakdown.
- An error response or malformed response from the chat endpoint must not be presented by the conversation script as a successful turn.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a reusable token-estimation capability that returns the floor of a text's character count divided by four.
- **FR-002**: The system MUST obtain actual input-token usage from model-call usage data and MUST NOT derive actual usage by applying the estimate in FR-001.
- **FR-003**: The system MUST aggregate actual input-token counts across all model calls made for one chat request and expose the aggregate as `metrics.promptTokens`.
- **FR-004**: The system MUST expose `metrics.promptTokens` as `null` when actual usage is absent from any model call needed to determine the complete request total.
- **FR-005**: The system MUST expose `metrics.contextBreakdown` with separate non-negative integer estimates for each context source included in model prompts for the request.
- **FR-006**: The system MUST calculate each source estimate using its included text's character count divided by four, rounded down, and aggregate repeated source contributions across model calls.
- **FR-007**: The system MUST keep actual usage and estimated source breakdown distinct in the chat response and MUST preserve existing response fields and metrics.
- **FR-008**: The long-conversation script MUST print the actual `promptTokens` value for every successful turn and indicate when that value is unavailable.
- **FR-009**: Automated tests MUST cover estimation boundaries, actual usage aggregation and absence, source-level estimates, the chat response contract, and per-turn script output without requiring an external model service.

### Key Entities *(include if data involved)*

- **Prompt Usage**: The actual input-token counts reported for model calls made during one chat request, aggregated only when the complete total is known.
- **Context Source Estimate**: An approximate token count attributed to one context source, calculated from the text included in model prompts.
- **Chat Turn Metrics**: The actual usage and estimated source breakdown returned with a successful chat result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all deterministic usage-reporting test cases, `promptTokens` equals the sum of the actual input-token counts reported by the model calls for that request.
- **SC-002**: In all deterministic context test cases, every included source is represented and its reported estimate equals the floor of its included character count divided by four, aggregated across calls.
- **SC-003**: In every test case with incomplete actual-usage data, `promptTokens` is `null` and is not substituted with an estimated value or partial sum.
- **SC-004**: Every successful turn in the conversation-script test output includes its actual `promptTokens` value, or an explicit unavailable indicator when the value is null.
- **SC-005**: All new measurement behaviors are covered by automated tests that run without contacting an external model service.

## Assumptions

- A chat request may make multiple model calls; request-level actual usage and source estimates include all such calls.
- Actual usage is considered complete only when every model call in the request reports input-token usage.
- The source breakdown is diagnostic and approximate; its values are not a replacement for provider-reported usage and are not expected to equal `promptTokens`.
- The existing chat response remains the delivery surface for metrics; no new endpoint or persistence of token metrics is required.
- When a successful response has no actual prompt usage, the API reports `null` and the conversation script prints an unavailable indicator.
