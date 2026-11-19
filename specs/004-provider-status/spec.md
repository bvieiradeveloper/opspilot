# Feature Specification: External Provider Status

**Feature Branch**: `[004-provider-status]`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Tool de status de provedores externos:
- Tool check_provider_status em src/agents/tools.ts: consulta a statuspage pública do provedor via API statuspage.io (sem chave):
github -> https://www.githubstatus.com/api/v2/status.json
cloudflare -> https://www.cloudflarestatus.com/api/v2/status.json
Parâmetro provider (enum: github | cloudflare, default "github", .describe explicando).
Descrição orientada a quando usar: suspeita de problema externo, "é nosso ou do provedor?", dependência fora do ar.
- Resiliência: timeout de 5s via AbortSignal.timeout; falha de rede ou 5xx, UMA nova tentativa; resposta validada com zod
({status: { indicator, description }}); qualquer falha final retorna string de erro legível como resultado da tool (erro é observação - nunca lançar exceção para fora da tool).
- Retorno compacto (indicador + descrição, uma linha), para não inflar o contexto.
- Teste: a função de fetch é injetável; testes cobrem sucesso, timeout e resposta inválida sem usod de rede (fake fetch)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distinguish provider outages from internal incidents (Priority: P1)

As an on-call operator using OpsPilot, I want the agent to check the public health of GitHub or
Cloudflare when an external dependency may be unavailable, so that I can determine whether an
incident may be caused by the provider rather than our own systems.

**Why this priority**: Quickly identifying an external dependency problem helps responders focus
investigation and communicate the likely source of an incident.

**Independent Test**: Invoke the status check for each supported provider with a simulated valid
status result and verify the returned observation identifies the provider's status indicator and
description in one line.

**Acceptance Scenarios**:

1. **Given** an operator suspects GitHub may be affecting an incident, **When** the agent checks
   provider status without specifying a provider, **Then** it checks GitHub and returns its
   indicator and description in one compact line.
2. **Given** an operator suspects Cloudflare may be affecting an incident, **When** the agent
   checks provider status with Cloudflare selected, **Then** it returns Cloudflare's indicator and
   description in one compact line.
3. **Given** the agent is investigating whether an incident is internal or caused by an external
   dependency, **When** it decides whether to use this check, **Then** the tool description clearly
   identifies suspected provider disruption and unavailable external dependencies as reasons to
   use it.

### User Story 2 - Receive a useful observation when status cannot be retrieved (Priority: P2)

As an on-call operator, I want the agent to receive a readable indication when a provider's status
cannot be checked, so that a retrieval problem is not mistaken for an actual provider outage.

**Why this priority**: A failed status lookup must not mislead incident diagnosis or interrupt the
agent's ability to report its other observations.

**Independent Test**: Use a simulated fetch function to trigger a timeout, a network failure, a
server error, and an invalid response; verify retry behavior where applicable and a readable
failure observation in every final-failure case, without making a network request.

**Acceptance Scenarios**:

1. **Given** a status request fails due to a network error or provider server error, **When** the
   status check retries once, **Then** it returns the valid status if that retry succeeds.
2. **Given** both status request attempts fail, **When** the status check completes, **Then** it
   returns a readable error observation instead of throwing an exception to the agent.
3. **Given** the status response does not contain the required status indicator and description,
   **When** the status check validates the response, **Then** it returns a readable error
   observation and does not present the invalid response as provider status.

### Edge Cases

- The provider argument is omitted; GitHub is selected by default.
- A provider value outside `github` and `cloudflare` is not accepted.
- A request times out at the five-second limit; retry policy applies to that failed attempt.
- A network failure or server error occurs on the first attempt and the retry either succeeds or
  fails.
- A non-server client error or an invalid response is received; it is reported as a readable
  observation and does not trigger a retry.
- A response is missing the nested status object, indicator, or description, or either required
  field has the wrong type.
- The status service remains unavailable after the permitted retry; the tool returns an error
  observation and does not throw.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The agent MUST provide a `check_provider_status` tool in
  `src/agents/tools.ts` to check the public service status for GitHub and Cloudflare without
  requiring provider credentials.
- **FR-002**: The tool MUST accept a provider selection limited to `github` and `cloudflare`, and
  MUST select `github` when no provider is supplied.
- **FR-003**: The tool's description MUST explain that it is appropriate when an external
  dependency may be unavailable and responders need to distinguish a provider-side issue from an
  internal issue.
- **FR-004**: The tool MUST obtain status from the corresponding public status source:
  `https://www.githubstatus.com/api/v2/status.json` for GitHub and
  `https://www.cloudflarestatus.com/api/v2/status.json` for Cloudflare.
- **FR-005**: Each request attempt MUST have a five-second timeout enforced with
  `AbortSignal.timeout`. A network failure, timeout, or server error (HTTP 5xx) MUST result in
  exactly one additional attempt; no further attempts may be made.
- **FR-006**: A response MUST be validated with Zod and considered valid only when it contains a
  status object with string-valued `indicator` and `description` fields.
- **FR-007**: On success, the tool MUST return the provider's status indicator and description
  together on one compact line.
- **FR-008**: If the final request or response validation fails, the tool MUST return a readable
  error string as the tool result and MUST NOT throw an exception outside the tool.
- **FR-009**: The status-fetch function MUST be injectable in tests. Tests MUST use a fake fetch
  function to verify success, timeout, retry, and invalid-response behavior without network access.

### Key Entities

- **Provider**: An external dependency supported by the status check; currently GitHub or
  Cloudflare.
- **Provider status observation**: The provider's status indicator and human-readable description,
  or a readable statement that status could not be retrieved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a valid status response, the agent receives one line containing both the
  provider's indicator and description in 100% of successful checks.
- **SC-002**: Each status request attempt ends within five seconds, and no failed eligible check
  makes more than one retry.
- **SC-003**: 100% of final lookup failures produce a readable tool-result observation without an
  exception escaping the status check.
- **SC-004**: All defined status-check behaviors can be verified without depending on live provider
  availability.

## Assumptions

- The two named public provider status pages are the authoritative sources for this feature.
- A valid status payload uses the requested shape `{ "status": { "indicator": string,
  "description": string } }`.
- Retry is limited to a single additional attempt after a timeout, network failure, or HTTP 5xx
  response. Invalid payloads and other HTTP errors are reported without a retry.
- Error observations distinguish a failed lookup from a provider-reported degraded or unavailable
  status.
- This feature reports provider status only; it does not open, modify, or resolve incidents.
- The specified five-second timeout, response validation, test injection, and no-throw behavior
  are part of the requested tool contract.
