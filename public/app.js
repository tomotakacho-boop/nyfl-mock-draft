const ROUNDS = 16;
const MOCK_SELECTIONS = 156;
const STARTER_REQUIREMENTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1 };
const POSITION_LIMITS = { QB: 2, RB: 6, WR: 6, TE: 2, DST: 1, K: 1 };
const CPU_PICK_DELAY = 260;
const CPU_ARCHETYPES = ["Balanced", "RB Aggressor", "WR Wave", "Zero-RB", "Late-QB", "Upside Hunter"];

let board;
let players = [];
let methodology = null;
let selectedTeamId = localStorage.getItem("nyfl-roster-team") || "cho";
let cpuMode = localStorage.getItem("nyfl-cpu-mode") === "automatic" ? "automatic" : "manual";
let draftStarted = false;
let draftSeed = Date.now();
let cpuPersonalities = [];
let cpuTimer = null;
let cpuBusy = false;
let sortKey = "adp";
let sortDirection = "asc";

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const format = (value, digits = 1) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const marketAdp = (player) => player?.adp !== null && player?.adp !== undefined && player?.adp !== "" && Number.isFinite(Number(player.adp)) ? Number(player.adp) : 9999;

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

function teamEntries(teamId) {
  return [...board.keepers, ...board.picks].filter((entry) => entry.teamId === teamId).map((entry) => {
    const player = playerByName(entry.player);
    return { ...entry, pos: entry.pos || player?.pos || "" };
  });
}

