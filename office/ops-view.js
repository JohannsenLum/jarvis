// Jarvis Office · Ops view: a command-centre HUD over the numbers in state.ops (see ops.mjs).
// API: OpsView.mount(el, { send }) · OpsView.update(state)
(() => {
  let root, send, state = null, orb, t = 0, paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        <section class="hud-orb" aria-label="Jarvis particle core"><div class="core-caption">NEURAL INTERFACE <span>01 / JARVIS</span></div><canvas id="h-orb" aria-hidden="true"></canvas><div class="hud-orb-text"><span class="core-eyebrow">YOUR PERSONAL INTELLIGENCE</span><b>JARVIS</b><span id="h-orb-sub">CONNECTING</span><button class="core-motion" id="h-motion" aria-pressed="${paused}">${paused ? "Resume motion" : "Pause motion"}</button></div></section>
        ${panel("h-feed", `Live feed <span class="live">LIVE</span>`, `<ul class="hud-feed" id="h-feed-list"></ul>`)}
        ${panel("h-cost", "Tokens &amp; cost", `<div id="h-cost-body"></div>`, "wide")}
        ${panel("h-agents", "Agents", `<div class="hud-agents" id="h-agents-list"></div>`)}
        ${panel("h-cmds", "Quick commands", `<div class="hud-cmds">${COMMANDS.map(([l], i) => `<button data-cmd="${i}">▸ ${esc(l)}</button>`).join("")}</div><p class="hud-note" id="h-cmd-note" role="status">Confirmation required before sending</p>`)}
        ${panel("h-routines", "Routines", `<div id="h-routines-body"></div>`)}
        ${panel("h-memory", "Memory insights", `<div id="h-memory-body"></div>`)}
        ${panel("h-system", "System monitor", `<div id="h-system-body"></div>`)}
      </div>
      <dialog class="cmd-confirm" aria-labelledby="cmd-confirm-title" aria-describedby="cmd-confirm-description cmd-confirm-text">
        <form method="dialog">
          <span class="cmd-confirm-label">QUICK COMMAND</span>
          <h2 id="cmd-confirm-title"></h2>
          <p id="cmd-confirm-description">Send this command to your Jarvis session?</p>
          <blockquote id="cmd-confirm-text"></blockquote>
          <div class="cmd-confirm-actions"><button class="btn" value="cancel" autofocus>Cancel</button><button class="btn primary" value="run">Run command</button></div>
        </form>
      </dialog></div>`;
    const dialog = root.querySelector(".cmd-confirm");
    const commandButtons = [...root.querySelectorAll("[data-cmd]")];
    const note = root.querySelector("#h-cmd-note");
    let pendingCommand = null, sending = false;
    root.querySelector(".hud-cmds").addEventListener("click", (e) => {
      const button = e.target.closest("[data-cmd]");
      if (!button || sending || dialog.open) return;
      pendingCommand = COMMANDS[Number(button.dataset.cmd)];
      dialog.querySelector("#cmd-confirm-title").textContent = pendingCommand[0];
      dialog.querySelector("#cmd-confirm-text").textContent = pendingCommand[1];
      dialog.returnValue = "cancel";
      dialog.showModal();
    });
    dialog.addEventListener("cancel", () => { dialog.returnValue = "cancel"; });
    dialog.addEventListener("close", async () => {
      const command = pendingCommand;
      pendingCommand = null;
      if (dialog.returnValue !== "run" || !command || sending) return;
      sending = true;
      commandButtons.forEach(button => { button.disabled = true; });
      note.textContent = `Sending: ${command[0]}…`;
      try { await send(command[1]); note.textContent = `Sent: ${command[0]}`; }
      catch (err) { note.textContent = `Could not send: ${err.message}`; }
      finally { sending = false; commandButtons.forEach(button => { button.disabled = false; }); }
    });
    orb = root.querySelector("#h-orb").getContext("2d");
    root.querySelector("#h-motion").onclick = (e) => {
      paused = !paused;
      e.target.textContent = paused ? "Resume motion" : "Pause motion";
      e.target.setAttribute("aria-pressed", paused);
    };
    drawOrb();
  }

  // Seeded volume and local edges are built once; perspective and depth shading run per frame.
  let seed = 73;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const particles = Array.from({ length: 1000 }, () => {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2;
    const radius = Math.cbrt(random()) * 155, ring = Math.sqrt(1 - y * y);
    return { x: Math.cos(angle) * ring * radius, y: y * radius, z: Math.sin(angle) * ring * radius, size: random() };
  });
  const edges = [];
  for (let i = 0; i < particles.length; i++) for (let j = i + 1; j < particles.length; j++) {
    const a = particles[i], b = particles[j];
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 32) edges.push([i, j]);
  }
  function drawOrb() {
    if (!orb) return;
    const canvas = orb.canvas, W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    orb.setTransform(dpr, 0, 0, dpr, 0, 0); orb.clearRect(0, 0, W, H);
    const working = state?.main?.state === "working", asking = state?.screen?.asking;
    const color = asking ? "237,178,115" : working ? "233,157,184" : "202,126,151";
    const cx = W / 2, cy = H * .43, scale = Math.min(W / 430, H / 490);
    const angle = t * .003, c = Math.cos(angle), s = Math.sin(angle);
    const glow = orb.createRadialGradient(cx, cy, 0, cx, cy, 225 * scale);
    glow.addColorStop(0, `rgba(${color},.13)`); glow.addColorStop(.5, `rgba(${color},.045)`); glow.addColorStop(1, `rgba(${color},0)`);
    orb.fillStyle = glow; orb.fillRect(0, 0, W, H);
    // A perspective floor grounds the suspended volume.
    const horizon = H * .73;
    orb.lineWidth = .6; orb.strokeStyle = "rgba(189,131,149,.12)";
    for (let i = -12; i <= 12; i++) {
      orb.beginPath(); orb.moveTo(cx + i * 17 * scale, horizon); orb.lineTo(cx + i * 85 * scale, H); orb.stroke();
    }
    for (let i = 0; i < 13; i++) {
      const y = horizon + (H - horizon) * Math.pow(i / 12, 2);
      orb.beginPath(); orb.moveTo(0, y); orb.lineTo(W, y); orb.stroke();
    }
    const breath = 1 + Math.sin(t * .022) * (working ? .055 : .018);
    const projected = particles.map(p => {
      const x = p.x * c + p.z * s, z = p.z * c - p.x * s;
      const y = p.y * .96 - z * .27, depth = z * .96 + p.y * .27;
      const perspective = 470 / (470 - depth);
      return { x: cx + x * perspective * scale * breath, y: cy + y * perspective * scale * breath,
        depth, a: .18 + (depth + 160) / 320 * .7, r: (.45 + p.size * 1.15) * perspective * scale };
    });
    for (const [i, j] of edges) {
      const a = projected[i], b = projected[j];
      orb.strokeStyle = `rgba(${color},${Math.min(a.a, b.a) * .23})`;
      orb.beginPath(); orb.moveTo(a.x, a.y); orb.lineTo(b.x, b.y); orb.stroke();
    }
    projected.sort((a, b) => a.depth - b.depth);
    for (const p of projected) {
      if (p.depth > 35 && p.r > 1.2) {
        orb.fillStyle = `rgba(${color},.035)`; orb.beginPath(); orb.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); orb.fill();
      }
      orb.fillStyle = `rgba(${p.depth > 80 ? "255,219,230" : color},${p.a})`;
      orb.beginPath(); orb.arc(p.x, p.y, p.r, 0, Math.PI * 2); orb.fill();
    }
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
    root.querySelector("#h-orb-sub").textContent = `CLAUDE CODE · ${mainLabel.toUpperCase()}`;
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
      + (r.launchd.length ? `<p class="hud-note">On this Mac (launchd): ${r.launchd.map((j) => `${esc(j.job)} ${j.lastRun ? "· ran " + ago(j.lastRun) + " ago" + (j.ok === false ? " (failed)" : "") : "· not run yet"}`).join(" · ")}</p>` : "")
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
  setInterval(() => {
    if (document.hidden || !root?.isConnected || !root.querySelector(".hud")) return;
    if (!paused) t += state?.main?.state === "working" ? 1.8 : 1;
    drawOrb(); clock();
  }, 40);
})();
