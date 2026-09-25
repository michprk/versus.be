// Point d'entrée : en-tête, menu mobile, statut d'ouverture, CTA flottant, suivi analytics.
import { initConsent, track } from './consent.js';
import { initMotion } from './motion.js';
import { initQuote } from './quote.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const reduced = html.classList.contains('reduced');
const I18N = (() => { try { return JSON.parse($('#i18n')?.textContent || '{}'); } catch { return {}; } })();

initConsent();
initHeader();
initMenu();
initStatus();
initFloat();
initNavSpy();
initTracking();
initNotFound();
initQuote(I18N);
initMotion();

/* En-tête : se cache en descendant, réapparaît en remontant. */
function initHeader() {
  const h = $('[data-header]');
  if (!h) return;
  html.style.setProperty('--header-h', `${h.offsetHeight}px`);
  let last = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    const hide = y > 240 && y > last + 4 && !document.body.classList.contains('menu-open') && !h.contains(document.activeElement);
    if (hide) h.classList.add('is-hidden');
    else if (y < last - 4 || y < 240) h.classList.remove('is-hidden');
    last = y;
  }, { passive: true });
}

/* Menu mobile plein écran (Échap pour fermer, focus conservé). */
function initMenu() {
  const btn = $('[data-burger]');
  const menu = $('[data-menu]');
  if (!btn || !menu) return;
  const open = () => {
    menu.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    setTimeout(() => menu.querySelector('a')?.focus(), reduced ? 0 : 250);
  };
  const close = (focusBtn = true) => {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, reduced ? 0 : 700);
    if (focusBtn) btn.focus();
  };
  btn.addEventListener('click', () => (btn.getAttribute('aria-expanded') === 'true' ? close() : open()));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') close(); });
  matchMedia('(min-width: 980px)').addEventListener('change', (e) => { if (e.matches) close(false); });
}

/* Statut d'ouverture en direct (heure de Bruxelles). */
function initStatus() {
  const el = $('[data-status]');
  if (!el || !I18N.open) return;
  const H = { Tue: [870, 1080], Wed: [600, 1080], Thu: [600, 1080], Fri: [600, 1080], Sat: [600, 1140], Sun: [600, 990] };
  const update = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t)?.value;
    const m = (+g('hour') % 24) * 60 + +g('minute');
    const d = H[g('weekday')];
    const isOpen = !!d && m >= d[0] && m < d[1];
    let label = I18N.closed;
    if (isOpen) {
      const hh = Math.floor(d[1] / 60), mm = d[1] % 60;
      const time = html.dataset.lang === 'nl' ? `${hh}${mm ? '.' + String(mm).padStart(2, '0') : ''} u` : `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`;
      label = I18N.open.replace('{h}', time);
    }
    el.classList.toggle('is-open', isOpen);
    $('[data-status-label]', el).textContent = label;
  };
  update();
  setInterval(update, 60000);
}

/* CTA flottant : visible après le hero, masqué quand le formulaire est à l'écran. */
function initFloat() {
  const f = $('[data-float]');
  const quote = $('#devis');
  if (!f) return;
  let quoteVisible = false;
  if (quote && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { quoteVisible = e.isIntersecting; update(); }, { threshold: 0.05 }).observe(quote);
  }
  const update = () => {
    const show = scrollY > 700 && !quoteVisible && !document.body.classList.contains('quote-sent');
    f.classList.toggle('is-visible', show);
    f.tabIndex = show ? 0 : -1;
    f.setAttribute('aria-hidden', show ? 'false' : 'true');
  };
  addEventListener('scroll', update, { passive: true });
  update();
}

/* Lien de navigation actif selon la section visible. */
function initNavSpy() {
  const links = $$('[data-nav]');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map(links.map((l) => [l.dataset.nav, l]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((x) => x.classList.remove('is-active'));
      map.get(e.target.id)?.classList.add('is-active'); // section hors menu (devis, presse…) : aucun lien actif
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => io.observe(s));
}

/* Suivi : clics sur les CTA, téléphone, email, liens sortants, FAQ, profondeur de défilement. */
function initTracking() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-track]');
    if (t) track(t.dataset.track, { label: t.dataset.trackLabel || t.textContent.trim().slice(0, 60) });
    const ls = e.target.closest('[data-lang-switch]');
    if (ls) { try { localStorage.setItem('vs_lang', ls.dataset.langSwitch); } catch { /* ignore */ } track('lang_switch', { to: ls.dataset.langSwitch }); }
  });
  $$('.faq-item').forEach((d) => d.addEventListener('toggle', () => { if (d.open) track('faq_open', { question: d.querySelector('summary span').textContent.slice(0, 80) }); }));
  const marks = [25, 50, 75, 90];
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? (scrollY / max) * 100 : 0;
    while (marks.length && p >= marks[0]) track('scroll_depth', { percent: marks.shift() });
  }, { passive: true });
}

/* 404 bilingue : affiche la langue correspondant à l'URL demandée. */
function initNotFound() {
  const blocks = $$('[data-nf]');
  if (!blocks.length) return;
  const path = location.pathname.slice((html.dataset.base || '').length); // sans le sous-dossier éventuel
  const nl = /^\/nl(\/|$)/.test(path) || (!/^\/fr(\/|$)/.test(path) && /^nl/i.test(navigator.language));
  const lang = nl ? 'nl' : 'fr';
  blocks.forEach((b) => b.classList.toggle('is-other', b.dataset.nf !== lang));
  if (nl) { html.lang = 'nl-BE'; document.title = 'Pagina niet gevonden | Versus'; }
  track('page_not_found', { path: location.pathname });
}
