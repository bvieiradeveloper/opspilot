# Quickstart: GitHub Pages Deployment

## Prerequisites

- Node.js 22 LTS and npm.
- A GitHub repository with Actions enabled.
- The repository's Pages configuration set to **GitHub Actions**.

## Validate locally

From the repository root:

```powershell
Push-Location web
npm ci
npm run build
Pop-Location
```

The web workspace uses the root `package-lock.json`. The build must succeed and produce `web/dist/index.html`. Asset references must use `/opspilot/`.

## Enable deployment

1. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. If the deployed console should prefill its separately hosted API URL, set the repository Actions variable `VITE_API_BASE_URL` to that public URL. Do not put credentials in this variable.
3. Push a change to `main`. Other branches do not trigger this workflow.
4. Open **Actions** to inspect build or deployment failures. On success, use the `github-pages` deployment/environment URL.

Pages serves only the static web console. The API must be deployed and configured separately, including its allowed web origin.
