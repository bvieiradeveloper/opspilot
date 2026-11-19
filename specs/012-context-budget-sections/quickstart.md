# Quickstart: Validate Context Budgets

## Prerequisites

- Node.js 22 LTS dependencies installed with `npm install`
- Repository dependencies available

## Run low-budget tests

```powershell
$env:"100"
$env:CONTEXT_BUDGET_SUMMARY="20"
$env:CONTEXT_BUDGET_HISTORY="40"
$env:CONTEXT_BUDGET_MEMORIES="20"
npm run test -- --test-name-pattern="context budget"
```

Use the repository test command without the name filter to validate the complete suite:

```powershell
npm run test
npm run typecheck
```

## Expected outcomes

- System content and the current message remain unchanged.
- Summary text is capped at the configured estimate.
- With a small history budget, oldest conversation entries are removed first.
- With a small memory budget, lowest-score memories are removed before higher-score memories.
- Equal-score memories are handled deterministically by original order.
- Every registered strategy receives the same bounded sections.
- Invalid numeric environment values fail before prompt assembly with an explicit error.

## Related artifacts

- Behavior rules: [research.md](../research.md)
- Entities and validation: [data-model.md](../data-model.md)
- Internal contract: [contracts/context-builder.md](./contracts/context-builder.md)
