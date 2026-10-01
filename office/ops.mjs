// Jarvis Office · Ops: the numbers behind the office, all read locally.
// - Cost and tokens: Claude Code's own "cost-state" records in each session file (API-equivalent USD;
//   on a Claude subscription you aren't billed per token, it shows what the work would cost on the API).
// - Plan usage (5-hour / 7-day %): samples the Claude desktop app records, when it's installed.
// - Vault, routines, activity, system: files and commands on this Mac. Nothing leaves it.
import fs from "node:fs";
import { safeFile } from "./security.mjs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 3000 }); } catch { return ""; } };

// ---------- cost & tokens ----------
// Tokens come from every reply's usage (exact, per day). Dollars: Anthropic prices output at 5x input,
// cache reads at 0.1x, cache writes at 1.25x (5 min) or 2x (1 h). The input rate per model is calibrated
// from Claude Code's own cost totals (cost-state records); defaults are used until one exists.
const DEFAULT_RATE = { opus: 5, sonnet: 3, haiku: 1, fable: 5 };      // $ per million input tokens
const family = (m) => (m.match(/opus|sonnet|haiku|fable/) || ["sonnet"])[0];

function replies(entries, out) {
  const seen = new Map();
  for (const e of entries) {
    const u = e.type === "assistant" && e.message?.usage;
    if (!u || !e.message.id) continue;
    seen.set(e.message.id, { ts: Date.parse(e.timestamp || 0), model: e.message.model || "", u });
  }
  for (const r of seen.values()) out.push(r);
}

function calibrate(sessions) {
  const acc = {};
  for (const s of sessions) {
    const last = [...s.entries].reverse().find((e) => e.type === "cost-state");
    for (const [model, u] of Object.entries(last?.modelUsage || {})) {
      const w = (u.inputTokens || 0) + 5 * (u.outputTokens || 0) + 0.1 * (u.cacheReadInputTokens || 0) + 2 * (u.cacheCreationInputTokens || 0);
      if (w > 0 && u.costUSD > 0) { const a = acc[model] ||= { cost: 0, w: 0 }; a.cost += u.costUSD; a.w += w; }
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([m, a]) => [m, a.cost / a.w]));
}

function priced(r, rates) {
  const u = r.u, cc = u.cache_creation || {};
  const w5 = cc.ephemeral_5m_input_tokens ?? 0, w1 = cc.ephemeral_1h_input_tokens ?? (u.cache_creation_input_tokens || 0) - w5;
  const rate = rates[r.model] ?? DEFAULT_RATE[family(r.model)] / 1e6;
  const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const cost = rate * ((u.input_tokens || 0) + 5 * (u.output_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0) + 1.25 * w5 + 2 * w1);
  return { tokens, cost, out: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0,
           input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) };
}

function contextOf(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const u = e.type === "assistant" && e.message?.usage;
    if (u) {
      const used = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const model = e.message.model || "";
      const size = /opus-5|sonnet-5|fable/.test(model) ? 1_000_000 : 200_000;
      return { used, size, model };
    }
  }
  return null;
}

function planUsage() {
  try {
    const f = path.join(os.homedir(), "Library", "Application Support", "Claude", "plan-usage-history.json");
    const samples = JSON.parse(fs.readFileSync(f, "utf8")).samples || [];
    const s = samples[samples.length - 1];
    return s ? { fiveHour: s.u?.fh ?? null, week: s.u?.sd ?? null, at: s.t } : null;
  } catch { return null; }
}

