# OpsPilot Constitution

## Core Principles

### I. Boundaries Validated by Schemas
All external input and output at HTTP and CLI boundaries must be validated with Zod before it is used by application logic. Types and schemas must make invalid operational data difficult to represent and pass between layers.

### II. Layered MVC Responsibilities
Organize the application into Model, Service, and Controller responsibilities. Keep domain rules in services, persistence concerns in models, and transport concerns in controllers. Do not let agent, HTTP, or database concerns become unnecessarily coupled.

### III. Test-First Changes
Every new behavior must be accompanied by tests using Node's built-in test runner (`node:test`) through `tsx`. Relevant tests must pass along with the TypeScript typecheck before a change is considered complete.

### IV. Explicit Domain Errors
Represent expected domain failures with dedicated error classes and translate them at the application boundary. Avoid leaking implementation details or unhandled internal errors through the API or CLI.

### V. Secure and Responsible Operations
Never commit secrets, and do not read `.env` directly in application code. Agent workflows for production alerts and incidents must keep inputs, outputs, and operational decisions explicit and validated.

## Technology Constraints

- Runtime: Node.js 22 LTS.
- Language and modules: TypeScript with ESM and strict type checking.
- API: Express.
- Persistence: SQLite through Node.js's built-in `node:sqlite` module (`DatabaseSync`); do not introduce a traditional database server as the application's persistence layer.
- Validation: Zod at HTTP and CLI boundaries.
- Agent orchestration: LangChain and LangGraph, using OpenRouter as the model provider.
- Tests: Node.js `node:test`, run through `tsx`.
- Use the package scripts as the project entry points:
	- `npm run dev` starts the API.
	- `npm run arena` runs the arena.
	- `npm run bench` runs benchmarks.
	- `npm run test` runs the test suite.
	- `npm run typecheck` checks types without emitting files.

## Development Workflow

Follow the GitHub Copilot Spec Kit flow in this order:

`/speckit.specify -> plan -> task -> implement`

Specifications must be versioned in `specs/`. Keep specifications, plans, tasks, and implementation aligned with this constitution and with the current package scripts and project guidance.

## Governance

This constitution governs project decisions and must be considered during specification, planning, task generation, implementation, and review. Contributions must follow the principles above, validate external data, include tests for new behavior, and pass `npm run test` and `npm run typecheck`. Any deliberate change to these principles must be reflected in a reviewed constitution update. Secrets must never be committed, and application code must not read `.env` directly.

**Version**: 1.1.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-10-11
