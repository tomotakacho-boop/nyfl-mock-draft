const API = "/api/board";
const ROUNDS = 16;
let board;
let players = [];
let hostKey = sessionStorage.getItem("nyfl-host-key") || "";
let offline = false;
let saving = false;

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const defaultTeams = [
  ["taffet", 1, "Matt's Monstrous Team", "Matt Taffet"], ["watts", 2, "U Dont Call Them Pollard People", "Josh Watts"],
  ["harrist", 3, "Chase Brown is God", "Jack Harrist"], ["danzig", 4, "Maye son or Conk daughter?", "Leo Danzig"],
  ["cho", 5, "The Twin Bowers", "Tomotaka Cho"], ["eng", 6, "'97-'98 Bulls", "Tashi Eng"],
  ["lai", 7, "2015-2016 Cleveland Cavs ⚔️", "Randy Lai"], ["lustberg", 8, "Vecberg", "David Lustberg"],
  ["enslin", 9, "Burrowmancer", "Matthew Enslin"], ["sahler", 10, "Big Boutte Btches", "Jeremy Sahler"],
  ["kazlow", 11, "Loser buys winner's Lemonade", "Nathaniel Kazlow"], ["spring", 12, "Gay McPride", "Matt Spring"],
].map(([id, slot, team, manager]) => ({ id, slot, team, manager }));
const defaultKeepers = [
  ["taffet",2,"Omarion Hampton"],["taffet",6,"Drake London"],["taffet",11,"Luther Burden III"],
  ["watts",2,"Kenneth Walker III"],["watts",4,"George Pickens"],["watts",5,"Emeka Egbuka"],
  ["harrist",8,"Jameson Williams"],["harrist",13,"Sam LaPorta"],["harrist",16,"Chase Brown"],
  ["danzig",7,"Ladd McConkey"],["danzig",12,"Caleb Williams"],["danzig",16,"Kyren Williams"],
  ["cho",5,"Jaxon Smith-Njigba"],["cho",8,"Brock Bowers"],["cho",16,"Woody Marks"],
  ["eng",2,"A.J. Brown"],["eng",3,"DeVonta Smith"],["eng",6,"Jonathan Taylor"],
  ["lai",5,"James Cook III"],["lai",9,"Colston Loveland"],["lai",16,"Christian Watson"],
  ["lustberg",1,"Bijan Robinson"],["lustberg",7,"Tyler Warren"],["lustberg",16,"Puka Nacua"],
  ["enslin",1,"Derrick Henry"],["enslin",8,"Travis Etienne Jr."],["enslin",16,"Rashee Rice"],
  ["sahler",1,"Ja'Marr Chase"],["sahler",4,"Breece Hall"],["sahler",10,"Nico Collins"],
  ["kazlow",4,"Jaylen Waddle"],["kazlow",7,"Quinshon Judkins"],["kazlow",16,"De'Von Achane"],
  ["spring",1,"Jahmyr Gibbs"],["spring",9,"Zay Flowers"],["spring",15,"Trey McBride"],
].map(([teamId, round, player]) => ({ teamId, round, player }));
const fallbackBoard = () => ({ season: 2026, teams: defaultTeams, keepers: defaultKeepers, picks: [], revision: 0, updatedAt: null });

function schedule() {
  const result = [];
  for (let round = 1; round <= ROUNDS; round += 1) for (let pick = 1; pick <= 12; pick += 1) {
    const slot = round % 2 ? pick : 13 - pick;
    result.push({ round, pick, overall: (round - 1) * 12 + pick, team: board.teams.find((team) => team.slot === slot) });
  }
  return result;
}
const keeperAt = (slot) => board.keepers.find((item) => item.teamId === slot.team.id && item.round === slot.round);
const pickAt = (slot) => board.picks.find((item) => item.teamId === slot.team.id && item.round === slot.round);
const nextSlot = () => schedule().find((slot) => !keeperAt(slot) && !pickAt(slot));
const usedPlayers = () => new Set([...board.keepers, ...board.picks].map((item) => item.player.toLowerCase()));

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
  $("#pick-count").textContent = `${board.picks.length} / 156`;
  $("#updated-label").textContent = offline ? "Local preview · deploy to sync" : board.updatedAt ? `Updated ${new Date(board.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Ready for the first pick";
  if (!slot) {
    $("#clock-summary").textContent = "Draft complete";
    $("#on-clock-team").textContent = "The 2026 NYFL draft is complete";
    $("#on-clock-detail").textContent = "Every live selection has been announced.";
    return;
  }
  $("#clock-summary").textContent = `#${slot.overall} · ${slot.team.team}`;
  $("#on-clock-team").textContent = `${slot.team.team} is on the clock`;
  $("#on-clock-detail").textContent = `${slot.team.manager} · Round ${slot.round}, pick ${slot.pick} · overall #${slot.overall}`;
}

