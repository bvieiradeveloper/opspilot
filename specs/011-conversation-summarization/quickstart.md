# Quickstart: Conversation History Summarization

## Prerequisites

- Node.js 22 LTS
- Project dependencies installed with `npm install`
- SQLite persistence available in the application configuration

## Validation Scenarios

Run the focused store and chat-service tests after implementation:

```powershell
npm run test
npm run typecheck
```

## Expected Behavior

1. Starting with fewer than 16 prior persisted messages does not produce a summary or `summarize` event.
2. After the first 8-message pruning boundary is reached, the response includes one `summarize` trace event and the newest 8 prior messages remain direct context.
3. Follow-up requests reuse the persisted summary and omit repeated refreshes until 8 more messages form a new boundary.
4. The deterministic summarizer produces a merged summary preserving decisions, facts, and pending items.
5. An in-memory SQLite store restores the same summary after a store is reopened.
6. Concurrent requests for one boundary produce one persisted update and one event.
7. A summarizer failure leaves the previous summary watermark unchanged and does not emit a success event.

For contract and field definitions, see [chat-history-summarization.md](./contracts/chat-history-summarization.md). For persistence fields and state transitions, see [data-model.md](./data-model.md).
