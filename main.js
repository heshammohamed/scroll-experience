(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Progress of a tall section through the viewport, 0 → 1 while it is pinned.
  const sectionProgress = (el) => {
    const r = el.getBoundingClientRect();
    const total = r.height - innerHeight;
    return total > 0 ? clamp(-r.top / total) : clamp(1 - r.top / innerHeight);
  };

  /* ---------- Sky colour: dusk → midnight → deep → dawn ---------- */
  const stops = [
    [0.00, [58, 44, 110], [20, 16, 46]],
    [0.25, [24, 20, 62], [9, 8, 28]],
    [0.60, [8, 7, 24], [3, 3, 12]],
    [0.82, [24, 20, 62], [70, 40, 90]],
    [0.93, [255, 190, 170], [255, 228, 205]],
    [1.00, [255, 214, 186], [255, 240, 222]],
  ];
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  const skyAt = (p) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const [p1, t1, b1] = stops[i];
      const [p2, t2, b2] = stops[i + 1];
      if (p <= p2) {
        const t = (p - p1) / (p2 - p1);
        return [mix(t1, t2, t), mix(b1, b2, t)];
      }
    }
    return [stops.at(-1)[1], stops.at(-1)[2]];
  };

  /* ---------- Starfield ---------- */
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  let stars = [], dpr = 1, starAlpha = 1, scrollY = 0;
  const makeStars = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    const n = Math.round((innerWidth * innerHeight) / 4500);
    stars = Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random() * 1.6,
      r: Math.random() * 1.2 + 0.2,
      z: Math.random() * 0.6 + 0.1,          // parallax depth
      tw: Math.random() * Math.PI * 2,
    }));
  };
  const drawStars = (t) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (starAlpha <= 0.01) return;
    const h = innerHeight;
    for (const s of stars) {
      const y = ((s.y * h - scrollY * s.z * 0.15) % (h * 1.6) + h * 1.6) % (h * 1.6);
      if (y > h) continue;
      const a = (0.55 + 0.45 * Math.sin(t * 0.0015 + s.tw)) * starAlpha;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x * innerWidth * dpr, y * dpr, s.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- Word-by-word statement ---------- */
  const words = document.querySelector('[data-words]');
  words.innerHTML = words.textContent.trim().split(/\s+/)
    .map((w) => `<span class="w">${w}</span>`).join(' ');
  const wordEls = [...words.querySelectorAll('.w')];

  /* ---------- Elements ---------- */
  const hero = document.querySelector('.hero');
  const phases = document.getElementById('phases');
  const phaseItems = [...document.querySelectorAll('.phase-list li')];
  const drift = document.getElementById('drift');
  const track = document.querySelector('.drift-track');
  const deep = document.getElementById('deep');
  const layers = [...document.querySelectorAll('.layer')];
  const dawn = document.getElementById('dawn');
  const bar = document.querySelector('.progress span');
  const clock = document.getElementById('clock');

  const fmtClock = (p) => {
    const mins = Math.round(19 * 60 + p * 11.5 * 60) % (24 * 60); // 19:00 → 06:30
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  };

  /* ---------- Main scroll update ---------- */
  const update = () => {
    scrollY = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max) : 0;

    bar.style.transform = `scaleX(${p})`;
    clock.textContent = fmtClock(p);

    const [top, bot] = skyAt(p);
    document.body.style.background = `linear-gradient(180deg, rgb(${top}) 0%, rgb(${bot}) 100%) fixed`;
    starAlpha = clamp(1 - (p - 0.8) / 0.1);

    root.style.setProperty('--hero', clamp(scrollY / innerHeight));

    // Moon phase + timeline
    const ph = sectionProgress(phases);
    root.style.setProperty('--phase', ph);
    const idx = Math.min(phaseItems.length - 1, Math.floor(ph * phaseItems.length));
    phaseItems.forEach((li, i) => li.classList.toggle('active', i === idx));

    // Words light up as the paragraph passes the middle of the screen
    const wr = words.getBoundingClientRect();
    const wp = clamp((innerHeight * 0.75 - wr.top) / (wr.height + innerHeight * 0.3));
    const lit = Math.round(wp * wordEls.length);
    wordEls.forEach((w, i) => w.classList.toggle('on', i < lit));

    // Horizontal track
    const dp = sectionProgress(drift);
    const dist = track.scrollWidth - innerWidth;
    track.style.transform = `translate3d(${-dp * Math.max(0, dist)}px,0,0)`;

    // Parallax descent
    const deepP = sectionProgress(deep);
    layers.forEach((l) => {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(0, ${(1 - deepP) * d * 60 - deepP * d * 40}vh, 0)`;
    });

    // Sunrise
    const dr = dawn.getBoundingClientRect();
    root.style.setProperty('--dawn', clamp(1 - dr.top / innerHeight));
  };

  /* ---------- Reveals + counters ---------- */
  const countUp = (el) => {
    const target = +el.dataset.count;
    if (reduce) { el.textContent = target; return; }
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / 1600);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      const n = e.target.querySelector('[data-count]');
      if (n) countUp(n);
      io.unobserve(e.target);
    }
  }, { threshold: 0.3 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---------- Loop ---------- */
  let ticking = false;
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { update(); ticking = false; }); }
  }, { passive: true });
  addEventListener('resize', () => { makeStars(); update(); });

  makeStars();
  update();
  const frame = (t) => { drawStars(t); if (!reduce) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  requestAnimationFrame(() => document.body.classList.add('loaded'));
})();
