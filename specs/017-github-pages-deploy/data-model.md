# Data Model: GitHub Pages Deployment

This feature adds no application database entities. The following deployment artifacts are derived from the specification's key entities.

## Workflow Run

- **event**: push; only a push to `main` is eligible to build and deploy.
- **build status**: success or failure from `npm run build` in the web workspace.
- **artifact**: generated static site uploaded from `web/dist/` only after a successful build.
- **deployment status**: absent for branches other than `main`; visible success or failure for pushes to `main`.

## Site Build Artifact

- **source**: the `web/` Vite workspace.
- **output**: `web/dist/`.
- **base path**: `/opspilot/` for the GitHub Pages project site.
- **contents**: static HTML, JavaScript, CSS, and other required public assets; no server credentials.

## Published Site

- **URL**: the Pages URL exposed by the GitHub Pages environment after deployment.
- **API**: hosted separately; the site may be configured with a public API base URL but contains no API credentials.
- **lifecycle**: updated by a successful deployment from `main`.
