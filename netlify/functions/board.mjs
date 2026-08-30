import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const teams = [
  { id: "taffet", slot: 1, team: "Matt's Monstrous Team", manager: "Matt Taffet" },
  { id: "watts", slot: 2, team: "U Dont Call Them Pollard People", manager: "Josh Watts" },
  { id: "harrist", slot: 3, team: "Chase Brown is God", manager: "Jack Harrist" },
  { id: "danzig", slot: 4, team: "Maye son or Conk daughter?", manager: "Leo Danzig" },
  { id: "cho", slot: 5, team: "The Twin Bowers", manager: "Tomotaka Cho" },
  { id: "eng", slot: 6, team: "'97-'98 Bulls", manager: "Tashi Eng" },
  { id: "lai", slot: 7, team: "2015-2016 Cleveland Cavs ⚔️", manager: "Randy Lai" },
  { id: "lustberg", slot: 8, team: "Vecberg", manager: "David Lustberg" },
  { id: "enslin", slot: 9, team: "Burrowmancer", manager: "Matthew Enslin" },
  { id: "sahler", slot: 10, team: "Big Boutte Btches", manager: "Jeremy Sahler" },
  { id: "kazlow", slot: 11, team: "Loser buys winner's Lemonade", manager: "Nathaniel Kazlow" },
  { id: "spring", slot: 12, team: "Gay McPride", manager: "Matt Spring" },
];

const keepers = [
  ["taffet", 2, "Omarion Hampton", "RB", "LAC"], ["taffet", 6, "Drake London", "WR", "ATL"], ["taffet", 11, "Luther Burden III", "WR", "CHI"],
  ["watts", 2, "Kenneth Walker III", "RB", "KC"], ["watts", 4, "George Pickens", "WR", "DAL"], ["watts", 5, "Emeka Egbuka", "WR", "TB"],
  ["harrist", 8, "Jameson Williams", "WR", "DET"], ["harrist", 13, "Sam LaPorta", "TE", "DET"], ["harrist", 16, "Chase Brown", "RB", "CIN"],
  ["danzig", 7, "Ladd McConkey", "WR", "LAC"], ["danzig", 12, "Caleb Williams", "QB", "CHI"], ["danzig", 16, "Kyren Williams", "RB", "LAR"],
  ["cho", 5, "Jaxon Smith-Njigba", "WR", "SEA"], ["cho", 8, "Brock Bowers", "TE", "LV"], ["cho", 16, "Woody Marks", "RB", "HOU"],
  ["eng", 2, "A.J. Brown", "WR", "NE"], ["eng", 3, "DeVonta Smith", "WR", "PHI"], ["eng", 6, "Jonathan Taylor", "RB", "IND"],
  ["lai", 5, "James Cook III", "RB", "BUF"], ["lai", 9, "Colston Loveland", "TE", "CHI"], ["lai", 16, "Christian Watson", "WR", "GB"],
  ["lustberg", 1, "Bijan Robinson", "RB", "ATL"], ["lustberg", 7, "Tyler Warren", "TE", "IND"], ["lustberg", 16, "Puka Nacua", "WR", "LAR"],
  ["enslin", 1, "Derrick Henry", "RB", "BAL"], ["enslin", 8, "Travis Etienne Jr.", "RB", "NO"], ["enslin", 16, "Rashee Rice", "WR", "KC"],
  ["sahler", 1, "Ja'Marr Chase", "WR", "CIN"], ["sahler", 4, "Breece Hall", "RB", "NYJ"], ["sahler", 10, "Nico Collins", "WR", "HOU"],
  ["kazlow", 4, "Jaylen Waddle", "WR", "DEN"], ["kazlow", 7, "Quinshon Judkins", "RB", "CLE"], ["kazlow", 16, "De'Von Achane", "RB", "MIA"],
  ["spring", 1, "Jahmyr Gibbs", "RB", "DET"], ["spring", 9, "Zay Flowers", "WR", "BAL"], ["spring", 15, "Trey McBride", "TE", "ARI"],
].map(([teamId, round, player, pos, nflTeam]) => ({ teamId, round, player, pos, nflTeam }));

