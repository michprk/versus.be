// Animations : intro, défilement fluide, titres lettre par lettre, photos en volet, parallaxe,
// galerie horizontale, bandeaux géants, hero interactif (lettres aimantées, traînée de pétales),
// boutons magnétiques à remplissage, inclinaison 3D, bulle-curseur, compteurs, textes brouillés.
// Tout est désactivé si l'utilisateur a demandé « réduire les animations ».

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
const html = document.documentElement;
const reduced = html.classList.contains('reduced');
const finePointer = matchMedia('(pointer: fine) and (hover: hover)').matches;
const SOFT_HYPHEN = String.fromCharCode(173);

export function initMotion() {
  intro();
  splitHeadings();
  reveal();
  counters();
  scrollEffects();
  gallery();
  if (reduced) return;
  marquee();
  hero();
  if (finePointer) { smoothScroll(); magnetic(); buttonFill(); tilt(); cursor(); }
}

/* Écran d'intro (1re visite) : le rideau est animé en CSS, ici on fait tourner le compteur. */
function intro() {
  const el = document.querySelector('[data-loader]');
  if (!el) return;
  if (!html.classList.contains('intro')) { el.remove(); return; }
  try { sessionStorage.setItem('vs_intro', '1'); } catch { /* ignore */ }
  const count = el.querySelector('[data-loader-count]');
  const t0 = performance.now();
  const step = (now) => {
    const p = clamp((now - t0) / 1050, 0, 1);
    count.textContent = Math.round((1 - Math.pow(1 - p, 3)) * 100);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => el.remove(), 2600);
}

/* Découpe les titres [data-split] en lettres animées (le lecteur d'écran lit l'aria-label). */
function splitHeadings() {
  if (reduced) return;
  $$('[data-split]').forEach((el) => {
    el.setAttribute('aria-label', el.textContent.split(SOFT_HYPHEN).join('').replace(/\s+/g, ' ').trim());
    let ci = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const w = document.createElement('span');
            w.setAttribute('aria-hidden', 'true');
            if (part.includes(SOFT_HYPHEN)) {
              // Mot très long à césure conseillée : animé d'un bloc pour garder la césure possible
              w.className = 'w w-soft';
              const c = document.createElement('span');
              c.className = 'c'; c.style.setProperty('--ci', ci++); c.textContent = part;
              w.append(c);
            } else {
              w.className = 'w';
              for (const ch of part) {
                const c = document.createElement('span');
                c.className = 'c'; c.style.setProperty('--ci', ci++); c.textContent = ch;
                w.append(c);
              }
            }
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    el.classList.add('is-split');
  });
}

