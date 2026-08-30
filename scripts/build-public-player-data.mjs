import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const season = 2026;
const sourcePath = resolve(process.argv[2] || "../nyfl-draft-board-2026/public/data/players.json");
const destinationPath = resolve("public/data/players.json");
const methodologyPath = resolve("public/data/methodology.json");
const espnUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`;
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const input = Array.isArray(source) ? source : source.players;

if (!Array.isArray(input)) throw new Error("The source player file does not contain a player array.");

const espnTeamIdByAbbr = {
  ATL: 1, BUF: 2, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, TEN: 10, IND: 11, KC: 12, LV: 13, LAR: 14, MIA: 15, MIN: 16,
  NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, ARI: 22, PIT: 23, LAC: 24, SF: 25, SEA: 26, TB: 27, WAS: 28, CAR: 29, JAX: 30, BAL: 33, HOU: 34,
};

const cleanNumber = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const positiveNumber = (value) => {
  const number = cleanNumber(value);
  return number !== null && number > 0 ? number : null;
};
const perGame = (value, games) => {
  const number = cleanNumber(value);
  return number !== null && games > 0 ? Math.round((number / games) * 10) / 10 : null;
};
const normalizeName = (value = "") => String(value)
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[’']/g, "")
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
  .replace(/[^a-z0-9]/g, "");

const filter = { players: { limit: 700, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } } };
const response = await fetch(espnUrl, {
  headers: {
    accept: "application/json",
    "user-agent": "NYFL-Mock-Draft/1.0",
    "x-fantasy-filter": JSON.stringify(filter),
  },
});
if (!response.ok) throw new Error(`ESPN player feed returned ${response.status}.`);
const espnPayload = await response.json();
const espnPlayers = (espnPayload.players || []).map((entry) => entry.player).filter(Boolean);
const espnByName = new Map(espnPlayers.map((player) => [normalizeName(player.fullName), player]));
const espnDefenseByTeamId = new Map(espnPlayers.filter((player) => player.defaultPositionId === 16).map((player) => [player.proTeamId, player]));

function espnProjection(player, position) {
  const fullSeason = player?.stats?.find((entry) => entry.seasonId === season && entry.scoringPeriodId === 0 && entry.statSourceId === 1 && entry.statSplitTypeId === 0);
  const details = fullSeason?.stats;
  if (!details) return null;
  const stat = (id) => cleanNumber(details[id]);
  const games = stat(210) ?? 17;
  if (position === "K") return {
    games, patMade: stat(86), fgMissed: stat(85), fgMade0to39: stat(80), fgMade40to49: stat(77), fgMade50to59: stat(198), fgMade60plus: stat(201),
  };
  if (position === "DST") return {
    games, interceptions: stat(95), fumbleRecoveries: stat(96), blockedKicks: stat(97), safeties: stat(98), sacks: stat(99),
    returnTds: [93, 101, 102, 103, 104].reduce((sum, id) => sum + (stat(id) || 0), 0),
    pointsAllowedPerGame: stat(126), yardsAllowedPerGame: stat(137),
  };
  return {
    games, passAttempts: stat(0), completions: stat(1), passYards: stat(3), passTds: stat(4), interceptions: stat(20),
    rushAttempts: stat(23), rushYards: stat(24), rushTds: stat(25), receptions: stat(53), targets: stat(58),
    receivingYards: stat(42), receivingTds: stat(43), fumblesLost: stat(72), passTwoPoint: stat(19), rushTwoPoint: stat(26), receivingTwoPoint: stat(44),
  };
}

function publicStats(projection = {}) {
  const games = cleanNumber(projection.games) || 17;
  const twoPointValues = [projection.passTwoPoint, projection.rushTwoPoint, projection.receivingTwoPoint].map(cleanNumber);
  const twoPointTotal = twoPointValues.some((value) => value !== null) ? twoPointValues.reduce((sum, value) => sum + (value || 0), 0) : null;
  return {
    passAttempts: perGame(projection.passAttempts, games), completions: perGame(projection.completions, games), passYards: perGame(projection.passYards, games),
    passTds: perGame(projection.passTds, games), interceptions: perGame(projection.interceptions, games), rushAttempts: perGame(projection.rushAttempts, games),
    rushYards: perGame(projection.rushYards, games), rushTds: perGame(projection.rushTds, games), targets: perGame(projection.targets, games),
    receptions: perGame(projection.receptions, games), receivingYards: perGame(projection.receivingYards, games), receivingTds: perGame(projection.receivingTds, games),
    fumblesLost: perGame(projection.fumblesLost, games), twoPointConversions: perGame(twoPointTotal, games), patMade: perGame(projection.patMade, games),
    fgMissed: perGame(projection.fgMissed, games), fgMade0to39: perGame(projection.fgMade0to39, games), fgMade40to49: perGame(projection.fgMade40to49, games),
    fgMade50to59: perGame(projection.fgMade50to59, games), fgMade60plus: perGame(projection.fgMade60plus, games), fumbleRecoveries: perGame(projection.fumbleRecoveries, games),
    blockedKicks: perGame(projection.blockedKicks, games), safeties: perGame(projection.safeties, games), sacks: perGame(projection.sacks, games),
    returnTds: perGame(projection.returnTds, games), pointsAllowed: cleanNumber(projection.pointsAllowedPerGame), yardsAllowed: cleanNumber(projection.yardsAllowedPerGame),
  };
}

const players = input.map((player) => {
  const espnPlayer = player.pos === "DST"
    ? espnDefenseByTeamId.get(espnTeamIdByAbbr[player.team])
    : espnByName.get(normalizeName(player.name));
  const espnStats = espnProjection(espnPlayer, player.pos);
  const fantasyProsStats = String(player.projectionSource || "").startsWith("FantasyPros raw stats") ? player.projection : null;
  const projection = espnStats || fantasyProsStats || {};
  return {
    id: String(player.id),
    name: String(player.name),
    team: String(player.team || "FA"),
    pos: String(player.pos),
    adp: positiveNumber(espnPlayer?.ownership?.averageDraftPosition),
    projectionProvider: espnStats ? "ESPN" : fantasyProsStats ? "FantasyPros" : null,
    projectedStatsPerGame: publicStats(projection),
  };
});

const providerCounts = players.reduce((counts, player) => {
  const key = player.projectionProvider || "Unavailable";
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
const methodology = {
  asOf: new Date().toISOString(),
  season,
  playerCount: players.length,
  espnAdpCount: players.filter((player) => player.adp !== null).length,
  projectionProviderCounts: providerCounts,
  sources: [
    { name: "ESPN Fantasy Football", purpose: "Only source used for ADP; primary raw 2026 statistical projections", url: "https://fantasy.espn.com/football/livedraftresults" },
    { name: "FantasyPros 2026 projections", purpose: "Fallback raw statistical projections only when an ESPN projection is unavailable", url: "https://www.fantasypros.com/nfl/projections/leaders.php" },
    { name: "NYFL league records", purpose: "Official 2026 draft order and 36 locked keepers supplied by the league", url: null },
  ],
};

await writeFile(destinationPath, `${JSON.stringify(players, null, 2)}\n`);
await writeFile(methodologyPath, `${JSON.stringify(methodology, null, 2)}\n`);
console.log(`Wrote ${players.length} public player records: ${methodology.espnAdpCount} ESPN ADPs; projections ${JSON.stringify(providerCounts)}.`);
