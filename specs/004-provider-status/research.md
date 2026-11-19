# Research: External Provider Status

## Tool and project integration

**Decision**: Add the provider-status tool to the existing agent-tools composition in
`src/agents/tools.ts`, and add deterministic cases to `src/agents/tools.test.ts`.

**Rationale**: This matches the current `createOpsTools` pattern and the repository's Node test
runner. Keeping the tool in the established composition makes it available alongside the existing
operational tools without changing agent wiring.

**Alternatives considered**:
- A new agent module and separate registration path: rejected because it duplicates the existing
  tool composition and creates unnecessary wiring.
- A new test file: unnecessary for this focused extension because an existing test file exercises
  tool schemas and invocation.

## External status source and response

**Decision**: Use the public status JSON endpoint for each supported provider and accept only
responses containing a nested status object with string `indicator` and `description` fields.

**Rationale**: These endpoints and the response shape are explicitly specified by the feature
request. Zod validation ensures an upstream format change is reported rather than presented as
valid provider status.

**Alternatives considered**:
- A third-party status aggregation service: rejected because the request names the providers'
  public status pages as the authoritative sources.
- Credentials or an authenticated API: unnecessary because the specified status endpoints are
  public.

## Timeout and retry behavior

**Decision**: Apply a fresh five-second `AbortSignal.timeout` to each attempt. Permit at most one
retry after a timeout, network failure, or HTTP 5xx. Return an error observation without retry for
other non-success HTTP responses or a structurally invalid payload.

**Rationale**: This implements the requested bounded resilience while preventing retries for
client-side responses or data that cannot be interpreted as a status. The retry limit bounds the
worst-case waiting time to two request windows.

**Alternatives considered**:
- Retrying all errors, including invalid payloads and non-5xx HTTP errors: rejected because the
  specification limits retries to network/timeout/5xx failures.
- Unlimited or exponential retries: rejected because only one retry is required and tool calls
  should return promptly.

## Fetch injection and failure handling

**Decision**: Make the fetch implementation an injectable dependency for the status-check logic
while defaulting production use to the built-in Fetch API. Convert final expected lookup failures
into a readable one-line result.

**Rationale**: Fake fetch functions allow tests to assert URL, timeout signal, retry count, parsing,
and returned text without network access. The tool boundary remains observation-oriented as
requested.

**Alternatives considered**:
- Tests against live status pages: rejected because external availability makes tests
  nondeterministic and network-dependent.
- Throwing errors to the agent runtime: rejected because a status-check failure is explicitly
  required to be returned as a tool observation.

## Unresolved questions

None. Provider list, URLs, response shape, retry classes, timeout, tool output, and test injection
are all specified.
