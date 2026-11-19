# Data Model: Safe Learning Reflector

## Learning assessment

A transient, validated result of evaluating one successful chat turn. It is not persisted independently.

| Field | Type | Rules |
|---|---|---|
| `hasLearning` | boolean | Required structured decision. `false` means do not mutate memory. |
| `fact` | string or null | When `hasLearning` is `true`, a trimmed, non-empty concise fact or preference derived only from the latest user message. When false, no fact may be saved. |

### Eligibility rules

- Candidate must be explicitly stated, user-specific, durable, and likely useful in a later conversation.
- One-time requests, temporary instructions, and facts inferred only from the assistant's answer are not eligible.
- Secret-like access information must not be persisted, even when another preference is eligible in the same message.
- If durability or sensitivity is unclear, do not create a memory.
- Each assessment yields zero or one persisted candidate.

## User memory

An eligible assessment is persisted through the existing `MemoryStore.remember(userId, fact)` operation. Its record shape, ownership, semantic representation, deduplication, and retention lifecycle remain defined by [the existing semantic-memory data model](../../008-semantic-memory/data-model.md). This feature adds no table or fields.

## Forget request

A transient, request-scoped instruction to remove one preference.

| Field | Source | Rules |
|---|---|---|
| `preference` | Agent tool argument | Required non-empty description of the preference to forget; validated before use. |
| `userId` | Validated chat request scope | Bound by the application and never accepted from model-generated arguments. |

### State outcomes

- **One unambiguous owned memory found**: forget only that memory.
- **No match or multiple plausible matches**: make no changes and return a clarification outcome.
- **Memory operation failure**: surface the explicit failure; do not report successful deletion.
- Deleting a preference does not alter any other memory or another user's memory.
