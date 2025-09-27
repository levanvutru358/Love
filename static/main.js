(() => {
  const screens = Array.from(document.querySelectorAll('.screen'));
  let current = 0;

  // --- Tiện ích chung ---
  const heartParametric = (t) => {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x, y };
  };
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
    const card = screens[0].querySelector('.card');
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

    // --- Hằng số ---
    const PARTICLE_GRAVITY = 0.04;
    const PARTICLE_FRICTION = 0.985;
    const BACKGROUND_TRAIL_ALPHA = 0.22;
    const STAR_COUNT_DIVISOR = 9000;
    const MIN_SPAWN_DELAY = 30;
    const RAND_SPAWN_DELAY = 40;

    const particles = [];
    const stars = [];
    const rockets = [];
    const ENABLE_TEXT_STARS = false; // set false to disable star-letter effect
    // Text fireworks state
    let textPoints = [];
    let textStars = [];
    let textOutline = [];
    let textBounds = { minx: 0, miny: 0, maxx: 0, maxy: 0 };
    let textIndex = 0;
    let textMode = false;
    let textDelayFrames = 0; // delay before starting text mode
    let textSpawnTimer = 0;  // independent spawner for text bursts
    let textFlares = [];
    let flareTimer = 0;
    let fwTime = 0; // local time for text animation
    const textColors = ['#ff85d8', '#ffd166', '#8ec5ff', '#b1ff9a'];

    function buildTextPoints() {
      textPoints = [];
      textStars = [];
      const off = document.createElement('canvas');
      const ww = Math.max(1, canvas.clientWidth);
      const hh = Math.max(1, canvas.clientHeight);
      off.width = ww;
      off.height = hh;
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, ww, hh);

      // Phrase to render as star text (match the image)
      const lines = ['Happy Birthday'];
      const maxWidth = ww * 0.86;
      let size = Math.min(ww, hh) * 0.18;
      octx.textAlign = 'left';
      octx.textBaseline = 'middle';
      octx.fillStyle = '#ffffff';
      const setFont = () => (octx.font = `900 ${size}px Segoe UI, Roboto, Helvetica, Arial, sans-serif`);
      setFont();
      // Fit based on the widest line
      let widths = lines.map(t => octx.measureText(t).width);
      let widest = Math.max(...widths);
      if (widest > maxWidth && widest > 0) {
        size = size * (maxWidth / widest);
        setFont();
        widths = lines.map(t => octx.measureText(t).width);
        widest = Math.max(...widths);
      }
      const gap = Math.max(10, size * 0.28);
      const blockHeight = size * lines.length + gap * (lines.length - 1);
      const cy = hh * 0.45;
      let ly = cy - blockHeight / 2 + size / 2;
      // Stroke + fill each line to create a bold, crisp mask
      octx.lineWidth = size * 0.14;
      octx.lineJoin = 'round';
      octx.miterLimit = 2;
      octx.strokeStyle = '#ffffff';
      for (let i = 0; i < lines.length; i++) {
        const tx = Math.max(10, (ww - widths[i]) / 2);
        octx.strokeText(lines[i], tx, ly);
        octx.fillText(lines[i], tx, ly);
        ly += size + gap;
      }

      // Denser sampling for bolder star-text
      const step = Math.max(5, Math.round(Math.min(ww, hh) / 90));
      const jitter = step * 0.5;
      const img = octx.getImageData(0, 0, ww, hh);
      const data = img.data;
      const alphaAt = (ix, iy) => {
        if (ix < 0 || iy < 0 || ix >= ww || iy >= hh) return 0;
        return data[(iy * ww + ix) * 4 + 3] | 0;
      };
      const samples = [];
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let y = 0; y < hh; y += step) {
        for (let x = 0; x < ww; x += step) {
          const a = alphaAt(x | 0, y | 0);
          if (a > 90) {
            const jx = (Math.random() - 0.5) * jitter;
            const jy = (Math.random() - 0.5) * jitter;
            const px = x + jx, py = y + jy;
            samples.push({ x: px, y: py });
            if (px < minx) minx = px; if (px > maxx) maxx = px;
            if (py < miny) miny = py; if (py > maxy) maxy = py;
          }
        }
      }
      // Shuffle and cap samples
      for (let i = samples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [samples[i], samples[j]] = [samples[j], samples[i]];
      }
      const MAX_POINTS = 480;
      const capped = samples.length > MAX_POINTS ? samples.slice(0, MAX_POINTS) : samples;
      textPoints = capped.slice();
      textStars = [];
      textOutline = [];
      // Classify edge vs fill by neighbor test
      const edgeDist = Math.max(1, Math.round(step * 0.8));
      for (const p of capped) {
        const ix = p.x | 0, iy = p.y | 0;
        const center = alphaAt(ix, iy);
        const neighbors = [
          alphaAt(ix + edgeDist, iy), alphaAt(ix - edgeDist, iy),
          alphaAt(ix, iy + edgeDist), alphaAt(ix, iy - edgeDist)
        ];
        const isEdge = center > 90 && neighbors.some(v => v < 70);
        if (isEdge) {
          textOutline.push({
            x: p.x,
            y: p.y,
            r: Math.random() * 1.6 + 0.9,
            b: Math.random() * 0.5 + 0.6,
            tw: Math.random() * Math.PI * 2,
            s: 0.9 + Math.random() * 0.8
          });
        } else {
          textStars.push({
            x: p.x,
            y: p.y,
            r: Math.random() * 2.0 + 1.3,
            b: Math.random() * 0.5 + 0.75,
            tw: Math.random() * Math.PI * 2,
            s: 0.8 + Math.random() * 0.7
          });
        }
      }
      textBounds = { minx, miny, maxx, maxy };
      textIndex = 0;
    }

    function resize() {
      const dpr = getDpr();
      w = canvas.width = Math.floor(canvas.clientWidth * dpr);
      h = canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      // regen starfield for aesthetic
      stars.length = 0;
      const count = Math.floor((canvas.clientWidth * canvas.clientHeight) / STAR_COUNT_DIVISOR);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.clientWidth,
          y: Math.random() * canvas.clientHeight,
          r: Math.random() * 1.2 + 0.2,
          a: Math.random() * Math.PI * 2,
        });
      }
      if (ENABLE_TEXT_STARS) {
        buildTextPoints();
      } else {
        textPoints = [];
        textStars = [];
        textOutline = [];
        textBounds = { minx: 0, miny: 0, maxx: 0, maxy: 0 };
      }
    }

    function spawnBurst(x, y, colors, countOverride, shape) {
      const count = (countOverride ?? (70 + Math.floor(Math.random() * 40)));
      const hue = Math.random() * 360;

      if (shape === 'heart') {
        // Heart-shaped burst using parametric curve
        const scale = 2.0 + Math.random() * 1.2;
        for (let i = 0; i < count; i++) {
          const t = (i / count) * Math.PI * 2;
          const h = heartParametric(t);
          const dx = h.x * 0.06 * scale;
          const dy = -h.y * 0.06 * scale;
          const jitter = (Math.random() * 0.35 + 0.65);
          const vx = dx * jitter;
          const vy = dy * jitter;
          const life = 70 + Math.random() * 40;
          particles.push({
            x, y, vx, vy,
            alpha: 1,
            life,
            age: 0,
            color: colors?.[i % (colors?.length||1)] || `hsl(${hue + (Math.random()*40-20)}, 80%, ${60 + Math.random()*20}%)`
          });
        }
        return;
      }

      if (shape === 'ring') {
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const speed = 2.8 + Math.random() * 0.6;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const life = 70 + Math.random() * 35;
          particles.push({
            x, y, vx, vy,
            alpha: 1,
            life,
            age: 0,
            color: colors?.[i % (colors?.length||1)] || `hsl(${hue + (Math.random()*40-20)}, 80%, ${60 + Math.random()*20}%)`
          });
        }
        return;
      }

      // Default chrysanthemum burst
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
          color: colors?.[i % (colors?.length||1)] || `hsl(${hue + (Math.random()*40-20)}, 80%, ${60 + Math.random()*20}%)`
        });
      }
    }

    function spawnRocket(targetX, targetY, colors, shape) {
      const cx = Math.max(30, Math.min(canvas.clientWidth - 30, targetX ?? (50 + Math.random() * (canvas.clientWidth - 100))));
      const startY = canvas.clientHeight + 10;
      const ty = Math.max(60, Math.min(canvas.clientHeight * 0.45, targetY ?? (80 + Math.random() * (canvas.clientHeight * 0.35))));
      const vx = (Math.random() * 0.6 - 0.3);
      const vy = - (4.8 + Math.random() * 1.8);
      rockets.push({ x: cx, y: startY, vx, vy, ax: 0, ay: -0.02, life: 220 + Math.floor(Math.random()*60), age: 0, trail: [], targetY: ty, colors, shape });
    }

    let spawnTimer = 0;
    let rocketSpawnTimer = 0;
    function update() {
      fwTime += 0.016;
      // Trails
      ctx.fillStyle = `rgba(6, 8, 20, ${BACKGROUND_TRAIL_ALPHA})`;
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

      // Spawn random bursts and rockets
      spawnTimer--;
      rocketSpawnTimer--;
      if (spawnTimer <= 0) {
        const x = 50 + Math.random() * (canvas.clientWidth - 100);
        const y = 80 + Math.random() * (canvas.clientHeight * 0.5);
        spawnBurst(x, y);
        spawnTimer = MIN_SPAWN_DELAY + Math.random() * RAND_SPAWN_DELAY;
      }
      if (rocketSpawnTimer <= 0) {
        const centerX = canvas.clientWidth * (0.3 + Math.random() * 0.4);
        const topY = canvas.clientHeight * (0.22 + Math.random() * 0.18);
        const palette = [`hsl(${Math.random()*360|0},85%,65%)`, `hsl(${Math.random()*360|0},90%,70%)`];
        const shapes = [undefined, 'ring', 'heart'];
        const shape = shapes[Math.floor(Math.random()*shapes.length)];
        spawnRocket(centerX, topY, palette, shape);
        rocketSpawnTimer = 70 + Math.floor(Math.random() * 80);
      }

      // Also spawn occasional bursts along the text to accent it
      if (ENABLE_TEXT_STARS && textPoints.length) {
        textSpawnTimer--;
        if (textSpawnTimer <= 0) {
          const p = textPoints[textIndex++ % textPoints.length];
          spawnBurst(p.x, p.y, textColors, 28);
          textSpawnTimer = 14 + Math.floor(Math.random() * 10);
        }
      }

      // Update rockets (ascending)
      if (rockets.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.age++;
          r.vx += r.ax;
          r.vy += r.ay;
          r.x += r.vx;
          r.y += r.vy;
          // trail
          r.trail.push({ x: r.x, y: r.y });
          if (r.trail.length > 18) r.trail.shift();
          for (let t = 0; t < r.trail.length; t++) {
            const p = r.trail[t];
            const f = t / r.trail.length;
            ctx.globalAlpha = 0.18 + f * 0.35;
            ctx.fillStyle = r.colors?.[t % (r.colors?.length||1)] || 'rgba(255,230,200,1)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.2 + f * 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          // sparkle head
          ctx.fillStyle = '#fff8d6';
          ctx.beginPath();
          ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
          ctx.fill();

          const reached = (r.vy > -0.5) || (r.y <= r.targetY) || (r.age > r.life);
          if (reached) {
            // Pre-burst
            spawnBurst(r.x, r.y, r.colors, 20);
            // Main shaped burst
            spawnBurst(r.x, r.y, r.colors, undefined, r.shape);
            rockets.splice(i, 1);
          }
        }
        ctx.restore();
      }

      // Update particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age++;
        const t = p.age / p.life;
        // Physics
        p.vx *= PARTICLE_FRICTION;
        p.vy = p.vy * PARTICLE_FRICTION + PARTICLE_GRAVITY; // gravity
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

      // Draw star-text on top of particles for clarity (disabled when flag is false)
      if (ENABLE_TEXT_STARS && (textStars.length || textOutline.length)) {
        // Soft glow backdrop
        const pad = 28;
        const gx = Math.max(0, textBounds.minx - pad);
        const gy = Math.max(0, textBounds.miny - pad);
        const gw = Math.min(canvas.clientWidth, (textBounds.maxx - textBounds.minx) + pad * 2);
        const gh = Math.min(canvas.clientHeight, (textBounds.maxy - textBounds.miny) + pad * 2);
        const lg = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
        lg.addColorStop(0, 'rgba(255,160,220,0.18)');
        lg.addColorStop(1, 'rgba(140,220,255,0.18)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = 'blur(10px)';
        ctx.fillStyle = lg;
        ctx.fillRect(gx, gy, gw, gh);
        ctx.filter = 'none';
        ctx.restore();

        // Animated glint sweep across the text block
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const sweepW = Math.max(12, gw * 0.06);
        const sweepSpeed = Math.max(80, gw * 0.35);
        const sx = gx - sweepW + (fwTime * sweepSpeed) % (gw + sweepW * 2);
        const g2 = ctx.createLinearGradient(sx, gy, sx + sweepW, gy);
        g2.addColorStop(0.0, 'rgba(255,255,255,0.0)');
        g2.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        g2.addColorStop(1.0, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = g2;
        ctx.fillRect(sx, gy, sweepW, gh);
        ctx.restore();

        // Fill (white) stars
        if (textStars.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = '#ffffff';
          for (const s of textStars) {
            s.tw += 0.02 * s.s;
            const tw = 0.5 + Math.sin(s.tw) * 0.5;
            const alpha = 0.55 * s.b + 0.45 * tw;
            const size = s.r * (0.96 + tw * 0.42);
            const wave = Math.sin((s.x * 0.02) + fwTime * 1.4) * 0.6;
            ctx.globalAlpha = Math.min(1, alpha * 1.3);
            ctx.beginPath();
            ctx.arc(s.x, s.y + wave, size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Outline: subtle color gradient per x-position
        if (textOutline.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (const s of textOutline) {
            s.tw += 0.02 * s.s;
            const tw = 0.5 + Math.sin(s.tw) * 0.5;
            const alpha = 0.55 * s.b + 0.45 * tw;
            const size = s.r * (0.9 + tw * 0.36);
            const nx = (s.x - textBounds.minx) / Math.max(1, (textBounds.maxx - textBounds.minx));
            const hue = (320 - nx * 120 + fwTime * 50) % 360; // animated pink->cyan
            const wave = Math.sin((s.x * 0.02) + fwTime * 1.4) * 0.5;
            ctx.globalAlpha = Math.min(1, alpha * 1.25);
            ctx.fillStyle = `hsl(${hue}, 90%, 70%)`;
            ctx.beginPath();
            ctx.arc(s.x, s.y + wave, size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Occasional lens-flares on random letters
        flareTimer--;
        if (flareTimer <= 0 && textPoints.length) {
          const p = textPoints[Math.floor(Math.random() * textPoints.length)];
          textFlares.push({ x: p.x, y: p.y, age: 0, life: 50 + Math.random() * 30, r0: 10 + Math.random() * 16 });
          flareTimer = 30 + Math.floor(Math.random() * 50);
        }
        if (textFlares.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (let i = textFlares.length - 1; i >= 0; i--) {
            const f = textFlares[i];
            f.age++;
            const t = f.age / f.life;
            const a = Math.max(0, 1 - t);
            const rad = f.r0 * (0.7 + t * 2.1);
            const g = ctx.createRadialGradient(f.x, f.y, rad * 0.2, f.x, f.y, rad);
            g.addColorStop(0, `rgba(255,255,255,${0.35 * a})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
            ctx.fill();
            if (t >= 1) textFlares.splice(i, 1);
          }
          ctx.restore();
        }
      }

      raf = running ? requestAnimationFrame(update) : null;
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      // Prime background
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      // Initialize timers
      textMode = false;
      textIndex = 0;
      textDelayFrames = 120; // ~2s at 60fps
      spawnTimer = 10;
      rocketSpawnTimer = 30;
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

    // --- Hằng số ---
    const OUTLINE_POINTS = 360;
    const BACKGROUND_TRAIL_ALPHA = 0.25;
    const AMBIENT_STAR_COUNT_DIVISOR = 8000;
    const HEART_BEAT_SPEED = 2.6;
    const HEART_BEAT_AMP = 0.055;

    const heartPoints = [];
    const heartFill = [];
    const ambientStars = [];
    let time = 0;
    let cx = 0, cy = 0, baseScale = 1;
    
    function buildHeartPath(scale, centerX, centerY) {
      const path = new Path2D();
      for (let i = 0; i <= OUTLINE_POINTS; i++) {
        const t = (i / OUTLINE_POINTS) * Math.PI * 2;
        const { x: xh, y: yh } = heartParametric(t);
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
        const t = (i / outlineDensity) * Math.PI * 2; // Keep density separate from shape points
        const { x: xh, y: yh } = heartParametric(t);
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
      const count = Math.floor((canvas.clientWidth * canvas.clientHeight) / AMBIENT_STAR_COUNT_DIVISOR);
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
      ctx.fillStyle = `rgba(6,8,20, ${BACKGROUND_TRAIL_ALPHA})`;
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
      const beat = 1 + HEART_BEAT_AMP * Math.sin(time * HEART_BEAT_SPEED);

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

    function makeHeart(cx, cy, scale, outlineCount) {
      const pts = [];
      const path = new Path2D();
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let i = 0; i <= outlineCount; i++) {
        const t = (i / outlineCount) * Math.PI * 2; // Use outlineCount for path detail
        const h = heartParametric(t);
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
