# Research: War Room Web Console

## Decisions

### Deploy below `/opspilot/`

- **Decision**: Build the frontend with Vite's `base` set to `/opspilot/`; configure static hosting to serve the application entry point under that prefix. Treat the HTTP API origin as a separate runtime setting.
- **Rationale**: Vite rewrites generated asset URLs for a non-root base. A separate API URL supports deployment environments without embedding backend origin assumptions in page paths. `VITE_` variables are public build-time values and must not contain secrets.
- **Alternatives considered**: Root-relative assets break when hosted beneath a path; proxy-only development would not validate production base-path behavior.
- **Sources**: [Vite public base path](https://vite.dev/guide/build#public-base-path), [Vite environment variables](https://vite.dev/guide/env-and-mode), [Vite static deployment](https://vite.dev/guide/static-deploy).

### Cross-origin browser requests

- **Decision**: Configure the Express API with an explicit allowed-origin list for the web deployment and local development, only the required methods/headers, and preflight support. Do not enable credentialed requests for the single-operator version.
- **Rationale**: JSON POST requests and the approval POST require preflight handling. CORS determines whether a browser can read a cross-origin response; it does not authenticate callers or protect a public API.
- **Alternatives considered**: Wildcard origins and broad credential support are unnecessary for this deployment. A development proxy alone would hide the real CORS contract.
- **Sources**: [Express CORS middleware](https://expressjs.com/en/resources/middleware/cors.html), [MDN CORS guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

### Untrusted Markdown and trace values

- **Decision**: Render answers with React Markdown and GFM support for tables; keep raw HTML disabled and apply a sanitizer schema. Render tool arguments and observation values as escaped text/JSON, not HTML.
- **Rationale**: Assistant answers and operational tool results are untrusted. Rich Markdown is required, while raw HTML and unsafe URL schemes are not needed for the requested content. Trace payloads should remain literal audit data.
- **Alternatives considered**: `dangerouslySetInnerHTML` and enabling raw HTML increase XSS risk. Plain text alone would omit requested tables and formatted code.
- **Sources**: [React DOM security guidance](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html), [react-markdown](https://github.com/remarkjs/react-markdown), [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize), [OWASP XSS overview](https://owasp.org/www-community/attacks/xss/).

### Responsive and accessible operator interface

- **Decision**: Use semantic landmarks, labeled controls, native buttons, visible keyboard focus, and status announcements that do not steal focus. On narrow screens, make chat and audit content switchable or stacked; confine horizontal overflow to code or wide structured data.
- **Rationale**: The chat and trace panel must stay operable with keyboard and at small viewport widths. A modal settings panel must follow dialog focus and dismissal behavior if implemented as a modal.
- **Alternatives considered**: A permanently side-by-side layout is not suitable for narrow viewports. Mouse-only controls and focus movement on every status update are not accessible.
- **Sources**: [WCAG 2.2 keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [WCAG 2.2 reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [WCAG 2.2 status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### Frontend validation and testing

- **Decision**: Keep `node:test` through `tsx` as the test runner required by the repository constitution. Use a DOM test environment and React Testing Library for component behavior; validate the production artifact at the non-root base path.
- **Rationale**: The existing test runner and root quality gates remain consistent across server and frontend code. Component assertions target user-visible behavior and keyboard operation.
- **Alternatives considered**: Vitest is a common Vite choice and integrates directly with Vite config, but introduces a second test runner contrary to the project constitution. Playwright adds browser provisioning and is deferred; the build and focused UI/API tests cover this feature's bounded scope.
- **Sources**: [Node test runner](https://nodejs.org/api/test.html), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Testing Library user-event](https://testing-library.com/docs/user-event/intro/), [Vite static deployment](https://vite.dev/guide/static-deploy).

### Tailwind integration

- **Decision**: Use Tailwind CSS through its official Vite plugin and CSS import in the web workspace.
- **Rationale**: This is the documented direct integration for Vite and avoids a separate runtime styling layer.
- **Alternatives considered**: A separate PostCSS setup is unnecessary for this single Vite client.
- **Source**: [Tailwind CSS installation with Vite](https://tailwindcss.com/docs/installation/using-vite).

### Operator identity and autonomy policy

- **Decision**: Use one stable `userId` configured server-side for a single-operator installation. The web client sends the message and optional conversation ID, while the API associates the configured identity with chat and approval records. Require a deployment network perimeter; do not treat CORS as authorization. Intercept `open_incident` and `resolve_incident` before mutation, persist a pending action, and execute only after an explicit approval.
- **Rationale**: The user selected a single-operator flow where they type only the question. The current backend has no authentication middleware, so the feature must not imply that CORS or an operator-supplied ID authenticates a person. The two existing write tools change operational state; read-only lookups remain autonomous.
- **Compatibility boundary**: Select the approval-aware tool registry only for War Room chat requests carrying `Idempotency-Key`. Existing MCP, CLI, and legacy HTTP requests continue to use the original tool registry and explicit identity behavior; the browser is an adapter rather than a replacement for those tested paths.
- **Alternatives considered**: Adding SSO/authentication would expand scope and conflicts with the selected single-operator mode. Trusting arbitrary browser-supplied `userId` would not provide identity validation. Applying approvals to read-only tools would unnecessarily block investigation.
- **Sources**: Existing project contracts [HTTP chat](../002-chat-api/contracts/http-chat.md), [semantic memory](../008-semantic-memory/contracts/http-chat-and-memory.md), and implementation surfaces `src/http/server.ts`, `src/agents/tools.ts`.

## Resolved Unknowns

- The selected client stack and deployment path are explicit in the feature request.
- The backend is an existing Express/TypeScript service using SQLite and `node:test`/`tsx`, confirmed from `package.json`, `src/http/server.ts`, and the project constitution.
- The initial conversation request omits `conversationId`; the existing API creates and returns it. Follow-ups include it.
- The application has no current CORS or authentication integration. CORS allowlisting and server-side single-installation identity are part of this feature; multi-user authentication is explicitly out of scope.
- Pending approval persistence uses the existing SQLite database. An approval can only execute once, and a rejected/failed action is never reported as successfully completed.
