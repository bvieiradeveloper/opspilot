# Pages Deployment Contract

## Inputs

- A push to `main` containing the repository source.
- Node.js 22 and npm dependencies from the root `package-lock.json`.
- Optional public Vite build variables; they must not contain credentials.

## Build

- Run `npm ci` and `npm run build` from `web/`.
- Generate the Pages artifact from `web/dist/`.
- Set the Vite project base to `/opspilot/`.
- A failed build must fail the workflow and must not produce a deployment.

## Publish

- Deploy only for a successful push to `main`.
- Use the `github-pages` environment and the uploaded Pages artifact.
- Build permissions: `contents: read`.
- Deploy permissions: `pages: write` and `id-token: write`.
- The published site contains the static web console only; the API is separate.

## Operator-visible results

- Branches other than `main` do not trigger this workflow.
- Pushes to `main` report deployment status and expose the published URL through the Pages environment.
