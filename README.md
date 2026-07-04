# Click here to play: [Space Core](https://bishoppawn1.github.io/space_core/)

Space Core is a browser-based spaceship construction and combat game. Build a ship around the core, launch into the debris field, salvage parts, trade, research upgrades, and fight enemy ships.

New players see a short tutorial first. Completing or skipping it opens the main menu, where Single Player starts the current local game flow. Multiplayer menu options are visible placeholders while server browsing/hosting flows are still in progress.

## Local Development

Run the local server:

```sh
npm start
```

Then open the URL printed by the server, usually:

```text
http://127.0.0.1:4174/
```

## Autonomous Tests

Run the browser test suite:

```sh
npm test
```

The suite starts the local server automatically, opens the game with `?test=1`, and checks construction, launch controls, weapon retargeting, trade/research, ammo routing, repair, shields, and salvage collection.

If Playwright browsers are missing on a new machine, install Chromium once:

```sh
npm run test:e2e:install
```

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the static game files from `dist` whenever `main` is pushed. The Pages build includes `index.html`, `js`, and `styles`.

The hosted GitHub Pages version runs the single-player/static browser game. WebSocket multiplayer still needs the local `server.js` process or another WebSocket host.