// ---------- activity ----------
function activity(sessions, agents, todayStart) {
  const tools = {}, feed = [];
  let toolCalls = 0, messages = 0;
  const scan = (entries, who) => {
    for (const e of entries) {
      const ts = e.timestamp ? Date.parse(e.timestamp) : 0;
      if (ts < todayStart) continue;
      const c = e.message?.content;
      if (e.type === "user" && typeof c === "string" && !c.startsWith("<")) { messages++; if (who === "Jarvis") feed.push({ ts, who: "You", text: c.slice(0, 90), kind: "you" }); }
      if (e.type === "assistant" && Array.isArray(c)) for (const b of c) if (b.type === "tool_use") {
        toolCalls++;
        const name = String(b.name).replace(/^mcp__(plugin_jarvis_)?jarvis__/, "jarvis·").replace(/^mcp__/, "");
        tools[name] = (tools[name] || 0) + 1;
        feed.push({ ts, who, text: name, kind: "tool" });
      }
    }
  };
  for (const s of sessions) scan(s.entries, "Jarvis");
  const runs = {};
  for (const a of agents) {
    scan(a.entries, a.type);
    const first = a.entries.find((e) => e.timestamp);
    if (first && Date.parse(first.timestamp) >= todayStart) {
      runs[a.type] = (runs[a.type] || 0) + 1;
      feed.push({ ts: Date.parse(first.timestamp), who: a.type, text: a.description || "started", kind: "agent" });
    }
  }
  const top = Object.entries(tools).sort((x, y) => y[1] - x[1]).slice(0, 6);
  return { toolCalls, messages, top, runs, feed };
}

