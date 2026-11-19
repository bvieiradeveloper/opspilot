# War Room UI Contract

## Application shell

- The client is available at the `/opspilot/` base path.
- The main region prioritizes the conversation. A gear control opens API and theme settings.
- Empty, loading, connection-failure, and malformed-response states are visible and textually explained.
- Layout reflows for narrow screens; chat and trace views are stackable or switchable rather than forcing page-wide horizontal scrolling.

## Conversation

- Provide a labeled multiline message field and a native submit button.
- Show each submitted user message once. While waiting for `200` or `202`, announce a loading status and prevent duplicate submits.
- Generate one idempotency key for each new message and reuse it for retries; a successful or pending response ends that key's retry lifecycle.
- Start the first conversation without an ID; attach the returned ID to subsequent messages in that in-memory conversation.
- Render assistant Markdown with tables, lists, emphasis, and formatted code. Raw HTML is not enabled; sanitized rendering prevents unsafe markup/URL execution.
- Keep failed messages visible with a retry action that does not erase the existing conversation state.

## Trace and audit

- Every assistant answer has a "Ver raciocínio" action.
- The selected response's trace opens in a side panel on wide screens and a keyboard-operable stacked/dialog view on small screens.
- Preserve source order. Categorize `thought`, `action`, `observation`, and `answer` as response; render other known variants under their own labels.
- Show action tool names and complete arguments, and observation values as escaped text or formatted JSON. Do not parse trace content as HTML or Markdown.
- Opening a panel moves focus appropriately; closing by button or Escape returns focus to its opener.

## Human approval

- Every valid HTTP 202 response renders a prominent pending-action card for each returned approval, with the service-provided description, tool name, arguments, and "Aprovar" and "Rejeitar" controls.
- Disable both controls while the decision request is pending.
- Update to a final state only after the service returns a valid confirmation. Rejected actions show that no mutation ran.
- If an approved tool fails to execute, show the failure separately from rejection and do not resubmit it as a new action.
- On network or CORS failure, leave the card pending, explain the failure, and allow retry. Repeating the same decision is safe on the server.
- Malformed HTTP 202 bodies never show actionable approval controls.

## Settings and accessibility

- Settings are reachable from the gear control and contain a validated absolute HTTP(S) API base URL and a system/light/dark theme choice.
- Save API URL and theme locally; never store transcripts, tool data, secrets, or authorization tokens in browser storage.
- Support keyboard operation, visible focus, meaningful labels, semantic landmarks, and polite announcements for loading, errors, and completed decisions without moving focus.
- A modal settings view traps focus, supports Escape, and returns focus to the gear control when dismissed. Unsaved chat content is preserved.
- Use sufficient contrast in light and dark themes; do not rely on color alone to communicate event type or approval state.
