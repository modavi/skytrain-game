# Skytrain

A small online card game for the family. The site is hosted on Azure Static Web Apps (Free plan) at https://icy-beach-087e9e80f.6.azurestaticapps.net.

## Layout

- `site/` - the game: `index.html`, `style.css`, and the scripts: `data.js` (stations and challenge cards), `game.js` (the rules), `ui.js` (the screens), `map-art.js`, `map-data.js`, `map.js` and `mapview.js` (the map, see below).
- `tests/` - tests for the rules and the map. Run with `node --test tests/*.test.js`.
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

## The map

The map screen shows TransLink's official [SkyTrain Network Map](https://www.translink.ca/schedules-and-maps/transit-system-maps), used with TransLink's permission, with the game drawn on top: the train, the last ride, and gold rings on stamped stations. The 🗺 button opens it (drag to move, pinch or +/- to zoom), and "Ride there" plays the train's trip after each roll.

- `site/map-art.js` is the map artwork (vector, from TransLink's PDF).
- `site/map-data.js` holds each station's position on the artwork and the exact track between neighbouring stations. It is generated, not written by hand.
- `site/map.js` and `site/mapview.js` use that data to draw the map screen and the ride.
- The tests check that the map has every game station, that its track connections match the game rules exactly, and that every stretch of track starts and ends at its stations.

To update the map when TransLink publishes a new one (needs `poppler-utils` and Python 3):

```
pdftocairo -svg skytrain-network-map.pdf map.svg
pdftotext -bbox skytrain-network-map.pdf words.html
node -e "const G=require('./site/game.js');require('fs').writeFileSync('game-adj.json',JSON.stringify({adj:G.adj,lines:G.lines}))"
python3 tools/build_translink_map.py map.svg words.html game-adj.json site
```

The script cross-checks every station name against the label text in the PDF and stops if anything doesn't line up.

## Later

A server version with an Azure Functions API and Table Storage so the shared deck state is remembered.
