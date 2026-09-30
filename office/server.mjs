#!/usr/bin/env node
// Jarvis Office: a local dashboard for the Claude Code session running in a Jarvis folder.
//
//   node office/server.mjs --root ~/Jarvis [--tmux jarvis] [--port 3777]
//
// - Reads the session's own transcript files (~/.claude/projects/<folder>/…) to show the main chat and
//   every sub-agent live. Nothing is sent anywhere; it binds to 127.0.0.1 only.
// - Typing: text from the dashboard is typed into the tmux session that runs Claude, so the terminal
//   and the dashboard drive the very same session.
// - Approvals: office/permission-hook.mjs (a Claude Code PermissionRequest hook) asks this server;
//   the dashboard shows Allow / Deny. With no dashboard open, the hook steps aside and the terminal asks.
// Standard library only.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ops } from "./ops.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) =>
  a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc, []));
const ROOT = path.resolve((args.root || process.cwd()).replace(/^~(?=$|\/)/, os.homedir()));
const PORT = Number(args.port || 3777);
const TMUX_SESSION = args.tmux || "jarvis";
const STATE_DIR = path.join(os.homedir(), ".jarvis-office");
const PROJECT_DIR = path.join(os.homedir(), ".claude", "projects", ROOT.replace(/[^a-zA-Z0-9]/g, "-"));
const VAULT = fs.existsSync(path.join(ROOT, "knowledge")) ? path.join(ROOT, "knowledge") : null;
const DESKS = ["librarian", "researcher", "critic", "creative"];
const TMUX = ["/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux"].find((p) => fs.existsSync(p)) || "tmux";

// Tokens: HOOK_TOKEN for the approval hook (file, 0600); UI_TOKEN embedded in the page we serve, so other
// websites can't post to this server.
fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
const HOOK_TOKEN = crypto.randomBytes(24).toString("hex");
const UI_TOKEN = crypto.randomBytes(24).toString("hex");
fs.writeFileSync(path.join(STATE_DIR, "hook-token"), HOOK_TOKEN, { mode: 0o600 });
fs.writeFileSync(path.join(STATE_DIR, "port"), String(PORT), { mode: 0o600 });

// ---------- transcripts ----------
const cache = new Map();                       // file -> { size, mtime, entries }

