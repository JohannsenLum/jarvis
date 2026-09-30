// Jarvis Office: a cosy isometric office ("3D in 2D"), drawn in code with no image assets.
// Smooth shapes, soft light and shadows, chibi agents who type when working, think with a hand on the
// chin, and stand up to stretch, sip coffee or look around when idle.
// API: PixelOffice.mount(el, onSelect) · PixelOffice.update(state, selected)
(() => {
  const W = 10, D = 8, TW = 64, TH = 32, WALL = 150;
  const CW = 660, CH = 540;
  const OX = 40 + D * TW / 2, OY = WALL + 56;
  const p = (gx, gy) => ({ x: OX + (gx - gy) * TW / 2, y: OY + (gx + gy) * TH / 2 });
  const up = (q, h) => ({ x: q.x, y: q.y - h });

  // Desks (grid x, y, width, depth), looks and desk themes.
  const CAST = {
    jarvis:     { desk: [3.6, 5.6, 2.8, 1.25], top: "#8A5A3B", theme: "jarvis",
                  look: { hair: "#2E2522", shirt: "#2C3E66", pants: "#27324A", skin: "#F1C09A", style: "short", tie: "#E8A838" } },
    librarian:  { desk: [1.1, 1.6, 2.1, 1.05], top: "#9CCB8A", theme: "librarian",
                  look: { hair: "#9A5A34", shirt: "#6FB08A", pants: "#445066", skin: "#F7D2B0", style: "bun" } },
    researcher: { desk: [6.6, 1.6, 2.1, 1.05], top: "#8EC9F0", theme: "researcher",
                  look: { hair: "#22222A", shirt: "#4D8FE0", pants: "#39465C", skin: "#D59A6E", style: "short", glasses: true } },
    critic:     { desk: [0.8, 5.2, 2.1, 1.05], top: "#C4B2F0", theme: "critic",
                  look: { hair: "#C9C4BE", shirt: "#8A5BC7", pants: "#3A3448", skin: "#F4CBA8", style: "side", glasses: true } },
    creative:   { desk: [7.0, 5.2, 2.1, 1.05], top: "#FFB99A", theme: "creative",
                  look: { hair: "#E8613F", shirt: "#FFC24D", pants: "#46506A", skin: "#FAD8BC", style: "long" } },
  };
  const VISITOR_SPOTS = [[8.8, 3.3], [9.4, 3.9], [8.2, 3.9], [9.4, 4.7], [8.8, 4.5], [8.2, 4.7]];
  const VISITOR_SHIRTS = ["#45B7A8", "#E26D8A", "#7A72D8", "#D9A441", "#4F9AD8", "#E58A4E"];

  let host, canvas, ctx, overlay, onSelect, state = null, selected = "jarvis", dpr = 1, scale = 1;
  const t0 = performance.now();
  let now = 0;
  const actors = {}, bubbles = {}, heads = {};

  // ---------- colour helpers ----------
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (h, f) => { const [r, g, b] = hex(h); const c = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))); return `rgb(${c(r)},${c(g)},${c(b)})`; };

  // ---------- primitives ----------
  function path(pts) { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }
  function poly(pts, fill, stroke, lw = 1) { path(pts); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function soft(fn, blur) { ctx.save(); ctx.filter = `blur(${blur}px)`; fn(); ctx.restore(); }
  function shadow(gx, gy, w, d, spread = 0.18, alpha = 0.2) {
    soft(() => poly([p(gx - spread * 0.3, gy - spread * 0.3), p(gx + w + spread, gy - spread * 0.3), p(gx + w + spread, gy + d + spread), p(gx - spread * 0.3, gy + d + spread)], `rgba(70,40,20,${alpha})`), 6);
  }
  // Isometric box: lit top, mid left face, darker right face, and a highlight along the top edges.
  function box(gx, gy, w, d, h, color, z = 0, opts = {}) {
    const a = up(p(gx, gy), z), b = up(p(gx + w, gy), z), c = up(p(gx + w, gy + d), z), e = up(p(gx, gy + d), z);
    let g = ctx.createLinearGradient(0, e.y - h, 0, e.y); g.addColorStop(0, mix(color, -0.06)); g.addColorStop(1, mix(color, -0.2));
    poly([e, c, up(c, h), up(e, h)], opts.left || g);
    g = ctx.createLinearGradient(0, c.y - h, 0, c.y); g.addColorStop(0, mix(color, -0.2)); g.addColorStop(1, mix(color, -0.34));
    poly([b, c, up(c, h), up(b, h)], opts.right || g);
    g = ctx.createLinearGradient(up(a, h).x, up(a, h).y, up(c, h).x, up(c, h).y); g.addColorStop(0, mix(color, 0.24)); g.addColorStop(1, mix(color, 0.05));
    poly([up(a, h), up(b, h), up(c, h), up(e, h)], opts.top || g);
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(up(e, h).x, up(e, h).y); ctx.lineTo(up(c, h).x, up(c, h).y); ctx.lineTo(up(b, h).x, up(b, h).y); ctx.stroke();
  }
  function rr(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); } }
  function circle(x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); } }
  function ellipse(x, y, rx, ry, fill, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  const onWall = (gx, gw, h0, h1) => [up(p(gx, 0), h0), up(p(gx + gw, 0), h0), up(p(gx + gw, 0), h1), up(p(gx, 0), h1)];
  const onLeft = (gy, gw, h0, h1) => [up(p(0, gy), h0), up(p(0, gy + gw), h0), up(p(0, gy + gw), h1), up(p(0, gy), h1)];

  // ---------- time of day ----------
  function daylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: ["#63C2FF", "#CFF0FF"], night: 0, warm: 0 };
    if (h >= 17 && h < 19.5) return { sky: ["#FF9A7A", "#FFDCA3"], night: 0.08, warm: 0.14 };
    if (h >= 5.5 && h < 7) return { sky: ["#B7A6F0", "#FFD1B8"], night: 0.08, warm: 0.1 };
    return { sky: ["#131B42", "#2E3D7A"], night: 0.26, warm: 0.22 };
  }

  // ---------- room ----------
  function room(day) {
    let g = ctx.createLinearGradient(0, OY - WALL, 0, OY + D * TH / 2); g.addColorStop(0, "#FBEFE3"); g.addColorStop(1, "#EFD8C3");
    poly([p(0, D), p(0, 0), up(p(0, 0), WALL), up(p(0, D), WALL)], g);
    g = ctx.createLinearGradient(0, OY - WALL, 0, OY + W * TH / 2); g.addColorStop(0, "#FFF7EF"); g.addColorStop(1, "#F7E3D0");
    poly([p(0, 0), p(W, 0), up(p(W, 0), WALL), up(p(0, 0), WALL)], g);
    poly(onLeft(0, D, 0, 40), "#E9CDB2"); poly(onWall(0, W, 0, 40), "#F0D6BD");
    poly(onLeft(0, D, 40, 44), "#FFFFFF"); poly(onWall(0, W, 40, 44), "#FFFFFF");
    poly(onLeft(0, D, WALL, WALL + 10), "#C9A07E"); poly(onWall(0, W, WALL, WALL + 10), "#D6AF8D");

    // windows with curtains on the left wall
    for (const gy of [2.9, 5.5]) {
      poly(onLeft(gy - 0.08, 2.16, 52, 132), "#FFFFFF");
      const win = onLeft(gy, 2.0, 56, 128);
      const sky = ctx.createLinearGradient(0, win[3].y, 0, win[0].y); sky.addColorStop(0, day.sky[0]); sky.addColorStop(1, day.sky[1]); poly(win, sky);
      ctx.save(); path(win); ctx.clip();
      if (day.night > 0.2) {
        for (let i = 0; i < 14; i++) { const s = up(p(0, gy + ((i * 37) % 100) / 50), 70 + ((i * 53) % 55)); circle(s.x, s.y, 0.9 + (i % 3) * 0.3, `rgba(255,255,230,${0.5 + 0.5 * Math.sin(now / 700 + i)})`); }
        const m = up(p(0, gy + 1.4), 112); circle(m.x, m.y, 7, "#FFF6C8"); circle(m.x + 3, m.y - 2, 6, day.sky[0]);
      } else {
        for (let i = 0; i < 2; i++) { const off = ((now / 60000 + i * 0.5 + gy) % 1) * 2.4 - 0.2, c0 = up(p(0, gy + off), 100 + i * 12);
          ellipse(c0.x, c0.y, 12, 5, "rgba(255,255,255,.9)"); ellipse(c0.x + 8, c0.y - 3, 8, 5, "rgba(255,255,255,.9)"); }
      }
      for (let i = 0; i < 6; i++) poly(onLeft(gy + 0.1 + i * 0.32, 0.26, 56, 56 + 14 + ((i * 17 + gy * 7) % 26)), day.night > 0.2 ? "#1A2350" : "rgba(110,150,195,.5)");
      if (day.night > 0.2) for (let i = 0; i < 6; i++) if ((i * 7) % 3) { const q = up(p(0, gy + 0.2 + i * 0.32), 64 + (i % 3) * 5); circle(q.x, q.y, 1, "#FFD98A"); }
      ctx.restore();
      const m1 = up(p(0, gy + 1.0), 56), m2 = up(p(0, gy + 1.0), 128);
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
      for (const [a0, a1] of [[-0.3, 0.12], [1.88, 2.3]]) { const cg = ctx.createLinearGradient(up(p(0, gy + a0), 0).x, 0, up(p(0, gy + a1), 0).x, 0); cg.addColorStop(0, "#F59A9A"); cg.addColorStop(0.5, "#FFB9B0"); cg.addColorStop(1, "#E97F82"); poly(onLeft(gy + a0, a1 - a0, 48, 138), cg); }
      poly(onLeft(gy - 0.4, 2.8, 138, 142), "#B98B62");
    }

    // right wall: picture, whiteboard with notes, clock, door
    poly(onWall(0.6, 1.1, 78, 122), "#7A553C"); poly(onWall(0.66, 0.98, 81, 119), "#A8E3D4");
    const sun = up(p(1.15, 0), 106); circle(sun.x, sun.y, 6, "#FFD166"); poly([up(p(0.7, 0), 84), up(p(1.1, 0), 98), up(p(1.6, 0), 84)], "#5BC27A");
    poly(onWall(2.25, 3.1, 58, 128), "#C3CCD6"); poly(onWall(2.3, 3.0, 62, 124), "#FFFFFF");
    const notes = ["#FFD166", "#7BE0AD", "#FF8FB1", "#7CC8FF", "#C9A7FF", "#FFD166", "#FF8FB1", "#7BE0AD"];
    notes.forEach((c, i) => poly(onWall(2.55 + (i % 4) * 0.68, 0.42, 96 - Math.floor(i / 4) * 24, 112 - Math.floor(i / 4) * 24), c));
    const s1 = up(p(2.5, 0), 70), s2 = up(p(5.0, 0), 76); ctx.strokeStyle = "#4D8FE0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.bezierCurveTo(s1.x + 30, s1.y - 10, s2.x - 30, s2.y + 6, s2.x, s2.y); ctx.stroke();
    const ck = up(p(6.3, 0), 112); circle(ck.x, ck.y, 14, "#FFFFFF", "#7A553C"); circle(ck.x, ck.y, 1.8, "#333");
    const d = new Date(), ha = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, ma = d.getMinutes() / 60 * Math.PI * 2;
    ctx.strokeStyle = "#333"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ha) * 6, ck.y - Math.cos(ha) * 6); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + Math.sin(ma) * 10, ck.y - Math.cos(ma) * 10); ctx.stroke();
    poly(onWall(7.5, 1.6, 0, 112), "#FFFFFF"); poly(onWall(7.6, 1.4, 0, 106), "#C08A5F"); poly(onWall(7.75, 1.1, 60, 96), "#D39D72"); poly(onWall(7.75, 1.1, 14, 50), "#D39D72");
    const kn = up(p(8.75, 0), 54); circle(kn.x, kn.y, 2.8, "#F2C94C");
    poly(onWall(7.85, 0.9, 100, 108), "#2C3E66"); // door sign

    // floor: warm oak planks, then soft corner shading and window light
    for (let gx = 0; gx < W; gx++) for (let gy = 0; gy < D; gy++) {
      poly([p(gx, gy), p(gx + 1, gy), p(gx + 1, gy + 1), p(gx, gy + 1)], mix(gy % 2 ? "#EDBE86" : "#E6B37C", ((gx * 7 + gy * 3) % 5) * 0.012 - 0.02));
      ctx.strokeStyle = "rgba(150,95,50,.16)"; ctx.lineWidth = 1;
      const a1 = p(gx, gy + 1), a2 = p(gx + 1, gy + 1); ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
      if ((gx + gy * 2) % 3 === 0) { const b0 = p(gx + 0.5, gy), b1 = p(gx + 0.5, gy + 1); ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke(); }
    }
    soft(() => { poly([p(0, 0), p(W, 0), p(W, 0.4), p(0.4, 0.4)], "rgba(120,70,30,.2)"); poly([p(0, 0), p(0.4, 0.4), p(0.4, D), p(0, D)], "rgba(120,70,30,.2)"); }, 8);
    if (day.night < 0.2) for (const gy of [3.0, 5.6]) soft(() => poly([p(0.1, gy), p(2.6, gy + 0.5), p(2.6, gy + 2.4), p(0.1, gy + 1.9)], "rgba(255,250,225,.3)"), 5);
    // rugs
    poly([p(2.8, 4.5), p(7.2, 4.5), p(7.2, 7.8), p(2.8, 7.8)], "#40BFB4");
    poly([p(3.05, 4.75), p(6.95, 4.75), p(6.95, 7.55), p(3.05, 7.55)], null, "rgba(255,255,255,.9)", 2);
    for (let i = 0; i < 6; i++) { const q = p(3.2 + i * 0.75, 7.68); circle(q.x, q.y, 2.5, "#FFD166"); }
    poly([p(3.9, 1.3), p(5.9, 1.3), p(5.9, 3.3), p(3.9, 3.3)], "#F6A6C1");
    poly([p(4.1, 1.5), p(5.7, 1.5), p(5.7, 3.1), p(4.1, 3.1)], null, "rgba(255,255,255,.9)", 2);
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
    rr(x - 2, y - 14, 4, 14, 2, "#5B6472"); ellipse(x, y, 12, 4, "#4A525E");
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0); g.addColorStop(0, mix(color, 0.15)); g.addColorStop(1, mix(color, -0.2));
    rr(x - 14, y - 52, 28, 34, 10, g, "rgba(0,0,0,.2)"); rr(x - 9, y - 47, 18, 3, 1.5, "rgba(255,255,255,.35)");
  }

  function desk(id, c, mode) {
    const [gx, gy, w, d] = c.desk, H = 30, working = mode === "working";
    shadow(gx, gy, w, d);
    for (const [lx, ly] of [[gx + 0.08, gy + d - 0.08], [gx + w - 0.08, gy + d - 0.08], [gx + w - 0.08, gy + 0.08]]) box(lx - 0.05, ly - 0.05, 0.1, 0.1, H - 6, "#7A553C");
    box(gx, gy, w, d, 7, c.top, H - 7);
    poly([up(p(gx + w * 0.6, gy + d), H - 7), up(p(gx + w * 0.92, gy + d), H - 7), up(p(gx + w * 0.92, gy + d), H - 21), up(p(gx + w * 0.6, gy + d), H - 21)], mix(c.top, -0.1), "rgba(0,0,0,.18)");
    const knob = up(p(gx + w * 0.76, gy + d), H - 14); circle(knob.x, knob.y, 1.6, "#FFFFFF");
    const top = (fx, fy) => up(p(gx + w * fx, gy + d * fy), H);
    const tint = { jarvis: "#6FE3C1", librarian: "#9BE39B", researcher: "#7CC8FF", critic: "#C9A7FF", creative: "#FFB38A" }[id];
    if (id === "jarvis") { monitor(gx + w * 0.12, gy + d * 0.36, H, working, tint, true); monitor(gx + w * 0.33, gy + d * 0.3, H, working, tint, true); }
    else monitor(gx + w * 0.22, gy + d * 0.36, H, working, tint);
    poly([top(0.52, 0.55), top(0.72, 0.55), top(0.72, 0.76), top(0.52, 0.76)], "#F4F6F8", "rgba(0,0,0,.22)");
    const deco = {
      jarvis: () => { const l = top(0.03, 0.2); rr(l.x - 2, l.y - 28, 4, 28, 2, "#C9A13B"); ellipse(l.x + 7, l.y - 30, 11, 5, "#E8C766");
                      if (daylight().night > 0.05) soft(() => ellipse(l.x + 9, l.y - 6, 30, 11, "rgba(255,220,120,.5)"), 10);
                      const m = top(0.88, 0.5); mug(m.x, m.y, "#FFFFFF", working); const pl = top(0.96, 0.18); smallPlant(pl.x, pl.y, "#2C3E66");
                      const np = top(0.78, 0.92); rr(np.x - 13, np.y - 8, 26, 8, 2, "#2C3E66"); rr(np.x - 10, np.y - 5.5, 20, 2, 1, "#E8A838"); },
      librarian: () => { const b = top(0.88, 0.32); books(b.x, b.y, ["#E76F51", "#2A9D8F", "#E9C46A", "#264653", "#F4A261"]);
                         const m = top(0.9, 0.82); mug(m.x, m.y, "#9CCB8A", working); const ob = top(0.74, 0.18); rr(ob.x - 7, ob.y - 3, 14, 3, 1, "#8B5E3C"); rr(ob.x - 6, ob.y - 6, 12, 3, 1, "#F4F1E8"); },
      researcher: () => { const g = top(0.88, 0.28); rr(g.x - 1.5, g.y - 14, 3, 14, 1, "#8B6B4A"); ellipse(g.x, g.y, 7, 2.5, "#8B6B4A");
                          circle(g.x, g.y - 21, 9, "#4DA3E0"); circle(g.x - 3, g.y - 22, 4.5, "#6CC56C"); circle(g.x + 4, g.y - 17, 2.5, "#6CC56C");
                          ["#FFD166", "#FF8FB1", "#7BE0AD"].forEach((cc, i) => { const s = top(0.5 + i * 0.12, 0.22); rr(s.x - 4, s.y - 4, 8, 6, 1, cc); });
                          const m = top(0.93, 0.8); mug(m.x, m.y, "#4D8FE0", working); },
      critic: () => { const c0 = top(0.9, 0.32); rr(c0.x - 5, c0.y - 10, 10, 10, 2, "#E26D6D"); rr(c0.x - 3, c0.y - 18, 2, 9, 1, "#333"); rr(c0.x + 1, c0.y - 16, 2, 7, 1, "#E63946");
                      poly([top(0.72, 0.68), top(0.88, 0.68), top(0.88, 0.95), top(0.72, 0.95)], "#FFFFFF", "#8A5BC7"); const ck = top(0.8, 0.8); ctx.strokeStyle = "#2FB36B"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ck.x - 4, ck.y - 1); ctx.lineTo(ck.x - 1, ck.y + 2); ctx.lineTo(ck.x + 4, ck.y - 3); ctx.stroke();
                      const pl = top(0.97, 0.1); smallPlant(pl.x, pl.y, "#8A5BC7"); },
      creative: () => { const pl = top(0.82, 0.74); ellipse(pl.x, pl.y - 2, 11, 5, "#F2D2A9"); ["#E63946", "#FFD166", "#2A9D8F", "#4D8FE0"].forEach((cc, i) => circle(pl.x - 6 + i * 4, pl.y - 3, 1.8, cc));
                        const vs = top(0.95, 0.22); rr(vs.x - 4, vs.y - 12, 8, 12, 3, "#7CC8FF"); ctx.strokeStyle = "#3F9E5C"; ctx.lineWidth = 1.4;
                        for (const [dx, cc] of [[-5, "#FF8FB1"], [0, "#FFD166"], [5, "#FF6B6B"]]) { ctx.beginPath(); ctx.moveTo(vs.x, vs.y - 12); ctx.lineTo(vs.x + dx, vs.y - 18); ctx.stroke(); circle(vs.x + dx, vs.y - 19, 3.2, cc); }
                        const hp = top(0.6, 0.22); ctx.strokeStyle = "#333"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hp.x, hp.y - 3, 6, Math.PI, 0); ctx.stroke(); rr(hp.x - 8, hp.y - 5, 4, 6, 2, "#FF6B6B"); rr(hp.x + 4, hp.y - 5, 4, 6, 2, "#FF6B6B"); },
    };
    deco[c.theme]?.();
  }

  function plant(gx, gy, big) {
    const s = big ? 1.4 : 1;
    shadow(gx, gy, 0.6, 0.6, 0.1, 0.16);
    box(gx, gy, 0.6, 0.6, 16 * s, "#E07A5F");
    const t = up(p(gx + 0.3, gy + 0.3), 16 * s), sway = Math.sin(now / 1400 + gx) * 1.5;
    for (const [dx, dy, r, c] of [[0, -30, 12, "#3F9E5C"], [-12, -22, 10, "#4CAF6A"], [12, -20, 10, "#3F9E5C"], [-6, -40, 10, "#5BC27A"], [7, -36, 11, "#4CAF6A"], [0, -14, 9, "#5BC27A"]]) {
      ellipse(t.x + dx * s + sway * (dy / -40), t.y + dy * s, r * s, r * s * 0.62, c, dx * 0.04);
    }
  }
  function bookshelf(gx, gy) {
    shadow(gx, gy, 0.7, 2.3, 0.1, 0.18);
    box(gx, gy, 0.7, 2.3, 120, "#C39468");
    const colors = ["#E76F51", "#2A9D8F", "#E9C46A", "#264653", "#F4A261", "#8AB17D", "#C9A7FF", "#FF8FB1"];
    for (let r = 0; r < 4; r++) {
      const s0 = up(p(gx + 0.7, gy), 18 + r * 26), s1 = up(p(gx + 0.7, gy + 2.3), 18 + r * 26);
      ctx.strokeStyle = "#8B6340"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        if ((i + r) % 5 === 4) continue;
        const y0 = gy + 0.15 + i * 0.26, h = 14 + ((i * 5 + r * 3) % 7);
        poly([up(p(gx + 0.7, y0), 20 + r * 26), up(p(gx + 0.7, y0), 20 + r * 26 + h), up(p(gx + 0.7, y0 + 0.2), 20 + r * 26 + h), up(p(gx + 0.7, y0 + 0.2), 20 + r * 26)], colors[(i * 3 + r) % colors.length]);
      }
    }
  }
  function cooler(gx, gy) {
    shadow(gx, gy, 0.7, 0.7, 0.1, 0.16);
    box(gx, gy, 0.7, 0.7, 46, "#F1F4F8");
    const t = up(p(gx + 0.35, gy + 0.35), 46), g = ctx.createLinearGradient(t.x - 10, 0, t.x + 10, 0);
    g.addColorStop(0, "#7CC8FF"); g.addColorStop(0.5, "#C4EAFF"); g.addColorStop(1, "#5BB4F0");
    rr(t.x - 10, t.y - 30, 20, 30, 8, g); rr(t.x - 6, t.y - 26, 4, 18, 2, "rgba(255,255,255,.6)");
    const tap = up(p(gx + 0.35, gy + 0.7), 30); rr(tap.x - 3, tap.y - 3, 6, 5, 1, "#4D8FE0");
  }
  function coffeeBar(gx, gy) {
    shadow(gx, gy, 1.2, 0.7, 0.1, 0.16);
    box(gx, gy, 1.2, 0.7, 34, "#FFFFFF");
    const m = up(p(gx + 0.45, gy + 0.3), 34); rr(m.x - 11, m.y - 24, 22, 24, 4, "#E26D6D"); rr(m.x - 7, m.y - 20, 14, 7, 2, "#2B3240"); circle(m.x + 4, m.y - 17, 1.5, "#6FE3C1");
    const c2 = up(p(gx + 0.95, gy + 0.45), 34); mug(c2.x, c2.y, "#FFD166", true);
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
    const beam = ctx.createLinearGradient(0, c.y, 0, c.y + 40); beam.addColorStop(0, "rgba(160,240,255,.35)"); beam.addColorStop(1, "rgba(160,240,255,0)");
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(c.x - 12, c.y + 10); ctx.lineTo(c.x + 12, c.y + 10); ctx.lineTo(c.x + 18, c.y + 38); ctx.lineTo(c.x - 18, c.y + 38); ctx.fill();
  }
  function beanbag(gx, gy, color) {
    const q = p(gx, gy);
    soft(() => ellipse(q.x, q.y + 4, 28, 10, "rgba(60,35,20,.22)"), 5);
    const g = ctx.createRadialGradient(q.x - 8, q.y - 18, 4, q.x, q.y - 8, 30); g.addColorStop(0, mix(color, 0.35)); g.addColorStop(1, mix(color, -0.15));
    ellipse(q.x, q.y - 8, 26, 16, g);
  }

  // ---------- chibi people ----------
  // poses: sit-type, sit-think, sit, stand, stretch, sip, look, wave
  function person(x, y, look, pose, id) {
    const T = now / 1000, seat = pose.startsWith("sit"), outline = "rgba(40,25,20,.38)";
    const bob = pose === "sit-type" ? Math.sin(T * 14) * 0.6 : pose === "stretch" ? -2 - Math.sin(T * 3) * 1.5 : Math.sin(T * 2 + x) * 0.6;
    const by = y + bob;
    if (!seat) {
      soft(() => ellipse(x, y + 1, 15, 5, "rgba(50,30,20,.3)"), 3);
      const step = pose === "look" ? Math.sin(T * 2) * 1 : 0;
      rr(x - 9, by - 18, 8, 17, 4, look.pants, outline); rr(x + 1, by - 18 + step, 8, 17, 4, mix(look.pants, -0.12), outline);
      rr(x - 11, by - 4, 11, 5, 3, "#3A2E2A"); rr(x + 1, by - 4 + step, 11, 5, 3, "#3A2E2A");
    }
    const bodyTop = by - 46;
    const sL = { x: x - 12, y: bodyTop + 6 }, sR = { x: x + 12, y: bodyTop + 6 };
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
    else hands = [[x - 15, bodyTop + 24], [x + 15, bodyTop + 24]];
    const behind = pose === "stretch" || pose === "wave";
    if (behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); }
    const sg = ctx.createLinearGradient(x - 14, 0, x + 14, 0); sg.addColorStop(0, mix(look.shirt, 0.2)); sg.addColorStop(1, mix(look.shirt, -0.18));
    rr(x - 14, bodyTop, 28, 30, 11, sg, outline);
    ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.moveTo(x - 5, bodyTop + 1); ctx.lineTo(x, bodyTop + 7); ctx.lineTo(x + 5, bodyTop + 1); ctx.fill();
    if (look.tie) { ctx.fillStyle = look.tie; ctx.beginPath(); ctx.moveTo(x - 2.5, bodyTop + 6); ctx.lineTo(x + 2.5, bodyTop + 6); ctx.lineTo(x + 3.5, bodyTop + 20); ctx.lineTo(x, bodyTop + 24); ctx.lineTo(x - 3.5, bodyTop + 20); ctx.fill(); }
    if (!behind) { arm(sL, ...hands[0], mix(look.shirt, 0.05)); arm(sR, ...hands[1], mix(look.shirt, -0.1)); if (pose === "sip") mug(hands[1][0] + 4, hands[1][1] + 6, "#FFFFFF", true); }
    // head
    const tilt = pose === "sit-think" ? 0.14 : pose === "look" ? Math.sin(T * 1.3) * 0.2 : pose === "stretch" ? -0.08 : 0;
    const hx = x + tilt * 16, hy = bodyTop - 16;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt * 0.6);
    if (look.style === "long") rr(-19, -16, 38, 40, 14, mix(look.hair, -0.12));
    if (look.style === "bun") circle(0, -24, 8, look.hair, outline);
    const sk = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22); sk.addColorStop(0, mix(look.skin, 0.22)); sk.addColorStop(1, mix(look.skin, -0.1));
    circle(0, 0, 18, sk, outline);
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
    return { hx, hy };
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
  const IDLE_CYCLE = ["stand", "stretch", "stand", "sip", "look", "sit", "sit", "stand", "look"];
  const JARVIS_CYCLE = ["sit", "sit", "stretch", "sit", "sip", "sit", "look", "sit"];   // the main session mostly stays at its desk
  function poseFor(id, mode, doing) {
    const a = actors[id] ||= { i: (id.length * 3) % IDLE_CYCLE.length, next: now + 1500 + (id.length % 5) * 900 };
    if (mode === "working") return /thinking/.test(doing || "") ? "sit-think" : "sit-type";
    if (mode === "asking") return "wave";
    const cycle = id === "jarvis" ? JARVIS_CYCLE : IDLE_CYCLE;
    if (now > a.next) { a.i = (a.i + 1) % cycle.length; a.next = now + 2600 + ((a.i * 1700 + id.length * 400) % 3200); }
    return cycle[a.i % cycle.length];
  }
  // Seated behind the desk (facing you), or standing beside it at the front-right.
  function spots(c) {
    const [gx, gy, w, d] = c.desk, sx = c.theme === "jarvis" ? gx - 0.42 : gx + w + 0.38;   // Jarvis stands on the left
    return { seat: p(gx + w * 0.66, gy - 0.18), stand: p(sx, gy + d * 0.55), seatDepth: gx + w * 0.66 + gy - 0.18, standDepth: sx + gy + d * 0.55 };
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
    bookshelf(0.04, 0.2);
    plant(0.35, 7.1, true);
    items.push({ depth: 9.9, fn: () => plant(9.3, 0.25) });
    items.push({ depth: 7.1, fn: () => brain(4.4, 1.7, agentState("librarian")?.state === "working") });
    items.push({ depth: 10.75, fn: () => cooler(9.15, 1.25) });
    items.push({ depth: 6.9, fn: () => coffeeBar(5.9, 0.15) });
    items.push({ depth: 9.0, fn: () => beanbag(1.6, 7.4, "#F28C8C") });
    for (const [id, c] of Object.entries(CAST)) {
      const s = agentState(id), mode = modeOf(id, s), pose = poseFor(id, mode, s?.doing), sp = spots(c);
      const [gx, gy, w, d] = c.desk;
      items.push({ depth: sp.seatDepth - 0.01, fn: () => chair(sp.seat.x, sp.seat.y + 10, mix(c.top, -0.22)) });
      if (pose.startsWith("sit")) items.push({ depth: sp.seatDepth, fn: () => { heads[id] = person(sp.seat.x, sp.seat.y + 6, c.look, pose, id); } });
      else items.push({ depth: sp.standDepth, fn: () => { heads[id] = person(sp.stand.x, sp.stand.y, c.look, pose, id); } });
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
      for (const [gx, gy] of [[2.2, 2.4], [7.6, 2.4], [5, 6.2]]) {
        const q = p(gx, gy), g = ctx.createRadialGradient(q.x, q.y - 40, 5, q.x, q.y, 150);
        g.addColorStop(0, `rgba(255,214,150,${day.warm + 0.08})`); g.addColorStop(1, "rgba(255,214,150,0)"); ctx.fillStyle = g; ctx.fillRect(q.x - 160, q.y - 190, 320, 300);
      }
    }
    placeBubbles();
  }

  // ---------- labels & clicks (HTML on top so text stays sharp) ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function labels() {
    if (!overlay || !state) return;
    const out = [];
    const add = (id, name, a, mode, doing) => {
      const bubble = mode === "working" ? (doing || "working…") : mode === "asking" ? "needs you!" : mode === "waiting" ? "waiting for you…" : mode === "done" ? "done ✓" : "";
      const n = a.name || a;
      out.push(`<button class="po-hit" data-id="${id}" aria-label="${esc(name)}" style="left:${(a.x - 34) * scale}px;top:${(a.y - 104) * scale}px;width:${68 * scale}px;height:${110 * scale}px"></button>`
        + (bubble ? `<span class="po-bubble m-${mode}" data-b="${id}">${esc(bubble)}</span>` : "")
        + `<span class="po-name ${selected === id ? "sel" : ""} m-${mode}" style="left:${n.x * scale}px;top:${(n.y + (a.name ? 4 : 36)) * scale}px">${esc(name)}</span>`);
    };
    for (const [id, c] of Object.entries(CAST)) {
      const s = agentState(id), [gx, gy, w, d] = c.desk;
      const seat = p(gx + w * 0.72, gy + d * 0.2);
      add(id, id === "jarvis" ? "Jarvis" : id[0].toUpperCase() + id.slice(1), { ...seat, name: p(gx + w * 0.5, gy + d + 0.15) }, modeOf(id, s), s?.doing);
    }
    (state.visitors || []).slice(0, VISITOR_SPOTS.length).forEach((v, i) => add(v.id, v.type, p(...VISITOR_SPOTS[i]), v.state === "working" ? "working" : "done", v.doing));
    const b = p(4.9, 2.2);
    out.push(`<button class="po-hit" data-id="brain" aria-label="The Brain" style="left:${(b.x - 32) * scale}px;top:${(b.y - 96) * scale}px;width:${64 * scale}px;height:${100 * scale}px"></button>
      <span class="po-name ${selected === "brain" ? "sel" : ""}" style="left:${b.x * scale}px;top:${(b.y + 8) * scale}px">The Brain</span>`);
    overlay.innerHTML = out.join("");
    for (const k in bubbles) delete bubbles[k];
    overlay.querySelectorAll("[data-b]").forEach((el) => (bubbles[el.dataset.b] = el));
    placeBubbles();
  }
  function placeBubbles() {
    for (const [id, el] of Object.entries(bubbles)) {
      const h = heads[id]; if (!h) continue;
      el.style.left = `${h.hx * scale}px`; el.style.top = `${(h.hy - 26) * scale}px`;
    }
  }

  function fit() {
    const avail = Math.min(host.clientWidth, (window.innerHeight - 150) * CW / CH);
    scale = Math.max(0.5, avail / CW);
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
