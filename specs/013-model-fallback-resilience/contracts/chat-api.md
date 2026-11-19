# Chat API Contract: Model Fallback Resilience

## `POST /chat`

The request shape is unchanged: a non-empty `message` and `userId`, with the existing optional
conversation and strategy fields.

### Successful response

The existing 200 response retains `conversationId`, `answer`, `trace`, and `metrics`.

The `metrics` object adds `modelUsed`, the identifier of the model that produced the latest
successful model output contributing to the returned answer. It is omitted only when no model was
invoked (for example, a test or injected strategy that computes a result without an LLM).

When failover succeeds, `trace` contains:

```json
{
  "type": "fallback",
  "node": "react",
  "from": "provider/primary-model",
  "to": "provider/fallback-model"
}
```

The event records successful failover only; failed attempts do not create a success-shaped event.
Model identifiers are configuration labels. Credentials, prompts, and provider error bodies are
never included.

### Exhausted model response

If every configured model candidate fails, `POST /chat` returns HTTP 503:

```json
{
  "error": {
    "code": "MODEL_UNAVAILABLE",
    "message": "All configured models are unavailable. Try again later."
  }
}
```

No partial assistant response is returned or persisted as a successful answer. Other existing
request validation and error mappings remain unchanged.