function readJsonl(file) {
  let st;
  try { st = fs.statSync(file); } catch { return { entries: [], mtime: 0 }; }
  const hit = cache.get(file);
  if (hit && hit.size === st.size) return hit;
  let entries = hit && st.size > hit.size ? hit.entries : [];
  const start = hit && st.size > hit.size ? hit.size : 0;
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(st.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const text = (hit?.tail || "") + buf.toString("utf8");
  const lines = text.split("\n");
  const tail = lines.pop();                    // possibly incomplete last line
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  const rec = { size: st.size, mtime: st.mtimeMs, entries, tail };
  cache.set(file, rec);
  return rec;
}

const clip = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function toolSummary(name, input = {}) {
  const v = input.command || input.file_path || input.path || input.pattern || input.query || input.url ||
    input.description || input.prompt || input.skill || "";
  // mcp__claude_ai_Gmail__send_message → "Gmail · send message"; mcp__jarvis__jarvis_write → "jarvis · write"
  const short = String(name).replace(/^mcp__(plugin_jarvis_)?jarvis__jarvis_/, "jarvis · ").replace(/^mcp__(claude_ai_)?/, "")
    .replace(/__/g, " · ").replace(/_/g, " ");
  return { name: short, detail: clip(String(v).replace(/\s+/g, " "), 140) };
}

function messages(entries, limit = 150) {
  const out = [];
  for (const e of entries) {
    if (e.isMeta || !e.message) continue;
    const c = e.message.content;
    if (e.type === "user") {
      if (typeof c === "string" && c.includes("<task-notification>")) {
        const summary = (c.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "A background task finished";
        out.push({ role: "tool", name: "↩", detail: clip(summary, 140), ts: e.timestamp });
        continue;
      }
      if (typeof c === "string") {
        if (c.startsWith("<command-") || c.startsWith("<local-command") || c.includes("<system-reminder>")) continue;
        out.push({ role: "user", text: c, ts: e.timestamp });
      } else if (Array.isArray(c)) {
        const text = c.filter((b) => b.type === "text" && !String(b.text).includes("<system-reminder>")).map((b) => b.text).join("\n");
        if (text.trim()) out.push({ role: "user", text, ts: e.timestamp });
      }
    } else if (e.type === "assistant" && Array.isArray(c)) {
      for (const b of c) {
        if (b.type === "text" && b.text.trim()) out.push({ role: "assistant", text: b.text, ts: e.timestamp });
        else if (b.type === "tool_use") out.push({ role: "tool", ...toolSummary(b.name, b.input), ts: e.timestamp });
      }
    }
  }
  return out.slice(-limit);
}

function activity(rec, msgs) {
  const age = Date.now() - rec.mtime;
  const last = msgs[msgs.length - 1];
  const lastEntry = [...rec.entries].reverse().find((e) => e.type === "assistant" || e.type === "user");
  const finished = lastEntry?.type === "assistant" && lastEntry.message?.stop_reason === "end_turn";
  if (age < 20000 && !finished) {
    return { state: "working", doing: last?.role === "tool" ? `${last.name} ${last.detail}` : "thinking…" };
  }
  // Finished its turn: the main session is waiting for you; a sub-agent is done.
  return { state: finished || age > 20000 ? "waiting" : "working", doing: "" };
}

// The kanban board on the office wall: Claude Code's own task lists (TaskCreate / TaskUpdate / TodoWrite)
// from the main session, plus sub-agent runs, plus the open loops in now.md as things to do.
function board(entries, agents, nowText) {
  const tasks = new Map(); let nextId = 1, todo = null;
  for (const e of entries) {
    const c = e.message?.content;
    if (e.type !== "assistant" || !Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type !== "tool_use") continue;
      const i = b.input || {};
      if (b.name === "TaskCreate") tasks.set(String(nextId++), { title: i.subject || i.description || "Task", status: "pending" });
      else if (b.name === "TaskUpdate" && tasks.has(String(i.taskId))) {
        const t = tasks.get(String(i.taskId));
        if (i.status === "deleted") tasks.delete(String(i.taskId)); else { if (i.status) t.status = i.status; if (i.subject) t.title = i.subject; }
      } else if (b.name === "TodoWrite" && Array.isArray(i.todos)) todo = i.todos;
    }
  }
  const items = [...tasks.values(), ...(todo || []).map((t) => ({ title: t.content || t.activeForm || "Task", status: t.status }))];
  const col = { todo: [], doing: [], done: [] };
  for (const t of items) col[t.status === "completed" ? "done" : t.status === "in_progress" ? "doing" : "todo"].push({ title: t.title, kind: "task" });
  for (const a of agents) {
    if (a.state === "working") col.doing.push({ title: a.description || a.type, kind: a.type });
    else if (Date.now() - a.updated < 12 * 3600e3) col.done.push({ title: a.description || a.type, kind: a.type });
  }
  const loops = (nowText.match(/## Open loops[^\n]*\n([\s\S]*?)(\n## |$)/) || [])[1] || "";
  for (const l of loops.split("\n")) { const t = l.replace(/^\s*[-*]\s*(\[ \]\s*)?/, "").trim(); if (t && t !== "-") col.todo.push({ title: t, kind: "loop" }); }
  col.done = col.done.slice(-8);
  return col;
}

// A question Jarvis is asking you right now with its question tool (asked, no answer yet).
function openQuestion(entries) {
  const answered = new Set();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i], c = e.message?.content;
    if (e.type === "user" && Array.isArray(c)) for (const b of c) if (b.type === "tool_result") answered.add(b.tool_use_id);
    if (e.type === "assistant" && Array.isArray(c)) for (const b of c) {
      if (b.type === "tool_use" && b.name === "AskUserQuestion") {
        if (answered.has(b.id)) return null;
        const qs = (b.input?.questions || []).map((q) => ({ question: q.question, multi: !!q.multiSelect, options: (q.options || []).map((o) => o.label) }));
        return qs.length ? { id: b.id, questions: qs } : null;
      }
    }
    if (entries.length - i > 400) break;
  }
  return null;
}

// The Brain as a graph: every page in the vault and the [[wikilinks]] between them.
let graphCache = { at: 0, data: null };
function vaultGraph() {
  if (!VAULT) return { nodes: [], links: [] };
  if (Date.now() - graphCache.at < 10000) return graphCache.data;
  const nodes = [], byKey = new Map(), raw = [];
  const walk = (dir, rel = "") => {
    let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      if (d.name.startsWith(".") || (!rel && ["_templates", "raw"].includes(d.name))) continue;
      const r = rel + d.name;
      if (d.isDirectory()) walk(path.join(dir, d.name), r + "/");
      else if (d.name.endsWith(".md") && nodes.length < 3000) {
        let text = ""; try { text = fs.readFileSync(path.join(dir, d.name), "utf8").slice(0, 200000); } catch { /* skip */ }
        const title = (text.match(/^#\s+(.+)$/m) || [])[1] || d.name.slice(0, -3);
        const node = { id: r, title, folder: rel.split("/")[0] || "(root)" };
        nodes.push(node);
        byKey.set(r.slice(0, -3).toLowerCase(), node.id); byKey.set(d.name.slice(0, -3).toLowerCase(), byKey.get(d.name.slice(0, -3).toLowerCase()) || node.id);
        for (const m of text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) raw.push([node.id, m[1].trim().toLowerCase().replace(/\.md$/, "")]);
      }
    }
  };
  walk(VAULT);
  const links = [], seen = new Set();
  for (const [from, key] of raw) {
    const to = byKey.get(key) || byKey.get(key.split("/").pop());
    if (!to || to === from) continue;
    const k = from < to ? from + "|" + to : to + "|" + from;
    if (!seen.has(k)) { seen.add(k); links.push({ source: from, target: to }); }
  }
  graphCache = { at: Date.now(), data: { nodes, links, vault: VAULT } };
  return graphCache.data;
}

function latestSession() {
  let best = null;
  try {
    for (const f of fs.readdirSync(PROJECT_DIR)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = path.join(PROJECT_DIR, f), m = fs.statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m, id: f.slice(0, -6) };
    }
  } catch { /* no sessions yet */ }
  return best;
}

// Ops numbers: every session in this folder from the last two weeks, recomputed at most every 5 s.
let opsCache = { at: 0, data: null };
function opsSnapshot() {
  if (Date.now() - opsCache.at < 5000) return opsCache.data;
  const cutoff = Date.now() - 14 * 864e5, sessions = [], agents = [];
  let files = [];
  try { files = fs.readdirSync(PROJECT_DIR).filter((f) => f.endsWith(".jsonl")); } catch { /* none */ }
  for (const f of files) {
    const p = path.join(PROJECT_DIR, f);
    let m = 0; try { m = fs.statSync(p).mtimeMs; } catch { continue; }
    if (m < cutoff) continue;
    const rec = readJsonl(p);
    sessions.push({ entries: rec.entries, mtime: rec.mtime });
    const sub = path.join(PROJECT_DIR, f.slice(0, -6), "subagents");
    let subs = [];
    try { subs = fs.readdirSync(sub).filter((x) => x.endsWith(".jsonl")); } catch { /* none */ }
    for (const x of subs) {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(sub, x.replace(/\.jsonl$/, ".meta.json")), "utf8")); } catch { /* none */ }
      agents.push({ type: meta.agentType || "agent", description: meta.description || "", entries: readJsonl(path.join(sub, x)).entries });
    }
  }
  try { opsCache = { at: Date.now(), data: ops({ sessions, agents, vault: VAULT, root: ROOT }) }; }
  catch (e) { opsCache = { at: Date.now(), data: { error: String(e.message || e) } }; }
  return opsCache.data;
}

