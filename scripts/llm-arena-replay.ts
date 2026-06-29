/**
 * Generate a standalone HTML replay viewer from an llm-arena log directory.
 *
 *   npx tsx scripts/llm-arena-replay.ts scripts/llm-arena-logs/<stamp>
 *
 * Emits <logdir>/replay.html with the frame + feed data inlined, playable
 * from file:// with no server.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, "replay.jsonl"))) {
  console.error("usage: npx tsx scripts/llm-arena-replay.ts <log-dir-with-replay.jsonl>");
  process.exit(1);
}

const readJsonl = (p: string): unknown[] =>
  fs.existsSync(p)
    ? fs
        .readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];

const frames = readJsonl(path.join(dir, "replay.jsonl"));
const feed = readJsonl(path.join(dir, "feed.jsonl"));
const summary = fs.existsSync(path.join(dir, "summary.json"))
  ? (JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")) as unknown)
  : null;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LLM Tank Arena — Replay</title>
<style>
  body { margin:0; background:#0b0e13; color:#cfd8e3; font:13px/1.4 ui-monospace,Menlo,monospace; display:flex; flex-direction:column; align-items:center; }
  #wrap { display:flex; gap:14px; padding:14px; align-items:flex-start; }
  canvas { background:#11161f; border:1px solid #2a3344; border-radius:6px; }
  #side { width:330px; display:flex; flex-direction:column; gap:10px; }
  .card { background:#141a25; border:1px solid #2a3344; border-radius:6px; padding:10px; }
  .pilot { display:flex; justify-content:space-between; margin:3px 0; }
  #feed { height:300px; overflow-y:auto; font-size:12px; }
  #feed div { margin:2px 0; opacity:.9; }
  #controls { display:flex; gap:8px; align-items:center; padding:0 14px 14px; width:100%; box-sizing:border-box; max-width:1100px; }
  button { background:#1d2738; color:#cfd8e3; border:1px solid #36425a; border-radius:4px; padding:4px 12px; cursor:pointer; }
  input[type=range] { flex:1; }
  h3 { margin:0 0 6px; font-size:13px; color:#8fa3c0; text-transform:uppercase; letter-spacing:1px; }
</style>
</head>
<body>
<div id="wrap">
  <canvas id="cv" width="720" height="720"></canvas>
  <div id="side">
    <div class="card"><h3>Scoreboard</h3><div id="score"></div></div>
    <div class="card"><h3>Kill feed / comms</h3><div id="feed"></div></div>
  </div>
</div>
<div id="controls">
  <button id="play">▶ Play</button>
  <span id="time">t=0</span>
  <input type="range" id="scrub" min="0" max="0" value="0">
  <select id="speed"><option value="1">1x</option><option value="2" selected>2x</option><option value="4">4x</option><option value="8">8x</option></select>
</div>
<script>
const FRAMES = ${JSON.stringify(frames)};
const FEED = ${JSON.stringify(feed)};
const SUMMARY = ${JSON.stringify(summary)};
const MAP = 3547, TICK_MS = 50;
const TEAMS = { "t-coder":"#ff5d5d", "t-heretic":"#5da9ff", "t-granite":"#ffae42", "t-glmair":"#c08cff" };
const NAMES = { "t-coder":"GLM-Coder", "t-heretic":"Heretic-35B", "t-granite":"Granite-2B", "t-glmair":"GLM-Air" };
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const scrub = document.getElementById("scrub"); scrub.max = FRAMES.length - 1;
let idx = 0, playing = false, lastWall = 0;
const sc = v => v * cv.width / MAP;

function draw() {
  const f = FRAMES[idx]; if (!f) return;
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.strokeStyle = "#1d2536"; ctx.lineWidth = 1;
  for (let g = 0; g < MAP; g += 500) { ctx.beginPath(); ctx.moveTo(sc(g),0); ctx.lineTo(sc(g),cv.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,sc(g)); ctx.lineTo(cv.width,sc(g)); ctx.stroke(); }
  for (const pk of f.pickups) {
    ctx.fillStyle = pk.type === "FUEL_CRATE" ? "#3fd68b" : "#8fa3c0";
    ctx.beginPath(); ctx.arc(sc(pk.x), sc(pk.y), 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#5a6b85"; ctx.font = "8px monospace";
    ctx.fillText(pk.type[0], sc(pk.x)+4, sc(pk.y)-3);
  }
  for (const m of f.mines) { ctx.strokeStyle = "#ff4d4d"; ctx.lineWidth = 1.5;
    const x = sc(m.x), y = sc(m.y);
    ctx.beginPath(); ctx.moveTo(x-4,y-4); ctx.lineTo(x+4,y+4); ctx.moveTo(x+4,y-4); ctx.lineTo(x-4,y+4); ctx.stroke(); }
  for (const p of f.projectiles) {
    ctx.fillStyle = p.kind === "MISSILE" ? "#ffd24d" : "#e8eef7";
    ctx.beginPath(); ctx.arc(sc(p.x), sc(p.y), p.kind === "MISSILE" ? 3 : 1.8, 0, 7); ctx.fill();
  }
  for (const t of f.tanks) {
    const x = sc(t.x), y = sc(t.y), col = TEAMS[t.id] || "#fff";
    ctx.globalAlpha = t.dead ? 0.25 : 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    if (t.shield && !t.dead) { ctx.strokeStyle = "#6ee7ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke(); }
    ctx.fillStyle = "#0b0e13"; ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
    ctx.fillText(String(t.kills), x, y + 3); ctx.textAlign = "left";
    ctx.fillStyle = col; ctx.font = "10px monospace";
    ctx.fillText(NAMES[t.id] + (t.dead ? " ✝" : ""), x + 10, y - 6);
    ctx.fillStyle = "#222b3d"; ctx.fillRect(x - 12, y + 10, 24, 3);
    ctx.fillStyle = t.fuel > 300 ? "#3fd68b" : "#ff5d5d"; ctx.fillRect(x - 12, y + 10, 24 * Math.max(0, t.fuel) / 1000, 3);
    ctx.globalAlpha = 1;
  }
  document.getElementById("time").textContent = "t=" + f.tick + " (" + (f.tick * TICK_MS / 1000).toFixed(1) + "s)";
  scrub.value = idx;
  const sb = document.getElementById("score");
  sb.innerHTML = f.tanks.map(t =>
    '<div class="pilot"><span style="color:' + (TEAMS[t.id]||'#fff') + '">' + NAMES[t.id] + '</span>' +
    '<span>' + t.kills + ' kills · fuel ' + t.fuel + (t.dead ? ' · DEAD' : '') + '</span></div>').join("");
  const fd = document.getElementById("feed");
  const visible = FEED.filter(e => e.tick <= f.tick && (e.kind === "kill" || e.kind === "say" || e.kind === "death" || e.kind === "tier" || e.kind === "mine"));
  fd.innerHTML = visible.slice(-40).map(e => "<div>[" + (e.tick * TICK_MS / 1000).toFixed(0) + "s] " + e.line.replace(/</g,"&lt;") + "</div>").join("");
  fd.scrollTop = fd.scrollHeight;
}
function loop(ts) {
  if (playing) {
    const speed = Number(document.getElementById("speed").value);
    if (ts - lastWall > 250 / speed / 2) { idx = Math.min(FRAMES.length - 1, idx + 1); lastWall = ts; draw();
      if (idx >= FRAMES.length - 1) { playing = false; document.getElementById("play").textContent = "▶ Play"; } }
  }
  requestAnimationFrame(loop);
}
document.getElementById("play").onclick = () => {
  if (idx >= FRAMES.length - 1) idx = 0;
  playing = !playing;
  document.getElementById("play").textContent = playing ? "⏸ Pause" : "▶ Play";
};
scrub.oninput = () => { idx = Number(scrub.value); draw(); };
draw(); requestAnimationFrame(loop);
</script>
</body>
</html>`;

const out = path.join(dir, "replay.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${frames.length} frames, ${feed.length} feed events)`);
