# Data Model: Conversation History Summarization

## ConversationSummary

The single merged summary associated with one conversation.

| Field | Type | Rules |
|---|---|---|
| `conversationId` | text | Foreign key to the owning conversation; unique |
| `summary` | text | Non-empty after a successful refresh; approximately 150 tokens |
| `summarizedThroughSequence` | positive integer | Highest message sequence incorporated into the persisted summary |
| `updatedAt` | datetime | Last successful summary update |

**Persistence table**: `conversation_summaries`

## Conversation Message (existing)

Ordered user or assistant records remain unchanged.

| Field | Type | Rules |
|---|---|---|
| `conversationId` | text | Owning conversation |
| `sequence` | positive integer | Unique and increasing within one conversation |
| `role` | enum | `user` or `assistant` |
| `content` | text | Non-empty |

## Derived State

### Recent Message Window

The latest 8 persisted prior messages, ordered by sequence and supplied directly to the strategy.

### Retired Batch

Exactly 8 ordered messages whose sequences are newer than the stored watermark and older than or equal to the first complete pruning boundary. A batch is selected only after the existing watermark and current history establish that boundary.

### State Transitions

1. Conversation has no summary: watermark is `0`.
2. History contains at least 16 prior messages: the oldest complete 8-message batch is eligible.
3. A summarizer successfully merges the batch with the existing summary.
4. The summary row is atomically updated and the watermark advances by 8 sequences.
5. An ordinary request with fewer than the next 8 boundary messages performs no summary write.
6. A failure leaves the row and watermark unchanged.

## Relationships

- One `conversation` can have zero or one `conversation_summaries` row.
- One summary references no duplicated message records; `summarizedThroughSequence` points to the persisted history boundary.
- Message deletion outside this feature does not alter the summarized-data lifecycle unless conversation deletion is already established as cascading deletion.
