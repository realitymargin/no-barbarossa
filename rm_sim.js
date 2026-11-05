// RealityMargin sim page engine, reused by every sim film. Needs the film's model (war, rng, warSeed, oddsFor, ODDS, O_DEF, O_RED) and window.RM from the film's builder.
// Wars run in workers across the processor's cores, with a slower fallback on the page itself. Blocks can finish in any order: each war's dice depend only on the seed and its number.
(() => {
  const $ = id => document.getElementById(id), R = window.RM, fmt = n => n.toLocaleString("en-US");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, glide = () => reduced ? "auto" : "smooth", narrow = () => matchMedia("(max-width: 979px)").matches;
  const qs = new URLSearchParams(location.search), MAX = 5000000, MIN = 100, PREVIEW = 5000, SMALL = 100000;
  const cores = qs.has("workers") ? Math.max(0, +qs.get("workers") | 0) : Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1));
  let over = {}, fix = {}, label = "", job = null, pool = null, broken = cores === 0, nextId = 1, previewTimer = 0, msPerWar = 0.125, reader = null, wars = R.film.i, seed = R.seed, tweenId = 0, quietUntil = 0, lastCounts = R.film.c;
  let shown = { P: oddsFor("mid"), H: undefined, seed: R.seed, n: R.film.i };

  /* ---------- small helpers ---------- */
  const base = () => oddsFor($("col").value), params = () => ({ ...base(), ...over }), forced = () => Object.keys(fix).length ? fix : undefined;
  const show = (kind, v) => kind === "%" ? (100 * v).toFixed(v < 0.1 ? 1 : 0) + "%" : String(+v.toFixed(3));
  const sameOdds = () => !Object.keys(over).length && !Object.keys(fix).length && $("col").value === "mid";
  const isVideo = () => sameOdds() && seed === R.seed;
  const span = s => s < 5 ? "a few seconds" : s < 90 ? "about " + Math.round(s / 5) * 5 + " seconds" : "about " + Math.max(2, Math.round(s / 60)) + " minutes";
  const threads = () => Math.max(1, broken ? 1 : cores);
  const pct = (a, n, d) => (100 * a / Math.max(1, n)).toFixed(d) + "%", digits = n => n < SMALL ? 1 : 2;
  const realJob = () => job && !job.preview;
  const lit = on => document.querySelectorAll(".preset").forEach(p => { if (!on) p.classList.remove("on"); });
  function toast(t) { const el = $("toast"); el.textContent = t; el.className = "on"; clearTimeout(toast.t); toast.t = setTimeout(() => el.className = "", 2200); }
  function setNums(vb, vh, d, animate) { /* a new draw always cancels an old count-up, so the tiles can't disagree with the rows */
    const id = ++tweenId, B = $("vBeaten"), H = $("vHolds"), put = (a, b) => { B.textContent = a.toFixed(d) + "%"; H.textContent = b.toFixed(d) + "%"; };
    if (!animate || reduced) { put(vb, vh); return; } const b0 = parseFloat(B.textContent) || 0, h0 = parseFloat(H.textContent) || 0, t0 = performance.now();
    const go = t => { if (id !== tweenId) return; const u = Math.min(1, (t - t0) / 420), e = 1 - (1 - u) * (1 - u); put(b0 + (vb - b0) * e, h0 + (vh - h0) * e); if (u < 1) requestAnimationFrame(go); else put(vb, vh); }; requestAnimationFrame(go);
  }
  function pulse() { const a = $("answer"); a.classList.remove("pulse"); void a.offsetWidth; a.classList.add("pulse"); }
  function goTo(el) { el.scrollIntoView({ behavior: glide(), block: "start" }); }
  function toResults() { if (narrow()) { const t = $("answer").getBoundingClientRect().top; if (t < 0 || t > innerHeight * .3) goTo($("answer")); return; } const t = $("answer").getBoundingClientRect().top; if (t < 0 || t > innerHeight * .3) goTo($("work")); }
  addEventListener("click", e => { if (performance.now() < quietUntil) { e.stopImmediatePropagation(); e.preventDefault(); } }, true); /* a double-click's second half must not stop a run or close a panel */

  /* ---------- reading what people type ---------- */
  const readNum = s => { const v = parseFloat(String(s).replace(/,/g, "").trim()); return isFinite(v) ? v : NaN; };
  const warsFrom = s => { const v = readNum(s); return isNaN(v) ? null : Math.max(MIN, Math.min(MAX, Math.floor(v))); };
  function warsUI() { document.querySelectorAll(".chip[data-n]").forEach(c => { const on = +c.dataset.n === wars; c.classList.toggle("on", on); c.setAttribute("aria-pressed", on); }); $("wEst").textContent = fmt(wars) + " wars, " + span(wars * msPerWar / 1000 / threads()); $("runT").textContent = "▶ Run " + fmt(wars) + " wars"; }
  function setWars(n) { wars = n; $("nw").value = fmt(n); warsUI(); if (!job) readyLine(); }
  function readyLine() { $("status").textContent = "Press Run when you're ready."; $("compare").textContent = ""; }

  /* ---------- odds ---------- */
  function countChanged() { const n = Object.keys(over).length; $("changedN").textContent = n ? n + " changed" : ""; $("changedN").hidden = !n; $("allN").textContent = n ? n + " changed" : "all 76"; }
  function paint(input, k, top) { input.style.setProperty("--p", Math.min(100, 100 * (over[k] ?? base()[k]) / top) + "%"); }
  function sliders() {
    const el = $("sliders"); el.innerHTML = "";
    for (const [k, txt, top, kind] of R.sliders) {
      const w = document.createElement("div"); w.className = "slider"; w.dataset.k = k;
      w.innerHTML = '<label><span>' + txt + '</span><span class="val"></span></label><div class="sl"><input type="range" min="0" max="1000" aria-label="' + txt.replace(/"/g, "") + '"><button class="undo" type="button" title="Back to the set value" aria-label="Back to the set value" hidden>↺</button></div><small>Against Germany ' + show(kind, ODDS[k][0]) + " · middle " + show(kind, ODDS[k][1]) + " · for Germany " + show(kind, ODDS[k][2]) + "</small>";
      const r = w.querySelector("input"), v = w.querySelector(".val"), u = w.querySelector(".undo");
      const sync = () => { const x = over[k] ?? base()[k]; r.value = Math.round(1000 * Math.min(top, x) / top); v.textContent = show(kind, x); u.hidden = over[k] === undefined; w.classList.toggle("moved", over[k] !== undefined); paint(r, k, top); };
      w.sync = sync; sync();
      r.oninput = () => { over[k] = r.value / 1000 * top; sync(); syncAll(k); changed(true); };
      u.onclick = () => { delete over[k]; sync(); syncAll(k); r.focus(); changed(true); };
      el.appendChild(w);
    }
  }
  function syncSlider(k) { const w = $("sliders").querySelector('[data-k="' + k + '"]'); if (w) w.sync(); }
  function syncAll(k) { const i = $("allOdds").querySelector('input[data-k="' + k + '"]'); if (i) { i.value = over[k] ?? base()[k]; i.closest(".odd").classList.toggle("moved", over[k] !== undefined); } }
  function capFor(k) { const m = Math.max(...ODDS[k]); return m <= 1 ? 1 : m * 100; }
  function allOdds() {
    const el = $("allOdds"), b = base(); el.innerHTML = "";
    for (const k of Object.keys(ODDS)) {
      const w = document.createElement("label"); w.className = "odd" + (over[k] !== undefined ? " moved" : ""); w.dataset.s = (k + " " + (R.desc[k] || "")).toLowerCase();
      w.innerHTML = '<span class="ot"><b>' + k + "</b><small>" + (R.desc[k] || "") + '</small><small class="om">Against ' + ODDS[k][0] + " · middle " + ODDS[k][1] + " · for " + ODDS[k][2] + '</small></span><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" aria-label="' + k + '">';
      const i = w.querySelector("input"); i.value = over[k] ?? b[k];
      i.onchange = () => { const v = readNum(i.value), def = base()[k]; if (isNaN(v) || v < 0) { i.value = over[k] ?? def; toast("That odd has to be a number, 0 or more"); return; } const x = Math.min(capFor(k), v); if (x !== v) toast("Capped at " + x); i.value = x; if (x === def) delete over[k]; else over[k] = x; w.classList.toggle("moved", over[k] !== undefined); syncSlider(k); changed(true); };
      el.appendChild(w);
    }
  }
  /* any change by hand: the panel stops claiming it's a named run, a forced what-if is let go, and a rough answer appears */
  function changed(preview) { label = ""; fix = {}; lit(false); countChanged(); warNote(); if (realJob()) { job.dirty = true; $("status").textContent = "Changed. Your change counts on the next run."; return; } if (!job) $("status").textContent = "Changed. Press Run for the full answer."; if (preview) { clearTimeout(previewTimer); previewTimer = setTimeout(() => { if (isVideo()) { if (job) job = null; showFilm(); return; } start({ preview: true }); }, 380); } }

  /* ---------- running ---------- */
  function getPool() { if (broken) return null; if (pool) return pool; try { pool = Array.from({ length: cores }, () => { const w = new Worker("rm_worker.js"); w.onmessage = e => onBlock(w, e.data); w.onerror = () => fallBack(); return w; }); } catch (e) { fallBack(); return null; } return pool; }
  function fallBack() { broken = true; if (pool) pool.forEach(w => w.terminate()); pool = null; if (job) { const j = job; job = null; start({ again: j }); } }
  const merge = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; };
  function feed(w) { const j = job; if (!j || j.next >= j.n) return; const from = j.next, to = Math.min(j.n, from + j.block); j.next = to; w.postMessage({ id: j.id, P: j.P, H: j.H, seed: j.seed, from, to }); }
  function onBlock(w, d) { const j = job; if (!j || d.id !== j.id) return; merge(j.c, d.c); merge(j.who, d.who); merge(j.fallen, d.fallen); j.holds += d.holds; j.done += d.n; tick(); if (j.done >= j.n) finish(false); else feed(w); }
  function localStep() { const j = job; if (!j || j.local !== j.id) return; const t0 = performance.now(); while (j.next < j.n && performance.now() - t0 < 60) { const i = j.next++, r = war(j.P, rng(warSeed(j.seed, i)), j.H); j.c[r.outcome] = (j.c[r.outcome] || 0) + 1; j.who[r.who] = (j.who[r.who] || 0) + 1; if (r.hold) j.holds++; if (r.outcome === O_DEF || r.outcome === O_RED) { const y = Math.floor(r.y); j.fallen[y] = (j.fallen[y] || 0) + 1; } j.done++; } tick(); if (j.done >= j.n) finish(false); else setTimeout(localStep, 0); }
  function tick() { const j = job, now = performance.now(); if (!j) return; const end = j.done >= j.n; if (!end && now - j.last < 110) return; j.last = now; const rate = j.done / Math.max(1, now - j.t0); setProgress(j.done, j.n); if (!j.preview) $("eta").textContent = end ? "" : j.done > 0 ? span((j.n - j.done) / Math.max(rate, 1e-6) / 1000) + " left" : ""; if (j.done) draw(j.c, j.who, j.fallen, j.holds, j.done, false); }
  function setProgress(i, n) { const u = 100 * i / Math.max(1, n); $("bar").style.width = u + "%"; $("dockBar").style.width = u + "%"; $("count").textContent = fmt(i) + " / " + fmt(n) + " wars"; }
  function buttons(run) {
    document.documentElement.classList.toggle("running", run); $("runT").hidden = run; $("stopT").hidden = !run; $("dockRun").textContent = run ? "■ Stop" : "▶ Run"; $("ansRun").textContent = run ? "■ Stop" : "▶ Run"; $("heroRun").textContent = run ? "Running…" : "▶ Run the video's war";
    for (const el of [$("heroRun"), $("reset"), ...document.querySelectorAll(".preset")]) el.setAttribute("aria-disabled", run); /* not "disabled": the keyboard keeps its place */
  }
  function start(o = {}) {
    clearTimeout(previewTimer);
    const again = o.again, preview = again ? again.preview : !!o.preview; if (!again && !preview && realJob()) return;
    const n = again ? again.n : preview ? PREVIEW : wars, odds = sameOdds(), name = preview ? "Rough preview" : label || (odds && seed === R.seed ? (n === R.film.i ? "The video's million" : "The video's odds") : Object.keys(fix).length ? "Forced settings" : "Your odds");
    const j = job = again ? { ...again, id: nextId++, next: 0, done: 0, c: {}, who: {}, fallen: {}, holds: 0 } : { id: nextId++, n, seed, P: params(), H: forced(), label: name, preview, odds, exact: !preview && odds && seed === R.seed && n === R.film.i, next: 0, done: 0, c: {}, who: {}, fallen: {}, holds: 0, block: Math.max(500, Math.min(4000, Math.ceil(n / 200))), t0: performance.now(), last: 0, was: { P: shown, c: lastCounts } };
    shown = { P: j.P, H: j.H, seed: j.seed, n: j.n };
    $("modeT").textContent = j.label; $("modeS").textContent = fmt(n) + " wars, seed " + j.seed; $("compare").textContent = ""; $("again").classList.remove("on"); setProgress(0, n);
    if (!preview) { quietUntil = performance.now() + 250; window.NBLAST = null; buttons(true); $("status").textContent = "Running. The numbers settle as it counts."; $("eta").textContent = ""; pulse(); try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: "run/" + String(label || "own settings").toLowerCase().replace(/[^a-z0-9]+/g, "-"), title: "RUN: " + (label || "own settings"), event: true }); } catch (e) { } /* counts which button was pressed, never the odds */ }
    else $("status").textContent = "Working out a rough answer…";
    const P = getPool(); if (P) P.forEach(feed); else { j.local = j.id; localStep(); }
  }
  function finish(stopped) {
    const j = job; if (!j) return; job = null;
    if (!j.preview && !stopped && j.done > 5000) msPerWar = (performance.now() - j.t0) * threads() / j.done;
    $("eta").textContent = "";
    if (j.preview) { draw(j.c, j.who, j.fallen, j.holds, j.done, true); setProgress(j.done, j.n); $("status").textContent = "Rough answer from " + fmt(j.done) + " wars. Press Run to use your " + fmt(wars) + "."; $("compare").textContent = "Only 5,000 wars, so small differences here can be chance."; return; }
    buttons(false); window.NBLAST = { i: j.done, c: j.c, who: j.who, fallen: j.fallen, holds: j.holds };
    if (stopped && !j.done) { showFilm(); $("status").textContent = "Stopped before any war finished."; return; }
    draw(j.c, j.who, j.fallen, j.holds, j.done, true); setProgress(j.done, j.n);
    if (stopped) { lit(false); $("modeT").textContent = "Stopped at " + fmt(j.done) + " of " + fmt(j.n); $("modeS").textContent = "seed " + j.seed; }
    $("status").textContent = stopped ? "Stopped at " + fmt(j.done) + " wars. These numbers cover only those." : j.dirty ? "Done, for the odds as they were when you pressed Run. Press Run again to use your change." : "Done. Same odds, same seed and same number of wars give the same answer on any computer. It isn't a forecast.";
    compare(j, stopped); $("again").classList.add("on"); warsUI();
  }
  function compare(j, stopped) {
    const b = 100 * ((j.c[O_DEF] || 0) + (j.c[O_RED] || 0)) / Math.max(1, j.done), h = 100 * j.holds / Math.max(1, j.done), F = R.film, fb = 100 * (F.c[O_DEF] + F.c[O_RED]) / F.i, fh = 100 * F.holds / F.i, d = digits(j.done);
    if (j.exact && !stopped) { $("compare").textContent = "This is the video's exact run."; return; }
    if (j.odds) { $("compare").textContent = "Same odds as the video, in a different sample of wars, so any gap from its " + fh.toFixed(2) + "% is chance."; return; }
    $("compare").textContent = "Germany holds Europe: " + fh.toFixed(2) + "% in the video, " + h.toFixed(d) + "% here. Germany beaten: " + fb.toFixed(2) + "% in the video, " + b.toFixed(d) + "% here." + (j.done < SMALL ? " With only " + fmt(j.done) + " wars, small differences can be chance." : "");
  }

  /* ---------- drawing the answer ---------- */
  function draw(c, who, fallen, holds, i, settled) {
    lastCounts = c; const b = (c[O_DEF] || 0) + (c[O_RED] || 0), vb = 100 * b / Math.max(1, i), vh = 100 * holds / Math.max(1, i), d = digits(i);
    setNums(vb, vh, d, settled); $("dB").textContent = vb.toFixed(d) + "%"; $("dH").textContent = vh.toFixed(d) + "%";
    $("stack").innerHTML = R.outcomes.map(o => '<i style="width:' + (100 * (c[o.key] || 0) / Math.max(1, i)) + "%;background:" + o.col + '"></i>').join("");
    const body = $("rowsB"); if (!body.children.length) { body.innerHTML = R.outcomes.map(o => '<button class="row" type="button" data-k="' + o.key + '" title="Read a war that ended this way"><span class="sw" style="background:' + o.col + '"></span><span class="l">' + o.say + '</span><span class="n"></span><span class="p"></span><span class="r"></span><span class="go2" aria-hidden="true">›</span></button>').join(""); body.querySelectorAll(".row").forEach(x => x.onclick = () => { if (x.getAttribute("aria-disabled") !== "true") readEnding(x.dataset.k); }); }
    body.querySelectorAll(".row").forEach(x => { const k = x.dataset.k, n = c[k] || 0; x.setAttribute("aria-disabled", !n); x.title = n ? "Read a war that ended this way" : "No war ended this way in this run"; x.querySelector(".n").textContent = fmt(n); x.querySelector(".p").textContent = pct(n, i, d); x.querySelector(".r").textContent = pct(R.film.c[k] || 0, R.film.i, 2); });
    $("who").innerHTML = R.who.filter(w => !w[3] || who[w[0]]).map(([k, t, col]) => "<span>" + t + '</span><span class="tr"><i style="width:' + (100 * (who[k] || 0) / Math.max(1, i)) + "%;background:" + col + '"></i></span><span class="p">' + pct(who[k] || 0, i, d) + "</span>").join("");
    $("curve").innerHTML = R.years.map(y => { const gone = Object.keys(fallen).filter(q => +q <= y).reduce((s, q) => s + fallen[q], 0), left = 100 * (i - gone) / Math.max(1, i); return "<span>" + y + '</span><span class="tr"><i style="width:' + left + '%;background:#3273e0"></i></span><span class="p">' + left.toFixed(0) + "%</span>"; }).join("");
  }
  function showFilm() { const f = R.film; shown = { P: oddsFor("mid"), H: undefined, seed: R.seed, n: f.i }; $("modeT").textContent = "The video's million"; $("modeS").textContent = fmt(f.i) + " wars, seed " + R.seed + ", every odd in the middle"; setProgress(f.i, f.i); $("eta").textContent = ""; $("status").textContent = "Press Run to watch it happen, or try a what-if."; $("compare").textContent = "This is the video's exact run."; $("again").classList.remove("on"); draw(f.c, f.who, f.fallen, f.holds, f.i, false); }
  function reset() { clearTimeout(previewTimer); if (realJob()) return; job = null; over = {}; fix = {}; label = ""; $("col").value = "mid"; seed = R.seed; $("seed").value = seed; $("oddFind").value = ""; $("oddN").textContent = ""; setWars(R.film.i); lit(false); sliders(); allOdds(); countChanged(); warNote(); showFilm(); }

  /* ---------- what-ifs ---------- */
  function presets() {
    const el = $("presets"); el.innerHTML = "";
    R.presets.forEach(([t, d, col, n, s, f], idx) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "preset"; b.innerHTML = '<span class="t">' + t + '</span><span class="d">' + d + "</span>";
      b.onclick = () => { if (realJob()) return; job = null; clearTimeout(previewTimer); lit(false); b.classList.add("on"); over = {}; fix = { ...f }; label = t; $("col").value = col; seed = s; $("seed").value = s; if (idx === 0) setWars(n); sliders(); allOdds(); countChanged(); warNote(); toResults(); start(); };
      el.appendChild(b);
    });
  }

  /* ---------- reading one war, in a side panel ---------- */
  const when = y => (y % 1 ? "second half of " : "first half of ") + Math.floor(y);
  function warNote() { const t = (Object.keys(fix).length || Object.keys(over).length || $("col").value !== "mid" || seed !== R.seed) ? "These aren't the video's settings, so this number is a different war. Press Back to the video's odds to see the video's war." : ""; $("warNote").textContent = t; $("warNote").hidden = !t; }
  function headline(id, r, o) { const cap = s => s.charAt(0).toUpperCase() + s.slice(1), defeat = r.outcome === O_DEF || r.outcome === O_RED; if (defeat) return "War " + fmt(id) + ": " + o.war + ", " + when(r.y) + ": " + r.why + "."; if (r.y >= 1950) return "War " + fmt(id) + ": " + cap(r.why) + "."; return "War " + fmt(id) + ", " + when(r.y) + ": " + cap(r.why) + "."; }
  function fillWar(id, r, kicker) { const o = R.outcomes.find(x => x.key === r.outcome) || { war: r.outcome }; $("drK").textContent = kicker; $("warHead").textContent = headline(id, r, o); $("warPath").innerHTML = r.path.map(e => "<li>" + e.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>").join(""); window.NBWAR = r; $("drBody").scrollTop = 0; }
  const behind = () => [document.querySelector(".bar"), ...document.querySelectorAll(".tabp"), document.querySelector("footer"), $("dock")];
  function openDrawer(back) { const d = $("drawer"); d.hidden = false; requestAnimationFrame(() => d.classList.add("on")); document.documentElement.classList.add("lock"); behind().forEach(e => e.inert = true); quietUntil = performance.now() + 250; reader.back = back; $("drClose").focus(); }
  function closeDrawer() { const d = $("drawer"); if (d.hidden) return; d.classList.remove("on"); document.documentElement.classList.remove("lock"); behind().forEach(e => e.inert = false); setTimeout(() => { d.hidden = true; }, reduced ? 0 : 240); if (reader && reader.back && reader.back.focus) reader.back.focus({ preventScroll: true }); }
  function oneWar() { const v = readNum($("warN").value); if (isNaN(v) || v < 0 || v >= MAX) { toast("Type a war number from 0 to " + fmt(MAX - 1)); return; } const id = Math.floor(v); $("warN").value = fmt(id); reader = { mode: "number" }; $("drMore").textContent = "Show a random war"; fillWar(id, war(params(), rng(warSeed(seed, id)), forced()), "One war"); warNote(); openDrawer($("warGo")); }
  function randomWar() { const id = Math.floor(Math.random() * R.film.i), back = reader && reader.back; $("warN").value = fmt(id); reader = { mode: "random", back }; $("drMore").textContent = "Show another random war"; fillWar(id, war(params(), rng(warSeed(seed, id)), forced()), "A random war"); warNote(); if ($("drawer").hidden) openDrawer($("warRand")); }
  function readEnding(k, from, keep) {
    const o = R.outcomes.find(x => x.key === k), s = shown, end = Math.min(s.n, 400000); let i = from || 0, r = null;
    for (; i < end; i++) { const q = war(s.P, rng(warSeed(s.seed, i)), s.H); if (q.outcome === k) { r = q; break; } }
    if (!r && from) { toast("That was the last one, so back to the first"); return readEnding(k, 0, keep); }
    if (!r) { toast("None found in the first " + fmt(end) + " wars of this run"); return; }
    const back = keep ? reader.back : document.activeElement; reader = { mode: "ending", key: k, at: i, back }; $("drMore").textContent = "Another war like this"; fillWar(i, r, o.say); $("warNote").hidden = true; if ($("drawer").hidden) openDrawer(back);
  }

  /* ---------- tabs, links, the back button ---------- */
  const TAB_OF = { sim: "sim", work: "sim", answer: "sim", whatif: "sim", odds: "sim", one: "sim", how: "how", method: "how", outcomes: "how", which: "how", left: "how", faq: "how", sources: "sources", inputs: "sources", decisions: "sources", quotes: "sources", lines: "sources" }, TITLES = { sim: "Simulator", how: "How it works", sources: "Sources" }; let tabNow = "";
  function ink() { const a = document.querySelector(".tabs a.on"), i = $("ink"); if (!a) return; i.style.width = a.offsetWidth + "px"; i.style.transform = "translateX(" + a.offsetLeft + "px)"; }
  function setTab(t) { if (t === tabNow) return false; tabNow = t; document.querySelectorAll(".tabp").forEach(p => { p.hidden = p.dataset.tab !== t; }); document.querySelectorAll(".tabs a").forEach(a => { const on = a.getAttribute("href") === "#" + t; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); document.documentElement.dataset.tab = t; document.title = TITLES[t] + " · " + R.title + " · RealityMargin"; ink(); return true; }
  function route(first) {
    closeDrawer();
    const raw = decodeURIComponent(location.hash.slice(1)), id = TAB_OF[raw] ? raw : "sim", tab = TAB_OF[id], moved = setTab(tab), t = id !== tab ? $(id) : null;
    if (t) { let opened = false; for (let e = t; e; e = e.parentElement) if (e.tagName === "DETAILS" && !e.open) { e.open = true; opened = true; } setTimeout(() => goTo(t), opened && !reduced ? 280 : 30); }
    else if (moved && !first) scrollTo({ top: 0, behavior: "auto" });
  }

  /* ---------- search the sources ---------- */
  function searchSources() {
    const q = $("find").value.trim().toLowerCase(), folds = document.querySelectorAll("#srcFolds details.fold"); let total = 0;
    folds.forEach(f => { const items = f.querySelectorAll("tr[id^='k-'], .in > section, .in li, .in > p"); let n = 0; items.forEach(it => { const m = !q || it.textContent.toLowerCase().includes(q); it.hidden = !m; if (m) n++; }); total += n; f.hidden = !!q && !n; if (q) f.open = n > 0; else f.open = false; const c = f.querySelector("summary small"); if (c) c.textContent = q ? n + (n === 1 ? " match" : " matches") : c.dataset.h; });
    $("findN").textContent = q ? total + (total === 1 ? " match" : " matches") : ""; $("findNone").hidden = !q || total > 0;
  }

  /* ---------- wiring ---------- */
  const runOrStop = () => { if (realJob()) { finish(true); return; } job = null; toResults(); start(); };
  for (const id of ["run", "dockRun", "ansRun"]) $(id).onclick = runOrStop;
  $("heroRun").onclick = () => { if (!realJob()) document.querySelector(".preset").click(); };
  $("reset").onclick = () => { if (!realJob()) reset(); }; $("again").onclick = () => { $("odds").open = true; setTimeout(() => goTo($("odds")), reduced ? 0 : 280); };
  $("col").onchange = () => { over = {}; sliders(); allOdds(); changed(true); };
  $("seed").onchange = () => { const v = readNum($("seed").value); if (isNaN(v) || v < 0 || v > 4294967295) { toast("A seed is a whole number from 0 to 4,294,967,295"); $("seed").value = seed; return; } seed = Math.floor(v); $("seed").value = seed; changed(true); };
  $("nw").oninput = () => { const n = warsFrom($("nw").value); if (n !== null) { wars = n; warsUI(); } };
  $("nw").onchange = () => { const n = warsFrom($("nw").value); if (n === null) { toast("Type a number of wars"); $("nw").value = fmt(wars); return; } setWars(n); };
  $("nw").onkeydown = e => { if (e.key === "Enter" && !realJob()) { const n = warsFrom($("nw").value); if (n !== null) { setWars(n); runOrStop(); } } };
  document.querySelectorAll(".chip[data-n]").forEach(c => c.onclick = () => setWars(+c.dataset.n));
  $("warGo").onclick = oneWar; $("warRand").onclick = () => { reader = reader || {}; randomWar(); }; $("warN").onkeydown = e => { if (e.key === "Enter") oneWar(); };
  $("drClose").onclick = closeDrawer; $("drShade").onclick = closeDrawer; $("drMore").onclick = () => { if (reader && reader.mode === "ending") readEnding(reader.key, reader.at + 1, true); else randomWar(); };
  addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
  $("share").onclick = async () => { const q = new URLSearchParams({ col: $("col").value, seed, n: wars, f: JSON.stringify(fix), o: JSON.stringify(over) }), url = location.href.split("#")[0].split("?")[0] + "?" + q + "#odds"; try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { prompt("Copy this link:", url); } };
  $("oddFind").oninput = () => { const q = $("oddFind").value.trim().toLowerCase(); let n = 0; $("allOdds").querySelectorAll(".odd").forEach(o => { const m = !q || o.dataset.s.includes(q); o.hidden = !m; if (m) n++; }); $("oddN").textContent = q ? n + " of 76" : ""; };
  $("find").oninput = searchSources; document.querySelectorAll("#srcFolds summary small").forEach(c => { c.dataset.h = c.textContent; });
  addEventListener("hashchange", () => route(false)); addEventListener("resize", ink); if (document.fonts && document.fonts.ready) document.fonts.ready.then(ink);
  document.addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href^="#"]'); if (a && a.getAttribute("href") === location.hash) route(false); }); /* a link to where you already are still takes you there */
  document.querySelectorAll('a[href^="http"]').forEach(a => { a.target = "_blank"; a.rel = "noopener"; });

  /* a shared link brings its settings, and says so if it can't */
  let shared = null;
  if (qs.has("col")) {
    try {
      const o = JSON.parse(qs.get("o") || "{}"), f = JSON.parse(qs.get("f") || "{}"); if (!["low", "mid", "high"].includes(qs.get("col")) || !o || !f || typeof o !== "object" || typeof f !== "object" || Array.isArray(o) || Array.isArray(f)) throw 0;
      const clean = {}; for (const k in o) if (k in ODDS && typeof o[k] === "number" && isFinite(o[k]) && o[k] >= 0) clean[k] = Math.min(capFor(k), o[k]);
      const s = readNum(qs.get("seed") || R.seed); $("col").value = qs.get("col"); seed = isNaN(s) || s < 0 || s > 4294967295 ? R.seed : Math.floor(s); $("seed").value = seed; over = clean; fix = f; wars = warsFrom(qs.get("n") || "") || R.film.i; shared = "ok";
      const P = R.presets.find(x => JSON.stringify(x[5]) === JSON.stringify(f) && x[2] === qs.get("col") && x[4] === seed); if (P && !Object.keys(clean).length) { label = P[0]; shared = P[0]; }
    } catch (e) { shared = "bad"; }
  }
  setWars(wars); presets(); sliders(); allOdds(); countChanged(); warNote(); showFilm();
  if (shared === "bad") { $("status").textContent = "That link's settings couldn't be read, so this is the video's run."; }
  else if (shared) { $("status").textContent = "Shared settings loaded. The numbers here are still the video's. Press Run to see them."; $("modeT").textContent = "The video's million, for now"; if (Object.keys(over).length) $("odds").open = true; if (shared !== "ok") [...document.querySelectorAll(".preset")].find(b => b.querySelector(".t").textContent === shared)?.classList.add("on"); }
  route(true);
  requestAnimationFrame(() => document.documentElement.classList.add("ready"));
})();
