// Tarifs publics Versus (versusfleurs.be/boutique, relevés le 25/09/2026) + calcul d'estimation.
// Module partagé : utilisé tel quel par le navigateur (estimateur) ET par l'API (recalcul côté serveur).

export const PRICES = {
  bouquets: { unpeu: 35, beaucoup: 50, passion: 70, folie: 70 },
  delivery: { min: 15, max: 20 },
  workshop: { perPerson: 55, minPeople: 2 },
};

export const NEEDS = ['abonnement', 'cadeaux', 'evenement', 'atelier'];
export const FORMATS = ['unpeu', 'beaucoup', 'passion', 'folie'];
export const FREQS = { hebdo: 4, bimensuel: 2, mensuel: 1 };
export const DEFAULT_QTY = { abonnement: 1, cadeaux: 5, evenement: 4, atelier: 8 };
export const MAX_QTY = 200;

const LABELS = {
  fr: {
    formats: { unpeu: 'Un peu', beaucoup: 'Beaucoup', passion: 'Passionnément', folie: 'À la folie' },
    freqs: { hebdo: 'chaque semaine', bimensuel: 'toutes les 2 semaines', mensuel: 'chaque mois' },
    needs: { abonnement: 'Abonnement', cadeaux: 'Cadeaux', evenement: 'Événement', atelier: 'Team building' },
    from: 'dès', perMonth: '/ mois', pickup: 'Retrait en boutique', free: 'gratuit', included: 'inclus',
    delivery: 'Livraison Bruxelles', deliveries: (n) => `${n} livraison${n > 1 ? 's' : ''} Bruxelles`,
    passages: (n) => `${n} passage${n > 1 ? 's' : ''}`, workshop: 'atelier 1h30', bouquetEach: 'Bouquet de chaque participant',
    compo: 'composition À la folie', compos: (n) => `${n} compositions sur-mesure`, participants: (n) => `${n} participants`,
  },
  nl: {
    formats: { unpeu: 'Un peu', beaucoup: 'Beaucoup', passion: 'Passionnément', folie: 'À la folie' }, // noms de marque, identiques en NL
    freqs: { hebdo: 'elke week', bimensuel: 'om de 2 weken', mensuel: 'elke maand' },
    needs: { abonnement: 'Abonnement', cadeaux: 'Geschenken', evenement: 'Event', atelier: 'Teambuilding' },
    from: 'vanaf', perMonth: '/ maand', pickup: 'Afhalen in de winkel', free: 'gratis', included: 'inbegrepen',
    delivery: 'Levering Brussel', deliveries: (n) => `${n} levering${n > 1 ? 'en' : ''} Brussel`,
    passages: (n) => `${n} levering${n > 1 ? 'en' : ''}`, workshop: 'workshop 1u30', bouquetEach: 'Boeket voor elke deelnemer',
    compo: 'compositie À la folie', compos: (n) => `${n} composities op maat`, participants: (n) => `${n} deelnemers`,
  },
};

export const labels = (lang) => LABELS[lang] || LABELS.fr;

/** Nettoie une saisie (client ou serveur) : ne fait jamais confiance au navigateur. */
export function normalize(input = {}) {
  const need = NEEDS.includes(input.need) ? input.need : 'abonnement';
  let format = FORMATS.includes(input.format) ? input.format : 'beaucoup';
  if (need === 'evenement') format = 'folie';
  const freq = Object.hasOwn(FREQS, input.freq) ? input.freq : 'hebdo';
  const minQ = need === 'atelier' ? PRICES.workshop.minPeople : 1;
  let qty = Number.parseInt(input.qty, 10);
  if (!Number.isFinite(qty)) qty = DEFAULT_QTY[need];
  qty = Math.min(Math.max(qty, minQ), MAX_QTY);
  const pickup = need === 'atelier' ? false : input.pickup === true || input.pickup === 'true' || input.pickup === 'on' || input.pickup === '1';
  return { need, format, freq, qty, pickup, minQty: minQ };
}

