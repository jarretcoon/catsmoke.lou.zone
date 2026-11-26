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

## Notes

This is a free fan project. It isn't affiliated with or endorsed by any casino, resort or brand
shown in it. Their names, signs and logos belong to their owners. The Sphere's show is an original
storm scene made for this game.

Copyright © 2026 Jarret Coon. All rights reserved.
