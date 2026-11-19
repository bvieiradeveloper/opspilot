# Feature Specification: Persistent Chat History

**Feature Branch**: `[007-persistent-chat-history]`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Persistent chat conversations that can be resumed by identifier, retain previous messages, include the 12 most recent messages as context, and report the history message count."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume a conversation (Priority: P1)

A caller continues an existing conversation by providing its identifier, so the assistant can respond with the relevant recent context instead of requiring the caller to repeat it.

**Why this priority**: Continuing an existing conversation is the main user value of persistent chat history.

**Independent Test**: Submit a message, retain the returned conversation identifier, and submit a follow-up with that identifier. Verify that the follow-up uses the earlier conversation context and returns the same identifier.

**Acceptance Scenarios**:

1. **Given** a conversation with prior messages, **When** a caller submits a new message with that conversation's identifier, **Then** the response continues that conversation and returns the same identifier.
2. **Given** a conversation with at least 12 prior messages, **When** a caller submits a follow-up, **Then** only its 12 most recent prior messages are supplied as context, in chronological order.
3. **Given** fewer than 12 prior messages, **When** a caller submits a follow-up, **Then** all available prior messages are supplied as context.

### User Story 2 - Start a conversation (Priority: P1)

A caller starts chatting without providing a conversation identifier and receives an identifier that can be used to continue the conversation later.

**Why this priority**: Callers must be able to begin a conversation without first obtaining an identifier elsewhere.

**Independent Test**: Submit a message without an identifier and verify that the response includes a newly assigned identifier; submit a follow-up with it and verify that the conversation can be resumed.

**Acceptance Scenarios**:

1. **Given** a chat request without a conversation identifier, **When** the request succeeds, **Then** a new conversation is created and its identifier is returned in the response.
2. **Given** a newly created conversation with no earlier messages, **When** its first message is processed, **Then** the history message count is zero.

### User Story 3 - Keep conversation histories separate (Priority: P2)

A caller's messages remain associated with the conversation in which they were sent, so continuing one conversation does not expose another conversation's history.

**Why this priority**: Conversation isolation preserves relevant context and prevents unrelated exchanges from being mixed.

**Independent Test**: Create two conversations with distinct messages, continue each, and verify that each response uses only its own conversation's context.

**Acceptance Scenarios**:

1. **Given** two conversations with different prior messages, **When** the caller continues either conversation, **Then** only that conversation's prior messages are used.
2. **Given** a caller provides an identifier that does not identify an existing conversation, **When** the caller submits a message, **Then** the request fails clearly and no new conversation is silently created.

### Edge Cases

- A new conversation has no prior history, and its history message count is zero.
- A conversation with fewer than 12 prior messages supplies all available messages; one with more than 12 supplies only the 12 most recent.
- The 12 selected messages retain their original order when supplied as context.
- An unknown conversation identifier is rejected rather than treated as a request to start a new conversation.
- A conversation identifier returned for one conversation is never used to retrieve messages from another conversation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat capability MUST accept an optional conversation identifier.
- **FR-002**: When no conversation identifier is provided, the system MUST create a new conversation and include its identifier in every successful response.
- **FR-003**: When a known conversation identifier is provided, the system MUST associate the new exchange with that conversation and return the same identifier.
- **FR-004**: The system MUST preserve each conversation's messages across separate chat requests and keep messages from different conversations isolated.
- **FR-005**: Before processing a follow-up, the system MUST include no more than the 12 most recent prior messages from that conversation as context, in their original order.
- **FR-006**: Each successful response MUST report `historyMessages`, equal to the number of prior conversation messages included as context; the value MUST be between zero and 12.
- **FR-007**: The system MUST reject an unknown conversation identifier with a client-facing error that identifies the identifier as unknown, and MUST NOT silently create a replacement conversation.

### Key Entities *(include if feature involves data)*

- **Conversation**: A distinct chat history identified by a stable identifier and containing an ordered sequence of messages.
- **Message**: A user or assistant contribution belonging to one conversation and ordered relative to its other messages.
- **Chat Response**: The result of processing a message, including the conversation identifier and a count of prior messages used as context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all successful chat scenarios, the response contains a conversation identifier that can be used to continue the same conversation.
- **SC-002**: In all follow-up scenarios, callers can continue without resending earlier messages, and the system supplies all available prior messages within the 12-message limit.
- **SC-003**: Across scenarios with zero, fewer than 12, exactly 12, and more than 12 prior messages, the context contains the correct number of messages, never exceeds 12, and the reported `historyMessages` count matches.
- **SC-004**: In all multi-conversation scenarios, no message from one conversation is included in another conversation's context.
- **SC-005**: All specified conversation scenarios can be verified without external model-service access or retaining test data after verification.

## Assumptions

- The chat operation already returns a successful response with answer and execution details; this feature adds the conversation identifier and history count without removing existing response data.
- A missing identifier starts a new conversation; an unknown supplied identifier is an error rather than a request to create one.
- The limit of 12 applies to prior messages used as context; the new request is processed after that prior context.
- Conversations remain available for later requests under the application's existing persistence lifecycle; this feature does not introduce a separate retention policy.
