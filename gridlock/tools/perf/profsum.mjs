// Summarise a .cpuprofile: top functions by self and by inclusive time.
import fs from "node:fs";
const file = process.argv[2];
const top = Number(process.argv[3] ?? 40);
const prof = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map();
for (const n of prof.nodes) byId.set(n.id, n);
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
const total = prof.timeDeltas.reduce((a, b) => a + b, 0);
for (let i = 0; i < prof.samples.length; i++) {
  const id = prof.samples[i];
  const dt = prof.timeDeltas[i] ?? 0;
  self.set(id, (self.get(id) ?? 0) + dt);
}
const name = (n) => {
  const cf = n.callFrame;
  const f = (cf.url || "").split("/").slice(-2).join("/");
  return `${cf.functionName || "(anon)"} ${f}:${cf.lineNumber + 1}`;
};
const selfByName = new Map();
const inclByName = new Map();
for (const [id, t] of self) {
  const seen = new Set();
  let cur = id;
  const nm = name(byId.get(id));
  selfByName.set(nm, (selfByName.get(nm) ?? 0) + t);
  while (cur != null) {
    const n = byId.get(cur);
    const k = name(n);
    if (!seen.has(k)) {
      seen.add(k);
      inclByName.set(k, (inclByName.get(k) ?? 0) + t);
    }
    cur = parent.get(cur);
  }
}
const pct = (t) => ((100 * t) / total).toFixed(1).padStart(5);
console.log(`total ${(total / 1000).toFixed(0)} ms\n--- self ---`);
for (const [k, t] of [...selfByName].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(t), k);
console.log("--- inclusive ---");
for (const [k, t] of [...inclByName].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(t), k);
