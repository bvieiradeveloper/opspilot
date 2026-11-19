# Feature Specification: GitHub Pages Deployment

**Feature Branch**: `[017-github-pages-deploy]`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Deploy do web/ no Pages via Actions: upload-pages-artifact + deploy-pages, permissões, README (atualizar)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish the web console (Priority: P1)

As a repository maintainer, I want the web console to be built and published automatically after changes are pushed to `main` so that operators can use the current version without manually uploading files.

**Why this priority**: Publishing the console is the primary outcome of this feature.

**Independent Test**: Push a change to the web console on `main`, confirm that a successful run publishes the new version, and open the published URL to verify the page and its assets load.

**Acceptance Scenarios**:

1. **Given** a valid change has been pushed to `main`, **When** its build and deployment complete successfully, **Then** the GitHub Pages site serves the newly built web console.
2. **Given** the web console is published as a repository project site, **When** an operator opens its Pages URL, **Then** the page and its static assets load from the project path without broken links.
3. **Given** the web console build fails, **When** the workflow finishes, **Then** deployment does not run and the failure is visible to the maintainer.
4. **Given** the deployment workflow runs, **When** it requests repository access, **Then** it has only the permissions needed to read the source and publish the site.

### User Story 2 - Configure and understand publishing (Priority: P2)

As a repository maintainer, I want the README to explain the Pages setup and publishing workflow so that I can enable deployment, find the published site, and diagnose common failures.

**Why this priority**: Clear setup instructions let maintainers operate the deployment safely and reduce setup errors.

**Independent Test**: Have a maintainer who did not configure the workflow follow the README to identify the Pages source, required repository configuration, deployment trigger, and published URL.

**Acceptance Scenarios**:

1. **Given** a maintainer is setting up Pages for the repository, **When** they follow the README, **Then** they can identify the required Pages configuration and the workflow's deployment behavior.
2. **Given** a deployment fails, **When** the maintainer consults the README, **Then** they can identify where to inspect the failed run and the common causes related to build or Pages configuration.
3. **Given** the site has been published, **When** an operator consults the README, **Then** the public site URL and the fact that the API is hosted separately are clear.
4. **Given** a maintainer follows the README and reviews the published site, **When** they check deployment configuration and public assets, **Then** the instructions do not require embedding or publishing credentials.

### Edge Cases

- The site build fails or produces no publishable static output; no deployment is made and the workflow reports failure.
- The repository Pages configuration or deployment permissions are missing or insufficient; the deployment fails visibly rather than appearing successful.
- The web console's configured base path differs from the repository Pages project path; the published page must not be considered successful if its assets cannot load.
- The API is unavailable or has not been separately deployed; publishing the static console does not imply that the API is available.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide an automated workflow that builds the `web/` site and makes its generated static files available for GitHub Pages deployment.
- **FR-002**: The workflow MUST publish the built site to GitHub Pages after a successful build for changes pushed to `main`.
- **FR-003**: The deployment step MUST NOT run when the site build fails, and a failed build or deployment MUST be reported as a failed workflow run.
- **FR-004**: The workflow MUST grant only the permissions required to read the repository and publish the site; it MUST NOT use unrestricted write permissions.
- **FR-005**: The published site MUST load its page and required static assets from the repository's GitHub Pages project URL.
- **FR-006**: The README MUST explain how to enable Pages for workflow-based publishing, what changes trigger deployment, where to find the published URL, and where to inspect failures.
- **FR-007**: The README MUST distinguish static-site publishing from hosting the OpsPilot API and MUST NOT instruct maintainers to add secrets to the published static site.

### Key Entities

- **Site build artifact**: The static files produced from the web console build and provided for publication.
- **Workflow run**: The result of building and, only after a successful build, publishing the site; it includes a visible success or failure status.
- **Published site**: The web console available at the repository's GitHub Pages project URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a successful change is pushed to `main`, the updated site is available at its published URL within 15 minutes in at least 95% of observed runs.
- **SC-002**: In all tested runs where the site build fails, no new site deployment is made.
- **SC-003**: A maintainer can use the published project URL to load the page and all required static assets without broken requests.
- **SC-004**: A maintainer unfamiliar with the deployment can use the README in under 5 minutes to identify the Pages setup, deployment trigger, published URL, and failure-log location.

## Assumptions

- The `main` branch is the release source, and GitHub Pages is enabled for this repository as a project site.
- The deployment publishes only the static web console; the API remains hosted and configured separately.
- The published project URL uses the repository path, and the web console's asset paths will be aligned with that URL.
- The named `upload-pages-artifact` and `deploy-pages` actions in the request are constraints for planning the GitHub Actions workflow.
