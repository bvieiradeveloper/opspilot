# Research: Chat API

## Summary

The repository already has the required HTTP, validation, agent, and test dependencies. The existing strategy contract supports plain deterministic fakes, and the installed LangChain runnable configuration supports `AbortSignal`, so the endpoint can honor its deadline without introducing another dependency.

## Decisions

### 1. Build an injectable Express app and keep startup separate

**Decision**: Export an app factory from `src/http/server.ts`; keep direct-execution startup in `src/index.ts`. Allow the app factory to receive a strategy registry, reflection options, and a request-timeout duration, with production defaults matching the public contract.

**Rationale**: `src/index.ts` is currently empty, Express 5 is already installed, and an app factory permits integration tests to exercise routing without initializing a real model provider. A configurable deadline allows timeout tests to run quickly while production remains fixed at 180 seconds.

**Alternatives considered**: Starting the listener as a module import would make tests harder to isolate. Adding Supertest would introduce a dependency despite Node's built-in HTTP and test facilities being sufficient.

### 2. Centralize named base strategies and apply reflection explicitly

**Decision**: Add a `ReadonlyMap<string, ReasoningStrategy>` in `src/agents/index.ts` for the existing base names `react` and `plan-and-execute`. Resolve the requested base strategy first; when `reflect` is true, apply `withReflection` to that strategy. Reuse the same base registry when the arena constructs its existing reflected and unreflected options.

**Rationale**: The public `reflect` boolean remains independent of strategy naming, unknown names can be distinguished before execution, and strategy construction no longer has multiple registries.

**Alternatives considered**: Requiring callers to send names such as `reflect:react` would duplicate the reflection flag and deviate from the request contract. Keeping separate registries in the API and arena risks drift.

### 3. Validate at the HTTP boundary and map expected failures explicitly

**Decision**: Use Zod `safeParse` for the request body and for the response object before serialization. Return request validation issues on `400`, map a typed unknown-strategy error to `422`, a request deadline to `504`, and unexpected failures to a generic `500` response without internal exception details. Handle JSON parser errors as client errors at the same boundary.

**Rationale**: This follows the constitution's HTTP-boundary validation rule and prevents implementation or model-provider details from leaking to callers. The installed Zod v4 exposes issues from `safeParse` results and `ZodError`.

**Alternatives considered**: Relying on Express's default error response can return HTML and disclose framework details. Treating every `ZodError` from anywhere in strategy execution as a client error could misclassify an internal failure.

### 4. Propagate an abort signal for the 180-second deadline

**Decision**: Create a per-request `AbortController`, abort it at the configured deadline, return `504`, and pass its signal through the reasoning input, underlying strategy invocations, reflection critic calls, and retries. Clear the deadline timer when processing finishes.

**Rationale**: The current `ReasoningInput` has no cancellation field, but the installed `RunnableConfig` declares `signal?: AbortSignal`. Propagation allows supported model and graph work to stop when the HTTP deadline expires instead of merely leaving it in the background.

**Alternatives considered**: `Promise.race` without cancellation can return `504` while provider calls continue consuming resources. Waiting for strategy completion would violate the endpoint's deadline.

**Caveat**: Cancellation is cooperative. Any strategy or provider operation that does not honor the signal may continue after the response deadline; the integration test must verify signal propagation through the strategy boundary.

### 5. Use built-in test facilities and deterministic fakes

**Decision**: Create a real Express app with injected fake strategies and exercise it through a temporary loopback HTTP server using Node's built-in `node:http` and `fetch`. The tests must not contact OpenRouter or any external service.

**Rationale**: The project targets Node 22 and already uses `node:test` through `tsx`; the strategy interface is straightforward to implement with a deterministic object. A loopback listener exercises Express parsing, routing, middleware, and serialization end to end.

**Alternatives considered**: Mocking Express request/response objects would test less of the HTTP behavior. Adding an HTTP testing package is unnecessary for these cases.

## Repository Findings

- `package.json` already declares Express `^5.2.1`, Zod `^4.6.5`, `tsx`, and the test/typecheck scripts; no dependency change is needed.
- `src/index.ts` is empty and `npm run dev` invokes it with `tsx`.
- `src/agents/reasoning.ts` defines `ReasoningStrategy.run` and the `ReasoningResult` shape; `ReasoningInput` currently contains `request` and optional `maxIterations`.
- `src/arena.ts` currently owns a local array of the two base strategies and their `withReflection` wrappers.
- `src/agents/reflection.ts` wraps strategies as `reflect:<base-name>` and accepts an injectable critic, which supports offline tests.
- Existing tests use `node:test` and plain fake strategy objects. The npm test glob discovers `src/**/*.test.ts`.
- `@langchain/core`'s installed `RunnableConfig` declaration includes `signal?: AbortSignal`.

## Resolved Questions

- No clarification markers remain. Use the existing supported strategy names, make reflection default to false, and use a 180-second production deadline with an injectable shorter test deadline.