// Jarvis Office v2: an isometric open-plan office ("3D in 2D"), drawn in code with no image assets.
// Carpet tiles, a window wall with blinds, desk pods with partitions, a meeting table, a printer and a
// coffee point; a live kanban board on the wall; chibi agents who type when working, think with a hand
// on the chin, and stand up to stretch, sip coffee or look around when idle.
// (v1, the cosy version, is kept as the git tag office-v1.)
// API: PixelOffice.mount(el, onSelect) · PixelOffice.update(state, selected)
(() => {
  const W = 14, D = 10, TW = 64, TH = 32, WALL = 160;
  const CW = 40 + (W + D) * TW / 2 + 40, CH = WALL + 60 + (W + D) * TH / 2 + 40;
  const OX = 40 + D * TW / 2, OY = WALL + 60;
  const P_SCALE = 0.9;                                     // people slightly smaller than furniture
  const p = (gx, gy) => ({ x: OX + (gx - gy) * TW / 2, y: OY + (gx + gy) * TH / 2 });
  const up = (q, h) => ({ x: q.x, y: q.y - h });

  const CAST = {
    jarvis:     { desk: [5.2, 6.5, 3.0, 1.3], top: "#7A5236", label: "JARVIS", accent: "#E8A838",
                  look: { hair: "#2E2522", shirt: "#2C3E66", pants: "#27324A", skin: "#F1C09A", style: "short", tie: "#E8A838" } },
    librarian:  { desk: [1.6, 2.4, 2.3, 1.1], top: "#F4F6F8", label: "LIBRARIAN", accent: "#5FAF7E", partition: "#8FC9A3",
                  look: { hair: "#9A5A34", shirt: "#6FB08A", pants: "#445066", skin: "#F7D2B0", style: "bun" } },
    researcher: { desk: [4.8, 2.4, 2.3, 1.1], top: "#F4F6F8", label: "RESEARCHER", accent: "#4D8FE0", partition: "#8FBDEB",
                  look: { hair: "#22222A", shirt: "#4D8FE0", pants: "#39465C", skin: "#D59A6E", style: "short", glasses: true } },
    creative:   { desk: [8.0, 2.4, 2.3, 1.1], top: "#F4F6F8", label: "CREATIVE", accent: "#F2994A", partition: "#F7C08F",
                  look: { hair: "#E8613F", shirt: "#FFC24D", pants: "#46506A", skin: "#FAD8BC", style: "long" } },
    critic:     { desk: [1.6, 6.0, 2.3, 1.1], top: "#F4F6F8", label: "CRITIC", accent: "#8A5BC7", partition: "#BBA3E3",
                  look: { hair: "#C9C4BE", shirt: "#8A5BC7", pants: "#3A3448", skin: "#F4CBA8", style: "side", glasses: true } },
  };
  const VISITOR_SPOTS = [[11.6, 4.2], [12.4, 4.6], [11.2, 5.0], [12.8, 5.4], [12.0, 5.6], [11.4, 3.4]];
  const VISITOR_SHIRTS = ["#45B7A8", "#E26D8A", "#7A72D8", "#D9A441", "#4F9AD8", "#E58A4E"];

  let host, canvas, ctx, overlay, onSelect, state = null, selected = "jarvis", dpr = 1, scale = 1;
  const t0 = performance.now();
  let now = 0;
  const actors = {}, bubbles = {}, heads = {};

  // ---------- helpers ----------
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (h, f) => { const [r, g, b] = hex(h); const c = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))); return `rgb(${c(r)},${c(g)},${c(b)})`; };
  function path(pts) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }
  function poly(pts, fill, stroke, lw = 1) { path(pts); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function soft(fn, blur) { ctx.save(); ctx.filter = `blur(${blur}px)`; fn(); ctx.restore(); }
  function shadow(gx, gy, w, d, spread = 0.18, alpha = 0.18) {
    soft(() => poly([p(gx - spread * 0.3, gy - spread * 0.3), p(gx + w + spread, gy - spread * 0.3), p(gx + w + spread, gy + d + spread), p(gx - spread * 0.3, gy + d + spread)], `rgba(40,45,60,${alpha})`), 6);
  }
  function box(gx, gy, w, d, h, color, z = 0, opts = {}) {
    const a = up(p(gx, gy), z), b = up(p(gx + w, gy), z), c = up(p(gx + w, gy + d), z), e = up(p(gx, gy + d), z);
    let g = ctx.createLinearGradient(0, e.y - h, 0, e.y); g.addColorStop(0, mix(color, -0.06)); g.addColorStop(1, mix(color, -0.2));
    poly([e, c, up(c, h), up(e, h)], opts.left || g);
    g = ctx.createLinearGradient(0, c.y - h, 0, c.y); g.addColorStop(0, mix(color, -0.2)); g.addColorStop(1, mix(color, -0.34));
    poly([b, c, up(c, h), up(b, h)], opts.right || g);
    g = ctx.createLinearGradient(up(a, h).x, up(a, h).y, up(c, h).x, up(c, h).y); g.addColorStop(0, mix(color, 0.2)); g.addColorStop(1, mix(color, 0.04));
    poly([up(a, h), up(b, h), up(c, h), up(e, h)], opts.top || g);
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(up(e, h).x, up(e, h).y); ctx.lineTo(up(c, h).x, up(c, h).y); ctx.lineTo(up(b, h).x, up(b, h).y); ctx.stroke();
  }
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); } }
  function circle(x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); } }
  function ellipse(x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  const onWall = (gx, gw, h0, h1) => [up(p(gx, 0), h0), up(p(gx + gw, 0), h0), up(p(gx + gw, 0), h1), up(p(gx, 0), h1)];
  const onLeft = (gy, gw, h0, h1) => [up(p(0, gy), h0), up(p(0, gy + gw), h0), up(p(0, gy + gw), h1), up(p(0, gy), h1)];
  // Draw flat things (text, cards) on the back wall: local u runs along the wall, v runs down.
  function onBackWall(gx, h, fn) {
    const o = up(p(gx, 0), h), len = Math.hypot(TW / 2, TH / 2);
    ctx.save(); ctx.transform((TW / 2) / len, (TH / 2) / len, 0, 1, o.x, o.y); fn(len); ctx.restore();
  }
  // Flat things on a desk top (u along the desk's width, v along its depth), for nameplates.
  function onDeskFront(gx, gy, h, fn) {
    const o = up(p(gx, gy), h), len = Math.hypot(TW / 2, TH / 2);
    ctx.save(); ctx.transform((TW / 2) / len, (TH / 2) / len, 0, 1, o.x, o.y); fn(len); ctx.restore();
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: ["#63C2FF", "#D2F1FF"], night: 0, warm: 0 };
    if (h >= 17 && h < 19.5) return { sky: ["#FF9A7A", "#FFDCA3"], night: 0.06, warm: 0.12 };
    if (h >= 5.5 && h < 7) return { sky: ["#B7A6F0", "#FFD1B8"], night: 0.06, warm: 0.1 };
    return { sky: ["#131B42", "#2E3D7A"], night: 0.22, warm: 0.2 };
  }

  // ---------- room ----------
  function room(day) {
    let g = ctx.createLinearGradient(0, OY - WALL, 0, OY + D * TH / 2); g.addColorStop(0, "#EEF1F5"); g.addColorStop(1, "#DDE3EA");
    poly([p(0, D), p(0, 0), up(p(0, 0), WALL), up(p(0, D), WALL)], g);
    g = ctx.createLinearGradient(0, OY - WALL, 0, OY + W * TH / 2); g.addColorStop(0, "#F7F9FB"); g.addColorStop(1, "#E7ECF1");
    poly([p(0, 0), p(W, 0), up(p(W, 0), WALL), up(p(0, 0), WALL)], g);
    poly(onLeft(0, D, 0, 8), "#9AA5B1"); poly(onWall(0, W, 0, 8), "#A7B1BC");
    poly(onLeft(0, D, WALL, WALL + 8), "#C9D1DA"); poly(onWall(0, W, WALL, WALL + 8), "#D3DAE2");
    // accent wall panel behind the logo, in Jarvis gold
    poly(onWall(0.3, 2.6, 8, WALL), "#2C3E66");

    // window wall with vertical mullions and blinds
    poly(onLeft(2.2, 7.4, 20, 148), "#B9C3CE");
    const win = onLeft(2.3, 7.2, 24, 144);
    const sky = ctx.createLinearGradient(0, win[3].y, 0, win[0].y); sky.addColorStop(0, day.sky[0]); sky.addColorStop(1, day.sky[1]); poly(win, sky);
    ctx.save(); path(win); ctx.clip();
    if (day.night > 0.15) {
      for (let i = 0; i < 26; i++) { const s = up(p(0, 2.4 + ((i * 37) % 100) / 14), 90 + ((i * 53) % 50)); circle(s.x, s.y, 0.9 + (i % 3) * 0.3, `rgba(255,255,230,${0.5 + 0.5 * Math.sin(now / 700 + i)})`); }
      const m = up(p(0, 7.6), 128); circle(m.x, m.y, 7, "#FFF6C8"); circle(m.x + 3, m.y - 2, 6, day.sky[0]);
    } else {
      for (let i = 0; i < 3; i++) { const off = ((now / 70000 + i * 0.33) % 1) * 7.6, c0 = up(p(0, 2.2 + off), 116 + (i % 2) * 12);
        ellipse(c0.x, c0.y, 14, 5, "rgba(255,255,255,.9)"); ellipse(c0.x + 9, c0.y - 3, 9, 5, "rgba(255,255,255,.9)"); }
    }
    for (let i = 0; i < 22; i++) {
      const hgt = 26 + ((i * 29) % 60), y0 = 2.3 + i * 0.33;
      poly(onLeft(y0, 0.3, 24, 24 + hgt), day.night > 0.15 ? "#1A2350" : "rgba(115,150,190,.55)");
      if (day.night > 0.15) for (let k = 0; k < 4; k++) if ((i + k) % 3) { const q = up(p(0, y0 + 0.1 + (k % 2) * 0.12), 32 + k * 9); if (32 + k * 9 < 24 + hgt) circle(q.x, q.y, 0.9, "#FFD98A"); }
    }
    ctx.restore();
    // blinds: horizontal slats in the top part of each pane
    for (let pane = 0; pane < 4; pane++) {
      const y0 = 2.3 + pane * 1.8;
      for (let k = 0; k < 7; k++) poly(onLeft(y0, 1.8, 144 - k * 5 - 3, 144 - k * 5), "rgba(245,247,250,.92)");
      const m1 = up(p(0, y0), 24), m2 = up(p(0, y0), 144);
      ctx.strokeStyle = "#8C98A6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
    }
    poly(onLeft(2.3, 7.2, 20, 24), "#8C98A6");

    // back wall: JARVIS logo, kanban board, clock, TV screen, door
    onBackWall(0.45, 118, (len) => {
      ctx.fillStyle = "#E8A838"; ctx.font = "800 26px ui-monospace, Menlo, monospace"; ctx.fillText("JARVIS", 10, 38);
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "600 9px ui-monospace, Menlo, monospace"; ctx.fillText("PERSONAL  HQ", 12, 54);
      void len;
    });
    kanbanBoard();
    const ck = up(p(11.9, 0), 136); circle(ck.x, ck.y, 14, "#FFFFFF", "#8C98A6"); circle(ck.x, ck.y, 1.8, "#333");
    const d = new Date(), ha = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, ma = d.getMinutes() / 60 * Math.PI * 2;
    ctx.strokeStyle = "#333"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ha) * 6, ck.y - Math.cos(ha) * 6); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ma) * 10, ck.y - Math.cos(ma) * 10); ctx.stroke();
    // restroom door with a WC sign and an occupied light
    poly(onWall(12.3, 1.4, 0, 116), "#D3DAE2"); poly(onWall(12.4, 1.2, 0, 110), "#7C8C9E");
    const kn = up(p(13.4, 0), 54); circle(kn.x, kn.y, 2.4, "#E3E7EC");
    poly(onWall(12.62, 0.76, 78, 98), "#FFFFFF");
    onBackWall(12.66, 97, () => { ctx.fillStyle = "#334155"; ctx.font = "800 11px ui-monospace, Menlo, monospace"; ctx.fillText("WC", 8, 13); });
    const occ = up(p(13.2, 0), 104); circle(occ.x, occ.y, 3, wcBusy() ? "#E5484D" : "#30A46C");
    // pantry sign over the counter
    poly(onWall(9.5, 1.9, 108, 124), "#2C3E66");
    onBackWall(9.62, 122, () => { ctx.fillStyle = "#E8A838"; ctx.font = "800 10px ui-monospace, Menlo, monospace"; ctx.fillText("PANTRY", 6, 11); });

    // floor: commercial carpet tiles with a lighter walkway
    for (let gx = 0; gx < W; gx++) for (let gy = 0; gy < D; gy++) {
      const walk = gy === 4 || gx === 10;
      const base = walk ? "#D9DEE5" : ((gx + gy) % 2 ? "#B9C2CE" : "#B1BAC7");
      poly([p(gx, gy), p(gx + 1, gy), p(gx + 1, gy + 1), p(gx, gy + 1)], base, "rgba(80,90,105,.12)");
    }
    soft(() => { poly([p(0, 0), p(W, 0), p(W, 0.4), p(0.4, 0.4)], "rgba(40,50,70,.18)"); poly([p(0, 0), p(0.4, 0.4), p(0.4, D), p(0, D)], "rgba(40,50,70,.18)"); }, 8);
    if (day.night < 0.15) soft(() => poly([p(0.1, 2.4), p(3.2, 3.0), p(3.2, 10), p(0.1, 9.6)], "rgba(255,252,235,.22)"), 6);
    // Jarvis's area rug
    poly([p(4.5, 5.9), p(8.9, 5.9), p(8.9, 8.9), p(4.5, 8.9)], "#34507A");
    poly([p(4.75, 6.15), p(8.65, 6.15), p(8.65, 8.65), p(4.75, 8.65)], null, "rgba(232,168,56,.8)", 2);
  }

  function kanbanBoard() {
    const B = state?.board || { todo: [], doing: [], done: [] };
    const x0 = 3.3, gw = 6.0, h0 = 44, h1 = 146;
    poly(onWall(x0 - 0.06, gw + 0.12, h0 - 4, h1 + 4), "#9AA5B1");
    poly(onWall(x0, gw, h0, h1), "#FFFFFF");
    onBackWall(x0, h1, (len) => {
      const width = gw * len, colW = width / 3, H = h1 - h0;
      const cols = [["TO DO", B.todo, "#FFD166"], ["DOING", B.doing, "#7CC8FF"], ["DONE", B.done, "#7BE0AD"]];
      cols.forEach(([name, list, color], i) => {
        const cx = i * colW;
        if (i) { ctx.strokeStyle = "#D5DBE2"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 6); ctx.lineTo(cx, H - 6); ctx.stroke(); }
        ctx.fillStyle = "#334155"; ctx.font = "800 10.5px ui-monospace, Menlo, monospace"; ctx.fillText(name, cx + 8, 15);
        rr(cx + colW - 22, 6, 16, 11, 5, color); ctx.fillStyle = "#1F2937"; ctx.font = "700 7.5px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center"; ctx.fillText(String(list.length), cx + colW - 14, 14.5); ctx.textAlign = "left";
        const shown = (name === "DONE" ? list.slice(-4).reverse() : list.slice(0, 4));
        shown.forEach((card, k) => {
          const cy = 22 + k * 19, wob = ((k + i) % 2 ? 0.6 : -0.6);
          ctx.save(); ctx.translate(cx + 6, cy); ctx.rotate(wob * 0.02);
          rr(0, 0, colW - 12, 16, 2, color); rr(0, 0, colW - 12, 3, 1, "rgba(0,0,0,.08)");
          ctx.fillStyle = "#1F2937"; ctx.font = "600 8.2px -apple-system, sans-serif"; ctx.fillText(clip(card.title, Math.floor((colW - 18) / 4.3)), 4, 12);
          ctx.restore();
        });
        if (list.length > 4) { ctx.fillStyle = "#64748B"; ctx.font = "600 6.5px ui-monospace, Menlo, monospace"; ctx.fillText(`+${list.length - 4} more`, cx + 8, 22 + 4 * 19 + 6); }
        if (!list.length) { ctx.fillStyle = "#94A3B8"; ctx.font = "italic 8px -apple-system, sans-serif"; ctx.fillText(i === 1 ? "nothing in progress" : i === 2 ? "nothing yet today" : "all clear", cx + 8, 32); }
      });
    });
    const tray = onWall(x0 + 0.2, gw - 0.4, h0 - 6, h0 - 2); poly(tray, "#C9D1DA");
  }

  // ---------- props ----------
  function monitor(gx, gy, h, working, tint, wide) {
    const b = up(p(gx, gy), h), w = wide ? 30 : 24;
    rr(b.x - 3, b.y - 10, 6, 10, 2, "#5B6472"); rr(b.x - 10, b.y - 2, 20, 4, 2, "#6E7886");
    rr(b.x - w / 2 - 2, b.y - 34, w + 4, 26, 4, "#2B3240");
    const scr = ctx.createLinearGradient(b.x, b.y - 32, b.x, b.y - 10);
    if (working) { scr.addColorStop(0, mix(tint, 0.35)); scr.addColorStop(1, tint); } else { scr.addColorStop(0, "#3A4760"); scr.addColorStop(1, "#27324A"); }
    rr(b.x - w / 2, b.y - 32, w, 22, 3, scr);
    if (working) {
      for (let k = 0; k < 4; k++) { const len = 6 + ((Math.floor(now / 180) + k * 3) % 5) * 3; rr(b.x - w / 2 + 3, b.y - 29 + k * 5, Math.min(len, w - 6), 2, 1, "rgba(255,255,255,.85)"); }
      soft(() => ellipse(b.x, b.y - 20, 20, 12, `${tint}55`), 8);
    }
    ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(b.x - w / 2, b.y - 32); ctx.lineTo(b.x - w / 2 + 9, b.y - 32); ctx.lineTo(b.x - w / 2, b.y - 19); ctx.fill();
  }
  function mug(x, y, color, steam) {
    rr(x - 4, y - 9, 8, 9, 2, color, "rgba(0,0,0,.25)"); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 5, y - 5, 2.5, -1.2, 1.2); ctx.stroke();
    if (steam) { ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.4; for (let i = 0; i < 2; i++) { const o = Math.sin(now / 300 + i) * 2; ctx.beginPath(); ctx.moveTo(x - 1 + i * 3, y - 11); ctx.quadraticCurveTo(x + o + i * 3, y - 16, x - 1 + i * 3, y - 21); ctx.stroke(); } }
  }
  function smallPlant(x, y, pot) {
    rr(x - 5, y - 8, 10, 8, 2, pot); ellipse(x, y - 8, 5, 1.8, mix(pot, -0.25));
    for (const [dx, dy, r, c] of [[-4, -13, 4.5, "#4CAF6A"], [4, -14, 4.5, "#3F9E5C"], [0, -18, 5, "#5BC27A"]]) circle(x + dx, y + dy, r, c);
  }
  function books(x, y, colors) { colors.forEach((c, i) => rr(x - 9 + (i % 2) * 2, y - 4 - i * 4, 18 - (i % 2) * 4, 4, 1, c, "rgba(0,0,0,.18)")); }
  function chair(x, y, color) {
    ellipse(x, y + 2, 13, 4, "rgba(40,45,60,.25)");
    for (const a of [0, 1.26, 2.51, 3.77, 5.03]) circle(x + Math.cos(a) * 10, y + Math.sin(a) * 3.5, 1.8, "#3C4450");
    rr(x - 2, y - 14, 4, 14, 2, "#5B6472");
    rr(x - 13, y - 22, 26, 8, 4, mix(color, -0.1));
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0); g.addColorStop(0, mix(color, 0.15)); g.addColorStop(1, mix(color, -0.2));
    rr(x - 13, y - 54, 26, 34, 10, g, "rgba(0,0,0,.2)"); rr(x - 8, y - 49, 16, 3, 1.5, "rgba(255,255,255,.3)");
  }
  function partition(gx, gy, w, color) {
    // fabric screen along the back edge of the desk
    box(gx, gy - 0.62, w, 0.08, 62, color);
    box(gx - 0.02, gy - 0.64, w + 0.04, 0.12, 3, "#9AA5B1", 62);
  }

  function desk(id, c, mode) {
    const [gx, gy, w, d] = c.desk, H = 30, working = mode === "working", exec = id === "jarvis";
    shadow(gx, gy, w, d);
    if (exec) box(gx + 0.05, gy + 0.08, w - 0.1, d - 0.12, H - 6, mix(c.top, -0.1));         // solid executive desk
    else for (const [lx, ly] of [[gx + 0.06, gy + d - 0.06], [gx + w - 0.06, gy + d - 0.06], [gx + w - 0.06, gy + 0.06]]) box(lx - 0.04, ly - 0.04, 0.08, 0.08, H - 6, "#9AA5B1");
    box(gx, gy, w, d, 6, c.top, H - 6);
    if (!exec) poly([up(p(gx + w * 0.64, gy + d), H - 6), up(p(gx + w * 0.94, gy + d), H - 6), up(p(gx + w * 0.94, gy + d), H - 22), up(p(gx + w * 0.64, gy + d), H - 22)], "#E3E8EE", "rgba(0,0,0,.14)");
    const top = (fx, fy) => up(p(gx + w * fx, gy + d * fy), H);
    const tint = { jarvis: "#6FE3C1", librarian: "#9BE39B", researcher: "#7CC8FF", critic: "#C9A7FF", creative: "#FFB38A" }[id];
    if (exec) { monitor(gx + w * 0.12, gy + d * 0.36, H, working, tint, true); monitor(gx + w * 0.32, gy + d * 0.3, H, working, tint, true); }
    else monitor(gx + w * 0.2, gy + d * 0.36, H, working, tint);
    poly([top(0.5, 0.56), top(0.7, 0.56), top(0.7, 0.76), top(0.5, 0.76)], "#FFFFFF", "rgba(0,0,0,.22)");
    const mouse = top(0.76, 0.66); ellipse(mouse.x, mouse.y - 1, 2.5, 1.6, "#FFFFFF");
    // nameplate on the front edge of every desk
    onDeskFront(gx + w * 0.06, gy + d, H - 9, () => {
      rr(0, -9, 52, 11, 3, exec ? "#1F2B45" : "#FFFFFF", "rgba(0,0,0,.2)");
      rr(0, -9, 4, 11, 2, c.accent);
      ctx.fillStyle = exec ? "#E8A838" : "#334155"; ctx.font = "700 6.2px ui-monospace, Menlo, monospace"; ctx.fillText(c.label, 7, -1.5);
    });
    const deco = {
      jarvis: () => { const l = top(0.03, 0.2); rr(l.x - 2, l.y - 28, 4, 28, 2, "#C9A13B"); ellipse(l.x + 7, l.y - 30, 11, 5, "#E8C766");
                      if (daylight().night > 0.05) soft(() => ellipse(l.x + 9, l.y - 6, 30, 11, "rgba(255,220,120,.5)"), 10);
                      const m = top(0.88, 0.5); mug(m.x, m.y, "#FFFFFF", working); const pl = top(0.96, 0.18); smallPlant(pl.x, pl.y, "#2C3E66"); },
      librarian: () => { const b = top(0.88, 0.32); books(b.x, b.y, ["#E76F51", "#2A9D8F", "#E9C46A", "#264653"]); const m = top(0.9, 0.82); mug(m.x, m.y, "#9CCB8A", working); },
      researcher: () => { const g = top(0.88, 0.28); rr(g.x - 1.5, g.y - 14, 3, 14, 1, "#8B6B4A"); ellipse(g.x, g.y, 7, 2.5, "#8B6B4A");
                          circle(g.x, g.y - 21, 9, "#4DA3E0"); circle(g.x - 3, g.y - 22, 4.5, "#6CC56C"); circle(g.x + 4, g.y - 17, 2.5, "#6CC56C");
                          const m = top(0.93, 0.8); mug(m.x, m.y, "#4D8FE0", working); },
      critic: () => { const c0 = top(0.9, 0.32); rr(c0.x - 5, c0.y - 10, 10, 10, 2, "#E26D6D"); rr(c0.x - 3, c0.y - 18, 2, 9, 1, "#333"); rr(c0.x + 1, c0.y - 16, 2, 7, 1, "#E63946");
                      poly([top(0.78, 0.66), top(0.92, 0.66), top(0.92, 0.92), top(0.78, 0.92)], "#FFFFFF", "#8A5BC7"); },
      creative: () => { const pl = top(0.84, 0.74); ellipse(pl.x, pl.y - 2, 11, 5, "#F2D2A9"); ["#E63946", "#FFD166", "#2A9D8F", "#4D8FE0"].forEach((cc, i) => circle(pl.x - 6 + i * 4, pl.y - 3, 1.8, cc));
                        const hp = top(0.6, 0.22); ctx.strokeStyle = "#333"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hp.x, hp.y - 3, 6, Math.PI, 0); ctx.stroke(); rr(hp.x - 8, hp.y - 5, 4, 6, 2, "#FF6B6B"); rr(hp.x + 4, hp.y - 5, 4, 6, 2, "#FF6B6B"); },
    };
    deco[id]?.();
  }

  function plant(gx, gy, big) {
    const s = big ? 1.4 : 1;
    shadow(gx, gy, 0.6, 0.6, 0.1, 0.16);
    box(gx, gy, 0.6, 0.6, 18 * s, "#E9EDF2");
    const t = up(p(gx + 0.3, gy + 0.3), 18 * s), sway = Math.sin(now / 1400 + gx) * 1.5;
    for (const [dx, dy, r, c] of [[0, -30, 12, "#3F9E5C"], [-12, -22, 10, "#4CAF6A"], [12, -20, 10, "#3F9E5C"], [-6, -40, 10, "#5BC27A"], [7, -36, 11, "#4CAF6A"], [0, -14, 9, "#5BC27A"]]) {
      ellipse(t.x + dx * s + sway * (dy / -40), t.y + dy * s, r * s, r * s * 0.62, c, dx * 0.04);
    }
  }
  function cabinets(gx, gy) {
    for (let i = 0; i < 2; i++) {
      shadow(gx, gy + i * 0.72, 0.7, 0.7, 0.08, 0.14);
      box(gx, gy + i * 0.72, 0.7, 0.7, 64, "#C9D1DA");
      for (let k = 0; k < 3; k++) { const q = up(p(gx + 0.7, gy + i * 0.72 + 0.35), 12 + k * 18); rr(q.x - 5, q.y - 1, 10, 3, 1.5, "#8C98A6"); }
    }
    const top = up(p(gx + 0.35, gy + 0.4), 64); books(top.x, top.y, ["#2A9D8F", "#E9C46A", "#E76F51"]);
    const pl = up(p(gx + 0.35, gy + 1.1), 64); smallPlant(pl.x, pl.y, "#FFFFFF");
  }
  function printer(gx, gy) {
    shadow(gx, gy, 0.9, 0.7, 0.1, 0.16);
    box(gx, gy, 0.9, 0.7, 30, "#8C98A6");
    box(gx + 0.05, gy + 0.05, 0.8, 0.6, 16, "#EEF1F5", 30);
    box(gx + 0.2, gy + 0.3, 0.5, 0.35, 2, "#FFFFFF", 46);
    const l = up(p(gx + 0.8, gy + 0.6), 40); circle(l.x, l.y, 1.8, Math.floor(now / 600) % 2 ? "#2FB36B" : "#9BE39B");
  }
  function pantry(gx, gy) {
    // counter with coffee machine, mugs and a microwave; a fridge at the end
    shadow(gx, gy, 2.0, 0.75, 0.1, 0.16);
    box(gx, gy, 2.0, 0.75, 36, "#FFFFFF");
    box(gx, gy, 2.0, 0.75, 3, "#C9D1DA", 36);
    const m = up(p(gx + 0.4, gy + 0.32), 39); rr(m.x - 11, m.y - 26, 22, 26, 4, "#2B3240"); rr(m.x - 7, m.y - 22, 14, 7, 2, "#111"); circle(m.x + 4, m.y - 19, 1.5, "#6FE3C1");
    const c2 = up(p(gx + 0.85, gy + 0.5), 39); mug(c2.x, c2.y, "#E8A838", true);
    const c3 = up(p(gx + 1.05, gy + 0.35), 39); mug(c3.x, c3.y, "#FFFFFF", false);
    box(gx + 1.3, gy + 0.08, 0.6, 0.5, 20, "#E3E8EE", 39);
    const mw = up(p(gx + 1.6, gy + 0.58), 52); rr(mw.x - 9, mw.y - 8, 12, 9, 2, "#2B3240");
    const fr = gx + 2.05; shadow(fr, gy, 0.8, 0.75, 0.08, 0.14);
    box(fr, gy, 0.8, 0.75, 88, "#E9EDF2");
    const h1 = up(p(fr + 0.8, gy + 0.2), 70), h2 = up(p(fr + 0.8, gy + 0.2), 44); ctx.strokeStyle = "#8C98A6"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
    const sep = [up(p(fr + 0.8, gy), 52), up(p(fr + 0.8, gy + 0.75), 52)]; ctx.strokeStyle = "#C9D1DA"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sep[0].x, sep[0].y); ctx.lineTo(sep[1].x, sep[1].y); ctx.stroke();
  }
  function cooler(gx, gy) {
    shadow(gx, gy, 0.7, 0.7, 0.1, 0.16);
    box(gx, gy, 0.7, 0.7, 46, "#F1F4F8");
    const t = up(p(gx + 0.35, gy + 0.35), 46), g = ctx.createLinearGradient(t.x - 10, 0, t.x + 10, 0);
    g.addColorStop(0, "#7CC8FF"); g.addColorStop(0.5, "#C4EAFF"); g.addColorStop(1, "#5BB4F0");
    rr(t.x - 10, t.y - 30, 20, 30, 8, g); rr(t.x - 6, t.y - 26, 4, 18, 2, "rgba(255,255,255,.6)");
  }
  function meetingTable(gx, gy) {
    shadow(gx, gy, 2.4, 1.4, 0.2, 0.16);
    for (const [lx, ly] of [[gx + 0.3, gy + 0.7], [gx + 2.1, gy + 0.7]]) box(lx - 0.08, ly - 0.08, 0.16, 0.16, 26, "#8C98A6");
    box(gx, gy, 2.4, 1.4, 5, "#F7F9FB", 26);
    const lap = up(p(gx + 0.8, gy + 0.6), 31); rr(lap.x - 9, lap.y - 12, 18, 12, 2, "#8C98A6"); rr(lap.x - 8, lap.y - 11, 16, 10, 2, "#CFE8FF");
    const pad = up(p(gx + 1.7, gy + 0.9), 31); rr(pad.x - 6, pad.y - 3, 12, 4, 1, "#FFD166");
  }
  function meetingChairs(gx, gy, front) {
    const seats = [[gx + 0.6, gy - 0.25], [gx + 1.8, gy - 0.25], [gx - 0.3, gy + 0.7], [gx + 0.6, gy + 1.65], [gx + 1.8, gy + 1.65], [gx + 2.7, gy + 0.7]];
    seats.filter(([, y]) => front ? y > gy + 1 : y <= gy + 1).forEach(([x, y]) => { const q = p(x, y); chair(q.x, q.y + 6, "#5B6B80"); });
  }
  function tvStand(gx, gy) {
    const b = up(p(gx, gy), 0); rr(b.x - 2, b.y - 60, 4, 60, 2, "#5B6472"); ellipse(b.x, b.y, 12, 4, "#5B6472");
    rr(b.x - 34, b.y - 100, 68, 42, 4, "#1F2533");
    const g = ctx.createLinearGradient(b.x - 32, 0, b.x + 32, 0); g.addColorStop(0, "#1D3B5C"); g.addColorStop(1, "#244E78"); rr(b.x - 32, b.y - 98, 64, 38, 3, g);
    const o = state?.ops?.cost;
    ctx.fillStyle = "#9FE8FF"; ctx.font = "700 7px ui-monospace, Menlo, monospace"; ctx.fillText("TODAY", b.x - 28, b.y - 88);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "800 12px ui-monospace, Menlo, monospace"; ctx.fillText(o ? `$${o.today.toFixed(2)}` : "—", b.x - 28, b.y - 75);
    const days = o?.days?.slice(-7) || [], mx = Math.max(0.01, ...days.map((x) => x.cost));
    days.forEach((dd, i) => rr(b.x + 6 + i * 3.6, b.y - 64 - (dd.cost / mx) * 26, 2.6, (dd.cost / mx) * 26 + 1, 1, "#4FD1FF"));
  }
  function brain(gx, gy, active) {
    shadow(gx, gy, 1, 1, 0.15, 0.2);
    box(gx + 0.1, gy + 0.1, 0.8, 0.8, 22, "#5E6B85");
    box(gx + 0.18, gy + 0.18, 0.64, 0.64, 4, "#7FE6FF", 22, { top: "#A6F3FF" });
    const c = up(p(gx + 0.5, gy + 0.5), 62 + Math.sin(now / 600) * 3);
    soft(() => circle(c.x, c.y, 30, active ? "rgba(120,255,220,.55)" : "rgba(110,210,255,.45)"), 10);
    const g = ctx.createRadialGradient(c.x - 6, c.y - 6, 2, c.x, c.y, 18);
    g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.35, active ? "#9CFFE0" : "#A8E8FF"); g.addColorStop(1, active ? "#2FC6A0" : "#3A9BDB");
    circle(c.x, c.y, 17, g);
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(c.x, c.y, 27, 9, (now / (i ? 1300 : -1700)) % (Math.PI * 2), 0, Math.PI * 2); ctx.stroke(); }
  }
  function pendant(gx, gy, lit) {
    const q = up(p(gx, gy), 190);
    ctx.strokeStyle = "rgba(60,65,75,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, 0); ctx.lineTo(q.x, q.y); ctx.stroke();
    rr(q.x - 22, q.y, 44, 5, 2.5, "#3A3F4B"); rr(q.x - 20, q.y + 5, 40, 2, 1, lit ? "#FFF3C4" : "#E9EDF2");
  }

  // ---------- chibi people ----------
  function person(x, y, look, pose, id) {
    ctx.save(); ctx.translate(x, y); ctx.scale(P_SCALE, P_SCALE); ctx.translate(-x, -y);
    const T = now / 1000, seat = pose.startsWith("sit"), outline = "rgba(40,25,20,.38)";
    const bob = pose === "sit-type" ? Math.sin(T * 14) * 0.6 : pose === "stretch" ? -2 - Math.sin(T * 3) * 1.5 : Math.sin(T * 2 + x) * 0.6;
    const by = y + bob;
    const walking = pose === "walk" || pose === "walk-back", back = pose === "walk-back";
    if (!seat) {
      soft(() => ellipse(x, y + 1, 15, 5, "rgba(40,40,60,.3)"), 3);
      const sw = walking ? Math.sin(T * 11) * 3.5 : pose === "look" ? Math.sin(T * 2) : 0;
      rr(x - 9, by - 18 - Math.max(0, sw), 8, 17, 4, look.pants, outline); rr(x + 1, by - 18 - Math.max(0, -sw), 8, 17, 4, mix(look.pants, -0.12), outline);
      rr(x - 11, by - 4 - Math.max(0, sw), 11, 5, 3, "#3A2E2A"); rr(x + 1, by - 4 - Math.max(0, -sw), 11, 5, 3, "#3A2E2A");
    }
    const bodyTop = by - 46, sL = { x: x - 12, y: bodyTop + 6 }, sR = { x: x + 12, y: bodyTop + 6 };
    const arm = (s, hx, hy, color) => {
      ctx.lineCap = "round"; ctx.strokeStyle = outline; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(hx, hy); ctx.stroke(); circle(hx, hy, 3.6, look.skin, outline);
    };
    let hands;
    if (pose === "stretch") { const k = Math.sin(T * 3) * 3; hands = [[x - 16 - k, bodyTop - 26], [x + 16 + k, bodyTop - 26]]; }
    else if (pose === "wave") hands = [[x - 15, bodyTop + 24], [x + 21, bodyTop - 14 + Math.sin(T * 10) * 4]];
    else if (pose === "sip") hands = [[x - 15, bodyTop + 24], [x + 4, bodyTop - 5]];
    else if (pose === "sit-type") hands = [[x - 9 + Math.sin(T * 16) * 2, bodyTop + 27], [x + 9 + Math.sin(T * 16 + 2) * 2, bodyTop + 27]];
    else if (pose === "sit-think") hands = [[x - 10, bodyTop + 25], [x + 3, bodyTop - 3]];
    else if (walking) { const sw = Math.sin(T * 11) * 5; hands = [[x - 15, bodyTop + 23 + sw], [x + 15, bodyTop + 23 - sw]]; }
    else hands = [[x - 15, bodyTop + 24], [x + 15, bodyTop + 24]];
    const behind = pose === "stretch" || pose === "wave";
    if (behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); }
    const sg = ctx.createLinearGradient(x - 14, 0, x + 14, 0); sg.addColorStop(0, mix(look.shirt, 0.2)); sg.addColorStop(1, mix(look.shirt, -0.18));
    rr(x - 14, bodyTop, 28, 30, 11, sg, outline);
    if (!back) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.moveTo(x - 5, bodyTop + 1); ctx.lineTo(x, bodyTop + 7); ctx.lineTo(x + 5, bodyTop + 1); ctx.fill(); }
    if (look.tie && !back) { ctx.fillStyle = look.tie; ctx.beginPath(); ctx.moveTo(x - 2.5, bodyTop + 6); ctx.lineTo(x + 2.5, bodyTop + 6); ctx.lineTo(x + 3.5, bodyTop + 20); ctx.lineTo(x, bodyTop + 24); ctx.lineTo(x - 3.5, bodyTop + 20); ctx.fill(); }
    if (!behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); if (pose === "sip") mug(hands[1][0] + 4, hands[1][1] + 6, "#FFFFFF", true); }
    const tilt = pose === "sit-think" ? 0.14 : pose === "look" ? Math.sin(T * 1.3) * 0.2 : pose === "stretch" ? -0.08 : 0;
    const hx = x + tilt * 16, hy = bodyTop - 16;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt * 0.6);
    if (look.style === "long") rr(-19, -16, 38, 40, 14, mix(look.hair, -0.12));
    if (look.style === "bun") circle(0, -24, 8, look.hair, outline);
    const sk = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22); sk.addColorStop(0, mix(look.skin, 0.22)); sk.addColorStop(1, mix(look.skin, -0.1));
    circle(0, 0, 18, sk, outline);
    if (back) {                                                   // seen from behind: all hair, no face
      circle(0, -1, 18.5, look.hair); ellipse(-5, -10, 7, 3, "rgba(255,255,255,.18)", -0.4);
      if (look.style === "bun") circle(0, -22, 8, look.hair, outline);
      ctx.restore(); ctx.restore();
      return { hx: x + (hx - x) * P_SCALE, hy: y + (hy - y) * P_SCALE };
    }
    ctx.fillStyle = look.hair; ctx.beginPath();
    if (look.style === "side") { ctx.arc(0, -2, 18.5, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(4, -8, -17, -1); }
    else { ctx.arc(0, -1, 18.5, Math.PI * 1.04, Math.PI * 1.96); ctx.quadraticCurveTo(8, -11, 0, -7); ctx.quadraticCurveTo(-8, -11, -18, -4); }
    ctx.fill();
    ellipse(-6, -13, 6, 2.4, "rgba(255,255,255,.25)", -0.4);
    const blink = (Math.floor(now / 110) + (id?.length || 0) * 7) % 40 === 0;
    const lookX = pose === "look" ? Math.sin(T * 1.3) * 2 : pose === "sit-type" ? 1 : 0;
    for (const ex of [-6.5, 6.5]) {
      if (blink || pose === "stretch") { ctx.strokeStyle = "#2B2020"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(ex + lookX, 2, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
      else { ellipse(ex + lookX, 2, 2.8, 3.6, "#2B2020"); circle(ex + lookX + 1, 0.6, 1.1, "#FFFFFF"); }
    }
    circle(-11, 8, 3, "rgba(255,120,120,.35)"); circle(11, 8, 3, "rgba(255,120,120,.35)");
    ctx.strokeStyle = "#8A4A3A"; ctx.lineWidth = 1.6; ctx.beginPath();
    if (pose === "stretch") { ctx.ellipse(0, 10, 2.5, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (pose === "sit-type" || pose === "sit-think") { ctx.moveTo(-2.5, 10.5); ctx.lineTo(2.5, 10.5); ctx.stroke(); }
    else { ctx.arc(0, 8, 3.5, 0.3, Math.PI - 0.3); ctx.stroke(); }
    if (look.glasses) { ctx.strokeStyle = "#2B2020"; ctx.lineWidth = 1.6; for (const ex of [-6.5, 6.5]) { ctx.beginPath(); ctx.arc(ex, 2, 5, 0, Math.PI * 2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-1.5, 2); ctx.lineTo(1.5, 2); ctx.stroke(); }
    ctx.restore();
    if (pose === "sit-think") for (let i = 0; i < 3; i++) circle(hx + 20 + i * 7, hy - 20 - i * 8, 2.5 + i * 1.5, `rgba(255,255,255,${0.6 + 0.4 * Math.sin(now / 300 - i)})`, "rgba(0,0,0,.15)");
    ctx.restore();
    return { hx: x + (hx - x) * P_SCALE, hy: y + (hy - y) * P_SCALE };
  }

  // ---------- behaviour ----------
  function agentState(id) {
    if (!state) return null;
    if (id === "jarvis") return state.main;
    return state.desks.find((x) => x.type === id)?.latest || null;
  }
  function modeOf(id, s) {
    if (id === "jarvis") return !s || s.state === "offline" ? "idle" : s.state === "working" ? "working" : state?.screen?.asking ? "asking" : "waiting";
    if (!s) return "idle";
    if (s.state === "working") return "working";
    return Date.now() - (s.updated || 0) < 10 * 60 * 1000 ? "done" : "idle";
  }
  // Calm by default: seated most of the time, the occasional stretch, and now and then a walk down the
  // aisle to the pantry or the restroom. Work always brings them straight back to the desk.
  const AISLE_Y = 4.5, AISLE_X = 10.5;
  const PLACES = {
    pantry: { at: [10.35, 1.25], via: [[AISLE_X, 1.25]] },
    wc: { at: [12.95, 0.6], via: [[AISLE_X, 1.05], [12.95, 1.05]], hidden: true },
  };
  const FAST = /[?&]fast\b/.test(location.search) ? 8 : 1;          // ?fast speeds up idle life, for demos
  const rnd = (id, n) => { let h = 7; for (const ch of id + ":" + n) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((h >>> 0) % 10000) / 10000; };
  function spots(id, c) {
    const [gx, gy, w, d] = c.desk, front = id === "jarvis";
    const sx = front ? gx + w * 0.55 : gx + w + 0.35, sy = front ? gy + d + 0.5 : gy + d * 0.6;
    return { seatG: [gx + w * 0.66, gy - 0.2], standG: [sx, sy] };
  }
  function routeTo(from, place) { return [[from[0], AISLE_Y], [AISLE_X, AISLE_Y], ...PLACES[place].via, PLACES[place].at]; }
  let lastFrame = 0;
  function stepActor(id, c, mode, dt) {
    const a = actors[id] ||= { phase: "desk", n: 0, until: now + (6000 + rnd(id, 0) * 14000) / FAST, stretchUntil: 0, pos: null, route: [], place: null };
    const standG = spots(id, c).standG, busy = mode === "working" || mode === "asking";
    if (a.phase === "desk") {
      if (busy || now < a.until) return;
      a.n++; const r = rnd(id, a.n);
      if (id !== "jarvis" && r < 0.32) {                         // a trip
        a.place = r < 0.2 ? "pantry" : "wc"; a.phase = "out"; a.pos = [...standG]; a.route = routeTo(standG, a.place);
      } else if (r < (id === "jarvis" ? 0.12 : 0.45)) {          // a quick stretch
        a.stretchUntil = now + 3000; a.until = now + 3000 + (16000 + rnd(id, a.n + 1) * 18000) / FAST;
      } else a.until = now + (14000 + rnd(id, a.n + 2) * 20000) / FAST;   // stay seated
      return;
    }
    if (a.phase === "at") {
      if (busy || now > a.stayUntil) { a.phase = "back"; a.route = [...routeTo(standG, a.place)].reverse().slice(1).concat([standG]); }
      return;
    }
    if (busy && a.phase === "out") { a.phase = "back"; a.route = [[a.pos[0], AISLE_Y], [standG[0], AISLE_Y], standG]; }
    let step = (busy ? 2.6 : 1.4) * dt / 1000;
    while (step > 0 && a.route.length) {
      const [tx, ty] = a.route[0], dx = tx - a.pos[0], dy = ty - a.pos[1], dist = Math.hypot(dx, dy);
      if (dist <= step) { a.pos = [tx, ty]; a.route.shift(); step -= dist; }
      else { a.pos = [a.pos[0] + (dx / dist) * step, a.pos[1] + (dy / dist) * step]; a.dir = dx + dy; step = 0; }
    }
    if (!a.route.length) {
      if (a.phase === "out") { a.phase = "at"; a.stayUntil = now + (a.place === "wc" ? 7000 : 5500) / Math.min(FAST, 2); }
      else { a.phase = "desk"; a.until = now + (16000 + rnd(id, a.n + 3) * 20000) / FAST; }
    }
  }
  function wcBusy() { return Object.values(actors).some((a) => a.phase === "at" && a.place === "wc"); }
  // Where and how to draw someone this frame: { g: [gx, gy], pose, hidden }
  function placement(id, c, mode, doing) {
    const a = actors[id], sp = spots(id, c);
    if (mode === "working") return { g: sp.seatG, pose: /thinking/.test(doing || "") ? "sit-think" : "sit-type" };
    if (a && a.phase !== "desk") {
      if (a.phase === "at") return a.place === "wc" ? { hidden: true } : { g: a.pos, pose: "sip" };
      return { g: a.pos, pose: a.dir < 0 ? "walk-back" : "walk" };
    }
    if (mode === "asking") return { g: sp.standG, pose: "wave" };
    if (a && now < a.stretchUntil) return { g: sp.standG, pose: "stretch" };
    return { g: sp.seatG, pose: "sit" };
  }

  // ---------- frame ----------
  function draw() {
    if (!ctx) return;
    now = performance.now() - t0 + 1e6;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    const day = daylight();
    room(day);
    const items = [];
    cabinets(0.05, 0.25);
    plant(0.35, 9.2, true);
    items.push({ depth: 13.6, fn: () => plant(13.2, 0.3) });
    items.push({ depth: 22.5, fn: () => plant(13.3, 9.1, true) });
    items.push({ depth: 10.8, fn: () => pantry(9.4, 0.15) });
    items.push({ depth: 16.0, fn: () => cooler(13.2, 2.4) });
    items.push({ depth: 17.4, fn: () => printer(13.0, 3.9) });
    items.push({ depth: 15.2, fn: () => brain(8.8, 5.6, agentState("librarian")?.state === "working") });
    items.push({ depth: 16.6, fn: () => meetingChairs(10.4, 6.9, false) });
    items.push({ depth: 18.2, fn: () => meetingTable(10.4, 6.9) });
    items.push({ depth: 20.4, fn: () => meetingChairs(10.4, 6.9, true) });
    items.push({ depth: 16.5, fn: () => tvStand(13.4, 6.8) });
    const dt = Math.min(100, lastFrame ? now - lastFrame : 16); lastFrame = now;
    for (const [id, c] of Object.entries(CAST)) {
      const s = agentState(id), mode = modeOf(id, s);
      stepActor(id, c, mode, dt);
      const pl = placement(id, c, mode, s?.doing), seatG = spots(id, c).seatG, seat = p(...seatG);
      const [gx, gy, w, d] = c.desk;
      if (c.partition) items.push({ depth: gx + gy - 0.6, fn: () => partition(gx, gy, w, c.partition) });
      items.push({ depth: seatG[0] + seatG[1] - 0.02, fn: () => chair(seat.x, seat.y + 10, id === "jarvis" ? "#3A2A20" : "#4A5566") });
      if (pl.hidden) heads[id] = null;
      else { const q = p(...pl.g), sit = pl.pose.startsWith("sit");
        items.push({ depth: pl.g[0] + pl.g[1], fn: () => { heads[id] = person(q.x, q.y + (sit ? 6 : 0), c.look, pl.pose, id); } }); }
      items.push({ depth: gx + w / 2 + gy + d / 2, fn: () => desk(id, c, mode) });
    }
    (state?.visitors || []).slice(0, VISITOR_SPOTS.length).forEach((v, i) => {
      const [gx, gy] = VISITOR_SPOTS[i], q = p(gx, gy), shirt = VISITOR_SHIRTS[i % VISITOR_SHIRTS.length];
      const pose = v.state === "working" ? (Math.floor(now / 2500 + i) % 2 ? "look" : "stand") : "stand";
      items.push({ depth: gx + gy, fn: () => { heads[v.id] = person(q.x, q.y, { hair: ["#3A2E28", "#C58B4E", "#1E1E24"][i % 3], shirt, pants: "#3E485C", skin: ["#E6B894", "#F4CFAF", "#C98E62"][i % 3], style: i % 2 ? "long" : "short" }, pose, v.id); } });
    });
    items.sort((a, b) => a.depth - b.depth).forEach((it) => it.fn());
    if (day.night) {
      ctx.fillStyle = `rgba(20,24,60,${day.night})`; ctx.fillRect(0, 0, CW, CH);
      for (const [gx, gy] of [[3, 3], [6.2, 3], [9.3, 3], [3, 6.6], [6.8, 7.2], [11.6, 7.6]]) {
        const q = p(gx, gy), g = ctx.createRadialGradient(q.x, q.y - 40, 5, q.x, q.y, 130);
        g.addColorStop(0, `rgba(255,236,190,${day.warm + 0.06})`); g.addColorStop(1, "rgba(255,236,190,0)"); ctx.fillStyle = g; ctx.fillRect(q.x - 140, q.y - 170, 280, 270);
      }
    }
    placeBubbles();
  }

  // ---------- labels & clicks ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function labels() {
    if (!overlay || !state) return;
    const out = [];
    const add = (id, name, a, mode, doing) => {
      const bubble = mode === "working" ? (doing || "working…") : mode === "asking" ? "needs you!" : mode === "waiting" ? "waiting for you…" : mode === "done" ? "done ✓" : "";
      out.push(`<button class="po-hit ${selected === id ? "sel" : ""}" data-id="${id}" aria-label="${esc(name)}" style="left:${(a.x - 34) * scale}px;top:${(a.y - 96) * scale}px;width:${68 * scale}px;height:${120 * scale}px">
          <span class="po-name m-${mode}">${esc(name)}${doing && mode === "working" ? "" : ""}</span></button>`
        + (bubble ? `<span class="po-bubble m-${mode}" data-b="${id}">${esc(bubble)}</span>` : ""));
    };
    for (const [id, c] of Object.entries(CAST)) {
      const s = agentState(id), [gx, gy, w, d] = c.desk;
      add(id, id === "jarvis" ? "Jarvis · main session" : id[0].toUpperCase() + id.slice(1), p(gx + w * 0.72, gy + d * 0.3), modeOf(id, s), s?.doing);
    }
    (state.visitors || []).slice(0, VISITOR_SPOTS.length).forEach((v, i) => add(v.id, v.type, p(...VISITOR_SPOTS[i]), v.state === "working" ? "working" : "done", v.doing));
    const b = p(9.3, 6.1);
    out.push(`<button class="po-hit ${selected === "brain" ? "sel" : ""}" data-id="brain" aria-label="The Brain" style="left:${(b.x - 32) * scale}px;top:${(b.y - 96) * scale}px;width:${64 * scale}px;height:${100 * scale}px"><span class="po-name">The Brain · your vault</span></button>`);
    const k0 = up(p(3.3, 0), 146), k1 = up(p(9.3, 0), 44);
    out.push(`<button class="po-hit po-board ${selected === "board" ? "sel" : ""}" data-id="board" aria-label="Task board" style="left:${k0.x * scale}px;top:${k0.y * scale}px;width:${(k1.x - k0.x) * scale}px;height:${(k1.y - k0.y) * scale}px"><span class="po-name">Task board · click to open</span></button>`);
    overlay.innerHTML = out.join("");
    for (const k in bubbles) delete bubbles[k];
    overlay.querySelectorAll("[data-b]").forEach((el) => (bubbles[el.dataset.b] = el));
    placeBubbles();
  }
  function placeBubbles() {
    for (const [id, el] of Object.entries(bubbles)) {
      const h = heads[id]; el.style.display = h ? "" : "none"; if (!h) continue;
      el.style.left = `${h.hx * scale}px`; el.style.top = `${(h.hy - 24) * scale}px`;
    }
  }

  function fit() {
    const avail = Math.min(host.clientWidth, (window.innerHeight - 140) * CW / CH);
    scale = Math.max(0.45, avail / CW);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(CW * scale * dpr); canvas.height = Math.round(CH * scale * dpr);
    canvas.style.width = `${CW * scale}px`; canvas.style.height = `${CH * scale}px`;
    overlay.style.width = canvas.style.width; overlay.style.height = canvas.style.height;
    draw(); labels();
  }

  window.PixelOffice = {
    mount(el, cb) {
      onSelect = cb; host = el;
      el.innerHTML = `<div class="po-wrap"><canvas></canvas><div class="po-overlay"></div></div>`;
      canvas = el.querySelector("canvas"); overlay = el.querySelector(".po-overlay");
      ctx = canvas.getContext("2d");
      overlay.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) onSelect(b.dataset.id); });
      new ResizeObserver(fit).observe(el);
      fit();
    },
    update(s, sel) { state = s; selected = sel; labels(); },
  };
  const loop = () => { if (canvas?.isConnected) draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
