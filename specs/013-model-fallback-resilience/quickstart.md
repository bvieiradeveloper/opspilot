# Quickstart: Model Fallback Resilience

## Prerequisites

- Node.js 22 and the dependencies installed from the repository lockfile.
- An OpenRouter API key and a primary model ID for optional live smoke testing.
- An optional fallback model ID when validating failover with a live provider.

Do not commit credentials or read `.env` directly in application code. Automated tests must use
deterministic fakes and must not require network access.

## Automated validation

1. Run the focused model and HTTP tests:

   ```powershell
   node --import tsx --test src/agents/model.test.ts src/agents/metrics.test.ts src/agents/trace.test.ts src/http/server.test.ts
   ```

2. Run the complete test suite:

   ```powershell
   npm run test
   ```

3. Check strict TypeScript compatibility:

   ```powershell
   npm run typecheck
   ```

Expected outcomes: primary success does not invoke fallback; primary exhaustion followed by
fallback success reports the fallback model and emits a fallback trace; each candidate is tried no
more than twice; exhaustion of all configured candidates produces HTTP 503 with
`MODEL_UNAVAILABLE`; all tests run without real provider requests.

## Optional live smoke test

Start the API with valid OpenRouter settings supplied through the project's environment
configuration, then submit an existing valid `POST /chat` request. Verify the successful response
reports `metrics.modelUsed`. For failover testing, use a primary model that reliably fails in the
test environment and a valid fallback; confirm the response and trace match
[the API contract](./contracts/chat-api.md). Live provider behavior is supplemental and does not
replace deterministic automated tests.
