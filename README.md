# NYFL Public Live Draft Board 2026

A separate, public-safe draft room for league night. It intentionally contains no private rankings, projections, injuries, watchlists, notes, player grades, model logic, or preference data from the private draft-prep site.

## Deploy to GitHub and Netlify

1. Create a new empty GitHub repository.
2. Upload the contents of this folder to the repository root.
3. In Netlify, choose **Add new project → Import an existing project** and select the new repository.
4. Netlify will read `netlify.toml`; no build settings need to be typed manually.
5. In **Project configuration → Environment variables**, add `NYFL_BOARD_EDIT_KEY` with a long private value, then redeploy.
6. Open the deployed site, choose **Host controls**, and enter the same key.

Everyone with the link gets the live read-only board. Only someone with the host key can make, undo, or reset picks. Viewers refresh automatically every five seconds.

## Privacy boundary

The only player data shipped publicly is player name, NFL team, and position. The 2026 NYFL order and 36 locked keepers are public league information. Host keys are never included in the repository.

## Local preview

Run `npm install`, then `npm run dev`. Netlify Dev supplies the function and local Blobs environment.
