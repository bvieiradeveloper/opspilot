# Research: Context Token Metrics

**Date**: 2026-10-27

## LangChain-reported prompt usage

- **Decision**: Capture actual usage in a request-scoped `handleLLMEnd` callback attached to the top-level runnable invocation. Read `input_tokens` from the first available AI generation's `message.usage_metadata`, and require a finite non-negative integer. Treat every LLM callback/run as one model invocation; do not sum multiple candidate generations from the same run. Missing or malformed usage makes the request total incomplete.
- **Rationale**: In `@langchain/core` 1.2.12, `handleLLMEnd` receives an `LLMResult` with nested generations, and `AIMessage.usage_metadata` is the canonical cross-provider usage shape. `@langchain/openai` 1.5.13 may assign an empty `usage_metadata` object when counts are absent, so validating individual fields is essential. A request-scoped callback sees model invocations across graph and nested runnable calls without relying on selected strategy call sites.
- **Alternatives considered**: Estimating `promptTokens` from characters (rejected); returning partial totals when any call lacks usage (rejected); counting calls only at selected strategy nodes (rejected); using `llmOutput.tokenUsage.promptTokens` as a provider-specific non-streaming fallback (possible but not the canonical path); using raw OpenAI `response_metadata.usage` as the primary source (rejected as provider-specific).
- **Propagation**: `RunnableConfig.callbacks` accepts callback handlers, and LangGraph passes top-level invocation configuration to child runnables. Ensure the `graph.invoke` config is supplied and explicitly pass node config into direct planner/replanner invocations; direct reflection model calls must receive the same request collector callback. Existing manual plan/replan call increments should not be mistaken for completed model usage.
- **Streaming caveat**: If a model is configured for streaming, request provider usage (such as `streamUsage: true` for ChatOpenAI) and still tolerate providers that omit usage trailers. Do not count `estimatedTokenUsage` as actual usage. This project currently uses invoke-style model calls.
- **Source references**: [`handleLLMEnd` callback contract](https://github.com/langchain-ai/langchainjs/blob/%40langchain%2Fcore%401.2.12/libs/langchain-core/src/callbacks/base.ts), [`AIMessage` usage metadata](https://github.com/langchain-ai/langchainjs/blob/%40langchain%2Fcore%401.2.12/libs/langchain-core/src/messages/metadata.ts), [`LLMResult` generations](https://github.com/langchain-ai/langchainjs/blob/%40langchain%2Fcore%401.2.12/libs/langchain-core/src/outputs.ts), [ChatOpenAI completion usage](https://github.com/langchain-ai/langchainjs/blob/%40langchain%2Fopenai%401.5.13/libs/providers/langchain-openai/src/chat_models/completions.ts), and [LangGraph runnable configuration](https://github.com/langchain-ai/langgraphjs/blob/main/libs/langgraph-core/src/pregel/index.ts). The project uses caret dependency ranges, so implementation should verify behavior against the installed lockfile versions.

## Character-based source estimates

- **Decision**: Estimate each explicitly attributed source text with `Math.floor(text.length / 4)`, where `text.length` is the JavaScript string's UTF-16 code-unit count. Accumulate estimates by stable source key and count each included occurrence once per model invocation.
- **Rationale**: This precisely operationalizes the specified chars/4 heuristic, remains dependency-free, and allows source totals to be compared consistently across turns.
- **Alternatives considered**: A tokenizer package (rejected because it adds dependency and computes a different measure); UTF-8 byte length (rejected because the stated heuristic is character-based); measuring an entire serialized prompt only (rejected because it loses attribution by source).
- **Scope**: The breakdown measures only application-attributed text sources: current request, prior conversation history, recalled memories, tool results, and reflection/critique context when present. It is an estimate, not a reconstruction of provider tokenization, hidden framework prompts, message serialization, or tool-schema overhead.

## Request-scoped context and usage propagation

- **Decision**: Carry a single request-scoped collector through reasoning execution, share it across agent strategies and reflection, and return a snapshot as part of chat metrics. Source buckets are `request`, `history`, `memories`, `toolResults`, and `reflection`; include only buckets actually present in a measured prompt.
- **Rationale**: A shared collector ensures that retries, iterative tool calls, replanning, and criticism are accounted for once at the request boundary rather than exposing fragmented strategy-local totals.
- **Alternatives considered**: Process-global or persisted metrics (rejected due to request isolation and unnecessary retention); one collector per strategy phase (rejected because the API contract requires a request total); a fixed zero-valued entry for every possible source (rejected because it obscures which sources contributed).

## Chat and exercise contracts

- **Decision**: Add `metrics.promptTokens` as a non-negative integer or `null`, and `metrics.contextBreakdown` as a map from source key to non-negative integer estimate. Update the existing HTTP response validator and the long-conversation script; do not introduce a new endpoint.
- **Rationale**: These metrics extend the existing `200 /chat` result and make actual and estimated measurements explicit for existing callers and the operator exercise.
- **Alternatives considered**: Replacing existing metrics (rejected for backward compatibility); placing estimates at the response root (rejected because the service already groups measurements under `metrics`); showing a request/response character estimate as actual usage (rejected).
