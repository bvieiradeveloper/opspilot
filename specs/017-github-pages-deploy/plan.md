# Implementation Plan: GitHub Pages Deployment

**Branch**: `[017-github-pages-deploy]` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-github-pages-deploy/spec.md`

## Summary

Build the `web/` console and publish its static output to GitHub Pages on pushes to `main`. GitHub Actions will use Node.js 22 and run `npm ci` and `npm run build` from `web/`, upload `web/dist/` as a Pages artifact, and deploy it with least-privilege permissions only after a successful build. Vite's base path is `/opspilot/` so project-site assets resolve correctly. The README and environment/gitignore guidance will be updated for repeatable build and deployment without exposing secrets or implying that the API is deployed with the site.

## Technical Context

**Language/Version**: TypeScript/ESM; Node.js 22 LTS in CI
**Primary Dependencies**: Vite 8, React, GitHub Actions Pages actions
**Storage**: N/A for static deployment; API persistence remains SQLite
**Testing**: `node:test` through `tsx`; `npm test`; `npm run build`
**Target Platform**: GitHub Pages project site
**Project Type**: Web console with a separately hosted Express API
**Performance Goals**: Static page and assets load from the repository project path
**Constraints**: Publish only `web/dist/`; run from `web/` on pushes to `main`; Vite base path is `/opspilot/`; no credentials in the static build; use minimal `contents`, `pages`, and OIDC permissions
**Scale/Scope**: One static web workspace and one GitHub Actions workflow; API hosting remains out of scope

## Constitution Check

- **Boundaries Validated by Schemas**: No new application input boundary is introduced.
- **Layered MVC Responsibilities**: No API or domain architecture changes are planned.
- **Test-First Changes**: The repository test suite and typechecks remain available through the root npm scripts; the Pages workflow verifies the production web build before publishing.
- **Explicit Domain Errors**: No domain errors are introduced.
- **Secure and Responsible Operations**: Never expose provider credentials in Pages; use the Pages deployment OIDC flow and narrowly scoped job permissions.
- **Technology Constraints**: Node.js 22 LTS is used by CI; the current SQLite API remains separate.

**Gate**: Pass. The static workflow does not change application runtime behavior or violate the constitution.

## Project Structure

### Documentation (this feature)

```text
specs/017-github-pages-deploy/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pages-deployment.md
└── tasks.md
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── deploy.yml
web/
├── vite.config.ts
└── dist/                 # generated Pages artifact; ignored by Git
README.md
.gitignore
.env.example
package.json
```

**Structure Decision**: Keep the existing web workspace and API structure. Add one workflow under `.github/workflows/`; use Vite's configured `base` for the Pages project path and keep generated static files under `web/dist/`. The API is not included in the Pages artifact.

## Complexity Tracking

No constitution violations or additional architectural components are required.