/** Estimation indicative. max = null quand le prix est ouvert (« dès »). */
export function estimate(input) {
  const s = normalize(input);
  const { need, format, freq, qty, pickup } = s;
  const price = PRICES.bouquets[format];
  const isFrom = format === 'folie';
  const { min: dMin, max: dMax } = PRICES.delivery;
  let min = 0, max = 0, lines = [], period = 'total';

  if (need === 'abonnement') {
    const n = FREQS[freq];
    const flowers = price * qty * n;
    const dl = pickup ? [0, 0] : [dMin * n, dMax * n];
    min = flowers + dl[0]; max = isFrom ? null : flowers + dl[1]; period = 'month';
    lines = [
      { k: 'flowersSub', qty, format, n, v: [flowers, isFrom ? null : flowers] },
      pickup ? { k: 'pickup' } : { k: 'delivery', v: dl },
    ];
  } else if (need === 'cadeaux') {
    const flowers = price * qty;
    const dl = pickup ? [0, 0] : [dMin * qty, dMax * qty];
    min = flowers + dl[0]; max = isFrom ? null : flowers + dl[1];
    lines = [
      { k: 'flowers', qty, format, v: [flowers, isFrom ? null : flowers] },
      pickup ? { k: 'pickup' } : { k: 'deliveries', n: qty, v: dl },
    ];
  } else if (need === 'evenement') {
    const flowers = PRICES.bouquets.folie * qty;
    min = flowers + (pickup ? 0 : dMin); max = null;
    lines = [
      { k: 'compo', qty, v: [flowers, null] },
      pickup ? { k: 'pickup' } : { k: 'delivery', v: [dMin, dMax] },
    ];
  } else {
    min = max = PRICES.workshop.perPerson * qty;
    lines = [{ k: 'workshop', qty, v: [min, min] }, { k: 'bouquetEach' }];
  }
  return { ...s, min, max, period, lines };
}

export function formatEUR(n, lang = 'fr') {
  const num = Math.round(n).toLocaleString(lang === 'nl' ? 'nl-BE' : 'fr-BE').replace(/[  ]/g, ' ');
  return lang === 'nl' ? `€ ${num}` : `${num} €`;
}

/** Fourchette lisible : « 260 – 280 € », « dès 350 € », « € 55 ». */
export function formatRange(min, max, lang = 'fr') {
  const L = labels(lang);
  if (max == null) return `${L.from} ${formatEUR(min, lang)}`;
  if (min === max) return formatEUR(min, lang);
  return lang === 'nl' ? `€ ${formatEUR(min, lang).slice(2)} – ${formatEUR(max, lang).slice(2)}` : `${formatEUR(min, lang).slice(0, -2)} – ${formatEUR(max, lang)}`;
}

/** Lignes du détail, traduites. */
export function describeLines(est, lang = 'fr') {
  const L = labels(lang);
  return est.lines.map((l) => {
    const val = l.v ? (l.v[1] === null ? `${L.from} ${formatEUR(l.v[0], lang)}` : formatRange(l.v[0], l.v[1], lang)) : '';
    switch (l.k) {
      case 'flowersSub': return { k: `${l.qty} × ${L.formats[l.format]} × ${L.passages(l.n)}`, v: val };
      case 'flowers': return { k: `${l.qty} × ${L.formats[l.format]}`, v: val };
      case 'compo': return { k: `${l.qty} × ${L.compo}`, v: val };
      case 'workshop': return { k: `${l.qty} × ${L.workshop}`, v: val };
      case 'pickup': return { k: L.pickup, v: L.free };
      case 'delivery': return { k: L.delivery, v: val };
      case 'deliveries': return { k: L.deliveries(l.n), v: val };
      case 'bouquetEach': return { k: L.bouquetEach, v: L.included };
      default: return { k: '', v: val };
    }
  });
}

/** Résumé d'une ligne, joint à la demande de devis (email + CRM). */
export function summarize(est, lang = 'fr') {
  const L = labels(lang);
  let s;
  if (est.need === 'abonnement') s = `${L.needs.abonnement} — ${est.qty} × ${L.formats[est.format]}, ${L.freqs[est.freq]}`;
  else if (est.need === 'cadeaux') s = `${L.needs.cadeaux} — ${est.qty} × ${L.formats[est.format]}`;
  else if (est.need === 'evenement') s = `${L.needs.evenement} — ${L.compos(est.qty)}`;
  else s = `${L.needs.atelier} — ${L.participants(est.qty)}`;
  const range = formatRange(est.min, est.max, lang);
  return `${s} · ${range}${est.period === 'month' ? ' ' + L.perMonth : ''}${est.pickup ? ` · ${L.pickup.toLowerCase()}` : ''}`;
}
