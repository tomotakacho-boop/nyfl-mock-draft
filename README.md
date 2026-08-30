# NYFL Public Mock Draft Board 2026

A separate, shareable NYFL mock-draft site. Every visitor runs an independent mock in their own browser, can draft for all 12 teams, and can switch the roster view to any manager.

## Included

- Official 12-team NYFL draft order
- All 36 locked 2026 keepers and their rounds
- Browser-local drafting, undo, reset, current clock, recent picks, full board, and team roster selector
- ESPN-only average draft position
- Raw 2026 projected statistics per game with the provider labeled
- A Methodology & Sources tab

The repository does **not** contain personal notes, watchlist labels, player flags, custom ranks, tiers, deltas, fantasy-point projections, PPG, confidence scores, injury models, availability odds, recommendation logic, simulations, projected paths, or decision-support panels.

## How mock state works

Selections are saved to the browser’s `localStorage`. There are no host controls, edit keys, server functions, or shared state. Opening the site on another device starts a separate mock draft.

## Deploy to GitHub and Netlify

1. Create a new empty GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In Netlify, choose **Add new project → Import an existing project** and select the repository.
4. Netlify reads `netlify.toml`; no environment variables or custom settings are required.

## Data methodology

- ESPN Fantasy Football is the only ADP source. Missing ESPN ADP is displayed as an em dash, never `0.0` and never replaced with another provider.
- ESPN is the primary provider for raw 2026 projected statistics. FantasyPros raw projections are supported only as an explicitly labeled fallback.
- Season totals are divided by projected games to produce the compact per-game stat lines.
- The site does not calculate a private player score from those projections.

Run `npm run build` to verify the upload locally. The site has no runtime dependencies or server functions.