function isAutomaticCpuTurn() {
  const slot = nextSlot();
  return draftStarted && cpuMode === "automatic" && Boolean(slot) && slot.team.id !== selectedTeamId;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function buildCpuPersonalities(seed) {
  const random = seededRandom(seed);
  const opponents = board.teams.filter((team) => team.id !== selectedTeamId);
  const shuffled = [...opponents];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const creativeTeams = new Set(shuffled.slice(0, random() < 0.55 ? 1 : 2).map((team) => team.id));
  return board.teams.map((team, index) => ({
    teamId: team.id,
    score: team.id === selectedTeamId ? 0 : creativeTeams.has(team.id) ? 68 + Math.round(random() * 18) : 10 + Math.round(random() * 36),
    archetype: team.id === selectedTeamId ? "Human control" : CPU_ARCHETYPES[(index + Math.floor(random() * CPU_ARCHETYPES.length)) % CPU_ARCHETYPES.length],
  }));
}

function chooseCpuPlayer(slot) {
  const used = usedPlayers();
  const entries = teamEntries(slot.team.id);
  const counts = entries.reduce((result, entry) => ({ ...result, [entry.pos]: (result[entry.pos] || 0) + 1 }), {});
  const personality = cpuPersonalities.find((item) => item.teamId === slot.team.id) || { score: 20, archetype: "Balanced" };
  const random = seededRandom(draftSeed + slot.overall * 7919 + slot.team.slot);
  const byMarket = players
    .filter((player) => !used.has(player.name.toLowerCase()))
    .sort((a, b) => marketAdp(a) - marketAdp(b) || a.name.localeCompare(b.name));
  const viable = byMarket.filter((player) => {
    if (slot.round <= 11 && ["K", "DST"].includes(player.pos)) return false;
    if (POSITION_LIMITS[player.pos] && (counts[player.pos] || 0) >= POSITION_LIMITS[player.pos]) return false;
    if (slot.round <= 3 && ["RB", "WR"].includes(player.pos) && (counts[player.pos] || 0) >= 2) return false;
    if (slot.round <= 5 && ["QB", "TE"].includes(player.pos) && (counts[player.pos] || 0) >= 1) return false;
    return true;
  });

  const missingSpecialists = ["DST", "K"].filter((position) => !(counts[position] || 0));
  let forcedPositions = [];
  if (!(counts.QB || 0) && (slot.round >= 10 || entries.length >= 9)) forcedPositions = ["QB"];
  else if (!(counts.TE || 0) && (slot.round >= 11 || entries.length >= 10)) forcedPositions = ["TE"];
  else if (slot.round >= 12 && missingSpecialists.length === 2 && entries.length >= 13) forcedPositions = missingSpecialists;
  else if (slot.round >= 12 && missingSpecialists.length === 1 && entries.length >= 14) forcedPositions = missingSpecialists;

  const logicalPool = forcedPositions.length ? viable.filter((player) => forcedPositions.includes(player.pos)) : viable;
  const pool = logicalPool.length ? logicalPool : viable.length ? viable : byMarket;
  const windowSize = Math.round(clamp(4 + personality.score * 0.15, 5, 19));
  const candidates = pool.slice(0, windowSize);
  if (!candidates.length) return null;

  const weights = candidates.map((player, index) => {
    let need = 1;
    if (player.pos === "RB" && (counts.RB || 0) < 2 && slot.round <= 7) need *= 1.75;
    if (player.pos === "WR" && (counts.WR || 0) < 2 && slot.round <= 7) need *= 1.75;
    if (["RB", "WR"].includes(player.pos) && ((counts.RB || 0) + (counts.WR || 0)) < 6 && slot.round >= 6) need *= 1.35;
    if (player.pos === "QB" && !(counts.QB || 0) && slot.round >= 7) need *= 2.15;
    if (player.pos === "TE" && !(counts.TE || 0) && slot.round >= 8) need *= 1.95;
    if (player.pos === "QB" && (counts.QB || 0) === 1) need *= slot.round <= 11 ? 0.38 : 0.65;
    if (player.pos === "TE" && (counts.TE || 0) >= 1) need *= slot.round <= 9 ? 0.55 : 0.82;
    if (["RB", "WR"].includes(player.pos) && (counts[player.pos] || 0) >= 4 && slot.round <= 10) need *= 0.62;
    if (["K", "DST"].includes(player.pos) && slot.round >= 12 && !(counts[player.pos] || 0)) need *= 5;
    if (personality.archetype === "RB Aggressor" && player.pos === "RB" && slot.round <= 9) need *= 1.55;
    if (personality.archetype === "WR Wave" && player.pos === "WR" && slot.round <= 9) need *= 1.55;
    if (personality.archetype === "Zero-RB" && slot.round <= 5) need *= player.pos === "RB" ? 0.48 : ["WR", "TE"].includes(player.pos) ? 1.45 : 1;
    if (personality.archetype === "Late-QB" && player.pos === "QB") need *= slot.round <= 7 ? 0.18 : !(counts.QB || 0) ? 2.2 : 1;
    const randomness = 0.85 + random() * 0.3;
    const rankWeight = Math.exp(-index / (1.4 + personality.score / 17));
    return Math.max(0.001, need * randomness * rankWeight);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let draw = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    draw -= weights[index];
    if (draw <= 0) return candidates[index];
  }
  return candidates[0];
}

function toast(message, danger = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("is-danger", danger);
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 2800);
}

function renderStatus() {
  const slot = nextSlot();
  const isComplete = draftStarted && !slot;
  $("#player-pool-section").hidden = isComplete;
  $("#pick-count").textContent = `${board.picks.length} / ${MOCK_SELECTIONS}`;
  $("#updated-label").textContent = board.updatedAt
    ? `Saved ${new Date(board.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "Ready for a new mock";
  if (!draftStarted) {
    $("#clock-summary").textContent = "Waiting to start";
    $("#on-clock-team").textContent = "Choose your team and CPU mode";
    $("#on-clock-detail").textContent = "Changing teams resets the mock. Press Start draft when the setup is correct.";
    $("#round-number").textContent = "1";
    $("#round-pick").textContent = "Ready at overall #1";
    return;
  }
  if (!slot) {
    $("#clock-summary").textContent = "Draft complete";
    $("#on-clock-team").textContent = "The 2026 NYFL draft is complete";
    $("#on-clock-detail").textContent = "Every mock selection has been recorded.";
    $("#round-number").textContent = "16";
    $("#round-pick").textContent = `${MOCK_SELECTIONS} mock selections`;
    return;
  }
  $("#clock-summary").textContent = `#${slot.overall} · ${slot.team.team}`;
  $("#on-clock-team").textContent = `${slot.team.team} is on the clock`;
  const control = cpuMode === "automatic" ? slot.team.id === selectedTeamId ? "your selection" : "CPU selecting" : "manual selection";
  $("#on-clock-detail").textContent = `${slot.team.manager} · scheduled R${slot.round}P${slot.pick} · overall #${slot.overall} · ${control}`;
  $("#round-number").textContent = slot.round;
  $("#round-pick").textContent = `Mock pick ${board.picks.length + 1} of ${MOCK_SELECTIONS}`;
}

function renderCpuControls() {
  document.querySelectorAll("[data-cpu-mode]").forEach((button) => {
    const active = button.dataset.cpuMode === cpuMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = draftStarted;
  });
  const team = board.teams.find((item) => item.id === selectedTeamId) || board.teams[0];
  const startButton = $("#start-draft-button");
  startButton.disabled = draftStarted;
  startButton.textContent = draftStarted ? "Draft in progress" : "Start draft";
  $("#roster-team-label").textContent = cpuMode === "automatic" ? "VIEW / CONTROL" : "VIEW TEAM";
  $("#cpu-mode-note").textContent = !draftStarted
    ? `${team.team} will be your mock team. ${cpuMode === "automatic" ? "The original strategic CPU model will run the other 11 teams." : "You will make every selection manually."}`
    : cpuMode === "automatic"
      ? `${team.team} is under your control. Strategic CPUs run until your next turn.`
      : "Manual draft in progress. You control every team and every selection.";
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
    const playerData = playerByName(selection.player);
    return [{ ...selection, pos: selection.pos || playerData?.pos || "—", nflTeam: selection.nflTeam || playerData?.team || "", slot, playerData }];
  });
  $("#roster-heading").textContent = `${team.team} · ${entries.length}/${ROUNDS}`;
  const needs = rosterNeeds(entries);
  $("#roster-needs").innerHTML = needs.length ? needs.map((need) => `<b>${need.pos} ×${need.open}</b>`).join("") : `<b>STARTERS FILLED</b>`;
  $("#roster-cells").innerHTML = entries.length ? entries.map((entry) => {
    const isKeeper = Boolean(keeperAt(entry.slot));
    return `<article class="${isKeeper ? "roster-keeper" : ""}"><span>${isKeeper ? "KEEPER" : `PICK #${entry.slot.overall}`} · R${entry.slot.round}</span><i class="pos pos-${escapeHTML(entry.pos)}">${escapeHTML(entry.pos)}</i><b>${escapeHTML(entry.player)}</b><small>${escapeHTML(entry.nflTeam)}</small></article>`;
  }).join("") : `<p>No players rostered yet. This team’s locked keepers and mock selections will appear here.</p>`;
}

