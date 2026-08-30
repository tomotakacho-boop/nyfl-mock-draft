const API = "/api/board";
const ROUNDS = 16;
const LIVE_SELECTIONS = 156;
const STARTER_REQUIREMENTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1 };

let board;
let players = [];
let hostKey = sessionStorage.getItem("nyfl-host-key") || "";
let selectedTeamId = localStorage.getItem("nyfl-roster-team") || "cho";
let offline = false;
let saving = false;
let sortKey = "adp";
let sortDirection = "asc";
let rendered = false;

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const format = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";

const defaultTeams = [
  ["taffet", 1, "Matt's Monstrous Team", "Matt Taffet"], ["watts", 2, "U Dont Call Them Pollard People", "Josh Watts"],
  ["harrist", 3, "Chase Brown is God", "Jack Harrist"], ["danzig", 4, "Maye son or Conk daughter?", "Leo Danzig"],
  ["cho", 5, "The Twin Bowers", "Tomotaka Cho"], ["eng", 6, "'97-'98 Bulls", "Tashi Eng"],
  ["lai", 7, "2015-2016 Cleveland Cavs ⚔️", "Randy Lai"], ["lustberg", 8, "Vecberg", "David Lustberg"],
  ["enslin", 9, "Burrowmancer", "Matthew Enslin"], ["sahler", 10, "Big Boutte Btches", "Jeremy Sahler"],
  ["kazlow", 11, "Loser buys winner's Lemonade", "Nathaniel Kazlow"], ["spring", 12, "Gay McPride", "Matt Spring"],
].map(([id, slot, team, manager]) => ({ id, slot, team, manager }));

const defaultKeepers = [
  ["taffet",2,"Omarion Hampton","RB","LAC"],["taffet",6,"Drake London","WR","ATL"],["taffet",11,"Luther Burden III","WR","CHI"],
  ["watts",2,"Kenneth Walker III","RB","KC"],["watts",4,"George Pickens","WR","DAL"],["watts",5,"Emeka Egbuka","WR","TB"],
  ["harrist",8,"Jameson Williams","WR","DET"],["harrist",13,"Sam LaPorta","TE","DET"],["harrist",16,"Chase Brown","RB","CIN"],
  ["danzig",7,"Ladd McConkey","WR","LAC"],["danzig",12,"Caleb Williams","QB","CHI"],["danzig",16,"Kyren Williams","RB","LAR"],
  ["cho",5,"Jaxon Smith-Njigba","WR","SEA"],["cho",8,"Brock Bowers","TE","LV"],["cho",16,"Woody Marks","RB","HOU"],
  ["eng",2,"A.J. Brown","WR","NE"],["eng",3,"DeVonta Smith","WR","PHI"],["eng",6,"Jonathan Taylor","RB","IND"],
  ["lai",5,"James Cook III","RB","BUF"],["lai",9,"Colston Loveland","TE","CHI"],["lai",16,"Christian Watson","WR","GB"],
  ["lustberg",1,"Bijan Robinson","RB","ATL"],["lustberg",7,"Tyler Warren","TE","IND"],["lustberg",16,"Puka Nacua","WR","LAR"],
  ["enslin",1,"Derrick Henry","RB","BAL"],["enslin",8,"Travis Etienne Jr.","RB","NO"],["enslin",16,"Rashee Rice","WR","KC"],
  ["sahler",1,"Ja'Marr Chase","WR","CIN"],["sahler",4,"Breece Hall","RB","NYJ"],["sahler",10,"Nico Collins","WR","HOU"],
  ["kazlow",4,"Jaylen Waddle","WR","DEN"],["kazlow",7,"Quinshon Judkins","RB","CLE"],["kazlow",16,"De'Von Achane","RB","MIA"],
  ["spring",1,"Jahmyr Gibbs","RB","DET"],["spring",9,"Zay Flowers","WR","BAL"],["spring",15,"Trey McBride","TE","ARI"],
].map(([teamId, round, player, pos, nflTeam]) => ({ teamId, round, player, pos, nflTeam }));

const fallbackBoard = () => ({ season: 2026, teams: defaultTeams, keepers: defaultKeepers, picks: [], revision: 0, updatedAt: null });

function schedule() {
  const result = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (let pick = 1; pick <= 12; pick += 1) {
      const slot = round % 2 ? pick : 13 - pick;
      result.push({ round, pick, overall: (round - 1) * 12 + pick, team: board.teams.find((team) => team.slot === slot) });
    }
  }
  return result;
}

