# Contract: ContextBuilder

The ContextBuilder is an internal module contract shared by all reasoning strategies.

## Input

```ts
{
  system?: string;
  message: string;
  summary?: string;
  history?: readonly { role: "user" | "assistant"; content: string }[];
  memories?: readonly { fact: string; score: number }[];
  environment?: NodeJS.ProcessEnv;
}
```

## Output

```ts
{
  system: string;
  message: string;
  summary?: string;
  history: readonly { role: "user" | "assistant"; content: string }[];
  memories: readonly { fact: string; score: number }[];
  budgets: {
    summary: number;
    history: number;
    memories: number;
  };
}
```

## Behavior

- Preserve `system` and `message` byte-for-byte in the returned output.
- Apply defaults without consulting the host environment when the corresponding environment variable is absent.
- Throw a configuration error before assembly if any supplied environment value is invalid.
- Truncate summary only if its estimated size exceeds its configured budget.
- Remove oldest history entries until the estimated history size fits or the history is empty.
- Remove memories ordered by increasing score, with input order as the tie-breaker, until the estimated memory section fits.
- Return stable section ordering; the builder does not reorder retained history entries.

## Strategy Compatibility

React, plan-and-execute, and reflection wrapping either strategy must pass the same immutable/request and optional section inputs through this contract before constructing prompts. The builder does not change tool definitions or model invocation policies.
