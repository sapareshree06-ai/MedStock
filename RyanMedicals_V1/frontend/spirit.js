/* The store's spirit animal: a serpent from the Rod of Asclepius, following the cursor. */
(() => {
  const cv = document.getElementById("spirit");
  if (!cv) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { cv.remove(); return; }

  const ctx = cv.getContext("2d");
  let W, H;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  const N = 38, GAP = 10;
  const mouse = { x: W * 0.5, y: H * 0.5, last: performance.now() };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.last = performance.now(); });

  const head = { x: W * 0.5, y: H * 0.5, vx: 0, vy: 0 };
  const pts = Array.from({ length: N }, (_, i) => ({ x: head.x - i * GAP, y: head.y }));
  const P = pts.map(() => ({ x: 0, y: 0 }));
  let t = 0, prev = performance.now();

  function frame(now) {
    const dt = Math.min((now - prev) / 16.67, 3);
    prev = now; t += dt * 0.016;

    // Target: the cursor, or a lazy figure-eight around it when still.
    let tx = mouse.x, ty = mouse.y;
    if (now - mouse.last > 2200) { tx += Math.cos(t * 0.8) * 130; ty += Math.sin(t * 1.6) * 55; }

    // Soft spring so the head glides and overshoots slightly.
    head.vx += (tx - head.x) * 0.012 * dt;
    head.vy += (ty - head.y) * 0.012 * dt;
    const damp = Math.pow(0.88, dt);
    head.vx *= damp; head.vy *= damp;
    head.x += head.vx * dt; head.y += head.vy * dt;
    const speed = Math.hypot(head.vx, head.vy);

    // Body follows the leader at a fixed gap.
    pts[0].x = head.x; pts[0].y = head.y;
    for (let i = 1; i < N; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (d > GAP) { b.x += dx * (d - GAP) / d; b.y += dy * (d - GAP) / d; }
    }

    // Slither: a travelling wave sideways, stronger when moving.
    const amp = Math.min(7, 1.5 + speed * 0.7);
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      const off = Math.sin(t * 7 - i * 0.42) * amp * Math.min(1, i / 6) * (1 - i / (N * 1.4));
      P[i].x = pts[i].x + Math.cos(ang + Math.PI / 2) * off;
      P[i].y = pts[i].y + Math.sin(ang + Math.PI / 2) * off;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";

    for (let i = N - 1; i >= 1; i--) {
      const w = 1.6 + 8.2 * Math.pow(1 - i / N, 0.75);
      ctx.strokeStyle = `hsl(162, 32%, ${17 + (i / N) * 40}%)`;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[i - 1].x, P[i - 1].y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = w * 0.32;
      ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[i - 1].x, P[i - 1].y); ctx.stroke();
    }

    // Head, eyes and a flicking tongue.
    const ang = Math.atan2(P[0].y - P[2].y, P[0].x - P[2].x);
    ctx.save();
    ctx.translate(P[0].x, P[0].y); ctx.rotate(ang);
    const flick = Math.pow(Math.max(0, Math.sin(t * 2.4)), 14);
    if (flick > 0.02) {
      const L = 14 * flick;
      ctx.strokeStyle = "#8e3a32"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8 + L, 0);
      ctx.moveTo(8 + L, 0); ctx.lineTo(8 + L + 4, -3);
      ctx.moveTo(8 + L, 0); ctx.lineTo(8 + L + 4, 3); ctx.stroke();
    }
    ctx.fillStyle = "#12302b";
    ctx.beginPath(); ctx.ellipse(1, 0, 10, 6.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8eeea";
    ctx.beginPath(); ctx.arc(3.5, -3, 1.5, 0, Math.PI * 2); ctx.arc(3.5, 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();