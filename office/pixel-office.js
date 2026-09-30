// Jarvis Office: an isometric pixel-art office, drawn in code (no image assets).
// Low-resolution canvas scaled up with crisp pixels, for a Habbo-style look.
// API: PixelOffice.mount(el, onSelect) · PixelOffice.update(state, selected)
(() => {
  const W = 10, D = 8, TW = 32, TH = 16, WALL = 78;
  const CW = 332, CH = 268;
  const OX = 20 + D * TW / 2, OY = WALL + 22;
  const p = (gx, gy) => ({ x: OX + (gx - gy) * TW / 2, y: OY + (gx + gy) * TH / 2 });

  // Who sits where (grid coordinates) and how they look.
  const CAST = {
    jarvis:     { desk: [3.6, 4.9, 2.6, 1.2], look: { hair: "#2B2320", shirt: "#23324A", shade: "#18233A", pants: "#1D2430", skin: "#E8B48C", style: "short", tie: "#C8871E" } },
    librarian:  { desk: [1.2, 1.7, 2.0, 1.0], look: { hair: "#8A4B2A", shirt: "#6C8E5A", shade: "#557246", pants: "#3B3A48", skin: "#F1C6A0", style: "bun" } },
    researcher: { desk: [6.6, 1.7, 2.0, 1.0], look: { hair: "#1C1C22", shirt: "#3F7FB5", shade: "#316594", pants: "#2F3542", skin: "#C98E62", style: "short", glasses: true } },
    critic:     { desk: [0.9, 5.3, 2.0, 1.0], look: { hair: "#B9B4AE", shirt: "#7A4A6E", shade: "#613A58", pants: "#2E2A30", skin: "#EDC2A0", style: "side", glasses: true } },
    creative:   { desk: [7.0, 5.3, 2.0, 1.0], look: { hair: "#D9573B", shirt: "#E3A63A", shade: "#C68A26", pants: "#39424F", skin: "#F3CFB0", style: "long" } },
  };
  const VISITOR_SPOTS = [[8.7, 3.2], [9.4, 3.6], [8.7, 4.1], [9.4, 4.5], [8.0, 3.6], [8.0, 4.4]];
  // Where a person stands: behind their desk, to the right of the monitor, facing you.
  const spot = (c) => { const [gx, gy, w] = c.desk; return p(gx + w * 0.68, gy - 0.22); };
  const VISITOR_LOOKS = ["#5B8C85", "#A0636B", "#6F6AA8", "#8C7B4E", "#4E7A9C", "#9C6A4E"];

  let host, canvas, ctx, overlay, onSelect, state = null, selected = "jarvis", frame = 0, scale = 1;

  // ---------- primitives ----------
  const poly = (pts, fill, stroke) => {
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const up = (q, h) => ({ x: q.x, y: q.y - h });
  function box(gx, gy, w, d, h, top, left, right, z = 0) {
    const a = up(p(gx, gy), z), b = up(p(gx + w, gy), z), c = up(p(gx + w, gy + d), z), e = up(p(gx, gy + d), z);
    poly([e, c, up(c, h), up(e, h)], left);                 // front-left face
    poly([b, c, up(c, h), up(b, h)], right);                // front-right face
    poly([up(a, h), up(b, h), up(c, h), up(e, h)], top);    // top
  }
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

  // ---------- time of day ----------
  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: ["#8EC5EA", "#CFE8F7"], dim: 0, lamps: false };
    if (h >= 17 && h < 19.5) return { sky: ["#F0A36B", "#F7D3A1"], dim: 0.12, lamps: true };
    if (h >= 5.5 && h < 7) return { sky: ["#B9A6D8", "#F4C9A8"], dim: 0.12, lamps: true };
    return { sky: ["#141B33", "#2C3558"], dim: 0.32, lamps: true };
  }

  // ---------- room ----------
  function room(day) {
    ctx.clearRect(0, 0, CW, CH);
    // walls
    const lw = [p(0, D), p(0, 0), up(p(0, 0), WALL), up(p(0, D), WALL)];
    const rw = [p(0, 0), p(W, 0), up(p(W, 0), WALL), up(p(0, 0), WALL)];
    poly(lw, "#CFC3AA"); poly(rw, "#DDD2BB");
    poly([up(p(0, D), WALL), up(p(0, 0), WALL), up(p(0, 0), WALL + 5), up(p(0, D), WALL + 5)], "#8C7A5E");
    poly([up(p(0, 0), WALL), up(p(W, 0), WALL), up(p(W, 0), WALL + 5), up(p(0, 0), WALL + 5)], "#9C8A6C");
    // skirting
    poly([p(0, D), p(0, 0), up(p(0, 0), 4), up(p(0, D), 4)], "#8E7B5C");
    poly([p(0, 0), p(W, 0), up(p(W, 0), 4), up(p(0, 0), 4)], "#A08D6D");
    // windows on the left wall (with a little skyline)
    for (const gy of [2.9, 5.5]) {
      const a = up(p(0, gy), 24), b = up(p(0, gy + 2.0), 24), c = up(p(0, gy + 2.0), 62), e = up(p(0, gy), 62);
      const g = ctx.createLinearGradient(0, e.y, 0, a.y); g.addColorStop(0, day.sky[0]); g.addColorStop(1, day.sky[1]);
      poly([a, b, c, e], g);
      ctx.save(); ctx.beginPath(); [a, b, c, e].forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.clip();
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.3) / 6, bx = a.x + (b.x - a.x) * t, by = a.y + (b.y - a.y) * t, hgt = 8 + ((i * 7 + gy * 3) % 13);
        px(bx - 3, by - hgt, 6, hgt + 4, day.dim > 0.2 ? "#1E2440" : "#9FB3C6");
        if (day.dim > 0.2) for (let k = 0; k < 3; k++) if ((i + k + frame) % 5) px(bx - 1 + (k % 2) * 2, by - hgt + 2 + k * 3, 1, 1, "#F6D77A");
      }
      ctx.restore();
      poly([a, b, c, e], "rgba(0,0,0,0)", "#7A6A50");
      const m1 = up(p(0, gy + 1.0), 24), m2 = up(p(0, gy + 1.0), 62);
      ctx.strokeStyle = "#7A6A50"; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
      poly([up(p(0, gy), 22), up(p(0, gy + 2.0), 22), up(p(0, gy + 2.0), 24), up(p(0, gy), 24)], "#EDE6D6");
    }
    // right wall: whiteboard, clock, door, poster
    const wb = [up(p(2.4, 0), 30), up(p(5.4, 0), 30), up(p(5.4, 0), 60), up(p(2.4, 0), 60)];
    poly(wb, "#F6F6F2", "#8E8E88");
    const notes = ["#F3D35B", "#8BD17C", "#F29AB0", "#7CC4F0", "#F3D35B", "#F29AB0"];
    notes.forEach((c, i) => { const q = up(p(2.8 + (i % 3) * 0.9, 0), 50 - Math.floor(i / 3) * 11); px(q.x - 2, q.y - 3, 5, 4, c); });
    const clock = up(p(6.4, 0), 58); px(clock.x - 4, clock.y - 4, 8, 8, "#3B3B3B"); px(clock.x - 3, clock.y - 3, 6, 6, "#FAFAF5");
    const hr = new Date().getHours() % 12, mn = new Date().getMinutes();
    px(clock.x, clock.y - 2, 1, 2, "#222"); px(clock.x + (mn > 30 ? -1 : 1), clock.y, 1, 1, "#222"); void hr;
    const door = [up(p(7.6, 0), 0), up(p(9.0, 0), 0), up(p(9.0, 0), 52), up(p(7.6, 0), 52)];
    poly(door, "#7B5635", "#523A24"); const knob = up(p(8.7, 0), 26); px(knob.x, knob.y, 2, 2, "#E2C06B");
    const sign = up(p(8.3, 0), 45); px(sign.x - 5, sign.y - 2, 10, 4, "#E9DFC6");
    // floor: wooden planks
    for (let gx = 0; gx < W; gx++) for (let gy = 0; gy < D; gy++) {
      const shade = (gx + gy * 3) % 4 === 0 ? "#B98A5B" : (gx * 5 + gy) % 3 === 0 ? "#C0915F" : "#C69866";
      poly([p(gx, gy), p(gx + 1, gy), p(gx + 1, gy + 1), p(gx, gy + 1)], shade, "rgba(90,60,30,.25)");
    }
    // sunlight patches through the windows
    if (day.dim < 0.2) for (const gy of [3.1, 5.7]) poly([p(0.2, gy), p(2.4, gy + 0.4), p(2.4, gy + 2.2), p(0.2, gy + 1.8)], "rgba(255,244,210,.16)");
    // rug under Jarvis
    poly([p(2.8, 4.0), p(7.4, 4.0), p(7.4, 7.6), p(2.8, 7.6)], "#7E3B3B");
    poly([p(3.1, 4.3), p(7.1, 4.3), p(7.1, 7.3), p(3.1, 7.3)], "#9A4B45");
    poly([p(3.6, 4.8), p(6.6, 4.8), p(6.6, 6.8), p(3.6, 6.8)], "rgba(0,0,0,0)", "#D8A55A");
  }

  // ---------- furniture ----------
  function desk(gx, gy, w, d, working, big) {
    box(gx, gy, w, d, 11, "#B07E4F", "#7C5534", "#946640");
    poly([up(p(gx, gy), 11), up(p(gx + w, gy), 11), up(p(gx + w, gy), 12), up(p(gx, gy), 12)], "#C9955F");
    // monitor(s) on the back edge, screen facing the viewer
    const n = big ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const mx = gx + w * (n === 1 ? 0.28 : 0.16 + i * 0.26), base = up(p(mx, gy + 0.3), 12);
      px(base.x - 1, base.y - 4, 2, 4, "#3A3F47");
      px(base.x - 7, base.y - 14, 14, 10, "#2A2F37");
      const on = working ? ((frame + i) % 2 ? "#63D6A0" : "#4FC08C") : "#3C4A5A";
      px(base.x - 6, base.y - 13, 12, 8, on);
      if (working) for (let k = 0; k < 3; k++) px(base.x - 5, base.y - 12 + k * 2, 3 + ((frame + k) % 4) * 2, 1, "#E9FFF3");
    }
    const kb = up(p(gx + w * 0.62, gy + d * 0.6), 12); px(kb.x - 5, kb.y - 1, 10, 2, "#D9D9D2");
    const mug = up(p(gx + w * 0.86, gy + d * 0.5), 12); px(mug.x, mug.y - 3, 3, 3, "#EDEDE6"); if (working) px(mug.x + 1, mug.y - 6 - (frame % 2), 1, 2, "rgba(255,255,255,.6)");
  }
  function plant(gx, gy) {
    box(gx, gy, 0.5, 0.5, 6, "#C9744A", "#9C5535", "#B0623F");
    const t = up(p(gx + 0.25, gy + 0.25), 6);
    const leaves = [[0, -14, 8, 6], [-5, -10, 6, 6], [4, -9, 6, 6], [-2, -19, 6, 6], [1, -6, 5, 4]];
    leaves.forEach(([x, y, w, h], i) => px(t.x + x - w / 2, t.y + y, w, h, i % 2 ? "#3F8A4B" : "#4FA35A"));
  }
  function cooler(gx, gy) {
    box(gx, gy, 0.6, 0.6, 16, "#E9ECEF", "#B8BEC6", "#CDD2D8");
    const t = up(p(gx + 0.3, gy + 0.3), 16); px(t.x - 4, t.y - 11, 8, 10, "#8CC8F0"); px(t.x - 3, t.y - 10, 2, 7, "#C4E6FA");
  }
  function bookshelf(gx, gy) {
    box(gx, gy, 0.6, 2.2, 44, "#8E6440", "#6E4B2E", "#7E5735");
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) {
      const q = up(p(gx + 0.6, gy + 0.2 + i * 0.28), 6 + r * 10);
      const colors = ["#B5473A", "#3F6FA8", "#D9A441", "#4E8E5E", "#7A4E8E", "#E0E0D8"];
      px(q.x - 1, q.y - 8, 2, 8, colors[(i + r * 3) % colors.length]);
    }
  }
  function brain(gx, gy, pulse) {
    box(gx, gy, 1.0, 1.0, 12, "#5A6B80", "#3C4A5C", "#4A5A6E");
    box(gx + 0.15, gy + 0.15, 0.7, 0.7, 3, "#7FD3E8", "#4AA3BA", "#5DB6CC", 12);
    const c = up(p(gx + 0.5, gy + 0.5), 30 + (frame % 4 < 2 ? 0 : 1));
    const r = 7 + (pulse ? (frame % 2) : 0);
    const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, r + 6);
    g.addColorStop(0, "rgba(180,245,255,.95)"); g.addColorStop(0.5, "rgba(90,200,230,.55)"); g.addColorStop(1, "rgba(90,200,230,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r + 6, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + frame * 0.35;
      px(c.x + Math.cos(a) * (r - 2), c.y + Math.sin(a) * (r - 3) * 0.7, 1, 1, "#FFFFFF");
    }
  }

  // ---------- characters (Habbo-style, 12×26 pixels) ----------
  function person(fx, fy, look, mode) {
    const x0 = Math.round(fx - 6), y0 = Math.round(fy - 26);
    const typing = mode === "working", t = frame % 2;
    const parts = [];
    const r = (x, y, w, h, c) => parts.push([x, y, w, h, c]);
    // legs & shoes
    r(3, 18, 3, 6, look.pants); r(6, 18, 3, 6, shadeOf(look.pants)); r(2, 24, 4, 2, "#2A2320"); r(6, 24, 4, 2, "#2A2320");
    // torso & arms
    r(2, 10, 8, 8, look.shirt); r(8, 10, 2, 8, look.shade); r(5, 10, 2, 1, "#F2F2EE");
    if (look.tie) r(5, 11, 2, 5, look.tie);
    if (typing) { r(1, 12, 2, 4, look.shirt); r(9, 12, 2, 4, look.shade); r(2, 15 + t, 2, 1, look.skin); r(8, 16 - t, 2, 1, look.skin); }
    else if (mode === "waiting") { r(0, 11, 2, 5, look.shirt); r(10, 9, 2, 4, look.shade); r(10, 7, 2, 2, look.skin); r(0, 16, 2, 1, look.skin); }
    else { r(0, 11, 2, 6, look.shirt); r(10, 11, 2, 6, look.shade); r(0, 17, 2, 1, look.skin); r(10, 17, 2, 1, look.skin); }
    // head
    r(5, 9, 2, 1, shadeOf(look.skin));
    r(2, 2, 8, 7, look.skin); r(8, 6, 1, 2, shadeOf(look.skin));
    r(4, 5, 1, 1, "#1B1B1F"); r(7, 5, 1, 1, "#1B1B1F");
    if (look.glasses) { r(3, 4, 3, 1, "#1B1B1F"); r(6, 4, 3, 1, "#1B1B1F"); }
    r(5, 7, 2, 1, shadeOf(look.skin));
    // hair styles
    r(2, 1, 8, 2, look.hair); r(3, 0, 6, 1, look.hair);
    if (look.style === "short") { r(2, 3, 1, 2, look.hair); r(9, 3, 1, 1, look.hair); }
    if (look.style === "side") { r(2, 3, 3, 1, look.hair); r(2, 3, 1, 3, look.hair); }
    if (look.style === "long") { r(1, 2, 1, 9, look.hair); r(10, 2, 1, 9, look.hair); r(2, 3, 1, 2, look.hair); }
    if (look.style === "bun") { r(4, -2, 4, 2, look.hair); r(2, 3, 1, 2, look.hair); r(9, 3, 1, 2, look.hair); }
    // shadow, outline (draw every part 1px out in dark first), then the parts
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(fx, fy, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (const [x, y, w, h] of parts) px(x0 + x + dx, y0 + y + dy, w, h, "#1A1614");
    for (const [x, y, w, h, c] of parts) px(x0 + x, y0 + y, w, h, c);
  }
  function shadeOf(hex) {
    const n = parseInt(hex.slice(1), 16), f = 0.78;
    return `rgb(${Math.round((n >> 16) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
  }

  // ---------- scene ----------
  function agentState(id) {
    if (!state) return null;
    if (id === "jarvis") return state.main;
    const d = state.desks.find((x) => x.type === id);
    return d ? d.latest : null;
  }
  function modeOf(id, s) {
    if (id === "jarvis") return !s || s.state === "offline" ? "idle" : s.state === "working" ? "working" : state?.screen?.asking ? "asking" : "waiting";
    if (!s) return "idle";                                       // at their desk, not called yet
    if (s.state === "working") return "working";
    return Date.now() - (s.updated || 0) < 10 * 60 * 1000 ? "done" : "idle";
  }

  function draw() {
    if (!ctx) return;
    const day = daylight();
    room(day);
    const items = [];
    bookshelf(0.05, 0.3);
    plant(0.3, 7.2); plant(9.3, 0.3);
    items.push({ depth: 9.3 + 7.1, fn: () => plant(9.3, 7.1) });
    items.push({ depth: 4.9 + 2.1, fn: () => brain(4.4, 1.6, agentState("librarian")?.state === "working") });
    items.push({ depth: 9.1 + 1.7, fn: () => cooler(9.1, 1.4) });
    for (const [id, c] of Object.entries(CAST)) {
      const [gx, gy, w, d] = c.desk, s = agentState(id), mode = modeOf(id, s);
      const q = spot(c);
      items.push({ depth: gx + w * 0.68 + gy - 0.22, fn: () => person(q.x, q.y, c.look, mode) });
      items.push({ depth: gx + w / 2 + gy + d / 2, fn: () => desk(gx, gy, w, d, mode === "working", id === "jarvis") });
    }
    (state?.visitors || []).slice(0, VISITOR_SPOTS.length).forEach((v, i) => {
      const [gx, gy] = VISITOR_SPOTS[i], q = p(gx, gy), color = VISITOR_LOOKS[i % VISITOR_LOOKS.length];
      items.push({ depth: gx + gy, fn: () => person(q.x, q.y, { hair: "#3A2E28", shirt: color, shade: shadeOf(color), pants: "#343B46", skin: "#E6B894", style: i % 2 ? "long" : "short" },
        v.state === "working" ? "working" : "idle") });
    });
    items.sort((a, b) => a.depth - b.depth).forEach((it) => it.fn());
    if (day.dim) { ctx.fillStyle = `rgba(12,16,40,${day.dim})`; ctx.fillRect(0, 0, CW, CH); }
    if (day.lamps) for (const [gx, gy] of [[2.5, 2.5], [7.5, 2.5], [5, 6.2]]) {
      const q = up(p(gx, gy), 70), g = ctx.createRadialGradient(q.x, q.y + 60, 2, q.x, q.y + 60, 60);
      g.addColorStop(0, "rgba(255,220,150,.22)"); g.addColorStop(1, "rgba(255,220,150,0)"); ctx.fillStyle = g; ctx.fillRect(q.x - 60, q.y, 120, 130);
    }
  }

  // ---------- labels & clicks (HTML on top, so text stays sharp) ----------
  function labels() {
    if (!overlay || !state) return;
    const tags = [];
    const add = (id, name, q, mode, doing, sel) => {
      const bubble = mode === "working" ? (doing || "working…") : mode === "asking" ? "needs you!" : mode === "waiting" ? "waiting for you…" : mode === "done" ? "done ✓" : "";
      const X = q.x * scale, Y = q.y * scale;
      tags.push(`<button class="po-hit ${sel ? "sel" : ""} m-${mode}" data-id="${id}" aria-label="${esc(name)}"
          style="left:${X - 10 * scale}px;top:${Y - 30 * scale}px;width:${20 * scale}px;height:${34 * scale}px"></button>
        ${bubble ? `<span class="po-bubble m-${mode}" style="left:${X}px;top:${Y - 30 * scale}px">${esc(bubble)}</span>` : ""}
        <span class="po-name ${sel ? "sel" : ""} m-${mode}" style="left:${X}px;top:${Y + 3 * scale}px">${esc(name)}</span>`);
    };
    for (const [id, c] of Object.entries(CAST)) {
      const s = agentState(id), mode = modeOf(id, s);
      add(id, id === "jarvis" ? "Jarvis" : id[0].toUpperCase() + id.slice(1), spot(c), mode, s?.doing, selected === id);
    }
    (state.visitors || []).slice(0, VISITOR_SPOTS.length).forEach((v, i) => add(v.id, v.type, p(...VISITOR_SPOTS[i]), v.state === "working" ? "working" : "done", v.doing, selected === v.id));
    const b = p(4.9, 2.1), BX = b.x * scale, BY = b.y * scale;
    tags.push(`<button class="po-hit" data-id="brain" aria-label="The Brain" style="left:${BX - 14 * scale}px;top:${BY - 44 * scale}px;width:${28 * scale}px;height:${46 * scale}px"></button>
      <span class="po-name ${selected === "brain" ? "sel" : ""}" style="left:${BX}px;top:${BY + 2 * scale}px">The Brain</span>`);
    overlay.innerHTML = tags.join("");
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function fit() {
    const avail = Math.min(host.clientWidth, (window.innerHeight - 170) * CW / CH);
    scale = avail >= CW * 2 ? Math.floor(avail / CW * 2) / 2 : Math.max(0.6, avail / CW);
    canvas.style.width = `${CW * scale}px`; canvas.style.height = `${CH * scale}px`;
    overlay.style.width = canvas.style.width; overlay.style.height = canvas.style.height;
    labels();
  }

  window.PixelOffice = {
    mount(el, cb) {
      onSelect = cb;
      el.innerHTML = `<div class="po-wrap"><canvas width="${CW}" height="${CH}"></canvas><div class="po-overlay"></div></div>`;
      host = el; canvas = el.querySelector("canvas"); overlay = el.querySelector(".po-overlay");
      ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
      overlay.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) onSelect(b.dataset.id); });
      new ResizeObserver(fit).observe(el);
      fit(); draw();
    },
    update(s, sel) { state = s; selected = sel; draw(); labels(); },
    tick() { frame++; draw(); },
  };
  setInterval(() => window.PixelOffice.tick(), 260);
})();
