# [Play Space Core](https://bishoppawn1.github.io/space_core/)

Space Core is a browser-based spaceship construction and combat game. Build a ship around the core, launch into the debris field, salvage parts, trade, research upgrades, and fight enemy ships.

## Local Development

Run the local server:

```sh
npm start
```

Then open the URL printed by the server, usually:

```text
http://127.0.0.1:4174/
```

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the static game files from `dist` whenever `main` is pushed. The Pages build includes `index.html`, `js`, and `styles`.

The hosted GitHub Pages version runs the single-player/static browser game. WebSocket multiplayer still needs the local `server.js` process or another WebSocket host.
