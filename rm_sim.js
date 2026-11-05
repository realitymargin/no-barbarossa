// RealityMargin sim page engine, reused by every sim film. Needs the film's model (war, rng, warSeed, oddsFor, ODDS, and the outcome names) and window.RM from the film's builder.
// Runs war() in slices so the page stays responsive. The page opens on the film's real million, written in by the builder and checked against a live run by the page test.
(() => {
  const $ = id => document.getElementById(id), R = window.RM, fmt = n => n.toLocaleString("en-US"), pc = (a, n) => (100 * a / Math.max(1, n)).toFixed(2) + "%";
  let over = {}, fix = {}, stop = false, running = false, label = "";
  const base = () => oddsFor($("col").value), show = (kind, v) => kind === "%" ? (100 * v).toFixed(v < 0.1 ? 1 : 0) + "%" : String(+v.toFixed(3));

  /* any change by hand: the panel stops claiming it's a named run, and a forced what-if is let go */
  function changed() { label = ""; fix = {}; document.querySelectorAll(".preset").forEach(p => p.classList.remove("on")); if (!running) $("status").textContent = "Changed. Press Run with these odds."; oneWarNote(); }
  function sliders() {
    const b = base(), el = $("sliders"); el.innerHTML = "";
    for (const [k, txt, top, kind] of R.sliders) {
      const v0 = over[k] ?? b[k], w = document.createElement("div"); w.className = "slider";
      w.innerHTML = '<label><span>' + txt + '</span><span class="val">' + show(kind, v0) + '</span></label><input type="range" min="0" max="1000" value="' + Math.round(1000 * v0 / top) + '" aria-label="' + txt.replace(/"/g, "") + '"><small>Against Germany ' + show(kind, ODDS[k][0]) + " · middle " + show(kind, ODDS[k][1]) + " · for Germany " + show(kind, ODDS[k][2]) + "</small>";
      const r = w.querySelector("input");
      r.oninput = () => { over[k] = r.value / 1000 * top; w.querySelector(".val").textContent = show(kind, over[k]); changed(); };
      el.appendChild(w);
    }
  }
  function presets() {
    const el = $("presets"); el.innerHTML = "";
    for (const [t, d, col, n, seed, f] of R.presets) {
      const b = document.createElement("button"); b.className = "preset"; b.innerHTML = '<span class="t">' + t + '</span><span class="d">' + d + "</span>";
      b.onclick = () => { if (running) return; document.querySelectorAll(".preset").forEach(p => p.classList.remove("on")); b.classList.add("on"); over = {}; fix = { ...f }; $("col").value = col; $("nw").value = n; $("seed").value = seed; sliders(); oneWarNote(); $("answer").scrollIntoView(); run(t); };
      el.appendChild(b);
    }
  }
  function draw(c, who, fallen, holds, i) {
    const beaten = (c[O_DEF] || 0) + (c[O_RED] || 0);
    $("vBeaten").textContent = pc(beaten, i); $("vHolds").textContent = pc(holds, i);
    $("stack").innerHTML = R.outcomes.map(o => '<i style="width:' + (100 * (c[o.key] || 0) / Math.max(1, i)) + "%;background:" + o.col + '" title="' + o.say + '"></i>').join("");
    $("rows").innerHTML = '<span></span><span></span><span class="h hn">Wars</span><span class="h">Share</span><span class="h">The video</span>' + R.outcomes.map(o => '<span class="sw" style="background:' + o.col + '"></span><span>' + o.say + '</span><span class="n">' + fmt(c[o.key] || 0) + '</span><span class="p">' + pc(c[o.key] || 0, i) + '</span><span class="r">' + pc(R.film.c[o.key] || 0, R.film.i) + "</span>").join("");
    $("who").innerHTML = R.who.filter(w => !w[3] || who[w[0]]).map(([k, t, col]) => "<span>" + t + '</span><span class="tr"><i style="width:' + (100 * (who[k] || 0) / Math.max(1, i)) + "%;background:" + col + '"></i></span><span class="p">' + pc(who[k] || 0, i) + "</span>").join("");
    $("curve").innerHTML = R.years.map(y => { const gone = Object.keys(fallen).filter(q => +q <= y).reduce((s, q) => s + fallen[q], 0), left = 100 * (i - gone) / Math.max(1, i); return "<span>End of " + y + '</span><span class="tr"><i style="width:' + left + '%;background:#3273e0"></i></span><span class="p">' + left.toFixed(0) + "%</span>"; }).join("");
  }
  function run(lab) {
    if (running) return; running = true; label = lab || label;
    try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: "run/" + String(label || "own settings").toLowerCase().replace(/[^a-z0-9]+/g, "-"), title: "RUN: " + (label || "own settings"), event: true }); } catch (e) { }   /* counts which button was pressed, never the odds */
    stop = false; $("run").disabled = true; $("heroRun").disabled = true; $("reset").disabled = true; $("stop").disabled = false; $("stop2").hidden = false;
    const n = +$("nw").value, seed = (+$("seed").value) >>> 0, P = { ...base(), ...over }, c = {}, who = {}, fallen = {}, H = Object.keys(fix).length ? fix : undefined; let i = 0, holds = 0; window.NBLAST = null;
    $("modeT").textContent = label || "Your odds"; $("modeS").textContent = fmt(n) + " wars, seed " + seed; $("status").textContent = "Running. The numbers settle as it counts.";
    const step = () => {
      const t0 = performance.now();
      while (i < n && performance.now() - t0 < 80) { const r = war(P, rng(warSeed(seed, i)), H); c[r.outcome] = (c[r.outcome] || 0) + 1; who[r.who] = (who[r.who] || 0) + 1; if (r.hold) holds++; if (r.outcome === O_DEF || r.outcome === O_RED) { const y = Math.floor(r.y); fallen[y] = (fallen[y] || 0) + 1; } i++; }
      $("count").textContent = fmt(i) + " / " + fmt(n) + " wars"; $("bar").style.width = (100 * i / n) + "%"; draw(c, who, fallen, holds, i);
      if (i < n && !stop) setTimeout(step, 0);
      else { running = false; $("run").disabled = false; $("heroRun").disabled = false; $("reset").disabled = false; $("stop").disabled = true; $("stop2").hidden = true; window.NBLAST = { i, c, who, fallen, holds }; $("status").textContent = stop ? "Stopped." : "Done. Same odds, same seed and same number of wars give the same answer on any computer. It isn't a forecast."; }
    };
    step();
  }
  const reset = () => { over = {}; fix = {}; label = ""; $("col").value = "mid"; $("nw").value = R.film.i; $("seed").value = R.seed; document.querySelectorAll(".preset").forEach(p => p.classList.remove("on")); sliders(); showFilm(); };
  const when = y => y >= 1950 ? "still so in 1950" : (y % 1 ? "second half of " : "first half of ") + Math.floor(y);
  function oneWarNote() { const ours = !Object.keys(fix).length && !Object.keys(over).length && $("col").value === "mid" && +$("seed").value === R.seed; $("warNote").textContent = ours ? "" : "These aren't the video's settings, so this number is a different war. Press Back to the video's odds to see the video's war."; }
  function oneWar() { const id = (+$("warN").value.replace(/\D/g, "")) | 0, r = war({ ...base(), ...over }, rng(warSeed((+$("seed").value) >>> 0, id)), Object.keys(fix).length ? fix : undefined), o = R.outcomes.find(x => x.key === r.outcome); oneWarNote(); $("warHead").textContent = "War " + fmt(id) + ": " + (o ? o.war : r.outcome) + ", " + when(r.y) + ": " + r.why + "."; $("warPath").innerHTML = r.path.map(e => "<li>" + e.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>").join(""); window.NBWAR = r; }
  function showFilm() { oneWarNote(); const f = R.film; $("modeT").textContent = "The video's million"; $("modeS").textContent = fmt(f.i) + " wars, seed " + R.seed + ", every odd in the middle"; $("count").textContent = fmt(f.i) + " / " + fmt(f.i) + " wars"; $("bar").style.width = "100%"; $("status").textContent = "Press Run the war to watch it happen, or try a what-if below."; draw(f.c, f.who, f.fallen, f.holds, f.i); }
  /* a link to a part of the page opens the part it points at */
  function openHash() { const id = decodeURIComponent(location.hash.slice(1)); if (!id) return; const t = document.getElementById(id); if (!t) return; for (let e = t; e; e = e.parentElement) if (e.tagName === "DETAILS") e.open = true; t.scrollIntoView(); }

  $("run").onclick = () => run(); $("stop").onclick = () => { stop = true; }; $("stop2").onclick = () => { stop = true; }; $("reset").onclick = reset; $("col").onchange = () => { over = {}; sliders(); changed(); }; $("nw").onchange = changed; $("seed").onchange = changed; $("warGo").onclick = oneWar;
  $("heroRun").onclick = () => document.querySelector(".preset").click();
  $("share").onclick = () => { const q = new URLSearchParams({ col: $("col").value, seed: $("seed").value, n: $("nw").value, f: JSON.stringify(fix), o: JSON.stringify(over) }), url = location.href.split("#")[0].split("?")[0] + "?" + q + "#odds"; if (navigator.clipboard) navigator.clipboard.writeText(url); const t = $("toast"); t.textContent = "Link copied"; t.className = "on"; setTimeout(() => t.className = "", 1600); };
  { const q = new URLSearchParams(location.search); if (q.get("col") && ["low", "mid", "high"].includes(q.get("col"))) { $("col").value = q.get("col"); $("seed").value = q.get("seed") || R.seed; $("nw").value = q.get("n") || R.film.i; try { fix = JSON.parse(q.get("f") || "{}"); over = JSON.parse(q.get("o") || "{}"); } catch (e) { } } }
  window.addEventListener("hashchange", openHash);
  presets(); sliders(); oneWar(); showFilm(); if (location.search.includes("col=")) { $("status").textContent = "Shared odds loaded. Press Run with these odds, under Change the odds yourself."; document.getElementById("odds").open = true; } openHash();
})();