function renderRecent() {
  const recent = schedule().map((slot) => ({ slot, pick: pickAt(slot) })).filter(({ pick }) => pick).slice(-6);
  $("#recent-count").textContent = `${board.picks.length} mock pick${board.picks.length === 1 ? "" : "s"} recorded`;
  const clock = draftStarted ? nextSlot() : null;
  $("#recent-picks").innerHTML = `${recent.map(({ slot, pick }) => `<article><span>#${slot.overall}</span><strong>${escapeHTML(pick.player)}</strong><small>${escapeHTML(slot.team.team)} · ${escapeHTML(pick.pos)}</small></article>`).join("")}${clock ? `<article class="ticker-clock"><span>NEXT</span><strong>${escapeHTML(clock.team.team)}</strong><small>Scheduled #${clock.overall}</small></article>` : !draftStarted ? `<article class="ticker-clock"><span>READY</span><strong>Start at pick #1</strong><small>No CPU picks run before Start draft</small></article>` : `<article class="ticker-clock"><span>FINAL</span><strong>Draft complete</strong><small>All picks recorded</small></article>`}`;
}

const sortColumns = [["name", "PLAYER"], ["pos", "POS"], ["adp", "ADP"]];

function renderPlayerHead() {
  $("#player-table-head").innerHTML = `<th>MOCK ACTION</th>${sortColumns.map(([key, label]) => `<th><button data-sort="${key}" class="${sortKey === key ? "active" : ""}">${label}<span>${sortKey === key ? sortDirection === "asc" ? "↑" : "↓" : "↕"}</span></button></th>`).join("")}<th>2026 PROJECTED STATS / GAME</th>`;
}

function sortValue(player, key) {
  return player[key] ?? (typeof player[key] === "string" ? "" : 9999);
}

function comparePlayers(a, b) {
  const aMissing = a[sortKey] === null || a[sortKey] === undefined || a[sortKey] === "";
  const bMissing = b[sortKey] === null || b[sortKey] === undefined || b[sortKey] === "";
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
  const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
  return (sortDirection === "asc" ? result : -result) || Number(a.adp || 9999) - Number(b.adp || 9999);
}