const keeperAt = (slot) => board.keepers.find((item) => item.teamId === slot.team.id && item.round === slot.round);
const pickAt = (slot) => board.picks.find((item) => item.teamId === slot.team.id && item.round === slot.round);
const nextSlot = () => schedule().find((slot) => !keeperAt(slot) && !pickAt(slot));
const usedPlayers = () => new Set([...board.keepers, ...board.picks].map((item) => item.player.toLowerCase()));
const playerByName = (name) => players.find((player) => player.name.toLowerCase() === String(name).toLowerCase());
const playerPhoto = (player) => player?.id ? `https://images.fantasypros.com/images/players/nfl/${encodeURIComponent(player.id)}/headshot/210x210.png` : "";

function toast(message, danger = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("is-danger", danger);
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 2800);
}

function ensureHost() {
  if (hostKey || offline) return true;
  $("#host-error").textContent = "Unlock host controls before recording picks.";
  $("#host-dialog").showModal();
  return false;
}

function renderHostState() {
  const unlocked = Boolean(hostKey || offline);
  $("#host-button").textContent = unlocked ? "Host unlocked" : "Host controls";
  $("#host-button").classList.toggle("is-unlocked", unlocked);
  $("#host-status").textContent = unlocked ? offline ? "Local preview" : "Unlocked" : "Viewer mode";
  $("#undo-button").classList.toggle("is-locked", !unlocked);
  $("#reset-button").classList.toggle("is-locked", !unlocked);
}

function renderStatus() {
  const slot = nextSlot();
  $("#pick-count").textContent = `${board.picks.length} / ${LIVE_SELECTIONS}`;
  $("#updated-label").textContent = offline
    ? "Local preview · deploy to sync"
    : board.updatedAt
      ? `Updated ${new Date(board.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "Ready for the first pick";
  if (!slot) {
    $("#clock-summary").textContent = "Draft complete";
    $("#on-clock-team").textContent = "The 2026 NYFL draft is complete";
    $("#on-clock-detail").textContent = "Every live selection has been recorded.";
    $("#round-number").textContent = "16";
    $("#round-pick").textContent = `${LIVE_SELECTIONS} live selections`;
    return;
  }
  $("#clock-summary").textContent = `#${slot.overall} · ${slot.team.team}`;
  $("#on-clock-team").textContent = `${slot.team.team} is on the clock`;
  $("#on-clock-detail").textContent = `${slot.team.manager} · scheduled R${slot.round}P${slot.pick} · overall #${slot.overall}`;
  $("#round-number").textContent = slot.round;
  $("#round-pick").textContent = `Live pick ${board.picks.length + 1} of ${LIVE_SELECTIONS}`;
}

function renderRosterSelector() {
  if (!board.teams.some((team) => team.id === selectedTeamId)) selectedTeamId = "cho";
  $("#roster-team-select").innerHTML = board.teams.map((team) => `<option value="${escapeHTML(team.id)}" ${team.id === selectedTeamId ? "selected" : ""}>#${team.slot} ${escapeHTML(team.team)} · ${escapeHTML(team.manager)}</option>`).join("");
}

function rosterNeeds(entries) {
  const counts = entries.reduce((total, entry) => ({ ...total, [entry.pos]: (total[entry.pos] || 0) + 1 }), {});
  const needs = ["QB", "RB", "WR", "TE", "DST", "K"].map((pos) => ({ pos, open: Math.max(0, STARTER_REQUIREMENTS[pos] - (counts[pos] || 0)) }));
  const flexExcess = Math.max(0, (counts.RB || 0) - 2) + Math.max(0, (counts.WR || 0) - 2) + Math.max(0, (counts.TE || 0) - 1);
  needs.splice(4, 0, { pos: "FLEX", open: flexExcess > 0 ? 0 : 1 });
  return needs.filter((need) => need.open > 0);
}

