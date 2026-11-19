# Feature Specification: Conversation History Summarization

**Feature Branch**: `[011-conversation-summarization]`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de 150 tokens preservando decisões, fatos e pendencias, MESCLADO ao resumo anterior e persistido - refeito só quando 8 novas saem da janela, nunca a cada request. Resuno entra no contexto; evento summarize. Com teste"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintain a usable summary as history grows (Priority: P1)

A caller continuing a conversation receives continuity even after old messages leave the recent-message window. Decisions, facts, and unresolved items from the exchanged messages remain available without resending the full history.

**Why this priority**: This is the primary value of pruning: preserving conversational context while limiting prompt growth.

**Independent Test**: Create a conversation with more than 8 prior messages, continue it, and verify that the response context contains one merged summary representing all relevant messages that have left the 8-message window.

**Acceptance Scenarios**:

1. **Given** a conversation with exactly 8 prior messages, **When** a new exchange is processed, **Then** no summary is regenerated if none of the messages has left the recent window.
2. **Given** a conversation where a group of 8 messages moves out of the recent 8-message window, **When** the conversation is processed, **Then** the group is incorporated into a summary of approximately 150 tokens that preserves decisions, facts, and pending items.
3. **Given** an existing summary and a newly retired group of 8 messages, **When** summarization is performed, **Then** the system produces one merged summary rather than replacing or duplicating previous summary content.
4. **Given** a persisted conversation summary, **When** that conversation is resumed in a later request, **Then** the summary is included in the context before the 8 most recent prior messages.

---

### User Story 2 - Refresh summaries only at batch boundaries (Priority: P1)

A conversation does not repeatedly invoke summarization while the recent window has not advanced by another complete group of 8 messages, so unrelated requests remain predictable and do not rewrite the summary unnecessarily.

**Why this priority**: Preventing repeated summarization controls cost and ensures that persisted context changes only when a real pruning boundary is reached.

**Independent Test**: Add fewer than 8 new messages beyond the existing pruning boundary, make multiple requests, and verify that the summary is neither regenerated nor persisted again for those requests.

**Acceptance Scenarios**:

1. **Given** a conversation that has an existing summary and 1 to 7 additional messages eligible for pruning, **When** requests continue within those boundaries, **Then** no summarization event is emitted and the existing summary remains unchanged.
2. **Given** 8 messages have newly retired from the recent window since the previous summary refresh, **When** the next request processes that boundary, **Then** exactly one summary refresh occurs and one summary record is persisted for the updated conversation state.
3. **Given** more than 8 messages are eligible for pruning at once, **When** the conversation is processed, **Then** all eligible retired messages are consolidated into the next merged summary in chronological order without triggering repeated refreshes for the same boundary.

---

### User Story 3 - Emit and test summary activity (Priority: P2)

Operators can observe when summarization occurs and automated tests can verify the pruning, merge, persistence, and context behavior without an external model service.

**Why this priority**: An explicit summary event makes behavior observable, while deterministic tests protect the context-management contract.

**Independent Test**: Run the summarized-history scenarios with a deterministic summarizer and verify the `summarize` event and expected persisted/context state after each boundary.

**Acceptance Scenarios**:

1. **Given** an 8-message pruning boundary is reached, **When** the summary refresh succeeds, **Then** a `summarize` event is emitted for that conversation.
2. **Given** the summary refresh is not needed because fewer than 8 new messages have crossed the boundary, **When** a request completes, **Then** no `summarize` event is emitted.
3. **Given** summarization cannot be completed, **When** the request resolves, **Then** existing history and the most recent message window remain available and the failure is reported clearly without silently losing earlier messages.
4. **Given** the automated test suite, **When** summary scenarios run, **Then** pruning, merging, persistence, context inclusion, event emission, and no-op boundaries are exercised without contacting an external model service.

---

### Edge Cases

