# Data Model: Context Budget by Section

## ContextBudgets

Configuration values used to limit optional prompt sections.

- `summary`: positive integer, default `100`
- `history`: positive integer, default `300`
- `memories`: positive integer, default `100`

Environment sources:

- `CONTEXT_BUDGET_SUMMARY`
- `CONTEXT_BUDGET_HISTORY`
- `CONTEXT_BUDGET_MEMORIES`

Validation rules:

- Each supplied value must parse as an integer.
- Each value must be greater than zero.
- Invalid values fail before context assembly.
- Missing values receive the documented defaults.

## ContextSection

A named prompt section with an optional budget and immutable ordering constraints.

- `name`: system, message, summary, history, or memories
- `text`: rendered section content
- `budget`: optional positive integer
- `immutable`: true for system and current message

Validation rules:

- Immutable sections are never removed or shortened.
- Budgeted sections are estimated using the existing chars-per-four function.
- The rendered result never exceeds its configured budget when section-level truncation is possible.

## ConversationEntry

A chronological item retained in the conversation history.

- `role`: user or assistant
- `content`: message text
- `position`: chronological order supplied by the caller

Behavior:

- Entries are processed oldest-first for removal.
- Retained entries preserve their original relative order.

## MemoryRecord

A semantic memory candidate considered for prompt inclusion.

- `fact`: memory text
- `score`: numeric relevance score

Behavior:

- Higher scores are retained first.
- Equal scores are retained in input order.
- Lower-scoring entries are removed first.
