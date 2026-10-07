(() => {
  const canvas = document.getElementById("bg-code");
  const ctx = canvas.getContext("2d");
  const SIZE = 16;
  const RADIUS = 170;
  const TOKENS = "{}()[]<>/\\;:=+-*&|!?#$%^~01 const let if for => </> fn ()=>".split("");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w, h, cols, drops, speeds;
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = SIZE + 'px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    cols = Math.ceil(w / SIZE);
    drops = Array.from({ length: cols }, () => -Math.random() * (h / SIZE));
    speeds = Array.from({ length: cols }, () => 0.12 + Math.random() * 0.35);
  }

  function glyph(x, y, alpha, scale) {
    const dx = x - mouse.x;
    const dy = y - mouse.y;
    const dist = Math.hypot(dx, dy);
    let px = x, py = y, a = alpha, s = 1;

    // Perto do mouse: letras brilham, crescem e são empurradas para fora
    if (dist < RADIUS && dist > 0.001) {
      const f = 1 - dist / RADIUS;
      px += (dx / dist) * f * f * 46;
      py += (dy / dist) * f * f * 46;
      a = Math.min(1, alpha + f * 0.8);
      s = 1 + f * 0.7;
    }
    ctx.fillStyle = "rgba(255,255,255," + a + ")";
    ctx.font = SIZE * s * (scale || 1) + 'px "Courier New", monospace';
    ctx.fillText(TOKENS[(Math.random() * TOKENS.length) | 0], px, py);
  }

  function step() {
    // Suaviza o movimento do cursor
    mouse.x += (mouse.tx - mouse.x) * 0.18;
    mouse.y += (mouse.ty - mouse.y) * 0.18;

    // Rastro: escurece o quadro anterior
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < cols; i++) {
      const prev = Math.floor(drops[i]);
      drops[i] += speeds[i];
      if (Math.floor(drops[i]) !== prev) {
        const x = i * SIZE + SIZE / 2;
        const y = Math.floor(drops[i]) * SIZE;
        glyph(x, y, 0.28 + Math.random() * 0.22);
        // cabeça da coluna mais clara
        if (Math.random() > 0.9) glyph(x, y, 0.85);
      }
      if (drops[i] * SIZE > h && Math.random() > 0.975) {
        drops[i] = -Math.random() * 12;
        speeds[i] = 0.12 + Math.random() * 0.35;
      }
    }

    // Respingo de código ao redor do cursor
    if (mouse.tx > -9000) {
      for (let k = 0; k < 4; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * RADIUS * 0.9;
        const x = Math.round((mouse.x + Math.cos(ang) * r) / SIZE) * SIZE;
        const y = Math.round((mouse.y + Math.sin(ang) * r) / SIZE) * SIZE;
        glyph(x, y, 0.7 + Math.random() * 0.3);
      }
    }

    if (!reduceMotion) requestAnimationFrame(step);
  }

  window.addEventListener("pointermove", (e) => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    if (mouse.x < -9000) { mouse.x = e.clientX; mouse.y = e.clientY; }
  });
  document.addEventListener("pointerleave", () => {
    mouse.tx = mouse.ty = mouse.x = mouse.y = -9999;
  });
  window.addEventListener("resize", resize);

  resize();
  if (reduceMotion) {
    for (let n = 0; n < 220; n++) step();
  } else {
    requestAnimationFrame(step);
  }
})();