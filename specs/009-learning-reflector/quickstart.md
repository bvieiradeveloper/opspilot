# Quickstart: Safe Learning Reflector

## Prerequisites

- Node.js 22 and project dependencies installed.
- Tests use injected structured-output and memory-store fakes; they do not require network access or `.env`.

## Run validation

```powershell
npm run typecheck
npm run test
```

Expected result: TypeScript and all targeted learning-reflector, agent-tool, and HTTP tests pass.

## Scenarios to verify

1. A successful chat response is sent before the learning assessment resolves; the eligible fact is subsequently passed to the existing memory store for the same user.
2. A transient request, a message with no eligible fact, malformed structured output, or a secret-like candidate creates no memory.
3. A message containing both a durable preference and secret-like content does not persist the secret.
4. A learned fact uses the existing deduplication behavior; a duplicate does not create another memory.
5. `forget_preference` removes one unique matching preference only for the validated request user.
6. When no unique forget target exists, the tool asks for clarification without deleting any memory.
7. An assessment or save failure is reported without modifying the already-sent response or leaking message/candidate content into logs.