/* Apparitions au défilement (+ photos en volet + étiquettes au texte brouillé). */
function reveal() {
  if (!reduced) $$('.card-media, .bouquet-media, .gallery-img, .dark-media').forEach((e) => e.setAttribute('data-reveal-img', ''));
  // En mouvement réduit, seuls les fondus [data-reveal] sont conservés (aucun déplacement)
  const els = reduced ? $$('[data-reveal]') : $$('[data-reveal], [data-split], [data-reveal-img]');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      if (!reduced && en.target.classList.contains('tag')) scramble(en.target);
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/* Texte « brouillé » qui se résout lettre par lettre (étiquettes 01 — Offres B2B, etc.). */
function scramble(el) {
  const final = el.textContent;
  if (!final.trim() || el.children.length) return;
  el.setAttribute('aria-label', final);
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789✺#%&';
  const t0 = performance.now();
  const dur = 700;
  const step = (now) => {
    const p = clamp((now - t0) / dur, 0, 1);
    const shown = Math.floor(p * final.length);
    el.textContent = final.split('').map((ch, i) => (i < shown || ch === ' ' ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('');
    if (p < 1) requestAnimationFrame(step); else el.textContent = final;
  };
  requestAnimationFrame(step);
}

/* Compteurs : « 55 € » compte de 0 à 55 quand il devient visible. */
function counters() {
  const els = $$('[data-count], [data-count-price]');
  if (reduced || !('IntersectionObserver' in window)) return;
  const run = (el) => {
    const raw = el.textContent;
    const m = raw.match(/\d+/);
    if (!m || +m[0] < 10) return;
    const target = +m[0];
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / 1400, 0, 1);
      el.textContent = raw.replace(m[0], String(Math.round(target * (1 - Math.pow(1 - p, 4)))));
      if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.6 });
  els.forEach((e) => io.observe(e));
}

/* Une seule boucle liée au défilement : progression, parallaxe, bandeaux géants, sortie du hero. */
function scrollEffects() {
  const bar = document.querySelector('.progress span');
  const para = reduced ? [] : $$('[data-speed]').map((el) => ({ el, speed: parseFloat(el.dataset.speed) || 0.1 }));
  const megas = reduced ? [] : $$('[data-mega]').map((el) => ({ el, dir: +el.dataset.mega || 1 }));
  const heroEl = reduced ? null : document.querySelector('[data-hero]');
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    para.forEach(({ el, speed }) => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * speed).toFixed(1)}px`);
    });
    megas.forEach(({ el, dir }) => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      const range = Math.max(0, el.scrollWidth - innerWidth * 0.6);
      el.style.setProperty('--megax', `${(-(dir > 0 ? p : 1 - p) * range).toFixed(1)}px`);
    });
    if (heroEl) {
      const h = heroEl.offsetHeight;
      const p = clamp(scrollY / h, 0, 1);
      if (p < 1) {
        heroEl.style.setProperty('--hc', `${(p * h * 0.22).toFixed(1)}px`);
        heroEl.style.setProperty('--ho', (1 - p * 0.9).toFixed(3));
        heroEl.style.setProperty('--hs', (1 - p * 0.12).toFixed(4));
        heroEl.style.setProperty('--hsy', `${(p * h * 0.1).toFixed(1)}px`);
      }
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  update();
}

/* Galerie « Le lieu » : épinglée et défilée horizontalement sur grand écran, swipe natif sinon. */
function gallery() {
  const sec = document.querySelector('[data-gallery]');
  if (!sec) return;
  const track = sec.querySelector('[data-gallery-track]');
  const bar = sec.querySelector('[data-gallery-bar]');
  const mq = matchMedia('(min-width: 980px)');
  let overflow = 0;
  const setBar = (p) => bar && bar.style.setProperty('--g', clamp(p, 0.08, 1).toFixed(3));
  const measure = () => {
    const pin = mq.matches && !reduced;
    sec.classList.toggle('is-pinned', pin);
    if (!pin) { sec.style.removeProperty('--gallery-h'); track.style.removeProperty('--gx'); return; }
    overflow = Math.max(0, track.scrollWidth - innerWidth);
    sec.style.setProperty('--gallery-h', `${innerHeight + overflow}px`);
    onScroll();
  };
  const onScroll = () => {
    if (!sec.classList.contains('is-pinned')) return;
    const p = overflow ? clamp(-sec.getBoundingClientRect().top / overflow, 0, 1) : 0;
    track.style.setProperty('--gx', `${(-p * overflow).toFixed(1)}px`);
    setBar(p);
  };
  track.addEventListener('scroll', () => {
    const max = track.scrollWidth - track.clientWidth;
    setBar(max > 0 ? track.scrollLeft / max : 0);
  }, { passive: true });
  addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
  addEventListener('resize', measure);
  mq.addEventListener('change', measure);
  track.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure, { once: true }));
  measure();
}

/* Bandeau : accélère avec la vitesse de défilement et change de sens quand on remonte. */
function marquee() {
  const wrap = document.querySelector('[data-marquee]');
  const anim = wrap?.querySelector('.marquee-track')?.getAnimations?.()[0];
  if (!anim) return;
  wrap.classList.add('is-skewed');
  let last = scrollY, dir = 1, rate = 1, skew = 0, visible = true, raf = 0;
  const loop = () => {
    const v = scrollY - last;
    last = scrollY;
    if (Math.abs(v) > 0.5) dir = v > 0 ? 1 : -1;
    rate = lerp(rate, dir * (1 + Math.min(Math.abs(v) * 0.12, 5)), 0.08);
    skew = lerp(skew, clamp(-v * 0.25, -10, 10), 0.12);
    anim.playbackRate = rate;
    wrap.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { last = scrollY; raf = requestAnimationFrame(loop); }
  }).observe(wrap);
}

/* Hero interactif : parallaxe des calques, lettres aimantées au curseur, traînée de pétales. */
function hero() {
  const el = document.querySelector('[data-hero]');
  if (!el || !finePointer) return;
  const title = el.querySelector('.hero-title');
  const canvas = el.querySelector('[data-trail]');
  const ctx = canvas?.getContext('2d');
  let mx = 0, my = 0, cx = 0, cy = 0, px = -9999, py = -9999, raf = 0, inside = false;
  let chars = [];
  const petals = [];
  const colors = ['#f7f4e8', '#c6c3ba', '#f0a8c8', '#f7f4e8'];
  let lastSpawn = 0;

  // Les lettres du titre deviennent « aimantées » une fois l'animation d'entrée terminée
  const prepareLetters = () => {
    title.querySelectorAll('.line-in').forEach((li) => {
      [...li.childNodes].forEach((n) => {
        if (n.nodeType !== 3 || !n.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((word) => {
          if (!word) return;
          if (/^\s+$/.test(word)) { frag.append(' '); return; }
          const w = document.createElement('span'); // mot insécable
          w.style.whiteSpace = 'nowrap'; w.setAttribute('aria-hidden', 'true');
          for (const ch of word) {
            const s = document.createElement('span');
            s.className = 'hc'; s.textContent = ch;
            w.append(s);
          }
          frag.append(w);
        });
        n.replaceWith(frag);
      });
    });
    title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
    chars = [...title.querySelectorAll('.hc')].map((s) => ({ s, y: 0, r: 0 }));
  };
  const delay = html.classList.contains('intro') ? 3200 : 1900;
  setTimeout(prepareLetters, delay);

  const resize = () => {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = el.offsetWidth * dpr; canvas.height = el.offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    px = e.clientX; py = e.clientY;
    inside = true;
    const now = performance.now();
    if (ctx && now - lastSpawn > 28 && petals.length < 60) {
      lastSpawn = now;
      petals.push({ x: e.clientX - r.left, y: e.clientY - r.top, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.2, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.12, s: 5 + Math.random() * 7, life: 1, c: colors[(Math.random() * colors.length) | 0] });
    }
    if (!raf) raf = requestAnimationFrame(loop);
  });
  el.addEventListener('pointerleave', () => { mx = 0; my = 0; inside = false; px = py = -9999; if (!raf) raf = requestAnimationFrame(loop); });

  function loop() {
    cx = lerp(cx, mx, 0.08); cy = lerp(cy, my, 0.08);
    el.style.setProperty('--hx', `${(cx * 26).toFixed(2)}px`);
    el.style.setProperty('--hy', `${(cy * 18).toFixed(2)}px`);
    el.style.setProperty('--bpx', `${(cx * -46).toFixed(2)}px`);
    el.style.setProperty('--bpy', `${(cy * -30).toFixed(2)}px`);
    el.style.setProperty('--cpx', `${(cx * 38).toFixed(2)}px`);
    el.style.setProperty('--cpy', `${(cy * 26).toFixed(2)}px`);
    // Lettres : se soulèvent et pivotent à l'approche du curseur
    let lettersMoving = false;
    chars.forEach((c) => {
      const b = c.s.getBoundingClientRect();
      const d = Math.hypot(px - (b.left + b.width / 2), py - (b.top + b.height / 2));
      const f = Math.max(0, 1 - d / 170);
      const ty = -f * f * 26, tr = (px < b.left + b.width / 2 ? -1 : 1) * f * 8;
      c.y = lerp(c.y, ty, 0.2); c.r = lerp(c.r, tr, 0.2);
      if (Math.abs(c.y - ty) > 0.1) lettersMoving = true;
      c.s.style.setProperty('--ly', `${c.y.toFixed(2)}px`);
      c.s.style.setProperty('--lr', `${c.r.toFixed(2)}deg`);
    });
    // Pétales
    if (ctx) {
      ctx.clearRect(0, 0, el.offsetWidth, el.offsetHeight);
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.vy += 0.045; p.x += p.vx + Math.sin(p.life * 8) * 0.4; p.y += p.vy; p.r += p.vr; p.life -= 0.012;
        if (p.life <= 0) { petals.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = Math.min(p.life * 1.4, 0.9); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.42, p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    const settling = Math.abs(cx - mx) > 0.001 || Math.abs(cy - my) > 0.001;
    raf = inside || settling || lettersMoving || petals.length ? requestAnimationFrame(loop) : 0;
  }
}

/* Défilement fluide avec inertie (souris uniquement ; clavier, trackpad horizontal et tactile restent natifs). */
function smoothScroll() {
  html.classList.add('smooth-js');
  html.style.scrollBehavior = 'auto';
  let target = scrollY, current = scrollY, running = false;
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  const tick = () => {
    current = lerp(current, target, 0.1);
    if (Math.abs(target - current) < 0.5) { current = target; running = false; }
    window.scrollTo(0, current);
    if (running) requestAnimationFrame(tick);
  };
  const go = (y) => { target = clamp(y, 0, maxY()); if (!running) { running = true; current = scrollY; requestAnimationFrame(tick); } };
  window.vsScrollTo = go;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented || document.body.classList.contains('menu-open')) return;
    if (e.target.closest?.('textarea, .cookie, .menu')) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    go((running ? target : scrollY) + d);
  }, { passive: false });
  addEventListener('scroll', () => { if (!running) target = current = scrollY; }, { passive: true });
  // Ancres internes (#devis, #tarifs…) : même glissé fluide
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    const dest = id && document.getElementById(id);
    if (!dest) return;
    e.preventDefault();
    const offset = parseFloat(getComputedStyle(html).scrollPaddingTop) || 80;
    go(dest.getBoundingClientRect().top + scrollY - offset);
    history.replaceState(null, '', `#${id}`);
    if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
    setTimeout(() => dest.focus({ preventScroll: true }), 600);
  });
}

