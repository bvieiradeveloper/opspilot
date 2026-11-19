# Tasks: GitHub Pages Deployment

**Input**: Design documents from `/specs/017-github-pages-deploy/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/pages-deployment.md`, `quickstart.md`

**Organization**: Tasks are grouped by user story and kept independently verifiable.

## Phase 1: Setup

**Purpose**: Add the production build entry point used by local validation and CI.

- [X] T001 [P] Mark the app private, declare Node.js 22, and add the `build` script for API typecheck, web typecheck, and Vite production build in `package.json` and `package-lock.json`

## Phase 2: Foundational

**Purpose**: Prepare the web output path and repository hygiene for publishing.

- [X] T002 [P] Set the Vite base path to `/opspilot/` in `web/vite.config.ts`
- [X] T003 [P] Ignore local secrets, generated output, runtime data, and logs while keeping `.env.example` trackable in `.gitignore`; document the runtime variables without adding secret values in `.env.example`

## Phase 3: User Story 1 - Publish the web console (Priority: P1)

**Goal**: Automatically build and publish the static console on pushes to `main`.

**Independent Test**: A push to `main` runs `npm ci` and `npm run build` from `web/`; a successful build deploys `web/dist/` to Pages with assets using `/opspilot/`.

- [X] T004 [US1] Configure `.github/workflows/deploy.yml` to use Node.js 22, run `npm ci` and `npm run build` in `web/`, upload `web/dist/`, and deploy after a successful push to `main`

## Phase 4: User Story 2 - Configure and understand publishing (Priority: P2)

**Goal**: Explain Pages setup, triggers, URL discovery, API separation, and failure diagnosis.

**Independent Test**: A maintainer can follow `README.md` to enable workflow-based Pages, identify when deployment runs, find the published URL and logs, and see that the API is separate.

- [X] T005 [P] [US2] Document local setup, build checks, Pages configuration, trigger behavior, public URL discovery, API separation, and troubleshooting in `README.md`

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify the full implementation against the deployment contract and quickstart.

- [X] T006 Run `npm test` and `npm run build`, then verify the generated `web/dist/index.html` uses the Pages project base described in `specs/017-github-pages-deploy/quickstart.md`

## Dependencies

```text
T001 ─┐
T002 ─┴─> T004 ─┐
T003 ────────────┼─> T006
T005 ────────────┘
```

- T001, T002, and T003 can be completed in parallel.
- T004 depends on the build command (T001) and Vite project base (T002).
- T003 and T005 can be completed in parallel with T004.
- T006 depends on all implementation and documentation tasks.

## Parallel Execution Examples

```text
Batch 1: T001 (package.json), T002 (web/vite.config.ts), T003 (.gitignore and .env.example)
Batch 2: T004 (.github/workflows/deploy.yml) and T005 (README.md), while T003 remains independent
Batch 3: T006 (test and build validation)
```

## Implementation Strategy

Deliver the P1 deployment path first: build command, project base, and Actions workflow. Complete the P2 README guidance alongside the repository cleanup, then run the test suite and production build and inspect the generated asset paths.
