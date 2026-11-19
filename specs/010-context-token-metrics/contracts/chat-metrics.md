# Chat Metrics Contract

This contract extends the successful response for the existing `POST /chat` endpoint. Request fields and error responses are unchanged.

## Successful response

`metrics` retains all existing fields and adds:

```json
{
  "promptTokens": 1234,
  "contextBreakdown": {
    "request": 12,
    "history": 21,
    "memories": 5,
    "toolResults": 8,
    "reflection": 0
  }
}
```

- `promptTokens` is a non-negative integer equal to the sum of actual input-token counts reported for every observed model call in the request, or `null` if there were no model calls or any call did not report a usable input count. A reported zero is valid.
- `contextBreakdown` maps the source keys `request`, `history`, `memories`, `toolResults`, and `reflection` to non-negative integer estimates. Each explicit text inclusion is estimated as `Math.floor(text.length / 4)` and accumulated by source across model calls. Omit keys that did not contribute text.
- The source estimate is diagnostic and does not have to equal actual provider usage. It excludes hidden framework/model instructions, serialization overhead, and schemas not explicitly attributed.
- Both fields are required in every successful response. An empty map is valid when no attributable context text is available.

Existing metrics such as `IICalls`, `latencyMs`, and `historyMessages`, along with the response's `conversationId`, `answer`, and `trace`, remain present.

## Validation and compatibility

The HTTP response boundary validates `promptTokens` as nullable and non-negative integer, and every `contextBreakdown` value as a non-negative integer under a known source key. The endpoint does not substitute estimated values for missing actual usage. Existing callers that ignore additional metrics remain compatible.

## Long conversation exercise

For each successful response, `scripts/conversa-longa.sh` prints the actual `metrics.promptTokens` value. A null value is rendered as unavailable; locally estimated request/response text remains separately labeled as an estimate.
