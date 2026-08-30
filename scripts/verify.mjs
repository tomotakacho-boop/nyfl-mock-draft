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
const playerKeys = new Set(["id", "name", "team", "pos", "adp", "espnPerGame"]);
const statKeys = new Set([
  "passAttempts", "completions", "passYards", "passTds", "interceptions",
  "rushAttempts", "rushYards", "rushTds", "targets", "receptions", "receivingYards", "receivingTds",
  "fumblesLost", "twoPointConversions", "patMade", "fgMissed", "fgMade0to39", "fgMade40to49", "fgMade50to59", "fgMade60plus",
  "fumbleRecoveries", "blockedKicks", "safeties", "sacks", "returnTds", "pointsAllowed", "yardsAllowed",
]);

if (!Array.isArray(players) || players.length < 350) throw new Error("The public player pool is missing or incomplete.");
for (const player of players) {
  if (Object.keys(player).some((key) => !playerKeys.has(key))) throw new Error(`Private or unsupported field found for ${player.name}.`);
  if (!player.id || !player.name || !player.pos || typeof player.espnPerGame !== "object") throw new Error(`Invalid public player record for ${player.name || "unknown player"}.`);
  if (Object.keys(player.espnPerGame).some((key) => !statKeys.has(key))) throw new Error(`Unsupported ESPN stat found for ${player.name}.`);
}

const markup = await readFile("public/index.html", "utf8");
const client = await readFile("public/app.js", "utf8");
const functionSource = await readFile("netlify/functions/board.mjs", "utf8");
const removedSurfaces = ["DRAFT-DAY PRACTICE SCENARIOS", "PROJECTED PICK", "DECISION SUPPORT", "BASELINE TEAM PATH"];
if (removedSurfaces.some((phrase) => markup.includes(phrase) || client.includes(phrase))) throw new Error("A private draft-prep surface remains in the public site.");
if (!markup.includes('id="roster-team-select"')) throw new Error("The manager roster selector is missing.");
if (!functionSource.includes("NYFL_BOARD_EDIT_KEY") || !functionSource.includes("x-nyfl-board-key")) throw new Error("Shared host controls are not configured.");

console.log(`Verified public draft room with ${players.length} allowlisted players, manager roster switching, and no private draft-prep panels.`);
