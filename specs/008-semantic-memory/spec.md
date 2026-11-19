# Feature Specification: Semantic User Memory

**Feature Branch**: `[008-semantic-memory]`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Allow the assistant to learn durable facts and preferences, recall them by meaning in user-scoped conversations, forget them on request, and manage them through a dedicated memory interface."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recall relevant personal facts (Priority: P1)

A user asks the assistant a question and receives an answer informed by relevant facts they previously asked it to remember, even when the question uses different words from those facts.

**Why this priority**: Reusing prior knowledge is the primary value of semantic memory and reduces the need for users to repeat themselves.

**Independent Test**: Save a fact using one set of words, then ask a related question using no words in common with the fact. Verify the relevant fact is available to the assistant and informs its answer.

**Acceptance Scenarios**:

1. **Given** a user has saved a relevant fact, **When** they send a chat request with their user identifier, **Then** the assistant receives that fact as context and can use it in its answer.
2. **Given** a saved fact and a related question with no words in common, **When** the user sends the question, **Then** the fact can still be recalled based on meaning.
3. **Given** more than three relevant facts, **When** the assistant recalls context, **Then** it receives no more than the three highest-ranked facts that meet the minimum relevance threshold.
4. **Given** no saved fact meets the minimum relevance threshold, **When** the user chats, **Then** no unrelated fact is added to the assistant's context.

### User Story 2 - Learn durable facts (Priority: P1)

After a successful chat exchange, the assistant identifies durable facts or preferences expressed by the user and saves a concise version for future conversations. A user can also save a fact directly through the memory API.

**Why this priority**: Recall is only useful when the system can reliably retain useful facts without requiring a separate manual workflow for normal chat.

**Independent Test**: Complete a chat turn containing a durable preference and verify that it is saved after the response without delaying that response. Also save an equivalent fact through the memory API and verify that only one memory is retained when similarity exceeds 0.92.

**Acceptance Scenarios**:

1. **Given** a successful chat turn expresses a durable preference, **When** the assistant has returned its response, **Then** a learning reflector can save a concise fact asynchronously for that user.
2. **Given** a user submits a fact to the memory API, **When** the request is valid, **Then** the fact is saved for the supplied user identifier.
3. **Given** a user already has a fact saved, **When** an equivalent fact with similarity greater than 0.92 is learned or submitted, **Then** the system does not create a duplicate memory.
4. **Given** two users save or express the same fact, **When** either user recalls memories, **Then** each user's memory remains associated only with that user.

### User Story 3 - Forget a saved fact (Priority: P1)

A user can ask the assistant in natural language to forget a specific fact, or delete a memory through the memory API, so it is no longer used in future conversations.

**Why this priority**: Users need control over personal information retained for future assistance.

**Independent Test**: Save a fact, forget it through chat and separately through the memory API, then ask a question that would previously have recalled it. Verify it is no longer available as context.

**Acceptance Scenarios**:

1. **Given** a user has a saved fact, **When** they request that specific fact be forgotten in chat, **Then** it is removed from their available memories.
2. **Given** a user has a saved fact identifier, **When** they delete it through the memory API with their user identifier, **Then** it is removed from their available memories.
3. **Given** a user has multiple saved facts, **When** they ask to forget one specific fact, **Then** their other facts remain available.
4. **Given** a forget request does not identify a saved fact unambiguously, **When** the request is processed, **Then** no memory is removed without confirmation or clarification.

### User Story 4 - Keep memories private to each user (Priority: P1)

A user receives context only from their own saved facts, even when other users have saved similar or more relevant information.

**Why this priority**: Memory is personal data; cross-user isolation is essential for user trust and safe operation.

**Independent Test**: Save distinct facts for two user identifiers, then make similar chat requests under each identifier. Verify that each receives only facts saved for that identifier.

**Acceptance Scenarios**:

1. **Given** two users have different saved facts, **When** either user chats, **Then** only that user's matching facts are considered for context.
2. **Given** a chat request omits its user identifier, **When** it is validated, **Then** the request is rejected and no user's memories are recalled.
3. **Given** a forget request is made for one user, **When** it completes, **Then** it does not remove another user's memory.

### Edge Cases

