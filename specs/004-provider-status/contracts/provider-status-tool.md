# Contract: `check_provider_status`

## Purpose

Check whether a supported public external dependency is reporting a service issue, especially
while determining whether an incident may be provider-side or internal.

## Tool input

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `provider` | `github \| cloudflare` | No | `github` | Provider whose public status should be checked |

Values outside the supported enum are invalid at the tool input boundary.

## Provider endpoints

| Provider | URL |
|----------|-----|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |

No provider credentials are required.

## Accepted response

The response body must be valid JSON with this structure:

```json
{
  "status": {
    "indicator": "string",
    "description": "string"
  }
}
```

Both fields are required strings. A response that does not satisfy this shape is invalid.

## Request and retry behavior

- Each attempt has a five-second timeout.
- Retry exactly once after a timeout, network failure, or HTTP 5xx response.
- Do not retry other HTTP errors or invalid response data.
- Do not make more than two attempts in total.

## Tool result

- Successful lookup returns one compact line containing the provider, indicator, and description.
- Final lookup failure returns a readable one-line error observation; it does not throw an exception
  outside the tool.
- The observation is informational and does not create or change an incident.

## Testability

The fetch operation is injectable. Tests use a fake fetch implementation and must not depend on
network access or live status-page availability.
