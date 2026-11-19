# Feature Specification: Safe Learning Reflector

**Feature Branch**: `[009-learning-reflector]`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Automatically identify durable facts and preferences from the user's latest message after each response, exclude one-time requests and secrets, save eligible facts asynchronously, and let the user forget a preference."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retain useful preferences safely (Priority: P1)

After receiving an answer, a user can expect the assistant to retain a concise, explicitly stated fact or preference that will be useful in future conversations, without retaining one-time requests or secrets.

**Why this priority**: Selective, safe learning is the central value of the feature; retaining transient or sensitive content would undermine user trust.

**Independent Test**: Send separate messages containing a durable preference, a one-time request, and a secret-like value. Verify that only the durable preference is retained and that the answer is delivered without waiting for learning.

**Acceptance Scenarios**:

1. **Given** the user's latest message contains a clearly stated durable preference, **When** the assistant completes its answer, **Then** a concise version of that preference is saved for that user after the answer is returned.
2. **Given** the user's latest message contains only a one-time request, **When** the assistant completes its answer, **Then** no long-term memory is created from that request.
3. **Given** the user's latest message contains a credential, secret, or authentication code, **When** the assistant completes its answer, **Then** that sensitive value is not saved as a memory.
4. **Given** the message contains no eligible durable fact or preference, **When** learning evaluates it, **Then** existing memories remain unchanged.

### User Story 2 - Forget a learned preference (Priority: P1)

A user can ask the assistant to forget a preference previously retained for them and can rely on it no longer being used in future conversations.

**Why this priority**: Users need a direct way to control what the assistant retains about them.

**Independent Test**: Have a preference retained, request that it be forgotten, and verify it is absent from later assistant context while unrelated memories remain available.

**Acceptance Scenarios**:

1. **Given** a user has one matching saved preference, **When** they ask the assistant to forget it, **Then** that preference is removed from their available memories.
2. **Given** a forget request could refer to multiple saved preferences or none, **When** it is handled, **Then** no memory is removed and the assistant asks the user to clarify.
3. **Given** a user forgets one preference, **When** they later ask a question relevant to another saved fact, **Then** the unrelated fact remains available.

### Edge Cases

- A message combines an eligible preference with a one-time request; only the eligible preference is retained.
- A message contains both an eligible preference and a secret; the secret is excluded even if the preference is retained.
- The message is ambiguous about whether a statement is durable; no memory is created unless the user clearly expresses a lasting fact or preference.
- Learning fails after the answer has been returned; the answer remains unchanged and available, and the failure is surfaced through operational error reporting.
- A forget request is ambiguous or does not match a saved preference; no memory is removed without clarification.
- A user has no eligible learning from a response; the normal conversation continues without a memory update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After each completed assistant answer, the system MUST evaluate only the user's latest message for facts or preferences that are explicitly stated and likely to remain useful in future conversations.
- **FR-002**: The system MUST NOT retain one-time requests, temporary instructions, or facts inferred solely from the assistant's answer as long-term memories.
- **FR-003**: The system MUST NOT retain secrets, credentials, authentication codes, or other sensitive access information from a user's message.
- **FR-004**: When no eligible durable fact or preference is identified, the system MUST leave the user's existing memories unchanged.
- **FR-005**: The system MUST retain an eligible fact or preference as a concise statement associated only with the user who provided it.
- **FR-006**: Learning MUST occur without delaying, changing, or withholding the answer already delivered to the user.
- **FR-007**: A learning failure MUST be surfaced through operational error reporting and MUST NOT change the already-delivered answer or prevent later conversations.
- **FR-008**: The system MUST allow a user to request that a specific learned preference be forgotten and MUST stop using that preference in future conversations after removal.
- **FR-009**: If a forget request does not identify one specific saved preference, the system MUST leave memories unchanged and ask the user to clarify.
- **FR-010**: Forgetting one preference MUST NOT remove or alter other memories belonging to the same user or any other user.

### Key Entities *(include if feature involves data)*

- **Learning Candidate**: A concise fact or preference evaluated for durability, sensitivity, and future usefulness before retention.
- **User Memory**: A retained durable fact or preference associated with its owner and available for future relevant conversations until forgotten.
- **Forget Request**: A user's request to remove one specific saved preference from their own available memories.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the complete set of learning acceptance tests, 100% of one-time requests and secret-like values are excluded from retained memories.
- **SC-002**: In the complete set of learning acceptance tests, 100% of clearly stated eligible durable preferences are retained as concise memories for the correct user.
- **SC-003**: The assistant returns every completed answer without waiting for background learning to finish.
- **SC-004**: In all forget acceptance tests, the requested unambiguous preference is absent from subsequent conversations, while unrelated memories remain available.
- **SC-005**: In all ambiguous-forget acceptance tests, zero memories are removed before the user clarifies which preference they mean.

## Assumptions

- Learning is evaluated after a completed assistant answer; failed or incomplete exchanges do not create memories.
- Only explicitly stated, durable, user-specific facts and preferences are eligible; uncertain candidates are not retained.
- Secret-like content includes credentials, passwords, access tokens, and one-time authentication codes.
- The existing user-scoped memory capability remains responsible for retaining, recalling, and removing memories; this feature defines the additional learning and forgetting behavior rather than a separate memory repository.
- A request to forget a preference is resolved against the requesting user's memories only; the assistant asks for clarification rather than guessing when the target is not unique.
