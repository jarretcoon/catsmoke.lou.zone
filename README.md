# Smoking Cat Simulator: Las Vegas Strip

A browser game about Lou, a chunky brown tabby (and a real cat), prowling a 3D Las Vegas Strip.
Walk into the casinos, the Sphere, the Forum Shops and the Grand Canal Shoppes. Ride the Deuce,
the High Roller and a gondola. Play for tips, and stay ahead of casino security.

**Play it: https://catsmoke.lou.zone**

## Controls

- Move: `W A S D` or the arrow keys. Sprint: `Shift`. Jump: `Space`.
- Smoke or vape: `E`. Switch between them: `V`.
- Beg or pose for photos: `B`. Steal cigs: `Q`. Dance for tips: `X`.
- Ride: `G`. Gamble, shop or enter the VIP lounge: `F`.
- Time of day: `T`. Goals: `J`. Minimap: `M`. Background sound: `N`. Reset: `R`.

## Run it locally

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev      # http://localhost:5180
bun run build    # type-check, then build to dist/
bun run preview  # serve dist/ on http://localhost:5181
```

## How it's built

- [three.js](https://threejs.org) with Vite and TypeScript. The whole Strip is built in code
  (`src/world/`), including its textures (canvas-drawn) and its sounds (synthesized with WebAudio).
- Lou is a Blender model that `blender/build_tabby_cat.py` builds from scratch. It exports
  `public/models/tabby_cat.glb` (Draco + WebP).
- Hosting: a Cloudflare Worker serving static assets (`wrangler.jsonc`). Merging to `main` deploys
  the live site, and every pull request gets a preview link.

## Checks

Every pull request runs the **Game check** (`.github/workflows/check.yml`). It builds the game, opens it
in a headless browser, checks it reaches "Ready" with no errors, and takes a dozen fixed snapshots
(`checks/postcards.json`). Each snapshot is measured for draw calls (against a budget per view), brightness,
blown-out white and black frames. The snapshots are posted in a PR comment next to `main`'s.

Run it locally (uses your installed Chrome):

```sh
bun run build && bun run build:check
bun run check          # software WebGL, like GitHub; add -- --gpu for this machine's GPU
```

## Notes

This is a free fan project. It isn't affiliated with or endorsed by any casino, resort or brand
shown in it. Their names, signs and logos belong to their owners. The Sphere's show is an original
storm scene made for this game.

Copyright © 2026 Jarret Coon. All rights reserved.
