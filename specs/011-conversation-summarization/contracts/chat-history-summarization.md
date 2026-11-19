# Contract: Chat History Summarization

## Existing Chat Request

`POST /chat` continues to require the existing external request fields and accepts an optional conversation identifier.

## New Trace Event

A successful summary refresh adds one trace event before the reasoning strategy's answer trace:

```json
{
  "type": "summarize",
  "conversationId": "conversation-123",
  "summary": "Merged conversation summary...",
  "summarizedThroughSequence": 16
}
```

Validation rules:

- `type` MUST equal `summarize`.
- `conversationId` MUST identify the conversation being refreshed.
- `summary` MUST be non-empty.
- `summarizedThroughSequence` MUST be a positive integer and equal the boundary persisted by the refresh.

A request with no completed pruning boundary MUST omit the event.

## Strategy Context Contract

The strategy receives:

- The summary as ordered conversational context before the recent window, only when a summary exists.
- No more than 8 direct prior user/assistant messages.
- The current user request separately.

The direct history remains chronological and the summary is not inserted as a stored user or assistant message.

## Persistence Contract

Summary writes:

- Use one logical row per conversation.
- Replace the complete merged summary and advance the sequence watermark in one atomic operation.
- Do not write when the next complete 8-message boundary has not been reached.
- Do not emit `summarize` when a write fails.

Concurrent requests reaching the same boundary must observe the same persisted watermark and permit at most one successful refresh.

## Existing Response Compatibility

Existing fields such as `conversationId`, `answer`, `trace`, and `metrics` remain required. `historyMessages` continues to report the number of direct prior messages supplied as context and is capped at 8 for this feature's direct history window.
