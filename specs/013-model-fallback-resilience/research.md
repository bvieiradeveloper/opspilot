# Research: Model Fallback Resilience

## Decisions

### Retry the primary and optional fallback before reporting exhaustion

- **Decision**: Compose the primary model with `withRetry({ stopAfterAttempt: 2 })` before
  attaching the optional fallback, and compose the fallback with the same two-total-attempt retry
  limit before attaching it.
- **Rationale**: The user explicitly requires retry on the primary before failover. The local
  selected example applies `stopAfterAttempt: 2` to both configured models. The installed
  LangChain default is three total attempts, so setting the count explicitly follows the example
  and bounds additional latency.
- **Alternatives considered**: Relying on the LangChain retry default (less explicit); not retrying
  the fallback (does not match the selected example); retrying more than twice (unbounded latency).
- **Evidence**: `specs/example.ts`; `src/agents/model.ts`; installed
  `@langchain/core` 1.2.12 `dist/runnables/base.d.ts` exposes `withRetry` and
  `withFallbacks`; `dist/runnables/base.js` confirms the default retry cap is three attempts.

### Preserve structured output across model candidates

- **Decision**: Keep one shared model-construction path for primary and fallback candidates.
  Compose equivalent structured-output runnables for each candidate before combining them when a
  call requires a schema; use the composed chat runnable for ordinary message calls. Assign each
  candidate an explicit run name/metadata label, and use run-scoped callbacks to record only the
  candidate whose invocation completes successfully.
- **Rationale**: `RunnableWithFallbacks` is a general `Runnable`, not a `ChatOpenAI` instance, so
  it does not retain chat-model-only methods such as `withStructuredOutput`. Existing router,
  planner, replanner, and critic calls depend on structured output. OpenAI's non-streaming
  generation path does not reliably include the selected model ID in response generation
  metadata; a configured candidate label is more reliable for distinguishing primary from
  fallback.
- **Alternatives considered**: Duplicating primary/fallback construction in each caller (drifts
  configuration); forcing a cast from `RunnableWithFallbacks` to `ChatOpenAI` (unsound); writing a
  custom `BaseChatModel` adapter (more machinery than this feature needs).
- **Evidence**: Installed LangChain type declarations:
  `@langchain/core` 1.2.12 `dist/runnables/base.d.ts` declares
  `RunnableWithFallbacks<RunInput, RunOutput> extends Runnable<RunInput, RunOutput>`.
  Existing structured-output consumers are in `src/graph/production-graph.ts`,
  `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`, and
  `src/services/learning-reflector.ts`. `@langchain/core` 1.2.12
  `dist/callbacks/base.d.ts` provides per-run model start/end callbacks; `@langchain/openai`
  1.5.13 `dist/chat_models/completions.js` does not set provider model identity in all
  non-streaming generations.

### Track the successful provider and fallback in per-run data

- **Decision**: Extend the existing isolated run-metrics callback to retain the model identity
  from successful model output metadata and record fallback use only when the fallback actually
  succeeds. Carry these observations through strategy/graph aggregation, add a typed fallback
  trace event, and format it with the existing trace formatter.
- **Rationale**: Existing strategies already aggregate model callbacks and trace events per run.
  Explicit candidate run labels plus successful completion callbacks avoid labeling a failed
  fallback attempt as the model that produced an answer. One run-local collector avoids shared
  mutable state across concurrent chat requests.
- **Alternatives considered**: Read the configured model from process environment after execution
  (cannot distinguish actual fallback use); use global mutable callback state (cross-request
  contamination); infer fallback from an attempted model start (may be a failed fallback).
- **Evidence**: `src/agents/metrics.ts` has per-run callbacks; `src/agents/reasoning.ts` defines
  `Metrics` and `TraceEvent`; `src/agents/reflection.ts` combines results; LangChain callback
  signatures in installed `@langchain/core` 1.2.12 `dist/callbacks/base.d.ts` include model start
  and LLM end payloads.

### Translate exhausted model execution to a safe HTTP 503

- **Decision**: Raise a dedicated `ModelUnavailableError` after all configured candidates fail,
  preserve it through routing and summarization wrappers, and map it to HTTP 503 with a stable
  `MODEL_UNAVAILABLE` error code and a provider-detail-free message. Do not rely on the final
  exception from `withFallbacks` to represent the last attempt: the installed implementation
  throws the first candidate error after every candidate fails.
- **Rationale**: The current Express boundary maps rate limits explicitly and other errors to 500.
  A typed failure keeps model exhaustion distinct from unrelated errors and allows the correct
  status without leaking provider responses.
- **Alternatives considered**: Map all errors from the provider to 503 (misclassifies malformed
  inputs and programming errors); inspect provider-specific status fields in the controller
  (couples transport code to provider internals); return an apparent successful answer (misleads
  the operator).
- **Evidence**: `src/http/server.ts` has a centralized error handler; `src/agents/errors.ts`
  contains domain error classes; `src/graph/production-graph.ts` currently falls back to ReAct
  when routing fails; `src/services/chat-service.ts` wraps summarization failures; installed
  `@langchain/core` 1.2.12 `dist/runnables/base.js` preserves the first error after fallback
  exhaustion.

## Clarifications

None remain. The primary attempt cap follows the checked-in model example. Exact fallback trace
fields are to be verified against deterministic unit tests during implementation.