function projectedStatLine(player) {
  const stats = player.projectedStatsPerGame || {};
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
  return available.length
    ? `${available.map(([label, value]) => `<span><b>${label}</b> ${format(value)}</span>`).join("")}<em>${escapeHTML(player.projectionProvider || "")}</em>`
    : `<span class="stats-unavailable">2026 statistical projection unavailable</span>`;
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
  const cpuTurn = isAutomaticCpuTurn();
  const selectionDisabled = !draftStarted || cpuTurn || !current;
  $("#player-result-count").textContent = `Showing ${matches.length} available players`;
  $("#player-table-body").innerHTML = matches.map((player) => {
    return `<tr>
      <td><button class="remove-button" data-player-id="${escapeHTML(player.id)}" ${selectionDisabled ? "disabled" : ""}><b>${!draftStarted ? "START FIRST" : cpuTurn ? "CPU" : "DRAFT"}</b><small>${!draftStarted ? "Setup" : cpuTurn ? "Selecting…" : current ? `Pick #${current.overall}` : "Complete"}</small></button></td>
      <td><div class="player-identity"><span class="player-photo" style="background-image:url('${playerPhoto(player)}')"><i>${escapeHTML(player.pos)}</i></span><span><b>${escapeHTML(player.name)}</b><small>${escapeHTML(player.team)}</small></span></div></td>
      <td><i class="pos pos-${escapeHTML(player.pos)}">${escapeHTML(player.pos)}</i></td>
      <td><b>${format(player.adp)}</b></td><td><div class="espn-stat-line">${projectedStatLine(player)}</div></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-table">No available players match these filters.</td></tr>`;
}

function renderBoard() {
  const current = draftStarted ? nextSlot() : null;
  const head = `<thead><tr><th>Round</th>${board.teams.map((team) => `<th><span>#${team.slot}</span><b>${escapeHTML(team.team)}</b><small>${escapeHTML(team.manager)}</small></th>`).join("")}</tr></thead>`;
  const body = Array.from({ length: ROUNDS }, (_, index) => index + 1).map((round) => `<tr><th>R${round}</th>${board.teams.map((team) => {
    const slot = schedule().find((item) => item.round === round && item.team.id === team.id);
    const keeper = keeperAt(slot), pick = pickAt(slot), onClock = current?.round === round && current.team.id === team.id;
    const position = keeper?.pos || pick?.pos || "";
    const positionClass = position ? ` board-pos-${position}` : "";
    if (keeper) return `<td class="keeper${positionClass}"><span>KEEPER · ${escapeHTML(position)}</span><strong>${escapeHTML(keeper.player)}</strong><small>Round ${round}</small></td>`;
    if (pick) return `<td class="selected${positionClass}"><span>#${slot.overall} · ${escapeHTML(position)}</span><strong>${escapeHTML(pick.player)}</strong><small>${escapeHTML(pick.nflTeam)}</small></td>`;
    if (onClock) return `<td class="on-clock"><span>ON CLOCK</span><strong>Overall #${slot.overall}</strong><small>R${round}P${slot.pick}</small></td>`;
    return `<td><span>#${slot.overall}</span><strong>Open</strong><small>R${round}P${slot.pick}</small></td>`;
  }).join("")}</tr>`).join("");
  $("#draft-board").innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderOrder() {
  $("#order-grid").innerHTML = board.teams.map((team) => `<article><b>${team.slot}</b><div><strong>${escapeHTML(team.team)}</strong><small>${escapeHTML(team.manager)}</small></div></article>`).join("");
}

function renderMethodology() {
  if (!methodology) return;
  $("#method-as-of").textContent = new Date(methodology.asOf).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  $("#method-adp-count").textContent = `${methodology.espnAdpCount} players`;
  $("#method-projection-counts").textContent = Object.entries(methodology.projectionProviderCounts || {}).map(([provider, count]) => `${provider}: ${count}`).join(" · ");
  $("#source-list").innerHTML = (methodology.sources || []).map((source) => `<article><div><b>${escapeHTML(source.name)}</b><p>${escapeHTML(source.purpose)}</p></div>${source.url ? `<a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">Open source ↗</a>` : `<span>League supplied</span>`}</article>`).join("");
}

function render() {
  renderStatus(); renderRosterSelector(); renderCpuControls(); renderRoster(); renderRecent(); renderPlayerHead(); renderPlayers(); renderBoard(); renderOrder(); renderMethodology();
  queueCpuPick();
}

async function commitPicks(nextPicks, successMessage = "") {
  board = { ...board, picks: nextPicks, revision: Number(board.revision || 0) + 1, updatedAt: new Date().toISOString() };
  persistMock();
  if (successMessage) toast(successMessage);
  render();
}

function persistMock() {
  localStorage.setItem("nyfl-mock-draft-2026", JSON.stringify({
    picks: board.picks,
    revision: board.revision,
    updatedAt: board.updatedAt,
    started: draftStarted,
    seed: draftSeed,
  }));
}

function returnToSetup(message = "Mock reset. Choose a team and mode, then press Start draft.") {
  clearTimeout(cpuTimer);
  cpuBusy = false;
  draftStarted = false;
  draftSeed = Date.now();
  cpuPersonalities = [];
  board = { ...board, picks: [], revision: Number(board.revision || 0) + 1, updatedAt: null };
  persistMock();
  render();
  if (message) toast(message);
}

function queueCpuPick() {
  clearTimeout(cpuTimer);
  if (!isAutomaticCpuTurn() || cpuBusy) return;
  cpuTimer = setTimeout(runCpuPick, CPU_PICK_DELAY);
}

async function runCpuPick() {
  if (!isAutomaticCpuTurn() || cpuBusy) return;
  const slot = nextSlot();
  const player = slot ? chooseCpuPlayer(slot) : null;
  if (!slot || !player) return;
  cpuBusy = true;
  const nextPicks = [...board.picks, { teamId: slot.team.id, round: slot.round, player: player.name, pos: player.pos, nflTeam: player.team }];
  await commitPicks(nextPicks);
  cpuBusy = false;
  queueCpuPick();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  const view = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".tab-view").forEach((panel) => panel.hidden = panel.id !== `${view}-view`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

$("#roster-team-select").addEventListener("change", (event) => {
  selectedTeamId = event.target.value;
  localStorage.setItem("nyfl-roster-team", selectedTeamId);
  returnToSetup("Team changed. The mock reset to pick #1; choose a CPU mode and press Start draft.");
});

document.querySelector(".cpu-mode-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cpu-mode]");
  if (!button || button.dataset.cpuMode === cpuMode) return;
  if (draftStarted) return toast("Reset the draft before changing CPU mode.", true);
  clearTimeout(cpuTimer);
  cpuMode = button.dataset.cpuMode;
  localStorage.setItem("nyfl-cpu-mode", cpuMode);
  render();
  toast(cpuMode === "automatic" ? "Automatic CPUs selected. Press Start draft when ready." : "Manual CPUs selected. Press Start draft when ready.");
});

$("#start-draft-button").addEventListener("click", () => {
  if (draftStarted) return;
  board = { ...board, picks: [], revision: Number(board.revision || 0) + 1, updatedAt: new Date().toISOString() };
  draftSeed = Date.now();
  cpuPersonalities = buildCpuPersonalities(draftSeed);
  draftStarted = true;
  persistMock();
  render();
  toast(cpuMode === "automatic" ? "Draft started. Strategic CPUs are on." : "Draft started in full manual mode.");
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
  if (!button) return;
  const player = players.find((item) => item.id === button.dataset.playerId);
  const slot = nextSlot();
  if (!draftStarted) return toast("Choose a team and CPU mode, then press Start draft.", true);
  if (!player || !slot) return toast("The draft is complete.", true);
  if (isAutomaticCpuTurn()) return toast("The CPU is making this selection. Switch to Manual CPUs to take over.", true);
  const nextPicks = [...board.picks, { teamId: slot.team.id, round: slot.round, player: player.name, pos: player.pos, nflTeam: player.team }];
  await commitPicks(nextPicks, `${player.name} recorded for ${slot.team.team}.`);
});

$("#undo-button").addEventListener("click", async () => {
  if (!board.picks.length) return toast("No mock pick to undo.", true);
  const removed = board.picks.at(-1);
  await commitPicks(board.picks.slice(0, -1), `${removed.player} returned to the board.`);
});

$("#reset-button").addEventListener("click", async () => {
  if (!confirm("Reset every mock selection? The 36 locked keepers will remain.")) return;
  returnToSetup();
});

async function start() {
  const saved = JSON.parse(localStorage.getItem("nyfl-mock-draft-2026") || "null");
  const supportsSetupFlow = typeof saved?.started === "boolean";
  board = { ...fallbackBoard(), picks: supportsSetupFlow && Array.isArray(saved?.picks) ? saved.picks : [], revision: Number(saved?.revision || 0), updatedAt: supportsSetupFlow ? saved?.updatedAt || null : null };
  draftStarted = supportsSetupFlow && Boolean(saved.started);
  draftSeed = Number(saved?.seed) || Date.now();
  cpuPersonalities = buildCpuPersonalities(draftSeed);
  try {
    [players, methodology] = await Promise.all([
      fetch("/data/players.json").then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/data/methodology.json").then((response) => response.ok ? response.json() : Promise.reject()),
    ]);
  } catch { toast("The public player pool could not load.", true); }
  render();
}

start();