function snapshot() {
  const s = latestSession();
  const main = { id: "jarvis", name: "Jarvis", kind: "main", state: "offline", doing: "", messages: [] };
  const agents = [];
  if (s) {
    const rec = readJsonl(s.p);
    main.messages = messages(rec.entries);
    Object.assign(main, activity(rec, main.messages));
    const title = [...rec.entries].reverse().find((e) => e.type === "ai-title");
    main.title = title?.aiTitle || title?.title || "";
    const subdir = path.join(PROJECT_DIR, s.id, "subagents");
    let files = [];
    try { files = fs.readdirSync(subdir).filter((f) => f.endsWith(".jsonl")); } catch { /* none */ }
    for (const f of files) {
      const p = path.join(subdir, f);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(p.replace(/\.jsonl$/, ".meta.json"), "utf8")); } catch { /* none */ }
      const arec = readJsonl(p);
      const msgs = messages(arec.entries, 80);
      agents.push({ id: f.slice(6, -6), type: meta.agentType || "agent", description: meta.description || "",
        ...activity(arec, msgs), updated: arec.mtime, messages: msgs });
    }
  }
  // One card per desk: the most recent run of that agent type; everything else is a visitor.
  const desks = DESKS.map((type) => {
    const runs = agents.filter((a) => a.type === type).sort((a, b) => b.updated - a.updated);
    return { type, runs: runs.length, latest: runs[0] || null };
  });
  const visitors = agents.filter((a) => !DESKS.includes(a.type)).sort((a, b) => b.updated - a.updated).slice(0, 6);
  let now = "";
  if (VAULT) { try { now = fs.readFileSync(path.join(VAULT, "now.md"), "utf8").replace(/^---[\s\S]*?---\n/, "").slice(0, 1500); } catch { /* none */ } }
  const kanban = board(s ? readJsonl(s.p).entries : [], agents, now);
  const sc = screen();
  // Answered in the terminal: the prompt is gone from the screen, so drop the dashboard card too.
  for (const item of [...pending.values()]) {
    if (sc.text && !sc.asking && Date.now() - item.created > 4000) item.resolve(null);
  }
  return { root: ROOT, session: s?.id || null, tmux: tmuxAlive(), screen: sc, main, desks, visitors, now, board: kanban, ops: opsSnapshot(),
           permissions: [...pending.values()].map(({ id, tool, detail, agent, agentId, created }) => ({ id, tool, detail, agent, agentId, created })),
           question: openQuestion(s ? readJsonl(s.p).entries : []) };
}