function renderRoster() {
  const team = board.teams.find((item) => item.id === selectedTeamId) || board.teams[0];
  const entries = schedule().flatMap((slot) => {
    if (slot.team.id !== team.id) return [];
    const selection = keeperAt(slot) || pickAt(slot);
    if (!selection) return [];
    const player = playerByName(selection.player);
    return [{ ...selection, pos: selection.pos || player?.pos || "—", nflTeam: selection.nflTeam || player?.team || "", slot, player }];
  });
  $("#roster-heading").textContent = `${team.team} · ${entries.length}/${ROUNDS}`;
  const needs = rosterNeeds(entries);
  $("#roster-needs").innerHTML = needs.length ? needs.map((need) => `<b>${need.pos} ×${need.open}</b>`).join("") : `<b>STARTERS FILLED</b>`;
  $("#roster-cells").innerHTML = entries.length ? entries.map((entry) => {
    const isKeeper = Boolean(keeperAt(entry.slot));
    return `<article class="${isKeeper ? "roster-keeper" : ""}"><span>${isKeeper ? "KEEPER" : `PICK #${entry.slot.overall}`} · R${entry.slot.round}</span><i class="pos pos-${escapeHTML(entry.pos)}">${escapeHTML(entry.pos)}</i><b>${escapeHTML(entry.player)}</b><small>${escapeHTML(entry.nflTeam)}</small></article>`;
  }).join("") : `<p>No players rostered yet. This team’s locked keepers and live selections will appear here.</p>`;
}

function renderRecent() {
  const recent = schedule().map((slot) => ({ slot, pick: pickAt(slot) })).filter(({ pick }) => pick).slice(-6);
  $("#recent-count").textContent = `${board.picks.length} live pick${board.picks.length === 1 ? "" : "s"} recorded`;
  const clock = nextSlot();
  $("#recent-picks").innerHTML = `${recent.map(({ slot, pick }) => `<article><span>#${slot.overall}</span><strong>${escapeHTML(pick.player)}</strong><small>${escapeHTML(slot.team.team)} · ${escapeHTML(pick.pos)}</small></article>`).join("")}${clock ? `<article class="ticker-clock"><span>NEXT</span><strong>${escapeHTML(clock.team.team)}</strong><small>Scheduled #${clock.overall}</small></article>` : `<article class="ticker-clock"><span>FINAL</span><strong>Draft complete</strong><small>All picks recorded</small></article>`}`;
}

const sortColumns = [["name", "PLAYER"], ["pos", "POS"], ["adp", "ADP"]];

function renderPlayerHead() {
  $("#player-table-head").innerHTML = `<th>LIVE ACTION</th>${sortColumns.map(([key, label]) => `<th><button data-sort="${key}" class="${sortKey === key ? "active" : ""}">${label}<span>${sortKey === key ? sortDirection === "asc" ? "↑" : "↓" : "↕"}</span></button></th>`).join("")}<th>ESPN PROJECTED STATS / GAME</th>`;
}

function sortValue(player, key) {
  return player[key] ?? (typeof player[key] === "string" ? "" : 9999);
}

function comparePlayers(a, b) {
  const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
  const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
  return (sortDirection === "asc" ? result : -result) || Number(a.adp || 9999) - Number(b.adp || 9999);
}

function espnStatLine(player) {
  const stats = player.espnPerGame || {};
  const fields = player.pos === "QB"
    ? [["CMP/G", stats.completions], ["PASS ATT/G", stats.passAttempts], ["PASS YD/G", stats.passYards], ["PASS TD/G", stats.passTds], ["INT/G", stats.interceptions], ["RUSH ATT/G", stats.rushAttempts], ["RUSH YD/G", stats.rushYards], ["RUSH TD/G", stats.rushTds], ["FUM LOST/G", stats.fumblesLost], ["2PT/G", stats.twoPointConversions]]
    : player.pos === "RB"
      ? [["RUSH ATT/G", stats.rushAttempts], ["RUSH YD/G", stats.rushYards], ["RUSH TD/G", stats.rushTds], ["TGT/G", stats.targets], ["REC/G", stats.receptions], ["REC YD/G", stats.receivingYards], ["REC TD/G", stats.receivingTds], ["FUM LOST/G", stats.fumblesLost], ["2PT/G", stats.twoPointConversions]]
      : ["WR", "TE"].includes(player.pos)
        ? [["RUSH ATT/G", stats.rushAttempts], ["RUSH YD/G", stats.rushYards], ["RUSH TD/G", stats.rushTds], ["TGT/G", stats.targets], ["REC/G", stats.receptions], ["REC YD/G", stats.receivingYards], ["REC TD/G", stats.receivingTds], ["FUM LOST/G", stats.fumblesLost], ["2PT/G", stats.twoPointConversions]]
        : player.pos === "K"
          ? [["PAT/G", stats.patMade], ["FG MISS/G", stats.fgMissed], ["FG 0–39/G", stats.fgMade0to39], ["FG 40–49/G", stats.fgMade40to49], ["FG 50–59/G", stats.fgMade50to59], ["FG 60+/G", stats.fgMade60plus]]
          : player.pos === "DST"
            ? [["SACK/G", stats.sacks], ["INT/G", stats.interceptions], ["FR/G", stats.fumbleRecoveries], ["BLK/G", stats.blockedKicks], ["SAFETY/G", stats.safeties], ["RETURN TD/G", stats.returnTds], ["PA/G", stats.pointsAllowed], ["YA/G", stats.yardsAllowed]]
            : [];
  const available = fields.filter(([, value]) => value != null);
  return available.length ? available.map(([label, value]) => `<span><b>${label}</b> ${format(value)}</span>`).join("") : `<span class="stats-unavailable">ESPN statistical projection unavailable</span>`;
}

