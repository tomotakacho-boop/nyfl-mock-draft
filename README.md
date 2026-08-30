# NYFL Public Live Draft Board 2026

A separate, shareable NYFL draft-night site. Managers can follow the same live board, select their team to inspect its current roster, and see every locked keeper and completed pick.

## What is public

- Official 12-team NYFL draft order
- All 36 locked 2026 keepers and their rounds
- Shared live selections and current draft clock
- Player identity, position, market ADP, and ESPN raw projected stats per game (with no substituted projection source)

The repository does **not** contain personal notes, watchlist labels, player flags, custom ranks, tiers, deltas, fantasy-point projections, PPG, confidence scores, injury models, availability odds, recommendation logic, simulations, projected paths, or decision-support panels.

## Deploy to a new GitHub repository and Netlify site

1. Create a new empty GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In Netlify, choose **Add new project → Import an existing project** and select the new repository.
4. Netlify reads `netlify.toml`; no custom build or publish settings are needed.
5. In **Project configuration → Environment variables**, add `NYFL_BOARD_EDIT_KEY` with a long private value.
6. Redeploy, open the site, choose **Host controls**, and enter that same key.

Everyone with the link receives the shared read-only board. Only a browser with the host key can record, undo, or reset selections. Viewers refresh automatically every five seconds, and the draft state persists across deploys.

## Local verification

Run `npm install` and then `npm run build`. For a local shared-state preview, run `npm run dev` so Netlify Dev supplies the function and local Blobs environment.

`NYFL_BOARD_EDIT_KEY` belongs in Netlify’s environment-variable settings, never in GitHub. `.env.example` shows the variable name without providing a real key.