- A user with no saved facts receives normal chat behavior without memory context.
- Facts below the minimum recall relevance threshold are not supplied, even if they contain overlapping words.
- The recall result is limited to three facts, and facts at the threshold are eligible.
- Similarity equal to 0.92 does not meet the deduplication rule, which applies only when similarity is greater than 0.92.
- A missing, blank, or invalid user identifier is rejected rather than mapped to a shared or default user.
- A request to forget a nonexistent or ambiguous fact leaves existing memories unchanged.
- Saving a fact for one user never changes another user's saved facts.
- A learning-reflector failure after a chat response does not change the already-sent response or prevent future chat requests.
- A delete request for an identifier owned by another user behaves like an unknown memory and does not reveal or alter that memory.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat capability MUST require a user identifier and MUST use it to scope all memory operations for that request.
- **FR-002**: The system MUST allow a user to explicitly save a fact for future conversations.
- **FR-003**: When a saved fact has similarity greater than 0.92 to an existing fact for the same user, the system MUST avoid creating a duplicate memory.
- **FR-004**: The system MUST retain each saved fact and its semantic representation so that it can be considered in later conversations.
- **FR-005**: Before answering a chat request, the system MUST find matching facts for that request's user and make eligible results available to the assistant as context.
- **FR-006**: Recall MUST return at most three facts ranked by semantic relevance and MUST exclude facts with a relevance score below 0.30.
- **FR-007**: Recall MUST be based on semantic meaning rather than requiring shared words between the saved fact and the user's request.
- **FR-008**: The system MUST NOT use, recall, or modify memories belonging to a different user identifier.
- **FR-009**: The system MUST allow a user to explicitly forget a specific saved fact without affecting other facts belonging to that user.
- **FR-010**: If a forget request does not identify exactly which saved fact to remove, the system MUST leave memories unchanged and request clarification.
- **FR-011**: A request with a missing or invalid user identifier MUST be rejected before any memory is recalled or changed.
- **FR-012**: When no eligible memory is found, the chat capability MUST continue without memory context.
- **FR-013**: After a successful chat response, the system MUST asynchronously analyze the completed user turn for durable facts or preferences and save any concise fact selected for retention.
- **FR-014**: Asynchronous learning MUST NOT delay or change the already-returned chat response; a learning failure MUST be surfaced through the application's operational error reporting.
- **FR-015**: The chat capability MUST process a user's natural-language request to forget a saved fact; if the target is ambiguous, it MUST ask for clarification without deleting any fact.
- **FR-016**: The system MUST expose `POST /memories` to accept a user identifier and fact for explicit memory creation.
- **FR-017**: The system MUST expose a deletion operation under `/memories` that requires both the memory identifier and owning user identifier.
- **FR-018**: Memory HTTP operations MUST validate request data and MUST scope reads, deduplication, and deletion to the supplied user identifier.

### Key Entities *(include if feature involves data)*

- **User Memory**: A fact explicitly saved for one user, with a stable identity, its semantic representation, and the time it was created.
- **User Identifier**: The value used to associate saved facts with their owner and isolate recall, save, and forget operations.
- **Chat Request**: A user's message and required user identifier; eligible memories for that user may be supplied as additional assistant context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In semantic recall tests, a relevant saved fact is available to the assistant for a query with no words in common, when its relevance score is at least 0.30.
- **SC-002**: Every recall result contains no more than three facts, and contains no fact with a relevance score below 0.30.
- **SC-003**: In all test cases with a same-user fact similarity greater than 0.92, saving the fact does not increase that user's duplicate count.
- **SC-004**: In all two-user isolation tests, zero facts belonging to the other user are supplied to the chat context or removed by a forget operation.
- **SC-005**: After a specific fact is forgotten, it is absent from subsequent recall, while unrelated memories for that user remain available.
- **SC-006**: A chat request without a valid user identifier fails validation and receives no memory context.
- **SC-007**: A successful chat response is returned without waiting for learning-reflector completion, and a saved durable preference becomes available to subsequent recall.
- **SC-008**: Explicit memory creation and deletion through `/memories` succeed only for valid input and the owning user identifier.

## Assumptions

- The learning reflector saves only durable facts or preferences it identifies in a successful chat turn; transient details are not retained as long-term memory.
- The user identifier supplied to chat is a stable identifier provided by the caller. Authentication and proof that the caller owns that identifier remain responsibilities of the surrounding application.
- The minimum recall score is inclusive (0.30 qualifies); deduplication is exclusive (only values greater than 0.92 qualify).
- When a duplicate is detected, the existing fact is retained and no second memory is created.
- Memories are retained until explicitly forgotten or removed under the application's existing data lifecycle; this feature does not define a separate expiration period.
- Semantic representations are generated and used locally so personal memory content is not sent to an external service for recall.
- The application exposes `/memories` for explicit memory management in addition to chat-based learning and forgetting.
