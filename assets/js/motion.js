// Animations : apparitions au défilement, titres mot à mot, parallaxe, galerie horizontale,
// bandeau réactif à la vitesse, boutons magnétiques, inclinaison 3D, bulle-curseur, compteurs.
// Tout est désactivé si l'utilisateur a demandé « réduire les animations ».

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
const html = document.documentElement;
const reduced = html.classList.contains('reduced');
const finePointer = matchMedia('(pointer: fine) and (hover: hover)').matches;

export function initMotion() {
  splitHeadings();
  reveal();
  counters();
  progressAndParallax();
  gallery();
  if (reduced) return;
  marquee();
  if (finePointer) { magnetic(); tilt(); cursor(); }
}

/* Découpe les titres [data-split] en mots animés (le lecteur d'écran lit l'aria-label). */
function splitHeadings() {
  if (reduced) return;
  $$('[data-split]').forEach((el) => {
    el.setAttribute('aria-label', el.textContent.replace(/­/g, '').replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const w = document.createElement('span');
            w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            w.innerHTML = `<span class="w-in" style="--wi:${i++}"></span>`;
            w.firstChild.textContent = part;
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

function reveal() {
  const els = $$('[data-reveal], [data-split]');
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
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
    const dur = 1400;
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = raw.replace(m[0], String(Math.round(target * e)));
      if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
  }, { threshold: 0.6 });
  els.forEach((e) => io.observe(e));
}

/* Barre de progression + parallaxe (une seule boucle rAF, déclenchée par le scroll). */
function progressAndParallax() {
  const bar = document.querySelector('.progress span');
  const items = reduced ? [] : $$('[data-speed]').map((el) => ({ el, speed: parseFloat(el.dataset.speed) || 0.1 }));
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    const vh = innerHeight;
    items.forEach(({ el, speed }) => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const center = r.top + r.height / 2 - vh / 2;
      el.style.setProperty('--py', `${(center * speed).toFixed(1)}px`);
    });
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
    const top = sec.getBoundingClientRect().top;
    const p = overflow ? clamp(-top / overflow, 0, 1) : 0;
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
  // Les images chargées en différé peuvent modifier la largeur : on remesure
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
    const target = dir * (1 + Math.min(Math.abs(v) * 0.12, 5));
    rate = lerp(rate, target, 0.08);
    skew = lerp(skew, clamp(-v * 0.25, -10, 10), 0.12);
    anim.playbackRate = rate;
    wrap.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  // La boucle ne tourne que lorsque le bandeau est à l'écran (économie de batterie)
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { last = scrollY; raf = requestAnimationFrame(loop); }
  }).observe(wrap);
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

/* Inclinaison 3D des cartes et de la photo principale. */
function tilt() {
  $$('[data-tilt]').forEach((el) => {
    const max = el.classList.contains('hero-photo') ? 6 : 3;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * max * 1.3).toFixed(2)}deg`);
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
  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    if (t) { label.textContent = t.dataset.cursor; c.classList.add('is-active'); }
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest('[data-cursor]');
    if (t && !t.contains(e.relatedTarget)) c.classList.remove('is-active');
  });
}