const defaultBoard = () => ({ season: 2026, teams, keepers, picks: [], revision: 0, updatedAt: null });
const json = (data, init = {}) => Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

const keeperSlots = new Set(keepers.map((keeper) => `${keeper.round}:${keeper.teamId}`));
const openSchedule = [];
for (let round = 1; round <= 16; round += 1) {
  for (let pick = 1; pick <= 12; pick += 1) {
    const draftSlot = round % 2 ? pick : 13 - pick;
    const team = teams.find((item) => item.slot === draftSlot);
    if (!keeperSlots.has(`${round}:${team.id}`)) openSchedule.push({ round, teamId: team.id });
  }
}

function validatePicks(value) {
  if (!Array.isArray(value)) return { picks: [], error: "Picks must be an array." };
  const seenPlayers = new Set(keepers.map((keeper) => keeper.player.toLowerCase()));
  const picks = [];
  for (const [index, pick] of value.slice(0, openSchedule.length).entries()) {
    const expected = openSchedule[index];
    const teamId = String(pick?.teamId || "");
    const round = Number(pick?.round);
    const player = String(pick?.player || "").trim().slice(0, 80);
    const pos = String(pick?.pos || "").toUpperCase().slice(0, 3);
    const nflTeam = String(pick?.nflTeam || "").toUpperCase().slice(0, 4);
    const playerKey = player.toLowerCase();
    if (!expected || teamId !== expected.teamId || round !== expected.round) return { picks: [], error: `Pick ${index + 1} is out of sequence.` };
    if (!player || !["QB", "RB", "WR", "TE", "K", "DST"].includes(pos)) return { picks: [], error: `Pick ${index + 1} has invalid player data.` };
    if (seenPlayers.has(playerKey)) return { picks: [], error: `${player} is already rostered.` };
    seenPlayers.add(playerKey);
    picks.push({ teamId, round, player, pos, nflTeam });
  }
  if (value.length > openSchedule.length) return { picks: [], error: "The live-pick limit was exceeded." };
  return { picks, error: null };
}

function authorized(request) {
  const expected = process.env.NYFL_BOARD_EDIT_KEY || "";
  const supplied = request.headers.get("x-nyfl-board-key") || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return Boolean(expected) && expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export default async (request) => {
  const store = getStore({ name: "nyfl-public-board", consistency: "strong" });
  const entry = await store.getWithMetadata("2026-live-board", { type: "json", consistency: "strong" });
  const saved = entry?.data;
  const savedPicks = validatePicks(saved?.picks || []).picks;
  const current = { ...defaultBoard(), picks: savedPicks, revision: Number(saved?.revision || 0), updatedAt: saved?.updatedAt || null };

  if (request.method === "GET") return json(current);
  if (!["POST", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, POST, PUT" } });
  if (!process.env.NYFL_BOARD_EDIT_KEY) return json({ error: "Host controls are not configured yet." }, { status: 503 });
  if (!authorized(request)) return json({ error: "Incorrect host key." }, { status: 401 });
  if (request.method === "POST") return json({ ok: true });

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request" }, { status: 400 }); }
  if (Number(body.revision) !== current.revision) return json({ error: "The board changed on another device. It has been refreshed; try again." }, { status: 409 });
  const validated = validatePicks(body.picks);
  if (validated.error) return json({ error: validated.error }, { status: 400 });

  const next = {
    season: 2026,
    teams,
    keepers,
    picks: validated.picks,
    revision: Number(current.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const write = await store.setJSON("2026-live-board", next, entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
  if (!write.modified) return json({ error: "The board changed on another device. Refresh and try again." }, { status: 409 });
  return json(next);
};

export const config = { path: "/api/board" };
