import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/data/players.json",
  "public/data/methodology.json",
  "netlify.toml",
];

for (const file of required) await access(file);

const players = JSON.parse(await readFile("public/data/players.json", "utf8"));
const methodology = JSON.parse(await readFile("public/data/methodology.json", "utf8"));
const playerKeys = new Set(["id", "name", "team", "pos", "adp", "projectionProvider", "projectedStatsPerGame"]);
const statKeys = new Set([
  "passAttempts", "completions", "passYards", "passTds", "interceptions",
  "rushAttempts", "rushYards", "rushTds", "targets", "receptions", "receivingYards", "receivingTds",
  "fumblesLost", "twoPointConversions", "patMade", "fgMissed", "fgMade0to39", "fgMade40to49", "fgMade50to59", "fgMade60plus",
  "fumbleRecoveries", "blockedKicks", "safeties", "sacks", "returnTds", "pointsAllowed", "yardsAllowed",
]);

if (!Array.isArray(players) || players.length < 350) throw new Error("The public player pool is missing or incomplete.");
for (const player of players) {
  if (Object.keys(player).some((key) => !playerKeys.has(key))) throw new Error(`Private or unsupported field found for ${player.name}.`);
  if (!player.id || !player.name || !player.pos || typeof player.projectedStatsPerGame !== "object") throw new Error(`Invalid public player record for ${player.name || "unknown player"}.`);
  if (player.adp !== null && (!Number.isFinite(player.adp) || player.adp <= 0)) throw new Error(`Invalid ESPN ADP found for ${player.name}.`);
  if (![null, "ESPN", "FantasyPros"].includes(player.projectionProvider)) throw new Error(`Unsupported projection provider found for ${player.name}.`);
  if (Object.keys(player.projectedStatsPerGame).some((key) => !statKeys.has(key))) throw new Error(`Unsupported projected stat found for ${player.name}.`);
}

if (!methodology.asOf || methodology.season !== 2026 || methodology.espnAdpCount < 300) throw new Error("Methodology metadata is missing or incomplete.");

const markup = await readFile("public/index.html", "utf8");
const client = await readFile("public/app.js", "utf8");
const removedSurfaces = ["Host controls", "Viewer mode", "DRAFT-DAY PRACTICE SCENARIOS", "PROJECTED PICK", "DECISION SUPPORT", "BASELINE TEAM PATH"];
if (removedSurfaces.some((phrase) => markup.includes(phrase) || client.includes(phrase))) throw new Error("An obsolete host or private draft-prep surface remains in the mock site.");
if (!markup.includes('id="roster-team-select"')) throw new Error("The manager roster selector is missing.");
if (!markup.includes('data-view="methods"') || !markup.includes('id="methods-view"')) throw new Error("The methodology and sources tab is missing.");
if (markup.includes("/api/board") || client.includes("/api/board")) throw new Error("The browser-local mock still references the old shared-board API.");

const keeperNames = ["Jaxon Smith-Njigba", "Brock Bowers", "Woody Marks"];
if (!keeperNames.every((name) => client.includes(name))) throw new Error("The Twin Bowers keepers are incomplete.");

console.log(`Verified browser-local NYFL mock with ${players.length} allowlisted players, ${methodology.espnAdpCount} ESPN ADPs, manager roster switching, and a methodology tab.`);
