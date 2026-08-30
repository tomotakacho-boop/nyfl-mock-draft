import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/data/players.json",
  "netlify/functions/board.mjs",
  "netlify.toml",
];

for (const file of required) await access(file);

const players = JSON.parse(await readFile("public/data/players.json", "utf8"));
if (!Array.isArray(players) || players.length < 250) throw new Error("The public player pool is missing or incomplete.");
if (players.some((player) => Object.keys(player).some((key) => !["id", "name", "team", "pos"].includes(key)))) {
  throw new Error("The public player pool contains fields outside the privacy-safe allowlist.");
}

console.log(`Verified public draft room with ${players.length} privacy-safe players.`);
