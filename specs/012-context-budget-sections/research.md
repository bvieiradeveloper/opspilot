# Research: Context Budget by Section

## Decision 1: Budget unit

- **Decision**: Use the project's existing token estimate (`floor(character count / 4)`) as the unit for section budgets.
- **Rationale**: This matches the existing metrics code and avoids introducing a second estimation convention.
- **Alternatives considered**: Counting individual array entries or raw characters only. Rejected because entries are inconsistent and raw characters would bypass existing project metrics semantics.

## Decision 2: Environment configuration

- **Decision**: Read `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_HISTORY`, and `CONTEXT_BUDGET_MEMORIES`; use 100, 300, and 100 when unset. System content remains immutable and has no environment budget. Accept positive integers only and report invalid values explicitly.
- **Rationale**: The names map directly to the three budgeted sections, and positive integer validation prevents ambiguous negative or fractional budgets.
- **Alternatives considered**: Silently falling back on invalid values. Rejected because silent fallback can conceal operational misconfiguration.

## Decision 3: Cutting summary text

- **Decision**: Keep the beginning of the summary and cut trailing text when it exceeds the budget.
- **Rationale**: Preserves the summary as a compact coherent section and gives the user no hidden fallback behavior; the specification does not require middle-out truncation.
- **Alternatives considered**: Dropping the entire summary when over budget. Rejected because it discards potentially useful context unnecessarily.

## Decision 4: Cutting conversation history

- **Decision**: Remove whole history entries from oldest to newest until the history estimate is within budget. Preserve the relative order and content of retained entries.
- **Rationale**: This follows the feature's explicit oldest-first requirement and avoids partial malformed messages.
- **Alternatives considered**: Character-level tail trimming or preserving the first entry after budget overflow. Rejected as inconsistent with whole-message history semantics.

## Decision 5: Cutting memories

- **Decision**: Sort memories by score descending for retention, remove low-score entries first, and preserve original order among equal scores. Budget based on formatted memory-section content.
- **Rationale**: This implements explicit score priority and stable tie behavior.
- **Alternatives considered**: Dropping only individual high-score text or sorting by fact length. Rejected because neither satisfies score-based removal.

## Decision 6: Immutable sections

- **Decision**: System instructions and the current user request are assembled outside or exempted from all section budgets.
- **Rationale**: The specification explicitly makes them non-trimmable and they are necessary for safety and request completion.
- **Alternatives considered**: Applying a total prompt budget globally. Rejected because a global cap could silently remove the user's request or system policy.

## Decision 7: Strategy integration

- **Decision**: Centralize assembly in `src/context-builder.ts`; React, plan-and-execute, and reflection use the builder before constructing model prompts.
- **Rationale**: One implementation prevents drift across strategies and satisfies the requirement that all strategies use identical section policies.
- **Alternatives considered**: Updating each strategy independently. Rejected because duplicated policy would be harder to test and maintain.
