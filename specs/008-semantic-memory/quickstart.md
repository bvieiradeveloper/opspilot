# Quickstart: Semantic User Memory

This guide validates the user-visible memory behavior defined in [the HTTP contract](./contracts/http-chat-and-memory.md) and [the data model](./data-model.md).

## Prerequisites

- Node.js 22 and npm.
- Project dependencies installed.
- For the real semantic integration test, provision the `all-MiniLM-L6-v2` ONNX model in the local Transformers.js cache while network access is available. Keep the cache available to the test process; run the test with remote model loading disabled to prove inference is local.
- Ordinary store and HTTP tests use injected deterministic embeddings and do not need a model download or an OpenRouter request.

## Run validation

```powershell
npm run typecheck
npm test
```

Expected result: TypeScript passes; unit and HTTP tests pass using in-memory SQLite and fakes; the dedicated embedding integration test passes using the locally cached model.

Run the real-model semantic recall test after provisioning the model cache:

```powershell
$env:RUN_SEMANTIC_INTEGRATION = "1"
$env:TRANSFORMERS_ALLOW_REMOTE_MODELS = "false"
npm test
```

For a custom writable cache location, set `$env:TRANSFORMERS_CACHE_DIR` before the first embedding is generated. The model must already be present there when remote loading is disabled.

## Scenarios to verify

1. `POST /memories` with a valid `userId` and fact creates a memory; an equivalent second fact above similarity `0.92` returns the existing memory without an additional row.
2. `POST /chat` with a valid `userId` and a question with different words from a saved fact receives that relevant fact as context when its score is at least `0.30`; at most three facts are provided.
3. The semantic integration test saves a fact and queries it with no shared words, then confirms that the local model ranks the fact above the recall threshold.
4. A successful chat expressing a durable preference returns before learning finishes; a later recall can find the asynchronously stored preference.
5. A natural-language forget request removes only one unambiguous memory for the current `userId`; ambiguous requests remove nothing.
6. `DELETE /memories/:memoryId?userId=...` removes an owned memory, while a different user's ID returns the generic not-found response.
7. A `/chat` request without a valid `userId` returns HTTP 400 before memory lookup or mutation.

No `.env` file is needed to execute deterministic tests; test fixtures should inject local fakes rather than reading environment secrets.