- A conversation has fewer than 8 messages eligible for pruning; its summary must remain unchanged and no event is emitted.
- A conversation already has 8 messages beyond the recent window and receives another batch; the summary refresh covers each newly retired batch without revisiting the previous summary messages unnecessarily.
- The existing summary is empty; the first summary refresh creates the initial summary from the retired messages.
- The existing summary contains decisions that conflict with newer retired messages; the merged summary records the latest clarified decision without fabricating a resolution when one remains absent.
- A summary refresh fails; the previous summary remains stored and the recent 8-message context remains unchanged.
- Concurrent requests for the same conversation reach a pruning boundary; only one refresh and one persisted merged summary result for that boundary.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST retain the most recent 8 prior messages of each conversation as its direct context window.
- **FR-002**: The system MUST treat messages older than the most recent 8 prior messages as eligible to be summarized, preserving their original chronological order.
- **FR-003**: The system MUST summarize only complete groups of 8 messages that newly leave the recent window since the previous summary refresh.
- **FR-004**: A generated summary MUST be approximately 150 tokens and MUST preserve decisions, facts, and unresolved or pending items from the retired messages.
- **FR-005**: The system MUST merge newly summarized content with the existing summary so that the result remains a single summary for each conversation.
- **FR-006**: The merged summary MUST be persisted and made available when the conversation is resumed after the pruning boundary is reached.
- **FR-007**: A summarization refresh MUST NOT occur on ordinary requests unless at least 8 additional messages have crossed from the recent window into the retired set since the previous refresh.
- **FR-008**: When a summarization refresh succeeds, the system MUST emit a `summarize` event identifying the conversation and the summary refresh outcome.
- **FR-009**: The persisted summary and the 8 recent prior messages MUST both be supplied as context to follow-up requests; the summary MUST appear before the recent messages in chronological intent.
- **FR-010**: The system MUST prevent duplicate summarization of the same message batch when concurrent requests reach the same pruning boundary.
- **FR-011**: If summarization fails after a pruning boundary is reached, the system MUST preserve the previous summary and MUST not silently remove or lose access to the retired message history.
- **FR-012**: Automated tests MUST verify summary creation, summary merging, persistence across requests, 8-message boundary behavior, context inclusion, event emission, failure behavior, and the absence of refreshes outside pruning boundaries.

### Key Entities *(include if feature involves data)*

- **Conversation Summary**: The single persistent, merged representation of decisions, facts, and pending items from batches of retired conversation messages for one conversation.
- **Recent Message Window**: The ordered set containing up to 8 prior messages that remain directly available in context.
- **Retired Message Batch**: An ordered group of messages that has left the recent window and qualifies for summarization once a complete group of 8 is reached.
- **Summary Event**: An observable `summarize` activity emitted when a summary refresh succeeds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all test conversations with exactly 8 or fewer newly retired messages, 100% of requests outside the completed 8-message boundary produce no summary refresh.
- **SC-002**: Each completed pruning boundary refresh merges exactly one batch of 8 newly retired messages and is performed no more than once for the same boundary.
- **SC-003**: Across deterministic summaries, the generated summary is between 120 and 180 tokens and contains explicit representation of decisions, facts, and unresolved pending items when present in the retired text.
- **SC-004**: A resumed conversation receives both the persisted summary and the 8 most recent prior messages in 100% of follow-up test cases where each source exists.
- **SC-005**: In 100% of concurrent requests targeting the same boundary, only one `summarize` event and one persisted summary update are produced for that boundary.
- **SC-006**: All pruning, merge, persistence, context, event, and no-refresh behaviors are covered by automated tests that do not require an external model service.

## Assumptions

- A prior message means an already persisted user or assistant message, excluding the new request being processed.
- The recent-message context remains the 8 most recent prior messages; the new user request is processed after that context is selected.
- If the final number of eligible messages exceeds an exact multiple of 8, only complete groups trigger refreshes and partial groups remain unpruned until the next boundary.
- Summaries are appended to, and not removed by, later legitimate conversation processing unless the application resets or deletes the conversation under an existing lifecycle.
- A summary refresh may use an existing model/provider capability, but tests replace it with a deterministic summarizer.
- Existing chat behavior and response fields remain available when history summarization is added.
