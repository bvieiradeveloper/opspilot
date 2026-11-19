# Phase 0 Research: Conversation History Summarization

## Decision 1: Pruning boundary

**Decision**: Use the most recent 8 persisted prior messages as direct history context. Calculate the number of newly retired complete batches from the persisted summary watermark (`summarized_through_sequence`). Refresh each batch containing exactly 8 messages in chronological order before the next request is sent to the reasoning strategy.

**Rationale**: A watermark prevents repeating summarization on ordinary requests and makes concurrency deterministic. It also allows partial batches to remain retained until a later request completes the next full batch.

**Alternatives considered**: Summarize whenever more than 8 messages exist, which violates the requirement to refresh only every 8 new departures; summarize by wall-clock time, which has no relationship to history growth.

## Decision 2: Summary merge and persistence

**Decision**: Represent each conversation with one `conversation_summaries` row. Merge the existing summary with each new 8-message batch before replacing that row and advance the `summarized_through_sequence` watermark.

**Rationale**: A single row matches the requirement, preserves a coherent merged summary, and gives SQLite atomic update semantics that can prevent duplicate refreshes.

**Alternatives considered**: One row per batch, which would complicate merge semantics and make a second merge unnecessary; storing no watermark, which could re-summarize existing messages.

## Decision 3: Context assembly

**Decision**: Provide the persisted summary before the 8 recent prior messages in the strategy history as a synthetic system-like conversation context entry, without changing the stored user/assistant records. If no summary exists, supply only the recent window.

**Rationale**: This keeps raw history intact for recovery and audits while placing concise background context before chronological recent content.

**Alternatives considered**: Replacing old history with the summary in-place; modifying stored messages, both of which would destroy original records or make the pruning boundary unstable.

## Decision 4: Observable event

**Decision**: Add a `summarize` trace event to successful chat responses when exactly one refresh succeeds in that request. The event identifies the refreshed conversation and the last summarized sequence.

**Rationale**: Existing chat responses already carry typed trace events, making this the smallest observable contract consistent with the application architecture.

**Alternatives considered**: A separate log-only event, which lacks caller-visible verification; a metrics-only flag, which does not expose summary activity.

## Decision 5: Summarization abstraction and failure handling

**Decision**: Define a service-level summarizer interface that receives the existing summary and an ordered batch, returning the merged text. Production behavior may call the configured reasoning/provider capability later; tests use a deterministic implementation.

**Rationale**: This separates pruning/transaction policy from model-generation behavior and supports the test-first constitution.

**Alternatives considered**: Calling the chat strategy recursively for summary generation, which would increase coupling and risk producing nested chat events or tool work.

**Failure decision**: A summarizer exception leaves the summary row and watermark unchanged, retains all persisted messages, and omits the `summarize` trace event. The chat request may report the domain failure through the normal controller error translation or continue with the previous context, depending on the implementation path selected by tasks; this plan reserves the existing summary and never acknowledges a refresh that was not persisted.

## Resolved Clarifications

No significant unresolved clarification remains. The feature assumes partial groups are retained and no response field beyond the trace event is required.
