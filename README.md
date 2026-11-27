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
- Pounce: `C`. Flop: `Z`. Honk while driving: `H`. Vape tricks: `1`–`4`.
- Camera: drag with the mouse to look around, the wheel zooms.
- Menu (pauses the game; controls, graphics, sound, full screen): `Esc`. Key hints on/off: `K`.
- Lou's phone: `P` (View / Select on a controller, the phone button on touch). Map, goals and missions,
  a camera (photo mode: poses, time of day, looks, a selfie, Save photo downloads a JPEG), rides (Waymo or
  Uber), texts, settings. The world keeps going while it's out; Lou stays put with it in his paws.
- On a phone: the stick walks, drag anywhere to look, pinch to zoom; the big button does whatever fits
  where Lou is (ride, gamble, shop, beg, smoke…) and the menu button has the rest. The minimap and the
  Degen Points live in the phone there, so the top of the screen stays clear.
- Graphics start on Auto: the game times its own frames and picks High, Medium or Low. Pick one in the
  menu to keep it.

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
  `public/models/tabby_cat.glb` (Draco + WebP). Phones and tablets load `tabby_cat_lite.glb`, the same
  model with half-size textures: after rebuilding Lou, run `node scripts/lite-model.mjs` to remake it
  (until then phones get the full model). Both are loaded with a content hash in the URL, so they can
  be cached for a year.
- Loading (`src/loading.ts`): Lou's model and the Draco decoder start downloading before the Strip is
  built, and the shaders of the opening view compile while Lou's model is parsed, with progress on the
  title screen.
- Hosting: a Cloudflare Worker serving static assets (`wrangler.jsonc`). Merging to `main` deploys
  the live site, and every pull request gets a preview link. The Worker's own code (`worker/index.ts`)
  only runs for `/api/*`: today that's the anonymous game stats below.

## Stats

The game sends a few anonymous numbers so we can see what to fix and what people play
(`src/stats.ts` → `POST /api/stats` → `worker/index.ts` → Cloudflare Workers Analytics Engine,
dataset `catsmoke_stats`, kept for three months; PR previews write to `catsmoke_stats_preview`).
The bindings are in `wrangler.jsonc`; without one (e.g. a local `wrangler dev`) the Worker accepts reports and drops them.

**What's sent**, as one small report when the tab is hidden or closed, and at most every 5 minutes
while playing: the kind of device (desktop, phone or tablet), the graphics setting, how long the game
took to load (in buckets like "3-6s"), the typical frame rate (in buckets), how long you've played (in
buckets), the three places on the Strip where Lou spent the most time, which missions and goals were
just finished, and the game version. Cloudflare adds the country.

**What isn't**: no IP address, no user agent, no cookies, no IDs of any kind, nothing stored on your
device for the stats, no fingerprinting, nothing that could tie two reports to the same person. If your browser
sends Do Not Track or Global Privacy Control, nothing is sent at all. Dev servers and the PR check
send nothing (add `?stats=1` to try it).

Reading the numbers needs an API token with **Account Analytics Read**; for example:

```sh
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $TOKEN" \
  -d "SELECT blob3 AS device, blob5 AS load, SUM(_sample_interval) AS reports
      FROM catsmoke_stats WHERE double3 = 1 AND timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY device, load ORDER BY reports DESC"
```

The field order is listed at the top of `worker/index.ts`.

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

Street layouts, building footprints and names in some districts (the Sphere district round Sands Ave,
Koval Ln and Manhattan St) follow OpenStreetMap. Map data © OpenStreetMap contributors (ODbL).

Copyright © 2026 Jarret Coon. All rights reserved.
