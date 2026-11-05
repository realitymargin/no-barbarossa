// RealityMargin sim page: one worker runs a block of wars and sends the counts back. Each war's dice depend only on the seed and its number, so the order of the blocks can't change the answer.
importScripts('model/sim_web.js');
onmessage = e => {
  const { id, P, H, seed, from, to } = e.data, c = {}, who = {}, fallen = {}; let holds = 0;
  for (let i = from; i < to; i++) {
    const r = war(P, rng(warSeed(seed, i)), H);
    c[r.outcome] = (c[r.outcome] || 0) + 1; who[r.who] = (who[r.who] || 0) + 1; if (r.hold) holds++;
    if (r.outcome === O_DEF || r.outcome === O_RED) { const y = Math.floor(r.y); fallen[y] = (fallen[y] || 0) + 1; }
  }
  postMessage({ id, n: to - from, c, who, fallen, holds });
};
