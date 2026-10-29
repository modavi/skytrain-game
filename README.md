# Skytrain

A small online card game for the family. The site is hosted on Azure Static Web Apps (Free plan) at https://icy-beach-087e9e80f.6.azurestaticapps.net.

## Layout

- `site/index.html` - the website. Right now it is a "coming soon" stub.
- `.github/workflows/deploy.yml` - GitHub Action that publishes `site/` to Azure.

## How deploys work

- Pushing to `main` publishes the site.
- Opening a pull request publishes a temporary preview copy; it is removed when the pull request is closed or merged.
- The workflow needs a repo Actions secret named `AZURE_STATIC_WEB_APPS_API_TOKEN` (the Static Web App's deployment token).

## Later

A server version with an Azure Functions API and Table Storage so the shared deck state is remembered.