// ---------- tmux ----------
function tmuxAlive() {
  try { execFileSync(TMUX, ["has-session", "-t", TMUX_SESSION], { stdio: "ignore" }); return true; } catch { return false; }
}

// What the terminal shows right now: pickers, folder-trust and MCP prompts, onboarding questions.
function screen() {
  if (!tmuxAlive()) return { text: "", asking: false };
  let text = "";
  try { text = execFileSync(TMUX, ["capture-pane", "-p", "-t", TMUX_SESSION], { encoding: "utf8" }); } catch { /* gone */ }
  text = text.replace(/\s+$/, "").split("\n").slice(-40).join("\n");
  const asking = /Enter to (confirm|select)|Esc to cancel|Do you want to proceed\?|Space to select|to navigate/i.test(text);
  return { text, asking };
}

const KEYS = new Set(["Up", "Down", "Left", "Right", "Space", "Enter", "Escape", "Tab", "BTab", ..."123456789"]);

function typeIntoSession(text, key) {
  if (!tmuxAlive()) throw new Error(`No tmux session "${TMUX_SESSION}". Start the office with: jarvis office`);
  if (key) { execFileSync(TMUX, ["send-keys", "-t", TMUX_SESSION, key]); return; }
  execFileSync(TMUX, ["send-keys", "-t", TMUX_SESSION, "-l", text]);
  execFileSync(TMUX, ["send-keys", "-t", TMUX_SESSION, "Enter"]);
}

// ---------- approvals ----------
const pending = new Map();                     // id -> { id, tool, detail, agent, created, resolve }
const clients = new Set();                     // SSE responses

function agentTypeOf(agentId) {
  if (!agentId) return null;
  const s = latestSession();
  try { return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, s.id, "subagents", `agent-${agentId}.meta.json`), "utf8")).agentType || "agent"; }
  catch { return "agent"; }
}

function askDashboard(hook, res) {
  return new Promise((resolve) => {
    if (clients.size === 0) return resolve(null);        // nobody watching: let the terminal ask
    const id = crypto.randomBytes(6).toString("hex");
    const t = toolSummary(hook.tool_name, hook.tool_input);
    const item = { id, tool: t.name, detail: t.detail, agent: hook.agent_type || agentTypeOf(hook.agent_id), agentId: hook.agent_id || null, created: Date.now(),
      resolve: (decision) => { clearTimeout(item.timer); pending.delete(id); setImmediate(broadcast); resolve(decision); } };
    item.timer = setTimeout(() => item.resolve(null), 110000);
    // Answered in the terminal instead: Claude Code stops the hook, the connection drops, the card goes.
    res.on("close", () => { if (pending.has(id)) item.resolve(null); });
    pending.set(id, item);
    broadcast();
  });
}

// ---------- Obsidian ----------
// Obsidian only opens folders it already knows as vaults. Add the Jarvis vault to its list (once, with a
// backup of Obsidian's settings), then open the vault or a page with an obsidian:// link.
function openInObsidian(rel) {
  if (!VAULT) return { ok: false, message: "This folder has no vault." };
  if (!fs.existsSync("/Applications/Obsidian.app")) return { ok: false, message: "Obsidian isn't installed. Get it free at obsidian.md, or use the graph view here." };
  const cfgPath = path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  let cfg = { vaults: {} }, added = false;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch { /* first run */ }
  cfg.vaults ||= {};
  if (!Object.values(cfg.vaults).some((v) => path.resolve(v.path) === path.resolve(VAULT))) {
    try { if (fs.existsSync(cfgPath) && !fs.existsSync(cfgPath + ".jarvis-backup")) fs.copyFileSync(cfgPath, cfgPath + ".jarvis-backup"); } catch { /* ignore */ }
    cfg.vaults[crypto.randomBytes(8).toString("hex")] = { path: VAULT, ts: Date.now() };
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    added = true;
  }
  const running = (() => { try { execFileSync("pgrep", ["-x", "Obsidian"], { stdio: "ignore" }); return true; } catch { return false; } })();
  if (added && running) return { ok: false, message: "Added your vault to Obsidian. Quit Obsidian (Cmd+Q) and press the button again: it only reads its vault list when it starts." };
  const target = rel ? path.join(VAULT, rel) : VAULT;
  try { execFileSync("open", [`obsidian://open?path=${encodeURIComponent(target)}`]); } catch (e) { return { ok: false, message: String(e.message || e) }; }
  return { ok: true, message: added ? "Opening your vault in Obsidian (added it to Obsidian's vault list)." : "Opening in Obsidian." };
}

