# Data Model: External Provider Status

This feature introduces no persisted entities. The following transient values describe the tool
input and output.

## Provider

The external service whose public status is being queried.

| Field | Type | Validation |
|-------|------|------------|
| `provider` | `github` or `cloudflare` | Required enum selection at the tool boundary; defaults to `github` when omitted |

## Provider status payload

The parsed public status response used to produce an observation.

| Field | Type | Validation |
|-------|------|------------|
| `status` | Object | Required |
| `status.indicator` | String | Required |
| `status.description` | String | Required |

## Provider status observation

One-line tool result intended for the agent's context.

| Outcome | Contents |
|---------|----------|
| Successful lookup | Provider name, status indicator, and description |
| Failed lookup | Readable statement that the status could not be retrieved, with a useful failure reason |

## Relationships and lifecycle

- One request selects exactly one provider and targets its configured public status endpoint.
- A successful valid payload produces one status observation.
- A retryable first-attempt failure may lead to one more request for the same provider.
- After the final failure, the tool returns an error observation; it does not persist status or alter
  incidents.
