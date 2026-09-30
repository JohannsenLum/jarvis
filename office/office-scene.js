// Jarvis Office v3: a warm, open-plan isometric office ("3D in 2D"), drawn in code with no image assets.
// v1's warm colours with a real office layout: long bench desks and L-shaped desks with seats for more
// agents, a small task board, a pantry and a restroom. Chibi agents type when working, think with a hand
// on the chin, stay mostly seated when idle, and now and then stretch or walk to the pantry or restroom.
// Earlier versions: git tags office-v1 (cosy) and office-v2 (grey open-plan).
// API: PixelOffice.mount(el, onSelect) · PixelOffice.update(state, selected)
(() => {
  const W = 20, D = 14, TW = 64, TH = 32, WALL = 160;
  const CW = 40 + (W + D) * TW / 2 + 40, CH = WALL + 60 + (W + D) * TH / 2 + 30;
  const OX = 40 + D * TW / 2, OY = WALL + 60;
  const P_SCALE = 0.9;
  const p = (gx, gy) => ({ x: OX + (gx - gy) * TW / 2, y: OY + (gx + gy) * TH / 2 });
  const up = (q, h) => ({ x: q.x, y: q.y - h });

  // ---------- who looks like what ----------
  const LOOKS = {
    jarvis:     { hair: "#2E2522", shirt: "#2C3E66", pants: "#27324A", skin: "#F1C09A", style: "short", tie: "#E8A838" },
    librarian:  { hair: "#9A5A34", shirt: "#6FB08A", pants: "#445066", skin: "#F7D2B0", style: "bun" },
    researcher: { hair: "#22222A", shirt: "#4D8FE0", pants: "#39465C", skin: "#D59A6E", style: "short", glasses: true },
    critic:     { hair: "#C9C4BE", shirt: "#8A5BC7", pants: "#3A3448", skin: "#F4CBA8", style: "side", glasses: true },
    creative:   { hair: "#E8613F", shirt: "#FFC24D", pants: "#46506A", skin: "#FAD8BC", style: "long" },
  };
  const ACCENT = { jarvis: "#E8A838", librarian: "#5FAF7E", researcher: "#4D8FE0", critic: "#8A5BC7", creative: "#F2994A" };
  const TINT = { jarvis: "#6FE3C1", librarian: "#9BE39B", researcher: "#7CC8FF", critic: "#C9A7FF", creative: "#FFB38A" };
  const SHIRTS = ["#45B7A8", "#E26D8A", "#7A72D8", "#D9A441", "#4F9AD8", "#E58A4E"];
  const HAIRS = ["#3A2E28", "#C58B4E", "#1E1E24", "#8A4B2A"], SKINS = ["#E6B894", "#F4CFAF", "#C98E62", "#F1C09A"];
  const lookFor = (id, type, i) => LOOKS[type] || { hair: HAIRS[i % 4], shirt: SHIRTS[i % 6], pants: "#3E485C", skin: SKINS[(i + 1) % 4], style: ["short", "long", "side", "bun"][i % 4], glasses: i % 3 === 1 };

  // ---------- furniture: bench desks and L-desks, split into one segment per seat ----------
  // Each seat: the desk segment in front of it [gx, gy, w, d], and who sits there by default.
  const SEG_W = 2.3;
  const SEATS = [];
  const bench = (x0, gy, n, owners) => { for (let i = 0; i < n; i++) SEATS.push({ seg: [x0 + i * SEG_W, gy, SEG_W, 1.1], owner: owners[i] || null, kind: "bench", row: gy }); };
  bench(2.0, 2.3, 4, ["librarian", "researcher", "creative", null]);
  bench(2.0, 6.0, 4, ["critic", null, null, null]);
  SEATS.push({ seg: [13.4, 3.0, 2.5, 1.05], owner: null, kind: "L", side: [15.0, 4.05, 0.9, 1.7] });
  SEATS.push({ seg: [16.6, 3.0, 2.5, 1.05], owner: null, kind: "L", side: [18.2, 4.05, 0.9, 1.7] });
  const JARVIS_DESK = [7.6, 10.0, 3.2, 1.4];
  const AISLE_X = 12.4;
  const PLACES = {
    pantry: { at: [15.6, 1.35], via: [[AISLE_X, 1.35]] },
    wc: { at: [19.0, 0.6], via: [[AISLE_X, 1.1], [19.0, 1.1]], hidden: true },
  };

  let host, canvas, ctx, overlay, onSelect, state = null, selected = "jarvis", dpr = 1, scale = 1;
  const t0 = performance.now();
  let now = 0, lastFrame = 0;
  const actors = {}, bubbles = {}, heads = {};

  // ---------- helpers ----------
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (h, f) => { const [r, g, b] = hex(h); const c = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))); return `rgb(${c(r)},${c(g)},${c(b)})`; };
  function path(pts) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }
  function poly(pts, fill, stroke, lw = 1) { path(pts); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function soft(fn, blur) { ctx.save(); ctx.filter = `blur(${blur}px)`; fn(); ctx.restore(); }
  function shadow(gx, gy, w, d, spread = 0.18, alpha = 0.2) {
    soft(() => poly([p(gx - spread * 0.3, gy - spread * 0.3), p(gx + w + spread, gy - spread * 0.3), p(gx + w + spread, gy + d + spread), p(gx - spread * 0.3, gy + d + spread)], `rgba(70,40,20,${alpha})`), 6);
  }
  function box(gx, gy, w, d, h, color, z = 0, opts = {}) {
    const a = up(p(gx, gy), z), b = up(p(gx + w, gy), z), c = up(p(gx + w, gy + d), z), e = up(p(gx, gy + d), z);
    let g = ctx.createLinearGradient(0, e.y - h, 0, e.y); g.addColorStop(0, mix(color, -0.06)); g.addColorStop(1, mix(color, -0.2));
    if (!opts.noLeft) poly([e, c, up(c, h), up(e, h)], opts.left || g);
    g = ctx.createLinearGradient(0, c.y - h, 0, c.y); g.addColorStop(0, mix(color, -0.2)); g.addColorStop(1, mix(color, -0.34));
    if (!opts.noRight) poly([b, c, up(c, h), up(b, h)], opts.right || g);
    g = ctx.createLinearGradient(up(a, h).x, up(a, h).y, up(c, h).x, up(c, h).y); g.addColorStop(0, mix(color, 0.24)); g.addColorStop(1, mix(color, 0.05));
    poly([up(a, h), up(b, h), up(c, h), up(e, h)], opts.top || g);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(up(e, h).x, up(e, h).y); ctx.lineTo(up(c, h).x, up(c, h).y); if (!opts.noRight) ctx.lineTo(up(b, h).x, up(b, h).y); ctx.stroke();
  }
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); } }
  function circle(x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); } }
  function ellipse(x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  const onWall = (gx, gw, h0, h1) => [up(p(gx, 0), h0), up(p(gx + gw, 0), h0), up(p(gx + gw, 0), h1), up(p(gx, 0), h1)];
  const onLeft = (gy, gw, h0, h1) => [up(p(0, gy), h0), up(p(0, gy + gw), h0), up(p(0, gy + gw), h1), up(p(0, gy), h1)];
  function alongX(gx, gy, h, fn) { const o = up(p(gx, gy), h), len = Math.hypot(TW / 2, TH / 2); ctx.save(); ctx.transform((TW / 2) / len, (TH / 2) / len, 0, 1, o.x, o.y); fn(len); ctx.restore(); }

  // ---------- time of day (your Mac's clock) ----------
  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: ["#63C2FF", "#CFF0FF"], night: 0, warm: 0 };
    if (h >= 17 && h < 19.5) return { sky: ["#FF9A7A", "#FFDCA3"], night: 0.08, warm: 0.14 };
    if (h >= 5.5 && h < 7) return { sky: ["#B7A6F0", "#FFD1B8"], night: 0.08, warm: 0.1 };
    return { sky: ["#131B42", "#2E3D7A"], night: 0.26, warm: 0.22 };
  }

  // ---------- room (v1 colours) ----------
  function room(day) {
    let g = ctx.createLinearGradient(0, OY - WALL, 0, OY + D * TH / 2); g.addColorStop(0, "#FBEFE3"); g.addColorStop(1, "#EFD8C3");
    poly([p(0, D), p(0, 0), up(p(0, 0), WALL), up(p(0, D), WALL)], g);
    g = ctx.createLinearGradient(0, OY - WALL, 0, OY + W * TH / 2); g.addColorStop(0, "#FFF7EF"); g.addColorStop(1, "#F7E3D0");
    poly([p(0, 0), p(W, 0), up(p(W, 0), WALL), up(p(0, 0), WALL)], g);
    poly(onLeft(0, D, 0, 40), "#E9CDB2"); poly(onWall(0, W, 0, 40), "#F0D6BD");
    poly(onLeft(0, D, 40, 44), "#FFFFFF"); poly(onWall(0, W, 40, 44), "#FFFFFF");
    poly(onLeft(0, D, WALL, WALL + 10), "#C9A07E"); poly(onWall(0, W, WALL, WALL + 10), "#D6AF8D");

    // window wall: five panes with warm frames and light blinds
    poly(onLeft(2.9, 10.2, 50, 146), "#FFFFFF");
    const win = onLeft(3.0, 10.0, 54, 142);
    const sky = ctx.createLinearGradient(0, win[3].y, 0, win[0].y); sky.addColorStop(0, day.sky[0]); sky.addColorStop(1, day.sky[1]); poly(win, sky);
    ctx.save(); path(win); ctx.clip();
    if (day.night > 0.2) {
      for (let i = 0; i < 34; i++) { const s = up(p(0, 3.1 + ((i * 37) % 100) / 10), 96 + ((i * 53) % 44)); circle(s.x, s.y, 0.9 + (i % 3) * 0.3, `rgba(255,255,230,${0.5 + 0.5 * Math.sin(now / 700 + i)})`); }
      const m = up(p(0, 10.4), 126); circle(m.x, m.y, 7, "#FFF6C8"); circle(m.x + 3, m.y - 2, 6, day.sky[0]);
    } else {
      for (let i = 0; i < 4; i++) { const off = ((now / 80000 + i * 0.25) % 1) * 10.2, c0 = up(p(0, 2.9 + off), 118 + (i % 2) * 12);
        ellipse(c0.x, c0.y, 13, 5, "rgba(255,255,255,.92)"); ellipse(c0.x + 8, c0.y - 3, 9, 5, "rgba(255,255,255,.92)"); }
    }
    for (let i = 0; i < 30; i++) {
      const hgt = 18 + ((i * 29) % 44), y0 = 3.0 + i * 0.33;
      poly(onLeft(y0, 0.3, 54, 54 + hgt), day.night > 0.2 ? "#1A2350" : "rgba(115,150,190,.5)");
      if (day.night > 0.2) for (let k = 0; k < 3; k++) if ((i + k) % 3) { const hh = 60 + k * 9; if (hh < 54 + hgt) { const q = up(p(0, y0 + 0.1 + (k % 2) * 0.12), hh); circle(q.x, q.y, 0.9, "#FFD98A"); } }
    }
    ctx.restore();
    for (let pane = 0; pane <= 5; pane++) { const m1 = up(p(0, 3.0 + pane * 2), 54), m2 = up(p(0, 3.0 + pane * 2), 142); ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke(); }
    for (let k = 0; k < 6; k++) poly(onLeft(3.0, 10.0, 142 - k * 4.5 - 3, 142 - k * 4.5), "rgba(250,244,236,.92)");

    // back wall: logo, small task board, picture, clock, pantry sign, restroom door
    poly(onWall(0.5, 3.0, 64, 128), "#2C3E66");
    alongX(0.62, 0, 124, () => { ctx.fillStyle = "#E8A838"; ctx.font = "800 22px ui-monospace, Menlo, monospace"; ctx.fillText("JARVIS", 10, 30); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "600 8px ui-monospace, Menlo, monospace"; ctx.fillText("PERSONAL HQ", 12, 46); });
    taskBoard();
    poly(onWall(8.3, 1.2, 80, 124), "#7A553C"); poly(onWall(8.36, 1.08, 83, 121), "#A8E3D4");
    const sun = up(p(8.9, 0), 108); circle(sun.x, sun.y, 6, "#FFD166"); poly([up(p(8.4, 0), 86), up(p(8.85, 0), 100), up(p(9.4, 0), 86)], "#5BC27A");
    const ck = up(p(10.6, 0), 112); circle(ck.x, ck.y, 14, "#FFFFFF", "#7A553C"); circle(ck.x, ck.y, 1.8, "#333");
    const d = new Date(), ha = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, ma = (d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2;
    ctx.strokeStyle = "#333"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ha) * 6, ck.y - Math.cos(ha) * 6); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ma) * 10, ck.y - Math.cos(ma) * 10); ctx.stroke();
    poly(onWall(14.3, 2.6, 110, 126), "#2C3E66");
    alongX(14.45, 0, 124, () => { ctx.fillStyle = "#E8A838"; ctx.font = "800 10px ui-monospace, Menlo, monospace"; ctx.fillText("PANTRY", 8, 11); });
    poly(onWall(18.3, 1.5, 0, 114), "#FFFFFF");
    if (now < wcDoorUntil && wcDoorUntil !== Infinity) {                      // door open: a dark doorway and the door swung in
      poly(onWall(18.4, 1.3, 0, 108), "#3B3029");
      poly([up(p(18.4, 0), 0), up(p(18.4, 0.9), 0), up(p(18.4, 0.9), 108), up(p(18.4, 0), 108)], "#C08A5F", "rgba(0,0,0,.2)");
    } else {
      poly(onWall(18.4, 1.3, 0, 108), "#C08A5F");
      poly(onWall(18.55, 1.0, 60, 94), "#D39D72"); poly(onWall(18.55, 1.0, 14, 50), "#D39D72");
    }
    poly(onWall(18.7, 0.7, 96, 106), "#FFFFFF");
    alongX(18.74, 0, 106, () => { ctx.fillStyle = "#334155"; ctx.font = "800 8px ui-monospace, Menlo, monospace"; ctx.fillText("WC", 6, 8); });
    const kn = up(p(19.45, 0), 54); circle(kn.x, kn.y, 2.6, "#F2C94C");
    const occ = up(p(19.45, 0), 118), busyWc = wcBusy();
    rr(occ.x - 13, occ.y - 5, 26, 10, 5, "#1F2533"); circle(occ.x - 7, occ.y, 3, busyWc ? "#E5484D" : "#30A46C");
    ctx.fillStyle = "#FFFFFF"; ctx.font = "700 5px ui-monospace, Menlo, monospace"; ctx.fillText(busyWc ? "BUSY" : "FREE", occ.x - 2, occ.y + 2);

    // floor: warm oak planks, soft corner shade and window light
    for (let gx = 0; gx < W; gx++) for (let gy = 0; gy < D; gy++) {
      poly([p(gx, gy), p(gx + 1, gy), p(gx + 1, gy + 1), p(gx, gy + 1)], mix(gy % 2 ? "#EDBE86" : "#E6B37C", ((gx * 7 + gy * 3) % 5) * 0.012 - 0.02));
      ctx.strokeStyle = "rgba(150,95,50,.15)"; ctx.lineWidth = 1;
      const a1 = p(gx, gy + 1), a2 = p(gx + 1, gy + 1); ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
      if ((gx + gy * 2) % 3 === 0) { const b0 = p(gx + 0.5, gy), b1 = p(gx + 0.5, gy + 1); ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke(); }
    }
    soft(() => { poly([p(0, 0), p(W, 0), p(W, 0.4), p(0.4, 0.4)], "rgba(120,70,30,.2)"); poly([p(0, 0), p(0.4, 0.4), p(0.4, D), p(0, D)], "rgba(120,70,30,.2)"); }, 8);
    if (day.night < 0.2) soft(() => poly([p(0.1, 3.0), p(3.4, 3.6), p(3.4, 13.6), p(0.1, 13.0)], "rgba(255,250,225,.24)"), 6);
    // rugs: teal under Jarvis, a soft pink runner along the aisle
    poly([p(6.4, 9.2), p(12.0, 9.2), p(12.0, 13.4), p(6.4, 13.4)], "#40BFB4");
    poly([p(6.7, 9.5), p(11.7, 9.5), p(11.7, 13.1), p(6.7, 13.1)], null, "rgba(255,255,255,.9)", 2);
    for (let i = 0; i < 7; i++) { const q = p(6.9 + i * 0.78, 13.28); circle(q.x, q.y, 2.5, "#FFD166"); }
    poly([p(AISLE_X - 0.45, 1.8), p(AISLE_X + 0.45, 1.8), p(AISLE_X + 0.45, 8.6), p(AISLE_X - 0.45, 8.6)], "rgba(246,166,193,.55)");
  }

  // Small v1-size board: a title, three columns with counts and coloured notes. Click for the tasks.
  function taskBoard() {
    const B = state?.board || { todo: [], doing: [], done: [] };
    const x0 = 4.1, gw = 3.3, h0 = 62, h1 = 128;
    poly(onWall(x0 - 0.05, gw + 0.1, h0 - 4, h1 + 4), "#C3CCD6"); poly(onWall(x0, gw, h0, h1), "#FFFFFF");
    alongX(x0, 0, h1, (len) => {
      const width = gw * len, colW = width / 3;
      ctx.fillStyle = "#334155"; ctx.font = "800 7.5px ui-monospace, Menlo, monospace"; ctx.fillText("TASKS", 6, 11);
      [["TO DO", B.todo, "#FFD166"], ["DOING", B.doing, "#7CC8FF"], ["DONE", B.done, "#7BE0AD"]].forEach(([name, list, color], i) => {
        const cx = i * colW;
        ctx.fillStyle = "#64748B"; ctx.font = "700 5.6px ui-monospace, Menlo, monospace"; ctx.fillText(`${name} ${list.length}`, cx + 5, 22);
        const n = Math.min(list.length, 6);
        for (let k = 0; k < n; k++) { const col = k % 2, row = Math.floor(k / 2); ctx.save(); ctx.translate(cx + 5 + col * 14, 26 + row * 11); ctx.rotate(((k + i) % 3 - 1) * 0.04); rr(0, 0, 12, 9, 1.5, color); ctx.restore(); }
      });
    });
    const s1 = up(p(x0 + 0.2, 0), h0 - 4), s2 = up(p(x0 + gw - 0.2, 0), h0 - 4); ctx.strokeStyle = "#AAB4BE"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
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
  // A mug big enough to read when someone carries it (size 1 on desks, bigger in hand).
  function bigMug(x, y) { ctx.save(); ctx.translate(x, y); ctx.scale(1.8, 1.8); ctx.translate(-x, -y); mug(x, y, "#FF8A3D", true); ctx.restore(); }
  function mug(x, y, color, steam) {
    rr(x - 4, y - 9, 8, 9, 2, color, "rgba(0,0,0,.25)"); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 5, y - 5, 2.5, -1.2, 1.2); ctx.stroke();
    if (steam) { ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.4; for (let i = 0; i < 2; i++) { const o = Math.sin(now / 300 + i) * 2; ctx.beginPath(); ctx.moveTo(x - 1 + i * 3, y - 11); ctx.quadraticCurveTo(x + o + i * 3, y - 16, x - 1 + i * 3, y - 21); ctx.stroke(); } }
  }
  function smallPlant(x, y, pot) {
    rr(x - 5, y - 8, 10, 8, 2, pot); ellipse(x, y - 8, 5, 1.8, mix(pot, -0.25));
    for (const [dx, dy, r, c] of [[-4, -13, 4.5, "#4CAF6A"], [4, -14, 4.5, "#3F9E5C"], [0, -18, 5, "#5BC27A"]]) circle(x + dx, y + dy, r, c);
  }
  function books(x, y, colors) { colors.forEach((c, i) => rr(x - 9 + (i % 2) * 2, y - 4 - i * 4, 18 - (i % 2) * 4, 4, 1, c, "rgba(0,0,0,.18)")); }
  function chair(x, y, color) {
    ellipse(x, y + 2, 13, 4, "rgba(60,35,20,.22)");
    for (const a of [0, 1.26, 2.51, 3.77, 5.03]) circle(x + Math.cos(a) * 10, y + Math.sin(a) * 3.5, 1.8, "#4A3C34");
    rr(x - 2, y - 14, 4, 14, 2, "#6B5A50");
    rr(x - 13, y - 22, 26, 8, 4, mix(color, -0.1));
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0); g.addColorStop(0, mix(color, 0.15)); g.addColorStop(1, mix(color, -0.2));
    rr(x - 13, y - 54, 26, 34, 10, g, "rgba(0,0,0,.2)"); rr(x - 8, y - 49, 16, 3, 1.5, "rgba(255,255,255,.3)");
  }
  function plant(gx, gy, big) {
    const s = big ? 1.4 : 1;
    shadow(gx, gy, 0.6, 0.6, 0.1, 0.16);
    box(gx, gy, 0.6, 0.6, 16 * s, "#E07A5F");
    const t = up(p(gx + 0.3, gy + 0.3), 16 * s), sway = Math.sin(now / 1400 + gx) * 1.5;
    for (const [dx, dy, r, c] of [[0, -30, 12, "#3F9E5C"], [-12, -22, 10, "#4CAF6A"], [12, -20, 10, "#3F9E5C"], [-6, -40, 10, "#5BC27A"], [7, -36, 11, "#4CAF6A"], [0, -14, 9, "#5BC27A"]]) ellipse(t.x + dx * s + sway * (dy / -40), t.y + dy * s, r * s, r * s * 0.62, c, dx * 0.04);
  }
  function bookshelf(gx, gy) {
    shadow(gx, gy, 0.7, 2.3, 0.1, 0.18);
    box(gx, gy, 0.7, 2.3, 120, "#C39468");
    const colors = ["#E76F51", "#2A9D8F", "#E9C46A", "#264653", "#F4A261", "#8AB17D", "#C9A7FF", "#FF8FB1"];
    for (let r = 0; r < 4; r++) {
      const s0 = up(p(gx + 0.7, gy), 18 + r * 26), s1 = up(p(gx + 0.7, gy + 2.3), 18 + r * 26);
      ctx.strokeStyle = "#8B6340"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      for (let i = 0; i < 8; i++) { if ((i + r) % 5 === 4) continue; const y0 = gy + 0.15 + i * 0.26, h = 14 + ((i * 5 + r * 3) % 7);
        poly([up(p(gx + 0.7, y0), 20 + r * 26), up(p(gx + 0.7, y0), 20 + r * 26 + h), up(p(gx + 0.7, y0 + 0.2), 20 + r * 26 + h), up(p(gx + 0.7, y0 + 0.2), 20 + r * 26)], colors[(i * 3 + r) % colors.length]); }
    }
  }
  function pantry(gx, gy) {
    shadow(gx, gy, 2.2, 0.75, 0.1, 0.16);
    box(gx, gy, 2.2, 0.75, 36, "#FFFFFF"); box(gx, gy, 2.2, 0.75, 3, "#E6C9A8", 36);
    const m = up(p(gx + 0.4, gy + 0.32), 39); rr(m.x - 11, m.y - 26, 22, 26, 4, "#E26D6D"); rr(m.x - 7, m.y - 22, 14, 7, 2, "#2B3240"); circle(m.x + 4, m.y - 19, 1.5, "#6FE3C1");
    const c2 = up(p(gx + 0.85, gy + 0.5), 39); mug(c2.x, c2.y, "#FFD166", true);
    const c3 = up(p(gx + 1.05, gy + 0.35), 39); mug(c3.x, c3.y, "#FFFFFF", false);
    const bowl = up(p(gx + 1.55, gy + 0.4), 39); ellipse(bowl.x, bowl.y - 2, 9, 4, "#F4A261"); circle(bowl.x - 3, bowl.y - 5, 3, "#E63946"); circle(bowl.x + 3, bowl.y - 5, 3, "#FFD166");
    const fr = gx + 2.3; shadow(fr, gy, 0.8, 0.75, 0.08, 0.14); box(fr, gy, 0.8, 0.75, 88, "#F4F6F8");
    const h1 = up(p(fr + 0.8, gy + 0.2), 72), h2 = up(p(fr + 0.8, gy + 0.2), 46); ctx.strokeStyle = "#AAB4BE"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
  }
  function cooler(gx, gy) {
    shadow(gx, gy, 0.7, 0.7, 0.1, 0.16); box(gx, gy, 0.7, 0.7, 46, "#F1F4F8");
    const t = up(p(gx + 0.35, gy + 0.35), 46), g = ctx.createLinearGradient(t.x - 10, 0, t.x + 10, 0);
    g.addColorStop(0, "#7CC8FF"); g.addColorStop(0.5, "#C4EAFF"); g.addColorStop(1, "#5BB4F0"); rr(t.x - 10, t.y - 30, 20, 30, 8, g);
  }
  function printer(gx, gy) {
    shadow(gx, gy, 0.9, 0.7, 0.1, 0.16); box(gx, gy, 0.9, 0.7, 30, "#8C98A6"); box(gx + 0.05, gy + 0.05, 0.8, 0.6, 16, "#EEF1F5", 30);
    const l = up(p(gx + 0.8, gy + 0.6), 40); circle(l.x, l.y, 1.8, Math.floor(now / 600) % 2 ? "#2FB36B" : "#9BE39B");
  }
  function brain(gx, gy, active) {
    shadow(gx, gy, 1, 1, 0.15, 0.2);
    box(gx + 0.1, gy + 0.1, 0.8, 0.8, 22, "#5E6B85"); box(gx + 0.18, gy + 0.18, 0.64, 0.64, 4, "#7FE6FF", 22, { top: "#A6F3FF" });
    const c = up(p(gx + 0.5, gy + 0.5), 62 + Math.sin(now / 600) * 3);
    soft(() => circle(c.x, c.y, 30, active ? "rgba(120,255,220,.55)" : "rgba(110,210,255,.45)"), 10);
    const g = ctx.createRadialGradient(c.x - 6, c.y - 6, 2, c.x, c.y, 18); g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.35, active ? "#9CFFE0" : "#A8E8FF"); g.addColorStop(1, active ? "#2FC6A0" : "#3A9BDB");
    circle(c.x, c.y, 17, g);
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(c.x, c.y, 27, 9, (now / (i ? 1300 : -1700)) % (Math.PI * 2), 0, Math.PI * 2); ctx.stroke(); }
  }
  function meetingTable(gx, gy, w, d) {
    shadow(gx, gy, w, d, 0.2, 0.16);
    for (const [lx, ly] of [[gx + 0.35, gy + d / 2], [gx + w - 0.35, gy + d / 2]]) box(lx - 0.08, ly - 0.08, 0.16, 0.16, 26, "#7A553C");
    box(gx, gy, w, d, 5, "#C9955F", 26);
    const lap = up(p(gx + 0.9, gy + 0.7), 31); rr(lap.x - 9, lap.y - 12, 18, 12, 2, "#8C98A6"); rr(lap.x - 8, lap.y - 11, 16, 10, 2, "#CFE8FF");
    const pad = up(p(gx + 2.1, gy + 0.9), 31); rr(pad.x - 6, pad.y - 3, 12, 4, 1, "#FFD166");
  }
  function meetingChairs(gx, gy, w, d, front) {
    const seats = [[gx + 0.7, gy - 0.3], [gx + w / 2, gy - 0.3], [gx + w - 0.7, gy - 0.3], [gx - 0.35, gy + d / 2], [gx + 0.7, gy + d + 0.3], [gx + w / 2, gy + d + 0.3], [gx + w - 0.7, gy + d + 0.3], [gx + w + 0.35, gy + d / 2]];
    seats.filter(([, y]) => (front ? y > gy + d / 2 : y <= gy + d / 2)).forEach(([x, y]) => { const q = p(x, y); chair(q.x, q.y + 6, "#8B6B8E"); });
  }
  function tv(gx, gy) {
    const b = p(gx, gy); rr(b.x - 2, b.y - 60, 4, 60, 2, "#5B6472"); ellipse(b.x, b.y, 12, 4, "#5B6472");
    rr(b.x - 34, b.y - 100, 68, 42, 4, "#1F2533");
    const g = ctx.createLinearGradient(b.x - 32, 0, b.x + 32, 0); g.addColorStop(0, "#1D3B5C"); g.addColorStop(1, "#244E78"); rr(b.x - 32, b.y - 98, 64, 38, 3, g);
    const o = state?.ops?.cost;
    ctx.fillStyle = "#9FE8FF"; ctx.font = "700 7px ui-monospace, Menlo, monospace"; ctx.fillText("TODAY", b.x - 28, b.y - 88);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "800 12px ui-monospace, Menlo, monospace"; ctx.fillText(o ? `$${o.today.toFixed(2)}` : "—", b.x - 28, b.y - 75);
    const days = o?.days?.slice(-7) || [], mx = Math.max(0.01, ...days.map((x) => x.cost));
    days.forEach((dd, i) => rr(b.x + 6 + i * 3.6, b.y - 64 - (dd.cost / mx) * 26, 2.6, (dd.cost / mx) * 26 + 1, 1, "#4FD1FF"));
  }

  // ---------- desks ----------
  const DECO = {
    librarian: (top) => { const b = top(0.9, 0.32); books(b.x, b.y, ["#E76F51", "#2A9D8F", "#E9C46A", "#264653"]); },
    researcher: (top) => { const g = top(0.9, 0.28); rr(g.x - 1.5, g.y - 14, 3, 14, 1, "#8B6B4A"); ellipse(g.x, g.y, 7, 2.5, "#8B6B4A"); circle(g.x, g.y - 21, 9, "#4DA3E0"); circle(g.x - 3, g.y - 22, 4.5, "#6CC56C"); },
    critic: (top) => { const c0 = top(0.9, 0.32); rr(c0.x - 5, c0.y - 10, 10, 10, 2, "#E26D6D"); rr(c0.x - 3, c0.y - 18, 2, 9, 1, "#333"); rr(c0.x + 1, c0.y - 16, 2, 7, 1, "#E63946"); },
    creative: (top) => { const vs = top(0.93, 0.22); rr(vs.x - 4, vs.y - 12, 8, 12, 3, "#7CC8FF"); ctx.strokeStyle = "#3F9E5C"; ctx.lineWidth = 1.4;
                         for (const [dx, cc] of [[-5, "#FF8FB1"], [0, "#FFD166"], [5, "#FF6B6B"]]) { ctx.beginPath(); ctx.moveTo(vs.x, vs.y - 12); ctx.lineTo(vs.x + dx, vs.y - 18); ctx.stroke(); circle(vs.x + dx, vs.y - 19, 3.2, cc); } },
  };
  function seatDesk(seat, i, occupant, mode) {
    const [gx, gy, w, d] = seat.seg, H = 30, working = mode === "working", first = i === 0 || SEATS[i - 1]?.row !== seat.row || seat.kind === "L";
    const last = seat.kind === "L" || SEATS[i + 1]?.row !== seat.row;
    shadow(gx, gy, w, d, 0.1, 0.16);
    // legs only at the ends of a bench; the top runs continuously across the segments
    if (first) box(gx + 0.04, gy + d - 0.12, 0.08, 0.08, H - 6, "#FFFFFF");
    if (last) { box(gx + w - 0.12, gy + d - 0.12, 0.08, 0.08, H - 6, "#FFFFFF"); box(gx + w - 0.12, gy + 0.04, 0.08, 0.08, H - 6, "#FFFFFF"); }
    box(gx, gy, w, d, 6, "#E7C8A0", H - 6, { noRight: !last });
    if (seat.side) { const [sx, sy, sw, sd] = seat.side; box(sx + sw - 0.12, sy + sd - 0.12, 0.08, 0.08, H - 6, "#FFFFFF"); box(sx, sy - 0.02, sw, sd + 0.02, 6, "#E7C8A0", H - 6); const pl = up(p(sx + sw * 0.5, sy + sd * 0.7), H); smallPlant(pl.x, pl.y, "#FFFFFF"); }
    // low divider between neighbours on a bench, in the occupant's colour
    const accent = occupant ? (ACCENT[occupant.type] || occupant.shirt) : "#D9C2A5";
    if (seat.kind === "bench" && !first) box(gx - 0.03, gy + 0.05, 0.06, d - 0.15, 18, "#EBD9C3", H);
    const top = (fx, fy) => up(p(gx + w * fx, gy + d * fy), H);
    monitor(gx + w * 0.24, gy + d * 0.34, H, working, TINT[occupant?.type] || "#8FE3C8");
    poly([top(0.5, 0.56), top(0.7, 0.56), top(0.7, 0.76), top(0.5, 0.76)], "#FFFFFF", "rgba(0,0,0,.2)");
    if (occupant) {
      const m = top(0.86, 0.72), act = actors[occupant.id];
      if (act && now < act.mugUntil && act.phase === "desk" && now > act.sipUntil) bigMug(m.x, m.y); else mug(m.x, m.y, accent, false);
      DECO[occupant.type]?.(top);
      alongX(gx + w * 0.08, gy + d, H - 9, () => {                 // nameplate on the front edge
        rr(0, -8, 46, 9.5, 2.5, "#FFFFFF", "rgba(0,0,0,.2)"); rr(0, -8, 3.5, 9.5, 2, accent);
        ctx.fillStyle = "#334155"; ctx.font = "700 5.6px ui-monospace, Menlo, monospace"; ctx.fillText(occupant.label.slice(0, 11).toUpperCase(), 6, -1.5);
      });
    }
  }
  function jarvisDesk(mode) {
    const [gx, gy, w, d] = JARVIS_DESK, H = 30, working = mode === "working";
    shadow(gx, gy, w, d);
    box(gx + 0.05, gy + 0.08, w - 0.1, d - 0.12, H - 6, "#6E4A32");
    box(gx, gy, w, d, 6, "#8A5A3B", H - 6);
    const top = (fx, fy) => up(p(gx + w * fx, gy + d * fy), H);
    monitor(gx + w * 0.12, gy + d * 0.36, H, working, TINT.jarvis, true); monitor(gx + w * 0.33, gy + d * 0.3, H, working, TINT.jarvis, true);
    poly([top(0.52, 0.56), top(0.72, 0.56), top(0.72, 0.76), top(0.52, 0.76)], "#FFFFFF", "rgba(0,0,0,.2)");
    const l = top(0.03, 0.2); rr(l.x - 2, l.y - 28, 4, 28, 2, "#C9A13B"); ellipse(l.x + 7, l.y - 30, 11, 5, "#E8C766");
    if (daylight().night > 0.05) soft(() => ellipse(l.x + 9, l.y - 6, 30, 11, "rgba(255,220,120,.5)"), 10);
    const m = top(0.88, 0.5); mug(m.x, m.y, "#FFFFFF", working); const pl = top(0.96, 0.18); smallPlant(pl.x, pl.y, "#2C3E66");
    alongX(gx + w * 0.62, gy + d, H - 9, () => { rr(0, -8, 40, 9.5, 2.5, "#1F2B45", "rgba(0,0,0,.2)"); rr(0, -8, 3.5, 9.5, 2, "#E8A838"); ctx.fillStyle = "#E8A838"; ctx.font = "700 5.8px ui-monospace, Menlo, monospace"; ctx.fillText("JARVIS", 6, -1.5); });
  }

  // ---------- chibi people ----------
  function person(x, y, look, pose, id) {
    ctx.save(); ctx.translate(x, y); ctx.scale(P_SCALE, P_SCALE); ctx.translate(-x, -y);
    const T = now / 1000, seat = pose.startsWith("sit"), outline = "rgba(40,25,20,.38)";
    const walking = pose.startsWith("walk"), back = pose.includes("back"), coffee = pose.endsWith("coffee");
    const bob = pose === "sit-type" ? Math.sin(T * 14) * 0.6 : pose === "stretch" ? -2 - Math.sin(T * 3) * 1.5 : walking ? Math.abs(Math.sin(T * 11)) * -1.5 : Math.sin(T * 2 + x) * 0.6;
    const by = y + bob;
    if (!seat) {
      soft(() => ellipse(x, y + 1, 15, 5, "rgba(50,30,20,.3)"), 3);
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
    else if (pose === "sip" || pose === "sit-sip") hands = [[x - 15, bodyTop + 24], [x + 4, bodyTop - 5]];
    else if (pose === "sit-type") hands = [[x - 9 + Math.sin(T * 16) * 2, bodyTop + 27], [x + 9 + Math.sin(T * 16 + 2) * 2, bodyTop + 27]];
    else if (pose === "sit-think") hands = [[x - 10, bodyTop + 25], [x + 3, bodyTop - 3]];
    else if (walking) { const sw = Math.sin(T * 11) * 5; hands = [[x - 15, bodyTop + 23 + sw], coffee ? [x + 13, bodyTop + 12] : [x + 15, bodyTop + 23 - sw]]; }
    else hands = [[x - 15, bodyTop + 24], [x + 15, bodyTop + 24]];
    const behind = pose === "stretch" || pose === "wave" || back;
    if (behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); if (coffee && back) bigMug(hands[1][0] + 3, hands[1][1] + 4); }
    const sg = ctx.createLinearGradient(x - 14, 0, x + 14, 0); sg.addColorStop(0, mix(look.shirt, 0.2)); sg.addColorStop(1, mix(look.shirt, -0.18));
    rr(x - 14, bodyTop, 28, 30, 11, sg, outline);
    if (!back) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.moveTo(x - 5, bodyTop + 1); ctx.lineTo(x, bodyTop + 7); ctx.lineTo(x + 5, bodyTop + 1); ctx.fill(); }
    if (look.tie && !back) { ctx.fillStyle = look.tie; ctx.beginPath(); ctx.moveTo(x - 2.5, bodyTop + 6); ctx.lineTo(x + 2.5, bodyTop + 6); ctx.lineTo(x + 3.5, bodyTop + 20); ctx.lineTo(x, bodyTop + 24); ctx.lineTo(x - 3.5, bodyTop + 20); ctx.fill(); }
    if (!behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); if (pose === "sip" || pose === "sit-sip" || coffee) bigMug(hands[1][0] + 4, hands[1][1] + 8); }
    const tilt = pose === "sit-think" ? 0.14 : pose === "look" ? Math.sin(T * 1.3) * 0.2 : pose === "stretch" ? -0.08 : 0;
    const hx = x + tilt * 16, hy = bodyTop - 16;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt * 0.6);
    if (look.style === "long") rr(-19, -16, 38, 40, 14, mix(look.hair, -0.12));
    if (look.style === "bun") circle(0, -24, 8, look.hair, outline);
    const sk = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22); sk.addColorStop(0, mix(look.skin, 0.22)); sk.addColorStop(1, mix(look.skin, -0.1));
    circle(0, 0, 18, sk, outline);
    if (back) { circle(0, -1, 18.5, look.hair); ellipse(-5, -10, 7, 3, "rgba(255,255,255,.18)", -0.4); ctx.restore(); ctx.restore(); return { hx: x + (hx - x) * P_SCALE, hy: y + (hy - y) * P_SCALE }; }
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

  // ---------- who is where ----------
  // The four sub-agents keep their seats; other agents (and future ones) take the free seats in order.
  function occupants() {
    const out = [];
    const taken = new Set();
    SEATS.forEach((seat, i) => {
      if (!seat.owner) return;
      const s = state?.desks.find((x) => x.type === seat.owner)?.latest || null;
      out.push({ i, id: seat.owner, type: seat.owner, label: seat.owner, s, look: LOOKS[seat.owner] }); taken.add(i);
    });
    const free = SEATS.map((_, i) => i).filter((i) => !taken.has(i));
    (state?.visitors || []).slice(0, free.length).forEach((v, k) => out.push({ i: free[k], id: v.id, type: v.type, label: v.type, s: v, look: lookFor(v.id, v.type, k), shirt: SHIRTS[k % 6] }));
    return out;
  }
  const needsYou = (id) => (state?.permissions || []).some((q) => id === "jarvis" ? !q.agent : q.agent === id || q.agentId === id);
  function modeOf(id, s) {
    if (needsYou(id) || (id === "jarvis" && (state?.question || state?.screen?.asking))) return "asking";
    if (id === "jarvis") return !s || s.state === "offline" ? "idle" : s.state === "working" ? "working" : "waiting";
    if (!s) return "idle";
    if (s.state === "working") return "working";
    return Date.now() - (s.updated || 0) < 10 * 60 * 1000 ? "done" : "idle";
  }
  const seatG = (i) => { const [gx, gy, w] = SEATS[i].seg; return [gx + w * 0.62, gy - 0.22]; };
  const behindG = (i) => { const [gx, gy, w] = SEATS[i].seg; return [gx + w * 0.62, gy - 0.62]; };
  const JARVIS_SEAT = [JARVIS_DESK[0] + JARVIS_DESK[2] * 0.66, JARVIS_DESK[1] - 0.2];
  const JARVIS_STAND = [JARVIS_DESK[0] + JARVIS_DESK[2] * 0.55, JARVIS_DESK[1] + JARVIS_DESK[3] + 0.5];

  const FAST = /[?&]fast\b/.test(location.search) ? 8 : 1;          // ?fast speeds up idle life, for demos
  const rnd = (id, n) => { let h = 7; for (const ch of id + ":" + n) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((h >>> 0) % 10000) / 10000; };
  function routeTo(from, place) {
    const out = [[from[0], from[1]]];
    if (from[0] < AISLE_X - 0.3) out.push([AISLE_X, from[1]]);
    return [...out.slice(1), ...PLACES[place].via, PLACES[place].at];
  }
  function stepActor(id, standG, mode, dt, canTrip) {
    const a = actors[id] ||= { phase: "desk", n: 0, until: now + (20000 + rnd(id, 0) * 60000) / FAST, stretchUntil: 0, pos: null, route: [], place: null, coffee: false, mugUntil: 0, sipUntil: 0, nextSip: 0 };
    const busy = mode === "working" || mode === "asking";
    if (a.phase === "desk") {
      if (busy || now < a.until) return a;
      a.n++; const r = rnd(id, a.n);
      // One decision a minute or so: a trip about every 5 minutes (pantry ~8 min, restroom ~15 min), a stretch
      // now and then, otherwise stay put. No second coffee while the first one is still on the desk.
      const wantsCoffee = r < 0.14 && now > a.mugUntil;
      if (canTrip && (wantsCoffee || (r >= 0.14 && r < 0.22))) { a.place = wantsCoffee ? "pantry" : "wc"; a.phase = "out"; a.pos = [...standG]; a.route = routeTo(standG, a.place); a.coffee = false; if (a.place === "wc") wcDoorUntil = Infinity; }
      else if (r >= 0.22 && r < (canTrip ? 0.34 : 0.3)) { a.stretchUntil = now + 3000; a.until = now + 3000 + (45000 + rnd(id, a.n + 1) * 45000) / FAST; }
      else a.until = now + (45000 + rnd(id, a.n + 2) * 45000) / FAST;
      return a;
    }
    if (a.phase === "at") {
      if (busy || now > a.stayUntil) { if (a.place === "wc") wcDoorUntil = now + 1400; a.phase = "back"; a.coffee = a.place === "pantry"; a.route = routeTo(standG, a.place).reverse().slice(1).concat([standG]); }
      return a;
    }
    if (busy && a.phase === "out") { a.phase = "back"; a.route = [[a.pos[0], standG[1]], standG]; }
    let step = (busy ? 2.6 : 1.3) * dt / 1000;
    while (step > 0 && a.route.length) {
      const [tx, ty] = a.route[0], dx = tx - a.pos[0], dy = ty - a.pos[1], dist = Math.hypot(dx, dy);
      if (dist <= step) { a.pos = [tx, ty]; a.route.shift(); step -= dist; }
      else { a.pos = [a.pos[0] + (dx / dist) * step, a.pos[1] + (dy / dist) * step]; a.dir = dx + dy; step = 0; }
    }
    if (!a.route.length) {
      if (a.phase === "out") { a.phase = "at"; a.stayUntil = now + (a.place === "wc" ? 9000 : 6000) / Math.min(FAST, 2); if (a.place === "wc") wcDoorUntil = now + 1400; }
      else {
        if (a.coffee) { a.mugUntil = now + 8 * 60000 / FAST; a.nextSip = now + 4000; }      // the mug goes on the desk
        a.phase = "desk"; a.coffee = false; a.until = now + (45000 + rnd(id, a.n + 3) * 45000) / FAST;
      }
    }
    return a;
  }
  let wcDoorUntil = 0;
  function wcBusy() { return Object.values(actors).some((a) => a.phase === "at" && a.place === "wc"); }
  function placement(a, mode, doing, seat, stand) {
    if (mode === "working") return { g: seat, pose: /thinking/.test(doing || "") ? "sit-think" : "sit-type" };
    if (a.phase !== "desk") {
      if (a.phase === "at") return a.place === "wc" ? { hidden: true } : { g: a.pos, pose: "sip" };
      return { g: a.pos, pose: (a.dir < 0 ? "walk-back" : "walk") + (a.coffee ? "-coffee" : "") };
    }
    if (mode === "asking") return { g: stand, pose: "wave" };
    if (now < a.stretchUntil) return { g: stand, pose: "stretch" };
    if (now < a.mugUntil) {
      if (now > a.nextSip) { a.sipUntil = now + 2500; a.nextSip = now + (25000 + rnd("sip" + a.n, Math.floor(now / 1000)) * 25000) / FAST; }
      if (now < a.sipUntil) return { g: seat, pose: "sit-sip" };
    }
    return { g: seat, pose: "sit" };
  }

  // ---------- frame ----------
  function draw() {
    if (!ctx) return;
    now = performance.now() - t0 + 1e6;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    const day = daylight();
    room(day);
    bookshelf(0.04, 0.3);
    plant(0.35, 13.2, true);
    const items = [
      { depth: 20.5, fn: () => plant(19.2, 0.4) },
      { depth: 33.0, fn: () => plant(19.2, 13.0, true) },
      { depth: 16.4, fn: () => pantry(14.3, 0.15) },
      { depth: 24.0, fn: () => cooler(19.2, 4.4) },
      { depth: 25.6, fn: () => printer(19.0, 6.0) },
      { depth: 22.9, fn: () => brain(12.3, 10.2, state?.desks?.find((d) => d.type === "librarian")?.latest?.state === "working") },
      { depth: 23.4, fn: () => meetingChairs(14.3, 9.2, 3.4, 1.6, false) },
      { depth: 24.5, fn: () => meetingTable(14.3, 9.2, 3.4, 1.6) },
      { depth: 26.5, fn: () => meetingChairs(14.3, 9.2, 3.4, 1.6, true) },
      { depth: 28.0, fn: () => tv(19.0, 9.6) },
      { depth: 17.5, fn: () => plant(12.0, 5.2) },
    ];
    const dt = Math.min(100, lastFrame ? now - lastFrame : 16); lastFrame = now;
    const occ = occupants(), byIndex = Object.fromEntries(occ.map((o) => [o.i, o]));
    SEATS.forEach((seat, i) => {
      const o = byIndex[i], [gx, gy, w, d] = seat.seg, sg = seatG(i), sq = p(...sg);
      items.push({ depth: sg[0] + sg[1] - 0.05, fn: () => chair(sq.x, sq.y + 10, o ? mix(ACCENT[o.type] || o.shirt || "#8B6B5A", -0.25) : "#8B6B5A") });
      const mode = o ? modeOf(o.id, o.s) : "idle";
      items.push({ depth: gx + w / 2 + gy + d / 2 + (seat.side ? 0.4 : 0), fn: () => seatDesk(seat, i, o, mode) });
      if (!o) return;
      const a = stepActor(o.id, behindG(i), mode, dt, true);
      const pl = placement(a, mode, o.s?.doing, sg, behindG(i));
      if (pl.hidden) { heads[o.id] = null; return; }
      const q = p(...pl.g), sit = pl.pose.startsWith("sit");
      items.push({ depth: pl.g[0] + pl.g[1], fn: () => { heads[o.id] = person(q.x, q.y + (sit ? 6 : 0), o.look, pl.pose, o.id); } });
    });
    // Jarvis
    const js = state?.main, jm = modeOf("jarvis", js), ja = stepActor("jarvis", JARVIS_STAND, jm, dt, false), jp = placement(ja, jm, js?.doing, JARVIS_SEAT, JARVIS_STAND);
    const jseat = p(...JARVIS_SEAT);
    items.push({ depth: JARVIS_SEAT[0] + JARVIS_SEAT[1] - 0.05, fn: () => chair(jseat.x, jseat.y + 10, "#3A2A20") });
    items.push({ depth: JARVIS_DESK[0] + JARVIS_DESK[2] / 2 + JARVIS_DESK[1] + JARVIS_DESK[3] / 2, fn: () => jarvisDesk(jm) });
    if (!jp.hidden) { const q = p(...jp.g), sit = jp.pose.startsWith("sit"); items.push({ depth: jp.g[0] + jp.g[1], fn: () => { heads.jarvis = person(q.x, q.y + (sit ? 6 : 0), LOOKS.jarvis, jp.pose, "jarvis"); } }); }
    items.sort((a, b) => a.depth - b.depth).forEach((it) => it.fn());
    if (day.night) {
      ctx.fillStyle = `rgba(20,24,60,${day.night})`; ctx.fillRect(0, 0, CW, CH);
      for (const [gx, gy] of [[4, 3.6], [9, 3.6], [15, 4.5], [4, 7.4], [9, 7.4], [9.2, 11.6], [15.8, 10.2]]) {
        const q = p(gx, gy), g = ctx.createRadialGradient(q.x, q.y - 40, 5, q.x, q.y, 150);
        g.addColorStop(0, `rgba(255,214,150,${day.warm + 0.06})`); g.addColorStop(1, "rgba(255,214,150,0)"); ctx.fillStyle = g; ctx.fillRect(q.x - 160, q.y - 190, 320, 300);
      }
    }
    placeBubbles();
  }

  // ---------- labels & clicks ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function labels() {
    if (!overlay || !state) return;
    const out = [];
    const add = (id, name, g, mode, doing) => {
      const a = p(...g), bubble = mode === "working" ? (doing || "working…") : mode === "asking" ? "needs your OK!" : mode === "waiting" ? "waiting for you…" : mode === "done" ? "done ✓" : "";
      out.push(`<button class="po-hit ${selected === id ? "sel" : ""}" data-id="${esc(id)}" aria-label="${esc(name)}" style="left:${(a.x - 28) * scale}px;top:${(a.y - 84) * scale}px;width:${56 * scale}px;height:${106 * scale}px"><span class="po-name m-${mode}">${esc(name)}</span></button>`
        + (bubble ? `<span class="po-bubble m-${mode}" data-b="${esc(id)}">${esc(bubble)}</span>` : ""));
    };
    for (const o of occupants()) add(o.id, o.label[0].toUpperCase() + o.label.slice(1), seatG(o.i), modeOf(o.id, o.s), o.s?.doing);
    add("jarvis", "Jarvis · main session", JARVIS_SEAT, modeOf("jarvis", state.main), state.main?.doing);
    const b = p(12.8, 10.7);
    out.push(`<button class="po-hit ${selected === "brain" ? "sel" : ""}" data-id="brain" aria-label="The Brain" style="left:${(b.x - 30) * scale}px;top:${(b.y - 90) * scale}px;width:${60 * scale}px;height:${94 * scale}px"><span class="po-name">The Brain · your vault</span></button>`);
    const k0 = up(p(4.1, 0), 128), k1 = up(p(7.4, 0), 62);
    out.push(`<button class="po-hit po-board ${selected === "board" ? "sel" : ""}" data-id="board" aria-label="Task board" style="left:${k0.x * scale}px;top:${k0.y * scale}px;width:${(k1.x - k0.x) * scale}px;height:${(k1.y - k0.y) * scale}px"><span class="po-name">Task board · click to open</span></button>`);
    overlay.innerHTML = out.join("");
    for (const k in bubbles) delete bubbles[k];
    overlay.querySelectorAll("[data-b]").forEach((el) => (bubbles[el.dataset.b] = el));
    placeBubbles();
  }
  function placeBubbles() {
    for (const [id, el] of Object.entries(bubbles)) {
      const h = heads[id]; el.style.display = h ? "" : "none"; if (!h) continue;
      el.style.left = `${h.hx * scale}px`; el.style.top = `${(h.hy - 22) * scale}px`;
    }
  }

  function fit() {
    const avail = Math.min(host.clientWidth, (window.innerHeight - 140) * CW / CH);
    scale = Math.max(0.35, avail / CW);
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