function renderPlayers() {
  const query = $("#player-search").value.trim().toLowerCase();
  const pos = $("#position-filter").value;
  const used = usedPlayers();
  const matches = players
    .filter((player) => !used.has(player.name.toLowerCase()))
    .filter((player) => pos === "ALL" || player.pos === pos)
    .filter((player) => !query || `${player.name} ${player.team} ${player.pos} ${player.posRank || ""}`.toLowerCase().includes(query))
    .sort(comparePlayers);
  const current = nextSlot();
  const unlocked = Boolean(hostKey || offline);
  $("#player-result-count").textContent = `Showing ${matches.length} available players`;
  $("#player-table-body").innerHTML = matches.map((player) => {
    return `<tr>
      <td><button class="remove-button ${unlocked ? "" : "viewer"}" data-player-id="${escapeHTML(player.id)}"><b>${unlocked ? "REMOVE" : "HOST"}</b><small>${current ? `Pick #${current.overall}` : "Complete"}</small></button></td>
      <td><div class="player-identity"><span class="player-photo" style="background-image:url('${playerPhoto(player)}')"><i>${escapeHTML(player.pos)}</i></span><span><b>${escapeHTML(player.name)}</b><small>${escapeHTML(player.team)}</small></span></div></td>
      <td><i class="pos pos-${escapeHTML(player.pos)}">${escapeHTML(player.pos)}</i></td>
      <td><b>${format(player.adp)}</b></td><td><div class="espn-stat-line">${espnStatLine(player)}</div></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-table">No available players match these filters.</td></tr>`;
}

function renderBoard() {
  const current = nextSlot();
  const head = `<thead><tr><th>Round</th>${board.teams.map((team) => `<th><span>#${team.slot}</span><b>${escapeHTML(team.team)}</b><small>${escapeHTML(team.manager)}</small></th>`).join("")}</tr></thead>`;
  const body = Array.from({ length: ROUNDS }, (_, index) => index + 1).map((round) => `<tr><th>R${round}</th>${board.teams.map((team) => {
    const slot = schedule().find((item) => item.round === round && item.team.id === team.id);
    const keeper = keeperAt(slot), pick = pickAt(slot), onClock = current?.round === round && current.team.id === team.id;
    if (keeper) return `<td class="keeper"><span>KEEPER</span><strong>${escapeHTML(keeper.player)}</strong><small>Round ${round}</small></td>`;
    if (pick) return `<td class="selected"><span>#${slot.overall}</span><strong>${escapeHTML(pick.player)}</strong><small>${escapeHTML([pick.pos, pick.nflTeam].filter(Boolean).join(" · "))}</small></td>`;
    if (onClock) return `<td class="on-clock"><span>ON CLOCK</span><strong>Overall #${slot.overall}</strong><small>R${round}P${slot.pick}</small></td>`;
    return `<td><span>#${slot.overall}</span><strong>Open</strong><small>R${round}P${slot.pick}</small></td>`;
  }).join("")}</tr>`).join("");
  $("#draft-board").innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderOrder() {
  $("#order-grid").innerHTML = board.teams.map((team) => `<article><b>${team.slot}</b><div><strong>${escapeHTML(team.team)}</strong><small>${escapeHTML(team.manager)}</small></div></article>`).join("");
}

function render() {
  renderHostState(); renderStatus(); renderRosterSelector(); renderRoster(); renderRecent(); renderPlayerHead(); renderPlayers(); renderBoard(); renderOrder();
  rendered = true;
}

async function loadBoard({ quiet = false, force = false } = {}) {
  if (saving && !force) return;
  try {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const incoming = await response.json();
    offline = false;
    if (rendered && board && incoming.revision === board.revision && incoming.picks?.length === board.picks?.length) {
      board.updatedAt = incoming.updatedAt;
      renderHostState(); renderStatus();
      return;
    }
    board = incoming;
  } catch {
    offline = true;
    board = JSON.parse(localStorage.getItem("nyfl-public-preview") || "null") || board || fallbackBoard();
    if (!quiet) toast("Local preview mode. Deploy to Netlify for shared updates.");
  }
  render();
}

async function commitPicks(nextPicks, successMessage) {
  if (saving) return;
  saving = true;
  try {
    if (offline) {
      board = { ...board, picks: nextPicks, revision: Number(board.revision || 0) + 1, updatedAt: new Date().toISOString() };
      localStorage.setItem("nyfl-public-preview", JSON.stringify(board));
      toast(`${successMessage} Saved in local preview.`); render(); return;
    }
    const response = await fetch(API, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-nyfl-board-key": hostKey },
      body: JSON.stringify({ picks: nextPicks, revision: board.revision }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 409) await loadBoard({ quiet: true, force: true });
      throw new Error(payload.error || "Could not save the board");
    }
    board = payload; toast(successMessage); render();
  } catch (error) { toast(error.message, true); }
  finally { saving = false; }
}

async function unlock(key) {
  if (offline) return true;
  const response = await fetch(API, { method: "POST", headers: { "x-nyfl-board-key": key } });
  return response.ok;
}

$("#host-button").addEventListener("click", () => {
  $("#host-error").textContent = "";
  $("#host-key-input").value = hostKey;
  $("#host-dialog").showModal();
});

$("#host-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = $("#host-key-input").value.trim();
  if (!key || !(await unlock(key))) { $("#host-error").textContent = "Incorrect host key."; return; }
  hostKey = key;
  sessionStorage.setItem("nyfl-host-key", key);
  $("#host-dialog").close(); render(); toast("Host controls unlocked.");
});

$("#roster-team-select").addEventListener("change", (event) => {
  selectedTeamId = event.target.value;
  localStorage.setItem("nyfl-roster-team", selectedTeamId);
  renderRoster();
});

$("#player-search").addEventListener("input", renderPlayers);
$("#position-filter").addEventListener("change", renderPlayers);
$("#player-table-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  if (sortKey === button.dataset.sort) sortDirection = sortDirection === "asc" ? "desc" : "asc";
  else {
    sortKey = button.dataset.sort;
    sortDirection = "asc";
  }
  renderPlayerHead(); renderPlayers();
});

$("#player-table-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-player-id]");
  if (!button || !ensureHost()) return;
  const player = players.find((item) => item.id === button.dataset.playerId);
  const slot = nextSlot();
  if (!player || !slot) return toast("The draft is complete.", true);
  const nextPicks = [...board.picks, { teamId: slot.team.id, round: slot.round, player: player.name, pos: player.pos, nflTeam: player.team }];
  await commitPicks(nextPicks, `${player.name} recorded for ${slot.team.team}.`);
});

$("#undo-button").addEventListener("click", async () => {
  if (!ensureHost()) return;
  if (!board.picks.length) return toast("No live pick to undo.", true);
  const removed = board.picks.at(-1);
  await commitPicks(board.picks.slice(0, -1), `${removed.player} returned to the board.`);
});

$("#reset-button").addEventListener("click", async () => {
  if (!ensureHost()) return;
  if (!confirm("Reset every live selection? The 36 locked keepers will remain.")) return;
  await commitPicks([], "The live board was reset.");
});

async function start() {
  board = fallbackBoard();
  try {
    players = await fetch("/data/players.json").then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    });
  } catch { toast("The public player pool could not load.", true); }
  await loadBoard();
  if (hostKey && !(await unlock(hostKey))) {
    hostKey = "";
    sessionStorage.removeItem("nyfl-host-key");
    renderHostState();
  }
  setInterval(() => loadBoard({ quiet: true }), 5000);
}

start();
