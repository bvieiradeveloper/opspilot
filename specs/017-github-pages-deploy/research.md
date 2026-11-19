# Research: GitHub Pages Deployment

## Decisions

- **Use the official Pages artifact flow.** Build the Vite app, upload only `web/dist/` with `actions/upload-pages-artifact`, and deploy that artifact with `actions/deploy-pages` in a dependent job.
- **Limit permissions by job.** The build job needs `contents: read`; the deployment job needs `pages: write` and `id-token: write`, and depends on a successful build.
- **Target `main` explicitly.** The requested workflow runs for pushes to `main` and deploys only that branch.
- **Set Vite's project base to `/opspilot/`.** This matches the repository's configured Pages project path and makes generated asset URLs resolve from the project site.
- **Keep the API separate.** Pages publishes static assets only. Any API base URL supplied at build time is public configuration, never a credential.

## Rationale

GitHub Pages workflow guidance uses a generated artifact and a separate deployment job/environment. The job dependency ensures deployment cannot start until the artifact is successfully built. Job-level permissions prevent the build from receiving publication rights. Vite documents that project sites require the repository path as `base`, otherwise relative assets can fail after publication.

## Alternatives Considered

- **Deploy source files directly:** rejected because Pages should receive the production build output, not the source tree.
- **Deploy dynamically from any configured default branch:** rejected because the requested trigger is specifically a push to `main`.
- **Derive the Vite path dynamically:** not needed for this deployment; the required project path is `/opspilot/`.
- **Publish the API with the Pages site:** rejected because Pages is static hosting; API hosting and its credentials are separate.

## Sources

- [GitHub: Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite: Deploying a Static Site — GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)
- [Vite: `base` shared option](https://vite.dev/config/shared-options.html#base)