function renderRecent() {
  const recent = schedule().map((slot) => ({ slot, pick: pickAt(slot) })).filter(({ pick }) => pick).slice(-4).reverse();
  $("#recent-picks").innerHTML = recent.length ? recent.map(({ slot, pick }) => `<article><span>#${slot.overall}</span><strong>${escapeHTML(pick.player)}</strong><small>${escapeHTML(slot.team.team)}</small></article>`).join("") : `<p>No live picks yet.</p>`;
}

function renderBoard() {
  const current = nextSlot();
  const head = `<thead><tr><th>Round</th>${board.teams.map((team) => `<th><span>#${team.slot}</span>${escapeHTML(team.team)}<small>${escapeHTML(team.manager)}</small></th>`).join("")}</tr></thead>`;
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

function renderPlayers() {
  const query = $("#player-search").value.trim().toLowerCase(), pos = $("#position-filter").value, used = usedPlayers();
  const matches = players.filter((player) => !used.has(player.name.toLowerCase()) && (pos === "ALL" || player.pos === pos) && (!query || `${player.name} ${player.team} ${player.pos}`.toLowerCase().includes(query))).slice(0, 48);
  $("#player-results").innerHTML = matches.length ? matches.map((player) => `<button data-id="${escapeHTML(player.id)}"><i>${escapeHTML(player.pos)}</i><span><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.team)}</small></span><b>Draft</b></button>`).join("") : `<p>No available players match.</p>`;
}

function render() { renderStatus(); renderRecent(); renderBoard(); renderOrder(); renderPlayers(); }

async function loadBoard() {
  if (saving) return;
  try {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw new Error();
    board = await response.json(); offline = false;
  } catch {
    offline = true;
    board = JSON.parse(localStorage.getItem("nyfl-public-preview") || "null") || board || fallbackBoard();
  }
  render();
}

async function saveBoard() {
  saving = true;
  try {
    if (offline) { board.updatedAt = new Date().toISOString(); localStorage.setItem("nyfl-public-preview", JSON.stringify(board)); toast("Saved in local preview."); render(); return; }
    const response = await fetch(API, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ editKey: hostKey, picks: board.picks }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save board");
    board = payload; toast("Live board updated for everyone."); render();
  } catch (error) { toast(error.message, true); } finally { saving = false; }
}

async function unlock(key) {
  if (offline) return true;
  const response = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ editKey: key }) });
  return response.ok;
}

$("#host-button").addEventListener("click", () => $("#host-dialog").showModal());
$("#host-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = $("#host-key-input").value.trim();
  if (!key || !(await unlock(key))) { $("#host-error").textContent = "Incorrect host key."; return; }
  hostKey = key; sessionStorage.setItem("nyfl-host-key", key); $("#host-panel").hidden = false; $("#host-dialog").close(); toast("Host controls unlocked.");
});
$("#player-search").addEventListener("input", renderPlayers);
$("#position-filter").addEventListener("change", renderPlayers);
$("#player-results").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-id]"); if (!button) return;
  const player = players.find((item) => item.id === button.dataset.id), slot = nextSlot(); if (!player || !slot) return;
  board.picks.push({ teamId: slot.team.id, round: slot.round, player: player.name, pos: player.pos, nflTeam: player.team }); render(); await saveBoard();
});
$("#undo-button").addEventListener("click", async () => { if (!board.picks.length) return toast("No live pick to undo.", true); board.picks.pop(); render(); await saveBoard(); });
$("#reset-button").addEventListener("click", async () => { if (!confirm("Reset all announced picks? Keepers remain locked.")) return; board.picks = []; render(); await saveBoard(); });

async function start() {
  board = fallbackBoard();
  try { players = await fetch("/data/players.json").then((response) => response.json()); } catch { toast("Player pool could not load.", true); }
  if (hostKey) $("#host-panel").hidden = false;
  await loadBoard(); setInterval(loadBoard, 5000);
}
start();
