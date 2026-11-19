# Quickstart: Context Token Metrics

## Prerequisites

- Node.js 22 and dependencies already installed.
- A Bash-compatible shell, `curl`, and `jq` only when exercising `scripts/conversa-longa.sh`.
- No model-provider credentials are needed for automated validation.

## Run automated tests

```sh
npm test
```

The suite should cover the character-estimation boundaries, complete and incomplete actual usage, aggregation across model invocations and phases, source breakdown estimates, and the HTTP metrics schema using deterministic fakes. The long-conversation script test should use a local stub response and assert that each successful turn prints `promptTokens` or an explicit unavailable value.

## Validate types and full test suite

```sh
npm run typecheck
npm test
```

Expected result: both commands exit successfully, with no external model requests.

## Exercise a live long conversation (optional)

Start the API using the project's configured local setup, then run:

```sh
BASE_URL=http://localhost:3000 bash scripts/conversa-longa.sh
```

Each successful turn prints `promptTokens` from `/chat` metrics. Review the numeric actual usage separately from the script's local character-based request/response estimates. See [chat-metrics.md](./contracts/chat-metrics.md) for field semantics and [data-model.md](./data-model.md) for aggregation rules.
