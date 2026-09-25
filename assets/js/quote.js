// Estimateur de budget + formulaire de devis (validation, anti-spam, envoi à l'API).
import { estimate, describeLines, summarize, formatRange, DEFAULT_QTY } from './pricing.js';
import { track } from './consent.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = document.documentElement.classList.contains('reduced');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()./-]{6,24}$/;
const PERSONAL = ['gmail.com', 'hotmail.com', 'hotmail.be', 'hotmail.fr', 'outlook.com', 'outlook.be', 'live.be', 'live.com', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'telenet.be', 'skynet.be', 'proximus.be', 'msn.com'];

export function initQuote(i18n) {
  const form = $('[data-quote]');
  if (!form) return;
  const lang = document.documentElement.dataset.lang || 'fr';
  const api = (document.documentElement.dataset.api || '') + '/api';
  // Hébergement statique sans API (démo GitHub Pages) : la demande part par la messagerie du visiteur
  const staticMode = document.documentElement.dataset.mode === 'static';
  const T = i18n;

  const el = {
    qty: $('[data-qty]', form),
    qtyLabel: $('[data-qty-label]', form),
    price: $('[data-price]', form),
    period: $('[data-period]', form),
    lines: $('[data-lines]', form),
    result: $('[data-result]', form),
    summary: $('[data-summary]', form),
    body: $('[data-form-body]', form),
    success: $('[data-form-success]', form),
    alert: $('[data-form-alert]', form),
    submit: $('[data-submit]', form),
  };
  let current = estimate(read());
  let shown = { min: current.min, max: current.max };

  /* ---------- Estimateur ---------- */
  function read() {
    const fd = new FormData(form);
    return { need: fd.get('need'), format: fd.get('format'), freq: fd.get('freq'), qty: fd.get('qty'), pickup: fd.get('pickup') === '1' };
  }

  function setRadio(name, value) {
    const r = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (r) r.checked = true;
  }

  function render(animate = true) {
    // 1. Afficher / masquer les options selon le besoin (avant de lire le formulaire :
    //    les champs désactivés ne figurent pas dans FormData)
    const need = new FormData(form).get('need') || 'abonnement';
    $$('[data-show]', form).forEach((g) => {
      const on = g.dataset.show.split(' ').includes(need);
      g.classList.toggle('is-hidden', !on);
      g.querySelectorAll('input').forEach((i) => { i.disabled = !on; });
    });
    // 2. Calculer et afficher (pour un événement, le format « À la folie » est imposé par normalize())
    const est = estimate(read());
    el.qty.min = est.minQty;
    if (String(est.qty) !== el.qty.value && document.activeElement !== el.qty) el.qty.value = est.qty;
    el.qtyLabel.textContent = T.qtyLabels[est.need];
    el.period.textContent = est.period === 'month' ? T.perMonth : T.total;
    el.lines.innerHTML = describeLines(est, lang).map((l) => `<div><dt>${l.k}</dt><dd>${l.v}</dd></div>`).join('');
    el.summary.textContent = summarize(est, lang);
    tweenPrice(est, animate);
    current = est;
  }

  function tweenPrice(est, animate) {
    const from = { ...shown };
    const to = { min: est.min, max: est.max };
    if (!animate || reduced || from.max === null || to.max === null) {
      shown = to;
      el.price.textContent = formatRange(to.min, to.max, lang);
      return;
    }
    el.result.classList.remove('is-bump'); void el.result.offsetWidth; el.result.classList.add('is-bump');
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / 550, 1);
      const e = 1 - Math.pow(1 - p, 3);
      shown = { min: from.min + (to.min - from.min) * e, max: from.max + (to.max - from.max) * e };
      el.price.textContent = formatRange(Math.round(shown.min), Math.round(shown.max), lang);
      if (p < 1) requestAnimationFrame(step); else { shown = to; el.price.textContent = formatRange(to.min, to.max, lang); }
    };
    requestAnimationFrame(step);
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'need') {
      el.qty.value = DEFAULT_QTY[t.value];
      track('select_need', { need: t.value });
    }
    if (['need', 'format', 'freq', 'qty', 'pickup'].includes(t.name)) render();
  });
  el.qty.addEventListener('input', () => { if (el.qty.value !== '') render(); });
  el.qty.addEventListener('blur', () => render());
  $$('[data-step]', form).forEach((b) => b.addEventListener('click', () => {
    const v = (parseInt(el.qty.value, 10) || 0) + parseInt(b.dataset.step, 10);
    el.qty.value = Math.min(Math.max(v, +el.qty.min || 1), 200);
    render();
  }));

  // Boutons des offres et des tarifs → pré-remplissent l'estimateur puis descendent au formulaire
  const goToQuote = () => {
    const sec = $('#devis');
    sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    const title = $('#devis-title');
    if (title) { title.setAttribute('tabindex', '-1'); setTimeout(() => title.focus({ preventScroll: true }), reduced ? 0 : 700); }
  };
  document.addEventListener('click', (e) => {
    const est = e.target.closest('[data-estimate]');
    const pick = e.target.closest('[data-pick]');
    if (est) {
      setRadio('need', est.dataset.estimate);
      el.qty.value = DEFAULT_QTY[est.dataset.estimate];
      render(); goToQuote();
    } else if (pick) {
      const f = pick.dataset.pick;
      const needNow = new FormData(form).get('need');
      const need = f === 'folie' ? 'evenement' : needNow === 'abonnement' ? 'abonnement' : 'cadeaux';
      setRadio('need', need); setRadio('format', f);
      el.qty.value = DEFAULT_QTY[need];
      render(); goToQuote();
    }
  });

  /* ---------- Validation ---------- */
  const fields = {
    name: $('[name="name"]', form),
    company: $('[name="company"]', form),
    email: $('[name="email"]', form),
    phone: $('[name="phone"]', form),
    message: $('[name="message"]', form),
  };
  const touched = new Set();

  function validate(name) {
    const v = fields[name].value.trim();
    switch (name) {
      case 'name': return !v ? 'nameRequired' : v.length < 2 ? 'nameShort' : '';
      case 'email': return !v ? 'emailRequired' : !EMAIL_RE.test(v) || v.length > 254 ? 'emailInvalid' : '';
      case 'phone': return v && (!PHONE_RE.test(v) || v.replace(/\D/g, '').length < 8) ? 'phoneInvalid' : '';
      case 'message': return v.length > 2000 ? 'messageLong' : '';
      default: return '';
    }
  }
  function showError(name, code) {
    const input = fields[name];
    const box = document.getElementById(`e-${name}-${lang}`);
    if (!box) return;
    if (code) {
      input.setAttribute('aria-invalid', 'true');
      box.textContent = T.errors[code] || T.errors.summary;
      box.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      box.hidden = true; box.textContent = '';
    }
  }
  Object.keys(fields).forEach((name) => {
    const input = fields[name];
    input.addEventListener('blur', () => { if (input.value.trim()) touched.add(name); if (touched.has(name)) showError(name, validate(name)); if (name === 'email') emailHint(); });
    input.addEventListener('input', () => { if (touched.has(name)) showError(name, validate(name)); el.alert.hidden = true; });
  });

  // Aide email : faute de frappe probable (gmial.com) ou adresse personnelle
  const hint = document.getElementById(`h-email-${lang}`);
  function emailHint() {
    if (!hint) return;
    const v = fields.email.value.trim().toLowerCase();
    const domain = v.split('@')[1] || '';
    hint.hidden = true; hint.textContent = '';
    if (!domain || !EMAIL_RE.test(v)) return;
    const guess = PERSONAL.find((d) => d !== domain && distance(d, domain) <= 2);
    if (guess && !PERSONAL.includes(domain)) {
      const fixed = v.split('@')[0] + '@' + guess;
      const [a, b] = T.didYouMean.split('{email}');
      hint.textContent = a;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = fixed;
      btn.addEventListener('click', () => { fields.email.value = fixed; emailHint(); showError('email', validate('email')); fields.email.focus(); });
      hint.append(btn, b || '');
      hint.hidden = false;
    } else if (PERSONAL.includes(domain)) {
      hint.textContent = T.emailHint;
      hint.hidden = false;
    }
  }

  // Compteur de caractères du message
  const counter = document.getElementById(`c-message-${lang}`);
  fields.message.addEventListener('input', () => { counter.textContent = `${fields.message.value.length} / 2000`; });

  /* ---------- Anti-spam : jeton temporel signé par l'API ---------- */
  const tokenInput = $('[name="token"]', form);
  let tokenAt = 0;
  async function fetchToken() {
    if (staticMode || (tokenAt && Date.now() - tokenAt < 50 * 60 * 1000)) return;
    tokenAt = Date.now();
    try {
      const r = await fetch(`${api}/form-token`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (r.ok) tokenInput.value = (await r.json()).token || '';
    } catch { tokenAt = 0; }
  }
  form.addEventListener('focusin', fetchToken, { once: true });
  form.addEventListener('pointerdown', fetchToken, { once: true });

  // Cloudflare Turnstile (si configuré)
  const ts = $('.cf-turnstile', form);
  if (ts && !window.turnstile) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true; s.defer = true;
    document.head.append(s);
  }

  /* ---------- Envoi ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    Object.keys(fields).forEach((n) => touched.add(n));
    const errors = Object.fromEntries(Object.keys(fields).map((n) => [n, validate(n)]).filter(([, c]) => c));
    Object.keys(fields).forEach((n) => showError(n, errors[n] || ''));
    if (Object.keys(errors).length) {
      alertMsg(T.errors.summary);
      fields[Object.keys(errors)[0]].focus();
      track('form_error', { fields: Object.keys(errors).join(',') });
      return;
    }
    if (staticMode) {
      if ($('[name="website"]', form).value) return; // champ piège rempli : robot
      const est = estimate(read());
      const summary = summarize(est, lang);
      const L = T.mailLabels;
      const body = [
        `${L.estimate} : ${summary}`, '',
        `${L.name} : ${fields.name.value.trim()}`, `${L.company} : ${fields.company.value.trim()}`,
        `${L.email} : ${fields.email.value.trim()}`, `${L.phone} : ${fields.phone.value.trim()}`, '',
        `${L.message} :`, fields.message.value.trim(),
      ].join('\n');
      location.href = `mailto:${T.email}?subject=${encodeURIComponent(`${T.mailSubject} — ${summary}`)}&body=${encodeURIComponent(body)}`;
      $('[data-success-mail]', form).textContent = T.staticSent;
      return success(est, summary);
    }
    const tsResponse = form.querySelector('[name="cf-turnstile-response"]')?.value;
    if (ts && !tsResponse) { alertMsg(T.errors.captcha); return; }

    await fetchToken();
    const est = estimate(read());
    const payload = {
      name: fields.name.value.trim(), company: fields.company.value.trim(), email: fields.email.value.trim(),
      phone: fields.phone.value.trim(), message: fields.message.value.trim(),
      website: $('[name="website"]', form).value, token: tokenInput.value, lang,
      need: est.need, format: est.format, freq: est.freq, qty: est.qty, pickup: est.pickup,
      turnstile: tsResponse || '', page: location.pathname,
    };
    loading(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`${api}/devis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload), signal: ctrl.signal, credentials: 'omit',
      });
      clearTimeout(timer);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return success(est, data.summary || summarize(est, lang));
      if (r.status === 400 && data.errors) {
        Object.entries(data.errors).forEach(([n, c]) => fields[n] && showError(n, c));
        alertMsg(T.errors.summary);
      } else if (r.status === 429) alertMsg(T.errors.rate);
      else if (r.status === 403 || r.status === 422) { tokenAt = 0; alertMsg(T.errors.spam); }
      else alertMsg(T.errors.network);
      track('form_error', { status: r.status });
    } catch {
      alertMsg(T.errors.network);
      track('form_error', { status: 'network' });
    } finally {
      loading(false);
    }
  });

  function alertMsg(msg) {
    el.alert.textContent = msg;
    el.alert.hidden = false;
  }
  function loading(on) {
    el.submit.classList.toggle('is-loading', on);
    el.submit.setAttribute('aria-busy', on ? 'true' : 'false');
    const roll = el.submit.querySelector('.btn-roll');
    if (on) { roll.dataset.orig = roll.textContent; roll.textContent = T.sending; }
    else if (roll.dataset.orig) roll.textContent = roll.dataset.orig;
  }

  function success(est, summary) {
    const first = fields.name.value.trim().split(/\s+/)[0] || '';
    $('[data-success-title]', form).textContent = T.successTitle.replace('{name}', first);
    $('[data-success-summary]', form).textContent = summary;
    el.body.hidden = true;
    el.success.hidden = false;
    el.success.focus();
    document.body.classList.add('quote-sent');
    track('generate_lead', { need: est.need, value: est.min, currency: 'EUR' });
    if (!reduced) confetti($('[data-confetti]', form));
  }

  form.querySelector('[data-reset]').addEventListener('click', () => {
    Object.values(fields).forEach((f) => { f.value = ''; f.removeAttribute('aria-invalid'); });
    touched.clear();
    el.alert.hidden = true;
    counter.textContent = '0 / 2000';
    tokenAt = 0; tokenInput.value = '';
    if (window.turnstile) window.turnstile.reset();
    el.success.hidden = true;
    el.body.hidden = false;
    document.body.classList.remove('quote-sent');
    fields.name.focus();
  });

  render(false);
}

/* Distance de Levenshtein (suggestion de domaine email). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/* Pluie de pétales à l'envoi du formulaire. */
function confetti(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr; canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#643aed', '#000000', '#c6c3ba', '#643aed', '#f0a8c8'];
  const parts = Array.from({ length: 90 }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 80, y: height * 0.55,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    s: 6 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (now) => {
    ctx.clearRect(0, 0, width, height);
    parts.forEach((p) => {
      p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.45, p.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    if (now - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, width, height);
  };
  requestAnimationFrame(frame);
}
