# Research: Persistent Chat History

## Existing application patterns

- **Decision**: Keep the feature in the existing TypeScript/Express application and follow its MVC separation: HTTP boundary, conversation orchestration, and persistence model.
- **Rationale**: `src/http/server.ts` already owns `/chat`, while `src/index.ts` is the production composition root and `src/store/sqlite-ops-store.ts` demonstrates the approved SQLite model pattern.
- **Alternatives considered**: Adding a separate service or database server was rejected because this is a focused extension to the existing chat path and the constitution mandates SQLite.

## Persistence technology and store contract

- **Decision**: Implement a `ConversationStore` contract with `create`, `append`, and `lastMessages` operations and a SQLite-backed implementation using `DatabaseSync`. Keep conversation persistence in its own store alongside the existing operational store.
- **Rationale**: This matches the requested store operations and existing synchronous store conventions, keeps conversation data separate from operational records, and permits direct isolated tests with SQLite `:memory:`.
- **Alternatives considered**: Reusing the operational store's responsibilities was rejected because conversation history has a separate lifecycle and interface. An external database or persistence package would violate project constraints and add an unnecessary dependency.

## Conversation and message schema

- **Decision**: Persist conversation identifiers in a conversations table and ordered user/assistant messages in a messages table with a required conversation reference. Give each conversation a generated stable identifier and each message an ordering key; use bound SQL parameters, static DDL, and explicit row mapping.
- **Rationale**: A conversation record distinguishes a known empty conversation from an unknown identifier and lets the API reject unknown IDs reliably. An explicit ordering key preserves message order even when timestamps tie. These choices follow the SQLite patterns in `src/store/sqlite-ops-store.ts`.
- **Alternatives considered**: Inferring conversation existence solely from message rows was rejected because a valid conversation may temporarily contain no messages. Ordering only by timestamp was rejected because two messages can share the same timestamp.

## Context retrieval and composition

- **Decision**: Retrieve no more than the 12 newest prior messages for the identified conversation and pass them to the selected strategy as ordered role/content history alongside its current request. Each strategy composes the history into its model input. Compute `historyMessages` from prior messages supplied, before appending the current exchange.
- **Rationale**: Keeping the current request separate from history makes the request boundary explicit and lets ReAct preserve user/assistant message roles. The planning strategy can include the same ordered transcript in its planner request. The metric count remains unambiguous.
- **Alternatives considered**: Flattening history into the current request at the HTTP/service boundary was rejected because it obscures the caller's current message and loses structured roles. Including the current request in the count was rejected because the metric is specifically the prior history used as context.

## HTTP behavior and compatibility

- **Decision**: Accept optional `conversationId`; create a conversation when omitted and return its identifier on successful responses. Return `metrics.historyMessages` alongside existing metrics and use `404` with a stable error code for an unknown supplied identifier.
- **Rationale**: This preserves the current response data while making start/resume behavior explicit. `404 Not Found` communicates that a requested conversation does not exist and avoids silently changing its identity.
- **Alternatives considered**: Returning a new identifier for an unknown supplied ID was rejected because it could strand callers in a different conversation. Returning the count at the top level was rejected to keep all metrics together.

## Test strategy

- **Decision**: Test storage behavior using a fresh `:memory:` database and HTTP behavior using an injected deterministic fake strategy plus isolated conversation storage.
- **Rationale**: The constitution requires isolated SQLite persistence tests, and the existing chat integration tests already use a fake strategy to avoid network access. This tests exact context ordering, the 12-message boundary, response metrics, and conversation isolation without model credentials or retained test data.
- **Alternatives considered**: Live model-provider tests were rejected because they are nondeterministic, require external access, and cannot reliably verify the exact prompt context.

## Failure and lifecycle assumptions

- **Decision**: Preserve the existing request deadline and safe unexpected-error handling. Map expected unknown-conversation failures explicitly. Continue to use the configured SQLite file lifecycle in production and close owned storage through application composition.
- **Rationale**: This feature does not define a new retention policy or change existing chat timeout semantics. Clear ownership prevents tests and server lifecycle from sharing persistent test state.
- **Alternatives considered**: Introducing retention, cleanup, or user authentication behavior was rejected because the specification does not request those changes.
