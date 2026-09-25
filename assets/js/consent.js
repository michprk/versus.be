// Bannière cookies conforme RGPD / APD + Google Analytics 4 en Consent Mode v2.
// Rien n'est chargé chez Google tant que le visiteur n'a pas accepté la mesure d'audience.

const KEY = 'vs_consent';
const MAX_AGE = 182 * 24 * 3600 * 1000; // choix redemandé après 6 mois
const GA_ID = document.documentElement.dataset.ga || '';
const DEBUG = /[?&]debug_analytics\b/.test(location.search);

let state = null; // { analytics: bool, ts }
let gaLoaded = false;

window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted' });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Date.now() - s.ts < MAX_AGE) return s;
  } catch { /* stockage indisponible (navigation privée) */ }
  return null;
}
function save(analytics) {
  state = { v: 1, analytics: !!analytics, ts: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  apply();
}

function apply() {
  const ok = !!state?.analytics;
  gtag('consent', 'update', { analytics_storage: ok ? 'granted' : 'denied' });
  if (ok && GA_ID && !gaLoaded) {
    gaLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.append(s);
    gtag('js', new Date());
    gtag('config', GA_ID, {
      cookie_expires: 34128000, // 13 mois (recommandation APD/CNIL)
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }
  if (!ok) {
    // Retrait du consentement : on supprime les cookies Google existants
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
      const host = location.hostname.split('.').slice(-2).join('.');
      document.cookie = `${n}=; Max-Age=0; path=/`;
      document.cookie = `${n}=; Max-Age=0; path=/; domain=.${host}`;
    });
  }
}

/** Événement analytics : envoyé seulement si consentement + GA configuré. */
export function track(name, params = {}) {
  const payload = { ...params, page_language: document.documentElement.dataset.lang };
  if (DEBUG) console.info('[analytics]', name, payload, state?.analytics ? '(envoyé)' : '(bloqué : pas de consentement)');
  window.dispatchEvent(new CustomEvent('vs:track', { detail: { name, params: payload } }));
  if (state?.analytics && GA_ID) gtag('event', name, payload);
}

export function initConsent() {
  const box = document.querySelector('[data-cookie]');
  if (!box) return;
  const main = box.querySelector('[data-cookie-main]');
  const prefs = box.querySelector('[data-cookie-prefs]');
  const sw = box.querySelector('[data-consent-analytics]');
  const custom = box.querySelector('[data-consent="customize"]');

  const open = (withPrefs = false) => {
    box.hidden = false;
    main.hidden = withPrefs;
    prefs.hidden = !withPrefs;
    custom?.setAttribute('aria-expanded', String(withPrefs));
    sw.checked = !!state?.analytics;
    document.body.classList.add('cookie-open');
  };
  const close = () => {
    box.hidden = true;
    document.body.classList.remove('cookie-open');
  };

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-consent]');
    if (!b) return;
    const action = b.dataset.consent;
    if (action === 'accept') { save(true); close(); }
    else if (action === 'refuse') { save(false); close(); }
    else if (action === 'save') { save(sw.checked); close(); }
    else if (action === 'customize') { open(true); sw.focus(); }
    if (action !== 'customize') track('consent_update', { analytics: !!state?.analytics });
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state) close(); });
  document.querySelectorAll('[data-cookie-settings]').forEach((b) => b.addEventListener('click', () => {
    open(true);
    sw.focus();
  }));

  state = load();
  if (state) apply(); else open(false);
}
