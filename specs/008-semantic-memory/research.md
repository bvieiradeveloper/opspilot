# Research: Semantic User Memory

## Local sentence embeddings

- **Decision**: Use `@huggingface/transformers` with the `feature-extraction` pipeline and `onnx-community/all-MiniLM-L6-v2-ONNX`. Request mean pooling and L2 normalization, CPU execution, and fp32 output. The expected embedding is a 384-element float vector.
- **Rationale**: The ONNX Community model card documents the Transformers.js feature-extraction workflow. Mean pooling and normalization are supported directly by the pipeline and match the original model's sentence-transformer use. Normalized vectors make dot product equivalent to cosine similarity.
- **Alternatives considered**: `Xenova/all-MiniLM-L6-v2` remains a compatible alternative but the ONNX Community repository is the more direct current ONNX model choice. Implementing pooling manually was rejected because the pipeline already handles attention masks and normalization.
- **Sources**: [ONNX model card](https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX), [original model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [Transformers.js feature extraction](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/pipelines/feature-extraction.js).

## Initialization and local model availability

- **Decision**: In `src/memory/embeddings.ts`, lazily initialize a singleton pipeline and cache the initialization promise so simultaneous first callers share one load. Set model cache configuration before creating the pipeline. Use local cached artifacts for inference; provision the cache before operating without network access.
- **Rationale**: Transformers.js documents a Node filesystem cache and a local model path. Its loader checks cached artifacts and can be configured to disallow remote models, causing a clear failure when the model is not provisioned instead of silently downloading it during offline operation.
- **Alternatives considered**: Loading one model pipeline per request was rejected due to repeated initialization and resource use. Requiring network inference was rejected because the feature calls for local embeddings.
- **Operational note**: A cold cache requires model artifact download or explicit provisioning; once warmed, the cache can be reused and remote model loading can be disabled.
- **Sources**: [Node.js tutorial: caching and local models](https://huggingface.co/docs/transformers.js/en/tutorials/node), [environment API](https://huggingface.co/docs/transformers.js/en/api/env), [hub loader](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/utils/hub.js).

## Stored vector representation and similarity

- **Decision**: Store the 384 float32 values as a 1,536-byte SQLite BLOB. Convert to and from byte views without numeric array coercion, reject invalid lengths/non-finite values, and keep the model dimensions fixed for this feature. Query only a user's rows and calculate dot products in application code; sort descending and apply the 0.30 threshold and top-three cap. Deduplication compares only that user's vectors and applies strictly above 0.92.
- **Rationale**: SQLite has no built-in vector type in the mandated stack. A compact fixed-size BLOB preserves the local vector without adding a database or vector extension, while memory sets are scoped per user as required.
- **Alternatives considered**: Storing JSON arrays was rejected for size and parsing overhead. A remote vector database or embedding API conflicts with the project's persistence and local-model constraints. SQL-side ranking is unavailable without an additional extension.

## Chat learning and forgetting

- **Decision**: Add a learning reflector that analyzes a completed successful user/assistant turn after the HTTP response has been sent. It extracts only durable, concise facts or preferences and calls the same `remember` operation used by the explicit API. Handle natural-language forget requests through request-scoped memory tools. Resolve a description against eligible facts for the validated user and delete only if exactly one candidate matches; return candidates for clarification if multiple results match. Never let model-supplied arguments choose the owner `userId`.
- **Rationale**: This follows the requested complementary modes: automatic learning/forgetting in natural chat and explicit HTTP management. Reuse the existing configured chat model for fact extraction rather than adding a separate remote learning provider; only embedding generation and vector scoring are local. The response remains independent of slower learning analysis, and user scoping stays enforced outside model-generated tool arguments.
- **Alternatives considered**: Blocking chat completion on reflection would add model latency and make a nonessential memory update part of chat success. Allowing model-supplied owner IDs would weaken user isolation. Deleting on an ambiguous language match was rejected as unsafe.

## Test strategy

- **Decision**: Use deterministic injected embedders for store threshold, ordering, persistence, and isolation tests. Use injected learning reflectors and reasoning strategies for chat and HTTP tests. Add a focused integration test that loads the local model and checks semantic recall for a relevant query with no words in common; provision/cache model assets ahead of offline CI and disable remote model loading for that test run.
- **Rationale**: Most tests remain repeatable and independent from external model providers. The focused model test verifies semantic meaning instead of merely testing vector arithmetic with fabricated embeddings.
- **Alternatives considered**: Requiring a model download in every test run was rejected because it makes ordinary CI network-dependent. Testing only synthetic vectors was rejected because it would not prove meaning-based retrieval.
- **Sources**: [Node.js tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/node), [ONNX Runtime JavaScript/Node.js](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).
