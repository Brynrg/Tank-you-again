# Tank You Again — Asset Inventory

> Per the `Brynrg/speedrungames` AGENTS.md template contract, every game with
> non-code assets must list them here with provenance and license.

## Current asset inventory

| Asset | Path | Source | License |
| --- | --- | --- | --- |
| (none) | — | — | — |

All in-game visuals are rendered procedurally via the 2D Canvas API (rects,
arcs, lines, system-font text). There are no sprites, audio files, or font
files shipped in `client/public/`. Vite copies `client/public/` verbatim into
`dist/`; the only files in `public/` today are the per-game source manifests
(`game.manifest.json`, `speedrungames.json`).

## When sprites / audio land later

Place under `client/public/assets/<category>/...` (e.g. `assets/tanks/`,
`assets/sfx/`). Add one row per file to the table above with:

- A short label (e.g. "BLUE hull sprite").
- The path inside the repo.
- A "Source" — the artist, generator, or upstream repo URL. Original = "self".
- A license name (CC0, CC-BY, OFL, MIT, etc.) plus, where the license requires
  attribution, the exact required line.

## External CDN policy

Per `AGENTS.md` § "No external CDNs without a vendored fallback", do NOT add
`<link>` / `<script>` references to third-party CDNs in `client/index.html`
without first vendoring a self-hosted copy under `client/public/`.
