// Jarvis Office · Ops view: a command-centre HUD over the numbers in state.ops (see ops.mjs).
// API: OpsView.mount(el, { send }) · OpsView.update(state)
(() => {
  let root, send, state = null, orb, t = 0;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => `$${(n || 0).toFixed(n >= 100 ? 0 : 2)}`;
  const big = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n || 0);
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
  const shortModel = (m) => m.replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/-(\d)-(\d)$/, " $1.$2").replace(/-(\d)$/, " $1");
  const ring = (pct, label, sub) => {
    const p = Math.max(0, Math.min(100, pct ?? 0)), r = 26, c = 2 * Math.PI * r;
    return `<div class="hud-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" class="bg"/><circle cx="32" cy="32" r="${r}" class="fg ${p > 85 ? "hot" : ""}"
      stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 32 32)"/></svg><b>${pct == null ? "–" : p + "%"}</b><span>${esc(label)}</span>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`;
  };
  const panel = (id, title, body, extra = "") => `<section class="hud-panel ${extra}" id="${id}"><h3>${title}</h3>${body}</section>`;

  const COMMANDS = [
    ["Morning briefing", "Give me my morning briefing now."],
    ["What's on today?", "What's on today? Keep it short."],
    ["Refresh memory", "Run the nightly memory refresh now (brain-consolidate) and tell me what changed."],
    ["Weekly review", "Let's do my weekly review."],
    ["Finish onboarding", "Let's continue onboarding."],
    ["Tidy the vault", "Run brain-lint on the vault and report anything that needs me."],
  ];

  function layout() {
    root.innerHTML = `<div class="hud">
      <div class="hud-top"><span class="hud-status" id="h-status">SYSTEM STATUS <i></i><b>—</b></span>
        <span class="hud-clock"><em id="h-date"></em><b id="h-time"></b></span>
        <span class="hud-plan" id="h-plan"></span></div>
      <div class="hud-grid">
        ${panel("h-core", "Core overview", `<ul class="hud-list" id="h-core-list"></ul>`)}
        <section class="hud-orb"><canvas id="h-orb" width="520" height="340"></canvas><div class="hud-orb-text"><b>JARVIS</b><span id="h-orb-sub">AI CORE</span></div></section>
        ${panel("h-feed", `Live feed <span class="live">LIVE</span>`, `<ul class="hud-feed" id="h-feed-list"></ul>`)}
        ${panel("h-cost", "Tokens &amp; cost", `<div id="h-cost-body"></div>`, "wide")}
        ${panel("h-agents", "Agents", `<div class="hud-agents" id="h-agents-list"></div>`)}
        ${panel("h-cmds", "Quick commands", `<div class="hud-cmds">${COMMANDS.map(([l], i) => `<button data-cmd="${i}">▸ ${esc(l)}</button>`).join("")}</div><p class="hud-note" id="h-cmd-note">Typed into your session</p>`)}
        ${panel("h-routines", "Routines", `<div id="h-routines-body"></div>`)}
        ${panel("h-memory", "Memory insights", `<div id="h-memory-body"></div>`)}
        ${panel("h-system", "System monitor", `<div id="h-system-body"></div>`)}
      </div></div>`;
    root.querySelector(".hud-cmds").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cmd]"); if (!b) return;
      const note = root.querySelector("#h-cmd-note");
      try { await send(COMMANDS[b.dataset.cmd][1]); note.textContent = `Sent: ${COMMANDS[b.dataset.cmd][0]}`; }
      catch (err) { note.textContent = err.message; }
    });
    orb = root.querySelector("#h-orb").getContext("2d");
  }

  // ---------- the core orb ----------
  function drawOrb() {
    if (!orb) return;
    const W = 520, H = 340, cx = W / 2, cy = H / 2, R = 118, working = state?.main?.state === "working";
    orb.clearRect(0, 0, W, H);
    const glow = orb.createRadialGradient(cx, cy, 10, cx, cy, R * 1.6);
    glow.addColorStop(0, working ? "rgba(90,240,200,.35)" : "rgba(70,190,255,.28)"); glow.addColorStop(1, "rgba(10,30,60,0)");
    orb.fillStyle = glow; orb.fillRect(0, 0, W, H);
    // orbit rings
    orb.strokeStyle = "rgba(90,200,255,.25)"; orb.lineWidth = 1;
    for (const [rx, ry, rot] of [[R * 1.75, R * 0.42, -0.12], [R * 1.5, R * 0.3, 0.18]]) {
      orb.beginPath(); orb.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); orb.stroke();
      const a = t * (working ? 0.03 : 0.012) * (rot > 0 ? 1 : -1);
      const x = cx + rx * Math.cos(a) * Math.cos(rot) - ry * Math.sin(a) * Math.sin(rot), y = cy + rx * Math.cos(a) * Math.sin(rot) + ry * Math.sin(a) * Math.cos(rot);
      orb.fillStyle = "#9FE8FF"; orb.beginPath(); orb.arc(x, y, 2.5, 0, Math.PI * 2); orb.fill();
    }
    // sphere of points (latitude / longitude), slowly rotating
    const spin = t * (working ? 0.02 : 0.007);
    for (let lat = -80; lat <= 80; lat += 10) for (let lon = 0; lon < 360; lon += 10) {
      const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180 + spin;
      const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      if (z < -0.2) continue;
      const a = 0.25 + 0.75 * ((z + 0.2) / 1.2);
      orb.fillStyle = `rgba(${working ? "120,255,210" : "120,210,255"},${a * 0.9})`;
      orb.fillRect(cx + x * R, cy + y * R * 0.98, z > 0.6 ? 2 : 1.4, z > 0.6 ? 2 : 1.4);
    }
    orb.strokeStyle = working ? "rgba(120,255,210,.55)" : "rgba(120,210,255,.45)"; orb.lineWidth = 1.2;
    orb.beginPath(); orb.arc(cx, cy, R + 2, 0, Math.PI * 2); orb.stroke();
    // base platform
    for (let i = 0; i < 3; i++) { orb.strokeStyle = `rgba(90,200,255,${0.35 - i * 0.1})`; orb.beginPath(); orb.ellipse(cx, cy + R + 26 + i * 6, 120 + i * 30, 12 + i * 4, 0, 0, Math.PI * 2); orb.stroke(); }
  }

  // ---------- panels ----------
  function render() {
    const o = state?.ops;
    if (!o || o.error) { root.querySelector("#h-cost-body").innerHTML = `<p class="hud-note">${esc(o?.error || "Loading…")}</p>`; return; }
    const main = state.main, asking = state.screen?.asking;
    const mainLabel = main.state === "working" ? "Working" : asking ? "Needs you" : main.state === "offline" ? "Offline" : "Waiting for you";
    const running = state.desks.filter((d) => d.latest?.state === "working").length + state.visitors.filter((v) => v.state === "working").length;
    const sys = o.system, ok = sys.cpu < 90 && sys.mem < 92;
    root.querySelector("#h-status b").textContent = ok ? "OPTIMAL" : "UNDER LOAD";
    root.querySelector("#h-status").classList.toggle("warn", !ok);
    root.querySelector("#h-orb-sub").textContent = `AI CORE · ${mainLabel.toUpperCase()}`;
    root.querySelector("#h-plan").innerHTML = o.plan
      ? `<span>5H <b>${o.plan.fiveHour ?? "–"}%</b></span><span>WEEK <b>${o.plan.week ?? "–"}%</b></span>` : `<span class="dim">Plan usage: open the Claude app to track it</span>`;

    const models = o.cost.models.map((m) => shortModel(m.model));
    root.querySelector("#h-core-list").innerHTML = [
      ["◉", "Session", mainLabel, main.state === "working" ? "on" : asking ? "warn" : "ok"],
      ["▤", "Memory", `${o.vault?.pages ?? 0} pages · ${o.vault?.people ?? 0} people`, "ok"],
      ["◎", "Agents", running ? `${running} working` : `${Object.values(o.activity.runs).reduce((a, b) => a + b, 0)} runs today`, running ? "on" : "ok"],
      ["◈", "Models", models.join(" · ") || "—", "ok"],
      ["♪", "Voice", sys.services.voice ? "Online" : "Off", sys.services.voice ? "on" : "off"],
      ["⌂", "Terminal", state.tmux ? "Linked" : "View only", state.tmux ? "ok" : "warn"],
    ].map(([i, k, v, c]) => `<li class="${c}"><i>${i}</i><span>${k}</span><b>${esc(v)}</b></li>`).join("");

    const feed = [...o.activity.feed.map((f) => ({ ...f })), ...(o.vault?.recent || []).map((l) => ({ ts: Date.parse(l.date), who: "vault", text: `${l.kind}: ${l.text}`, kind: "vault" })),
      ...state.permissions.map((p) => ({ ts: p.created, who: p.agent || "Jarvis", text: `wants ${p.tool}`, kind: "warn" }))]
      .sort((a, b) => b.ts - a.ts).slice(0, 9);
    root.querySelector("#h-feed-list").innerHTML = feed.length ? feed.map((f) => `<li class="k-${f.kind}"><b>${esc(f.who)}</b><span>${esc(f.text)}</span><em>${ago(f.ts)}</em></li>`).join("")
      : `<li class="k-tool"><span>Nothing yet today</span></li>`;

    const c = o.cost, maxDay = Math.max(...c.days.map((d) => d.cost), 0.01);
    const ctx = o.context ? Math.round((o.context.used / o.context.size) * 100) : null;
    root.querySelector("#h-cost-body").innerHTML = `
      <div class="hud-kpis">
        <div><em>Today</em><b>${money(c.today)}</b><span>${big(c.tokensToday)} tokens · ${c.repliesToday} replies</span></div>
        <div><em>7 days</em><b>${money(c.week)}</b><span>${big(c.tokensWeek)} tokens</span></div>
        <div><em>Cache hits</em><b>${c.cacheHit == null ? "–" : Math.round(c.cacheHit * 100) + "%"}</b><span>of input read from cache</span></div>
        <div><em>Context</em><b>${ctx == null ? "–" : ctx + "%"}</b><span>${o.context ? `${big(o.context.used)} / ${big(o.context.size)}` : ""}</span></div>
      </div>
      <div class="hud-bars">${c.days.map((d) => `<div title="${d.day}: ${money(d.cost)}"><i style="height:${Math.max(2, (d.cost / maxDay) * 100)}%"></i><span>${d.day.slice(8)}</span></div>`).join("")}</div>
      <table class="hud-table"><tr><th>Model (7 days)</th><th>Tokens</th><th>Output</th><th>Cost</th></tr>
        ${c.models.map((m) => `<tr><td>${esc(shortModel(m.model))}</td><td>${big(m.tokens)}</td><td>${big(m.output)}</td><td>${money(m.cost)}</td></tr>`).join("") || `<tr><td colspan="4">No usage yet</td></tr>`}</table>
      <p class="hud-note">API-equivalent cost${c.calibrated ? ", calibrated from Claude Code's own totals" : " (estimate)"}. On a Claude subscription you aren't billed per token; your plan limits are the 5H / WEEK figures above.</p>`;

    const who = [["jarvis", "Jarvis", "◉"], ["librarian", "Librarian", "▤"], ["researcher", "Researcher", "⌕"], ["critic", "Critic", "◐"], ["creative", "Creative", "✦"]];
    root.querySelector("#h-agents-list").innerHTML = who.map(([id, name, icon]) => {
      const s = id === "jarvis" ? main : state.desks.find((d) => d.type === id)?.latest;
      const st = id === "jarvis" ? mainLabel : s?.state === "working" ? "Working" : s ? "Done" : "Standby";
      const runs = id === "jarvis" ? `${o.activity.messages} messages` : `${o.activity.runs[id] || 0} runs today`;
      return `<button class="hud-agent ${st === "Working" ? "on" : st === "Needs you" ? "warn" : ""}" data-select="${id}"><i>${icon}</i><b>${name}</b><span>${esc(st)}</span><em>${esc(s?.state === "working" ? s.doing : runs)}</em></button>`;
    }).join("");

    const r = o.routines;
    root.querySelector("#h-routines-body").innerHTML = (r.list.length ? `<ul class="hud-rows">${r.list.map((x) => `<li class="${x.on ? "on" : "off"}"><i></i><span>${esc(x.name)}</span><b>${x.on ? esc(x.when || "on") : "off"}</b></li>`).join("")}</ul>`
      : `<p class="hud-note">No routines yet. They're set in onboarding (chapter 4), or say "set up my briefing".</p>`)
      + (r.launchd.length ? `<p class="hud-note">On this Mac (launchd): ${r.launchd.map((j) => `${esc(j.job)} ${j.lastRun ? "· ran " + ago(j.lastRun) + " ago" : "· not run yet"}`).join(" · ")}</p>` : "")
      + (o.vault?.onboarding && o.vault.onboarding.status !== "complete" ? `<p class="hud-note warn">Onboarding: ${esc(o.vault.onboarding.status)} (${esc(o.vault.onboarding.step || "")})</p>` : "");

    const v = o.vault;
    const nowAge = v?.nowUpdated ? Math.round((Date.now() - Date.parse(v.nowUpdated)) / 864e5) : null;
    root.querySelector("#h-memory-body").innerHTML = v ? `
      <div class="hud-mini"><div><b>${v.pages}</b><span>pages</span></div><div><b>${v.people}</b><span>people</span></div><div><b>${v.clients}</b><span>clients</span></div>
        <div><b>${v.changesThisWeek}</b><span>changes this week</span></div><div class="${v.proposals ? "warn" : ""}"><b>${v.proposals}</b><span>proposals for you</span></div>
        <div class="${nowAge > 2 ? "warn" : ""}"><b>${nowAge == null ? "–" : nowAge === 0 ? "today" : nowAge + "d"}</b><span>now.md updated</span></div></div>
      ${nowAge > 2 ? `<p class="hud-note warn">Short-term memory is stale: the nightly refresh isn't running.</p>` : ""}` : `<p class="hud-note">No vault in this folder.</p>`;

    const svc = [["Terminal link", state.tmux], ["Voice app", sys.services.voice], ["Hermes gateway", sys.services.hermes], ["Codex CLI", sys.services.codex]];
    root.querySelector("#h-system-body").innerHTML = `<div class="hud-rings">${ring(sys.cpu, "CPU", sys.cores + " cores")}${ring(sys.mem, "RAM")}${ring(sys.disk, "Disk")}</div>
      <ul class="hud-rows">${svc.map(([n, on]) => `<li class="${on ? "on" : "off"}"><i></i><span>${n}</span><b>${on ? "online" : "off"}</b></li>`).join("")}
      <li class="on"><i></i><span>MCP servers</span><b>${esc(o.mcp.join(", ") || "none")}</b></li></ul>`;
  }

  function clock() {
    if (!root?.querySelector("#h-time")) return;
    const d = new Date();
    root.querySelector("#h-time").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    root.querySelector("#h-date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  window.OpsView = {
    mount(el, opts) { root = el; send = opts.send; layout(); clock(); if (state) render(); },
    update(s) { state = s; if (root?.querySelector(".hud")) render(); },
  };
  setInterval(() => { t++; if (root?.isConnected && root.querySelector(".hud")) { drawOrb(); if (t % 25 === 0) clock(); } }, 40);
})();
