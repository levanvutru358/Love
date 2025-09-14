(() => {
  const screens = Array.from(document.querySelectorAll('.screen'));
  let current = 0;
  const getDpr = () => Math.min(2, window.devicePixelRatio || 1); // clamp for mobile perf

  function showScreen(index) {
    screens.forEach((s, i) => s.classList.toggle('active', i === index));
    current = index;
    // Start/stop animations per screen
    if (index === 0) { s1stars.start(); hearts1.start && hearts1.start(); } else { hearts1.stop && hearts1.stop(); }
    if (index === 2) fireworks.start(); else fireworks.stop();
    if (index === 3) heart.start(); else heart.stop();
  }

  function nextScreen() {
    const next = (current + 1) % screens.length;
    showScreen(next);
  }

  // Wire clicks to advance (general)
  screens.forEach(s => {
    s.addEventListener('click', (e) => {
      if ((e.target.closest('a,button'))) return;
      nextScreen();
    });
  });

  // Special open animation for the card on Screen 1
  (function setupCardOpen() {
    const card = document.querySelector('#screen-1 .card');
    if (!card) return;
    const handle = (e) => {
      e.stopPropagation();
      if (card.classList.contains('open')) return;
      card.classList.add('open');
      // Wait for open animation then go to next screen
      setTimeout(() => nextScreen(), 1050);
    };
    card.addEventListener('click', handle);
    // Keyboard accessibility
    card.tabIndex = 0;
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handle(ev); }
    });
  })();

  // Handle resizing for canvases
  window.addEventListener('resize', () => {
    s1stars.resize();
    hearts1.resize && hearts1.resize();
    fireworks.resize();
    heart.resize();
  });

  // Fireworks animation
  const fireworks = (() => {
    const canvas = document.getElementById('fireworks');
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = null, running = false;

    const particles = [];
    const stars = [];

    function resize() {
      const dpr = getDpr();
      w = canvas.width = Math.floor(canvas.clientWidth * dpr);
      h = canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      // regen starfield for aesthetic
      stars.length = 0;
      const count = Math.floor((canvas.clientWidth * canvas.clientHeight) / 9000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.clientWidth,
          y: Math.random() * canvas.clientHeight,
          r: Math.random() * 1.2 + 0.2,
          a: Math.random() * Math.PI * 2,
        });
      }
    }

    function spawnBurst(x, y, colors) {
      const count = 70 + Math.floor(Math.random() * 40);
      const hue = Math.random() * 360;
      for (let i = 0; i < count; i++) {
        const speed = 1.5 + Math.random() * 3.5;
        const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.2 - 0.1);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const life = 60 + Math.random() * 40; // frames
        particles.push({
          x, y, vx, vy,
          alpha: 1,
          life,
          age: 0,
          color: colors?.[i % colors.length] || `hsl(${hue + (Math.random()*40-20)}, 80%, ${60 + Math.random()*20}%)`
        });
      }
    }

    let spawnTimer = 0;
    function update() {
      // Trails
      ctx.fillStyle = 'rgba(6, 8, 20, 0.22)';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      // Background stars
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        s.a += 0.02;
        const tw = 0.6 + Math.sin(s.a) * 0.4;
        ctx.fillStyle = `rgba(200,220,255,${0.3 + tw*0.3})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.7 + tw*0.5), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();

      // Spawn new bursts
      spawnTimer--;
      if (spawnTimer <= 0) {
        const x = 50 + Math.random() * (canvas.clientWidth - 100);
        const y = 80 + Math.random() * (canvas.clientHeight * 0.5);
        spawnBurst(x, y);
        spawnTimer = 30 + Math.random() * 40;
      }

      // Update particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age++;
        const t = p.age / p.life;
        // Physics
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.04; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.alpha = Math.max(0, 1 - t);

        // Twinkle flicker
        const flicker = 0.7 + Math.random() * 0.6;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * flicker;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + (1 - t) * 1.8, 0, Math.PI * 2);
        ctx.fill();

        if (t >= 1) particles.splice(i, 1);
      }
      ctx.restore();

      raf = running ? requestAnimationFrame(update) : null;
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      // Prime background
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      spawnTimer = 10;
      raf = requestAnimationFrame(update);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }

    // public API
    return { start, stop, resize };
  })();

  // Heart of stars animation (Screen 4)
  const heart = (() => {
    const canvas = document.getElementById('heart');
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = null, running = false;

    const heartPoints = [];
    const heartFill = [];
    const ambientStars = [];
    let time = 0;
    let cx = 0, cy = 0, baseScale = 1;
    const outlineCount = 360;
    
    function buildHeartPath(scale, centerX, centerY) {
      const path = new Path2D();
      for (let i = 0; i <= outlineCount; i++) {
        const t = (i / outlineCount) * Math.PI * 2;
        const xh = 16 * Math.pow(Math.sin(t), 3);
        const yh = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const x = centerX + xh * scale;
        const y = centerY - yh * scale;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      }
      path.closePath();
      return path;
    }

    function resize() {
      const dpr = getDpr();
      w = canvas.width = Math.floor(canvas.clientWidth * dpr);
      h = canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      buildHeart();
      buildAmbient();
    }

    function buildHeart() {
      heartPoints.length = 0;
      heartFill.length = 0;
      
      const scale = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.03;
      cx = canvas.clientWidth / 2;
      cy = canvas.clientHeight / 2 + 10;
      baseScale = scale;
      
      // Create heart-shaped outline stars
      const outlineDensity = 800;
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i < outlineDensity; i++) {
        const t = (i / outlineDensity) * Math.PI * 2;
        const xh = 16 * Math.pow(Math.sin(t), 3);
        const yh = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const x = cx + xh * scale;
        const y = cy - yh * scale;

        // track bounds for interior sampling
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        
        // Add slight randomness for natural look
        const noise = (Math.random() - 0.5) * 2;
        const xNoise = x + noise;
        const yNoise = y + noise;
        
        heartPoints.push({
          x: xNoise,
          y: yNoise,
          b: Math.random() * 0.6 + 0.4,
          tw: Math.random() * Math.PI * 2,
          r: Math.random() * 1.5 + 0.8,
        });
      }
      // Interior stars - sample points inside path
      const path = buildHeartPath(scale, cx, cy);
      const bw = Math.max(1, maxx - minx);
      const bh = Math.max(1, maxy - miny);
      // approximate heart area ~55% of bounding box
      const approxArea = bw * bh * 0.55;
      const target = Math.max(220, Math.min(1200, Math.floor(approxArea / 130)));
      let tries = 0;
      while (heartFill.length < target && tries < target * 12) {
        const rx = minx + Math.random() * bw;
        const ry = miny + Math.random() * bh;
        // Use identity transform for hit-test so DPR scaling doesn't skew results
        let inside = false;
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        try {
          inside = ctx.isPointInPath(path, rx, ry);
        } finally {
          ctx.restore();
        }
        if (inside) {
          heartFill.push({
            dx: rx - cx,
            dy: ry - cy,
            b: Math.random() * 0.5 + 0.4,
            tw: Math.random() * Math.PI * 2,
            r: Math.random() * 1.4 + 0.6,
          });
        }
        tries++;
      }
    }

    function buildAmbient() {
      ambientStars.length = 0;
      const count = Math.floor((canvas.clientWidth * canvas.clientHeight) / 8000);
      for (let i = 0; i < count; i++) {
        ambientStars.push({
          x: Math.random() * canvas.clientWidth,
          y: Math.random() * canvas.clientHeight,
          r: Math.random() * 1.5 + 0.3,
          a: Math.random() * Math.PI * 2,
          s: 0.5 + Math.random() * 0.8,
        });
      }
    }

    function update() {
      time += 0.016;
      // Soft background
      ctx.fillStyle = 'rgba(6,8,20,0.25)';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      // Ambient starfield
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of ambientStars) {
        s.a += 0.02 * s.s;
        const tw = 0.5 + Math.sin(s.a) * 0.5;
        ctx.fillStyle = `rgba(180,200,255,${0.2 + tw*0.3})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.7 + tw*0.6), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();

      // Heart: gentle beating scale (a bit faster)
      const beat = 1 + 0.055 * Math.sin(time * 2.6);

      // Subtle glow behind heart
      const r0 = baseScale * 6 * beat;
      const r1 = baseScale * 36 * beat;
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      g.addColorStop(0, 'rgba(255, 120, 200, 0.25)');
      g.addColorStop(1, 'rgba(255, 120, 200, 0.0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Render heart fill and outline stars with beat effect
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Interior stars first for depth
      for (const p of heartFill) {
        p.tw += 0.06;
        const tw = 0.6 + Math.sin(p.tw) * 0.4;
        const alpha = 0.45 * p.b + 0.55 * tw;
        const size = p.r * (0.8 + tw * 0.35);
        const x = cx + p.dx * beat;
        const y = cy + p.dy * beat;
        ctx.fillStyle = `rgba(255, 120, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render outline stars with heart beat
      for (const p of heartPoints) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const x = cx + dx * beat;
        const y = cy + dy * beat;

        p.tw += 0.08;
        const tw = 0.6 + Math.sin(p.tw) * 0.4;
        const alpha = 0.55 * p.b + 0.45 * tw;
        const size = p.r * (0.85 + tw * 0.35);
        ctx.fillStyle = `rgba(255, 120, 200, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();

      raf = running ? requestAnimationFrame(update) : null;
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      // Prime background
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      raf = requestAnimationFrame(update);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }

    return { start, stop, resize };
  })();

  // Screen 1 starfield (CSS-driven, JS placement)
  const s1stars = (() => {
    const container = document.querySelector('#screen-1 .stars');
    let built = false;

    function build() {
      if (!container) return;
      container.innerHTML = '';
      const rect = container.getBoundingClientRect();
      const area = rect.width * rect.height;
      const count = Math.max(60, Math.min(160, Math.floor(area / 8000)));
      for (let i = 0; i < count; i++) {
        const x = Math.random() * rect.width;
        const y = Math.random() * rect.height;
        const s = Math.random() * 0.9 + 0.4; // scale
        const delay = Math.random() * 3;
        const dur = 2.2 + Math.random() * 2.6;
        const star = document.createElement('span');
        star.className = 'star';
        star.style.setProperty('--x', `${x}px`);
        star.style.setProperty('--y', `${y}px`);
        star.style.setProperty('--s', s.toFixed(2));
        star.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        star.style.setProperty('--dur', `${dur.toFixed(2)}s`);
        container.appendChild(star);
      }
      built = true;
    }

    function start() { if (!built) build(); }
    function resize() { built = false; build(); }
    function stop() { /* no-op; screen hidden disables painting */ }
    return { start, stop, resize };
  })();

  // Screen 1: Multiple pulsing star hearts (no rotation)
  const hearts1 = (() => {
    const canvas = document.getElementById('hearts-1');
    if (!canvas) return {};
    const ctx = canvas.getContext('2d');
    let running = false, raf = null, time = 0;
    let hearts = [];

    function resize() {
      const dpr = getDpr();
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      layout();
    }

    function heartParam(t) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return { x, y };
    }

    function makeHeart(cx, cy, scale, outlineCount) {
      const pts = [];
      const path = new Path2D();
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i <= outlineCount; i++) {
        const t = (i / outlineCount) * Math.PI * 2;
        const h = heartParam(t);
        const dx = h.x * scale;
        const dy = -h.y * scale;
        const x = cx + dx;
        const y = cy + dy;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
        // store outline star
        if (i < outlineCount) {
          pts.push({ dx, dy, b: Math.random() * 0.5 + 0.5, tw: Math.random() * Math.PI * 2, r: Math.random() * 1.5 + 0.9 });
        }
      }
      path.closePath();

      // Interior stars using rejection sampling within path
      const fill = [];
      const bw = Math.max(1, maxx - minx);
      const bh = Math.max(1, maxy - miny);
      const approxArea = bw * bh * 0.55; // heart covers ~55% of bbox area
      const target = Math.max(180, Math.min(900, Math.floor(approxArea / 140)));
      let tries = 0;
      while (fill.length < target && tries < target * 12) {
        const x = minx + Math.random() * bw;
        const y = miny + Math.random() * bh;
        if (ctx.isPointInPath(path, x, y)) {
          fill.push({
            dx: x - cx,
            dy: y - cy,
            b: Math.random() * 0.5 + 0.4,
            tw: Math.random() * Math.PI * 2,
            r: Math.random() * 1.4 + 0.6,
          });
        }
        tries++;
      }

      return {
        cx, cy, scale,
        pts,
        fill,
        amp: 0.04 + Math.random() * 0.03,
        speed: 1.6 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        color: '255, 120, 200'
      };
    }

    function layout() {
      hearts = [];
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const base = Math.min(w, h) * 0.11;
      const y = h * 0.48;
      const spacing = base * 2.6;
      const centers = [
        { cx: w / 2 - spacing, cy: y },
        { cx: w / 2,           cy: y },
        { cx: w / 2 + spacing, cy: y },
      ];
      const count = 240;
      centers.forEach(c => hearts.push(makeHeart(c.cx, c.cy, base, count)));
    }

    function update() {
      time += 0.016;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const hrt of hearts) {
        const beat = 1 + hrt.amp * Math.sin(time * hrt.speed + hrt.phase);

        // Interior stars first
        for (const p of hrt.fill) {
          p.tw += 0.06;
          const tw = 0.6 + Math.sin(p.tw) * 0.4;
          const alpha = 0.45 * p.b + 0.55 * tw;
          const size = p.r * (0.8 + tw * 0.35);
          const x = hrt.cx + p.dx * beat;
          const y = hrt.cy + p.dy * beat;
          ctx.fillStyle = `rgba(${hrt.color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }

        // Outline stars on top for definition
        for (const p of hrt.pts) {
          p.tw += 0.07;
          const tw = 0.6 + Math.sin(p.tw) * 0.4;
          const alpha = 0.55 * p.b + 0.45 * tw;
          const size = p.r * (0.85 + tw * 0.35);
          const x = hrt.cx + p.dx * beat;
          const y = hrt.cy + p.dy * beat;
          ctx.fillStyle = `rgba(${hrt.color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      raf = running ? requestAnimationFrame(update) : null;
    }

    function start() { if (running) return; running = true; resize(); raf = requestAnimationFrame(update); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

    return { start, stop, resize };
  })();

  // Init
  showScreen(0);
})();