/* Boutons magnétiques : ils suivent légèrement le curseur. */
function magnetic() {
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px`);
      el.style.setProperty('--my', `${((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); });
  });
}

/* Remplissage des boutons depuis le point d'entrée du curseur. */
function buttonFill() {
  const set = (e) => {
    const b = e.target.closest?.('.btn');
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--bx', `${e.clientX - r.left}px`);
    b.style.setProperty('--by', `${e.clientY - r.top}px`);
  };
  document.addEventListener('pointerover', set);
  document.addEventListener('pointerout', set);
}

/* Inclinaison 3D des cartes et de la photo principale. */
function tilt() {
  $$('[data-tilt]').forEach((el) => {
    const max = el.classList.contains('hero-photo') ? 6 : 3;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--rx', `${(-((e.clientY - r.top) / r.height - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width - 0.5) * max * 1.3).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
}

/* Bulle violette qui suit le curseur au survol des photos (le curseur natif reste visible). */
function cursor() {
  const c = document.querySelector('.cursor');
  const label = c?.querySelector('.cursor-label');
  if (!c) return;
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, raf = 0;
  const loop = () => {
    cx = lerp(cx, x, 0.18); cy = lerp(cy, y, 0.18);
    c.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    raf = Math.abs(cx - x) + Math.abs(cy - y) > 0.3 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    if (t) { label.textContent = t.dataset.cursor; c.classList.add('is-active'); }
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest('[data-cursor]');
    if (t && !t.contains(e.relatedTarget)) c.classList.remove('is-active');
  });
}