// ---------- vault ----------
function vaultStats(vault) {
  if (!vault) return null;
  let pages = 0;
  const walk = (dir, rel = "") => {
    let list = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      if (d.name.startsWith(".") || ["_templates", "raw", "inbox"].includes(d.name) && !rel || d.name === "node_modules") continue;
      if (d.isDirectory() && d.name === "dev" && fs.existsSync(path.join(dir, "SPACE.md"))) continue;   // a client's code, not knowledge
      if (d.isDirectory()) walk(path.join(dir, d.name), rel + d.name + "/");
      else if (d.isFile() && d.name.endsWith(".md")) pages++;
    }
  };
  walk(vault);
  const count = (p) => { try { return fs.readdirSync(path.join(vault, p)).filter((f) => f.endsWith(".md")).length; } catch { return 0; } };
  let clients = 0;
  try { for (const w of fs.readdirSync(path.join(vault, "work"))) { try { clients += fs.readdirSync(path.join(vault, "work", w, "clients")).filter((f) => !f.startsWith(".")).length; } catch { /* none */ } } } catch { /* none */ }
  let log = [];
  try {
    log = fs.readFileSync(safeFile(vault, "log.md", [".md", ".json"]), "utf8").split("\n").filter((l) => l.startsWith("## ["))
      .map((l) => { const m = l.match(/^## \[(\d{4}-\d{2}-\d{2})\]\s*(\w+)\s*\|\s*(.*)$/); return m ? { date: m[1], kind: m[2], text: m[3] } : null; }).filter(Boolean);
  } catch { /* none */ }
  const weekAgo = dayKey(Date.now() - 7 * 864e5);
  let proposals = 0;
  try { proposals = (fs.readFileSync(safeFile(vault, "me/_proposals.md", [".md", ".json"]), "utf8").match(/^- \[ \]/gm) || []).length; } catch { /* none */ }
  let onboarding = null;
  try { const o = JSON.parse(fs.readFileSync(safeFile(vault, "me/onboarding.json", [".md", ".json"]), "utf8")); onboarding = { status: o.status, step: o.current_step, pending: (o.pending || []).length, connections: o.connections || {} }; } catch { /* none */ }
  let nowUpdated = null;
  try { nowUpdated = (fs.readFileSync(safeFile(vault, "now.md", [".md", ".json"]), "utf8").match(/Updated:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null; } catch { /* none */ }
  return { pages, people: count("relationships/people"), clients, changesThisWeek: log.filter((l) => l.date >= weekAgo).length,
           recent: log.slice(-6).reverse(), proposals, onboarding, nowUpdated };
}

// ---------- routines ----------
function routines(vault, root) {
  const list = [];
  try {
    const text = fs.readFileSync(safeFile(vault, "me/routines.md", [".md", ".json"]), "utf8");
    for (const m of text.matchAll(/^##\s+([^:\n]+):\s*(on|off)\b([^\n]*)$/gim)) {
      list.push({ name: m[1].trim(), on: m[2].toLowerCase() === "on", when: m[3].replace(/^[,\s]+/, "").trim() });
    }
  } catch { /* none yet */ }
  const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  let launchd = [];
  try {
    launchd = fs.readdirSync(agentsDir).filter((f) => /^ai\.jarvis\..*\.plist$/.test(f) && f !== "ai.jarvis.capslock.plist").map((f) => {
      const job = f.replace(/^ai\.jarvis\.|\.plist$/g, "");
      // Each run records how it went in <logs>/<job>.last.json (the Jarvis folder's .jarvis/logs, or ~/.jarvis/logs).
      let lastRun = null, ok = null;
      for (const dir of [path.join(root || "", ".jarvis", "logs"), path.join(os.homedir(), ".jarvis", "logs")]) {
        try { const r = JSON.parse(fs.readFileSync(path.join(dir, `${job}.last.json`), "utf8")); lastRun = r.finished * 1000; ok = r.exit === 0; break; } catch { /* next */ }
      }
      return { job, lastRun, ok };
    });
  } catch { /* none */ }
  return { list, launchd };
}

// ---------- system & services ----------
let sysCache = { at: 0 };
function system() {
  if (Date.now() - sysCache.at < 5000) return sysCache.data;
  const cpu = Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100));
  let mem = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  const vm = sh("vm_stat", []);
  if (vm) {
    const pg = (k) => Number((vm.match(new RegExp(`${k}:\\s+(\\d+)`)) || [])[1] || 0);
    const size = Number((vm.match(/page size of (\d+)/) || [])[1] || 16384);
    const used = (pg("Pages active") + pg("Pages wired down") + pg("Pages occupied by compressor")) * size;
    mem = Math.round((used / os.totalmem()) * 100);
  }
  const df = sh("df", ["-k", os.homedir()]).split("\n")[1]?.split(/\s+/) || [];
  const disk = df[4] ? Number(df[4].replace("%", "")) : null;
  const running = (pattern) => sh("pgrep", ["-f", pattern]).trim().length > 0;
  const data = { cpu, mem, disk, cores: os.cpus().length,
    services: { voice: running("jarvis_voice|jarvis-voice"), hermes: running("hermes.*gateway"), codex: !!sh("/bin/sh", ["-c", "command -v codex"]).trim() } };
  sysCache = { at: Date.now(), data };
  return data;
}

export function ops({ sessions, agents, vault, root }) {
  const now = Date.now(), todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const rates = calibrate(sessions), all = [], byDay = {}, byModel = {};
  for (const s of sessions) replies(s.entries, all);
  for (const a of agents) replies(a.entries, all);
  for (const r of all) {
    const p = priced(r, rates), d = byDay[dayKey(r.ts)] ||= { cost: 0, tokens: 0, replies: 0 };
    d.cost += p.cost; d.tokens += p.tokens; d.replies++;
    if (r.ts >= now - 7 * 864e5) {
      const m = byModel[r.model] ||= { cost: 0, tokens: 0, output: 0, cacheRead: 0, input: 0 };
      m.cost += p.cost; m.tokens += p.tokens; m.output += p.out; m.cacheRead += p.cacheRead; m.input += p.input;
    }
  }
  const days = [];
  for (let i = 13; i >= 0; i--) { const k = dayKey(now - i * 864e5); days.push({ day: k, ...(byDay[k] || { cost: 0, tokens: 0, replies: 0 }) }); }
  const sum = (arr, k) => arr.reduce((a, d) => a + d[k], 0);
  const last7 = days.slice(-7);
  const models = Object.entries(byModel).map(([model, m]) => ({ model, ...m })).sort((a, b) => b.cost - a.cost);
  const cacheRead = sum(models, "cacheRead"), inputish = sum(models, "input");
  const main = sessions.slice().sort((a, b) => b.mtime - a.mtime)[0];
  return {
    cost: { today: days[days.length - 1].cost, week: sum(last7, "cost"), tokensToday: days[days.length - 1].tokens,
            tokensWeek: sum(last7, "tokens"), repliesToday: days[days.length - 1].replies, days, models,
            calibrated: Object.keys(rates).length > 0,
            cacheHit: cacheRead + inputish ? cacheRead / (cacheRead + inputish) : null },
    context: main ? contextOf(main.entries) : null,
    plan: planUsage(),
    activity: activity(sessions.filter((s) => s.mtime >= todayStart), agents, todayStart),
    vault: vaultStats(vault),
    routines: vault ? routines(vault, root) : { list: [], launchd: [] },
    system: system(),
    mcp: (() => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")).mcpServers || {}); } catch { return []; } })(),
    at: now,
  };
}
