const LOW_SAMPLE = 20;
const SET_CLASS = {
  "Season One": "set-season-one",
  "Season Two": "set-season-two",
  Outcasts: "set-outcasts",
  Vanguard: "set-vanguard",
  Marvel: "set-marvel",
  "X-Men": "set-x-men",
  "Santa vs Krampus": "set-santa-vs-krampus",
  "Single Release": "set-single-release",
};
const state = { data: null, filterSet: "all", query: "", selected: null };
const $ = (sel) => document.querySelector(sel);
function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "\u2014";
  return `${Number(n).toFixed(1)}%`;
}
function fmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "\u2014";
  return Number(n).toLocaleString();
}
function fmtWhen(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function setClass(setName) { return SET_CLASS[setName] || "set-season-one"; }
function findHero(slug) { return state.data?.heroes?.find((h) => h.slug === slug) || null; }
function goHall() { state.selected = null; location.hash = ""; render(); }
function goLedger(slug) { state.selected = slug; location.hash = `#hero/${slug}`; render(); }
function currentSlugFromHash() {
  const m = location.hash.match(/^#hero\/([a-z0-9_]+)/i);
  return m ? m[1] : null;
}
function renderBanner() {
  const fetchedAt = state.data?.fetchedAt;
  const fallback = Boolean(state.data?.fallback);
  $("#updated-stamp").textContent = `Last updated ${fmtWhen(fetchedAt)}`;
  $("#source-stamp").textContent = fallback ? "Fallback snapshot" : "Karnyx live pull";
  $("#footer-updated").textContent = fmtWhen(fetchedAt);
}
function renderHall() {
  const roster = $("#roster");
  const q = state.query.trim().toLowerCase();
  const heroes = (state.data?.heroes || []).filter((h) => {
    if (state.filterSet !== "all" && h.set !== state.filterSet) return false;
    if (!q) return true;
    return `${h.name} ${h.set} ${h.slug}`.toLowerCase().includes(q);
  });
  $("#roster-count").textContent = `${heroes.length} champions on the floor`;
  if (!heroes.length) {
    roster.innerHTML = `<p class="empty">The hall is empty for that search.</p>`;
    return;
  }
  roster.innerHTML = heroes.map((h) => `
      <button class="hero-card ${setClass(h.set)}" data-slug="${h.slug}">
        <div class="pip-row">
          <div class="avatar">${initials(h.name)}</div>
          <span class="set-chip">${h.set}</span>
        </div>
        <h2>${h.name}</h2>
        <div class="stats-row">
          <span>WR <b>${fmtPct(h.winRate)}</b></span>
          <span>${fmtNum(h.matches)} games</span>
        </div>
      </button>`).join("");
  roster.querySelectorAll(".hero-card").forEach((btn) => {
    btn.addEventListener("click", () => goLedger(btn.dataset.slug));
  });
}
function pickRow(pick) {
  const low = pick.games != null && pick.games < LOW_SAMPLE;
  return `
    <button class="pick" data-slug="${pick.slug}">
      <div class="avatar">${initials(pick.name)}</div>
      <div>
        <div class="name">${pick.name}${low ? `<span class="badge">Low Sample</span>` : ""}</div>
        <div class="games">${fmtNum(pick.games)} games</div>
      </div>
      <div class="wr">${fmtPct(pick.winRate)}</div>
    </button>`;
}
function renderLedger() {
  const hero = findHero(state.selected);
  if (!hero) {
    $("#ledger-missing").hidden = false;
    $("#ledger-body").hidden = true;
    return;
  }
  $("#ledger-missing").hidden = true;
  $("#ledger-body").hidden = false;
  $("#ledger-avatar").className = `avatar ${setClass(hero.set)}`;
  $("#ledger-avatar").textContent = initials(hero.name);
  $("#ledger-name").textContent = hero.name;
  $("#ledger-kicker").textContent = `${hero.set} · Complexity ${hero.complexity ?? "\u2014"} · 1v1 ledger`;
  $("#stat-wr").textContent = fmtPct(hero.winRate);
  $("#stat-pick").textContent = fmtPct(hero.pickRate);
  $("#stat-ban").textContent = fmtPct(hero.banRate);
  $("#stat-games").textContent = fmtNum(hero.matches);
  const best = hero.bestPicks || [];
  const worst = hero.worstPicks || [];
  $("#best-list").innerHTML = best.length ? best.map(pickRow).join("") : `<p class="empty">No best-pick rows in this snapshot.</p>`;
  $("#worst-list").innerHTML = worst.length ? worst.map(pickRow).join("") : `<p class="empty">No worst-pick rows in this snapshot.</p>`;
  document.querySelectorAll("#best-list .pick, #worst-list .pick").forEach((btn) => {
    btn.addEventListener("click", () => goLedger(btn.dataset.slug));
  });
}
function render() {
  const slug = currentSlugFromHash();
  state.selected = slug;
  const onLedger = Boolean(slug);
  $("#hall-screen").classList.toggle("active", !onLedger);
  $("#ledger-screen").classList.toggle("active", onLedger);
  renderBanner();
  if (onLedger) renderLedger();
  else renderHall();
}
function fillSetFilter(heroes) {
  const sets = [...new Set(heroes.map((h) => h.set))];
  $("#set-filter").innerHTML = `<option value="all">All sets</option>` + sets.map((s) => `<option value="${s}">${s}</option>`).join("");
}
function registerAppShell() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
function maybeShowInstallHint() {
  const hint = $("#install-hint");
  if (!hint) return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!standalone && ios) hint.hidden = false;
}
async function boot() {
  registerAppShell();
  maybeShowInstallHint();
  try {
    const res = await fetch("./data/heroes.json", { cache: "no-store" });
    if (!res.ok) throw new Error("missing ledger");
    state.data = await res.json();
  } catch (err) {
    $("#load-error").hidden = false;
    $("#load-error").textContent = "The hall could not open the ledger book.";
    console.error(err);
    return;
  }
  fillSetFilter(state.data.heroes || []);
  $("#search").addEventListener("input", (e) => { state.query = e.target.value; renderHall(); });
  $("#set-filter").addEventListener("change", (e) => { state.filterSet = e.target.value; renderHall(); });
  $("#back-btn").addEventListener("click", goHall);
  window.addEventListener("hashchange", render);
  render();
}
boot();