// ---------- restart when updated ----------
// `jarvis update` replaces these files; restart so the dashboard always runs the code it serves.
const OWN = ["server.mjs", "ops.mjs"].map((f) => path.join(HERE, f));
const stamp = () => OWN.map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join(",");
const startedWith = stamp();
setInterval(() => {
  if (stamp() === startedWith) return;
  server.close(); server.closeAllConnections?.();
  const log = fs.openSync(path.join(STATE_DIR, "server.log"), "a");
  setTimeout(() => {
    const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: ["ignore", log, log] });
    try { fs.writeFileSync(path.join(STATE_DIR, "server.pid"), String(child.pid)); } catch { /* ignore */ }
    child.unref(); process.exit(0);
  }, 300);
}, 4000);

// ---------- http ----------
let lastSent = "";
function broadcast(force = true) {
  const data = JSON.stringify(snapshot());
  if (!force && data === lastSent) return;
  lastSent = data;
  for (const res of clients) res.write(`data: ${data}\n\n`);
}
setInterval(() => broadcast(false), 1000);

function body(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const sameOrigin = (req) => !req.headers.origin || req.headers.origin === `http://127.0.0.1:${PORT}` || req.headers.origin === `http://localhost:${PORT}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(path.join(HERE, "ui.html"), "utf8").replace("__UI_TOKEN__", UI_TOKEN);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(html);
    }
    if (url.pathname === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (req.method === "GET" && ["/office-scene.js", "/ops-view.js"].includes(url.pathname)) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return res.end(fs.readFileSync(path.join(HERE, url.pathname.slice(1))));
    }
    if (req.method === "GET" && url.pathname === "/stream") {
      if (url.searchParams.get("t") !== UI_TOKEN) return send(res, 403, { error: "forbidden" });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      clients.add(res);
      res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/graph" || url.pathname === "/api/note")) {
      if (url.searchParams.get("t") !== UI_TOKEN) return send(res, 403, { error: "forbidden" });
      if (url.pathname === "/api/graph") return send(res, 200, vaultGraph());
      const rel = String(url.searchParams.get("path") || ""), full = path.resolve(VAULT || "/nonexistent", rel);
      if (!VAULT || !full.startsWith(path.resolve(VAULT) + path.sep) || !full.endsWith(".md")) return send(res, 400, { error: "not a vault page" });
      try { return send(res, 200, { path: rel, text: fs.readFileSync(full, "utf8").slice(0, 6000) }); } catch { return send(res, 404, { error: "not found" }); }
    }
    if (req.method === "POST" && url.pathname === "/hook/permission") {
      if (req.headers.authorization !== `Bearer ${HOOK_TOKEN}`) return send(res, 403, { error: "forbidden" });
      const decision = await askDashboard(await body(req), res);
      if (res.destroyed) return;
      return send(res, 200, { decision });
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      if (!sameOrigin(req) || req.headers["x-office-token"] !== UI_TOKEN) return send(res, 403, { error: "forbidden" });
      const b = await body(req);
      if (url.pathname === "/api/send") {
        const text = String(b.text || "").trim();
        if (!text && !b.key) return send(res, 400, { error: "empty" });
        if (b.key && !KEYS.has(b.key)) return send(res, 400, { error: "key not allowed" });
        typeIntoSession(text, b.key);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/open-obsidian") return send(res, 200, openInObsidian(String(b.path || "")));
      const m = url.pathname.match(/^\/api\/permission\/([a-f0-9]+)$/);
      if (m) {
        const item = pending.get(m[1]);
        if (!item) return send(res, 404, { error: "already answered" });
        if (!["allow", "deny"].includes(b.behavior)) return send(res, 400, { error: "allow or deny" });
        item.resolve(b.behavior);
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Jarvis Office: http://127.0.0.1:${PORT}  (folder ${ROOT}, tmux session "${TMUX_SESSION}")`);
});
