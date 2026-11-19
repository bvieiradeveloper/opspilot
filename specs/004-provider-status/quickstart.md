# Quickstart: External Provider Status

## Prerequisites

- Node.js 22 LTS and the repository dependencies installed.
- No provider credentials or live network access are required for the automated checks.

## Validate the feature

Run the test suite, which includes fake-fetch tests for the provider-status tool:

```sh
npm run test
```

The focused tests should use an injected fake fetch and verify successful GitHub and Cloudflare
responses, GitHub's default selection, a timeout, one retry for retryable failures, invalid
response handling, and the maximum attempt count.

Then run the TypeScript check:

```sh
npm run typecheck
```

Both commands should exit successfully. Tests must not call the public provider endpoints.

## Expected behavior

- A valid response yields one compact line with the provider's status indicator and description.
- A timeout, network failure, or HTTP 5xx can cause one additional request, but no more.
- An invalid payload or other HTTP error is reported as a readable tool result without an additional
  request.
- Any final lookup failure is returned as an observation instead of escaping as an exception.

See [the tool contract](contracts/provider-status-tool.md) and [the data model](data-model.md) for
the accepted input, status payload, and output behavior.
