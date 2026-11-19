# Chat Learning and Forget Tool Contract

## Post-response learning assessment

After a successful `/chat` response has been sent, the application may start a background assessment using only the latest user message from that completed turn.

Structured assessment result:

```json
{
  "hasLearning": true,
  "fact": "I prefer concise incident summaries."
}
```

When no durable, non-sensitive fact or preference qualifies:

```json
{
  "hasLearning": false,
  "fact": null
}
```

Contract rules:

- The result must conform to the structured schema before it is acted on.
- When `hasLearning` is false, no memory write occurs.
- When true, the fact must be non-empty and pass the durability and sensitive-content checks.
- At most one fact is sent to the existing `MemoryStore.remember` operation for the validated request user.
- The HTTP response does not wait for assessment or persistence. Failures are reported through the application's operational error reporting and cannot change the sent response.
- The message, assessment, and secret-like candidate must not be included in error logs.

## `forget_preference` agent tool

The tool accepts one model-controlled argument:

```json
{
  "preference": "concise incident summaries"
}
```

The application binds the owner from the validated chat request; the model cannot provide or override the owner identifier.

Possible outcomes:

- **Forgotten**: exactly one unambiguous memory belonging to the request user is removed.
- **Clarification required**: no unique owned memory can be identified; no deletion occurs and the assistant asks which preference the user means.
- **Failure**: the memory operation fails; return/report an explicit failure rather than claiming the preference was forgotten.

Only the requesting user's memories may be considered. A successful removal must not affect other memories.

## Existing HTTP behavior

This feature adds no new HTTP route or response field. Existing `/chat`, `/memories`, and memory deletion contracts remain in effect. Automatic assessment begins only after a successful chat response is sent.
