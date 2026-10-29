# Skytrain

A small online card game for the family. The site is hosted on Azure Static Web Apps (Free plan) at https://icy-beach-087e9e80f.6.azurestaticapps.net.

## Layout

- `site/` - the game: `index.html`, `style.css`, and three scripts (`data.js` = the map and challenge cards, `game.js` = the rules, `ui.js` = the screens).
- `tests/game.test.js` - tests for the rules. Run with `node --test tests/`.
- `.github/workflows/deploy.yml` - GitHub Action that publishes `site/` to Azure.

## How deploys work

- Pushing to `main` publishes the site.
- Opening a pull request publishes a temporary preview copy; it is removed when the pull request is closed or merged.
- The workflow needs a repo Actions secret named `AZURE_STATIC_WEB_APPS_API_TOKEN` (the Static Web App's deployment token).

## How the game works

1. Set up: players, together or against each other, a token goal and/or a time limit, and how forks are decided (coin flip or the roller chooses).
2. On your turn, roll the die (or tap the number on a real die) and ride that many stops on the real SkyTrain map (Expo, Millennium and Canada lines). The whole family rides one train.
3. At a fork or transfer you flip a coin or choose, depending on the setting. At the end of a line the train turns around.
4. When you stop, draw a challenge card. Finish it for a token, or skip it.
5. The game ends when someone (or the team) reaches the goal, or when time runs out and the most tokens wins.

The challenge cards in `site/data.js` are placeholders; edit them there. The game is saved in the browser on one device only; sharing it between phones is what the server version below is for.

## Later

A server version with an Azure Functions API and Table Storage so the shared deck state is remembered.
