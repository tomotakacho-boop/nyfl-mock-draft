import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve(process.argv[2] || "../nyfl-draft-board-2026/public/data/players.json");
const destinationPath = resolve("public/data/players.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const input = Array.isArray(source) ? source : source.players;

if (!Array.isArray(input)) throw new Error("The source player file does not contain a player array.");

const nullableNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const perGame = (value, games) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && games > 0
  ? Math.round((Number(value) / games) * 10) / 10
  : null;

const players = input.map((player) => {
  const projection = String(player.projectionSource || "").startsWith("ESPN raw stats")
    ? (player.projection || {})
    : {};
  const games = nullableNumber(projection.games || player.projectedGames) || 17;
  const twoPointValues = [projection.passTwoPoint, projection.rushTwoPoint, projection.receivingTwoPoint]
    .map(nullableNumber);
  const twoPointTotal = twoPointValues.some((value) => value !== null)
    ? twoPointValues.reduce((sum, value) => sum + (value || 0), 0)
    : null;
  return {
    id: String(player.id),
    name: String(player.name),
    team: String(player.team || "FA"),
    pos: String(player.pos),
    adp: nullableNumber(player.adp),
    espnPerGame: {
      passAttempts: perGame(projection.passAttempts, games),
      completions: perGame(projection.completions, games),
      passYards: perGame(projection.passYards, games),
      passTds: perGame(projection.passTds, games),
      interceptions: perGame(projection.interceptions, games),
      rushAttempts: perGame(projection.rushAttempts, games),
      rushYards: perGame(projection.rushYards, games),
      rushTds: perGame(projection.rushTds, games),
      targets: perGame(projection.targets, games),
      receptions: perGame(projection.receptions, games),
      receivingYards: perGame(projection.receivingYards, games),
      receivingTds: perGame(projection.receivingTds, games),
      fumblesLost: perGame(projection.fumblesLost, games),
      twoPointConversions: perGame(twoPointTotal, games),
      patMade: perGame(projection.patMade, games),
      fgMissed: perGame(projection.fgMissed, games),
      fgMade0to39: perGame(projection.fgMade0to39, games),
      fgMade40to49: perGame(projection.fgMade40to49, games),
      fgMade50to59: perGame(projection.fgMade50to59, games),
      fgMade60plus: perGame(projection.fgMade60plus, games),
      fumbleRecoveries: perGame(projection.fumbleRecoveries, games),
      blockedKicks: perGame(projection.blockedKicks, games),
      safeties: perGame(projection.safeties, games),
      sacks: perGame(projection.sacks, games),
      returnTds: perGame(projection.returnTds, games),
      pointsAllowed: nullableNumber(projection.pointsAllowedPerGame),
      yardsAllowed: nullableNumber(projection.yardsAllowedPerGame),
    },
  };
});

await writeFile(destinationPath, `${JSON.stringify(players, null, 2)}\n`);
console.log(`Wrote ${players.length} privacy-safe public player records to ${destinationPath}.`);
