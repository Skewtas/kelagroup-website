// KELA OS – offertberäkning. Delas mellan webbläsare och server (servern räknar alltid om).
// Alla belopp är heltal i minsta valutaenhet (öre). Moms och rabatt i baspunkter (2500 = 25 %).
// Antal i tusendelar (1000 = 1 st). Inga flyttal i lagrade värden.

/** Avrundning halva uppåt (bort från noll) till heltal. */
export function roundHalfUp(x) {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Andel i baspunkter av ett belopp, avrundat. */
export function bpOf(amount, bp) {
  return roundHalfUp((amount * bp) / 10000);
}

/**
 * En rad: brutto = antal × à-pris, radrabatt, netto.
 * @param {{qty_milli:number, unit_price_minor:number, discount_bp?:number}} item
 */
export function calcLine(item) {
  const gross = roundHalfUp((item.qty_milli * item.unit_price_minor) / 1000);
  const discount = bpOf(gross, item.discount_bp || 0);
  return { gross, discount, net: gross - discount };
}

function groupVat(lines, quoteDiscountBp) {
  const byRate = new Map();
  for (const l of lines) byRate.set(l.vat_bp, (byRate.get(l.vat_bp) || 0) + l.net);
  const rates = [...byRate.entries()].sort((a, b) => b[0] - a[0]);
  let discount = 0, vat = 0, base = 0;
  const vatByRate = [];
  for (const [vat_bp, net] of rates) {
    const d = bpOf(net, quoteDiscountBp);
    const b = net - d;
    const v = bpOf(b, vat_bp);
    discount += d; base += b; vat += v;
    vatByRate.push({ vat_bp, base: b, vat: v });
  }
  return { discount, base, vat, vatByRate };
}

/**
 * Räknar fram offertens summor.
 * - Valfria tillägg (optional) räknas bara med om de finns i selectedOptional.
 * - Offertrabatten (discount_bp) gäller engångskostnaden.
 * - Radrabatt kan finnas på både engångs- och månadsrader.
 * @param {{items:Array<any>, discount_bp?:number, currency?:string}} q
 * @param {string[]} [selectedOptional] id:n på valda tillägg
 */
export function calcQuote(q, selectedOptional = []) {
  const selected = new Set(selectedOptional);
  const lines = (q.items || []).map((it) => ({ ...it, ...calcLine(it), included: !it.optional || selected.has(it.id) }));
  const inc = lines.filter((l) => l.included);
  const once = inc.filter((l) => l.billing === 'once');
  const monthly = inc.filter((l) => l.billing === 'monthly');

  const onceSub = once.reduce((s, l) => s + l.net, 0);
  const onceLineDiscount = once.reduce((s, l) => s + l.discount, 0);
  const og = groupVat(once, q.discount_bp || 0);

  const monthSub = monthly.reduce((s, l) => s + l.net, 0);
  const monthLineDiscount = monthly.reduce((s, l) => s + l.discount, 0);
  const mg = groupVat(monthly, 0);

  return {
    currency: q.currency || 'SEK',
    lines: lines.map((l) => ({ id: l.id, gross: l.gross, discount: l.discount, net: l.net, included: l.included })),
    once: {
      subtotal: onceSub,              // efter radrabatter, före offertrabatt, exkl. moms
      line_discount: onceLineDiscount,
      discount: og.discount,          // offertrabatt
      net: og.base,                   // exkl. moms
      vat: og.vat,
      total: og.base + og.vat,        // inkl. moms
      vat_by_rate: og.vatByRate,
    },
    monthly: {
      subtotal: monthSub,
      line_discount: monthLineDiscount,
      net: mg.base,
      vat: mg.vat,
      total: mg.base + mg.vat,
      vat_by_rate: mg.vatByRate,
    },
    optional_count: lines.filter((l) => !!l.optional).length,
  };
}

/** Marginal för en tjänst. Returnerar null om pris saknas. */
export function margin(price, cost) {
  if (price == null || price === 0) return null;
  const m = price - (cost || 0);
  return { amount: m, bp: roundHalfUp((m * 10000) / price) };
}

/** "1 234,50" → 123450 (öre). Accepterar mellanslag, komma eller punkt. Returnerar null vid tomt/ogiltigt. */
export function parseMoney(input) {
  if (input == null) return null;
  const s = String(input).replace(/\s| |kr|sek/gi, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [i, f = ''] = s.replace('-', '').split('.');
  const v = Number(i) * 100 + Number((f + '00').slice(0, 2));
  return s.startsWith('-') ? -v : v;
}

/** "1,5" → 1500 (tusendelar). */
export function parseQty(input) {
  const s = String(input ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return NaN;
  const [i, f = ''] = s.split('.');
  return Number(i) * 1000 + Number((f + '000').slice(0, 3));
}

/** "25" eller "12,5" (procent) → baspunkter. */
export function parsePercent(input) {
  const s = String(input ?? '').replace(/\s|%/g, '').replace(',', '.');
  if (s === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const v = Math.round(Number(s) * 100);
  return v > 10000 ? NaN : v;
}

const nfCache = new Map();
/** 123450 → "1 234,50 kr" (decimaler bara om öre finns, om inte always=true). */
export function formatMoney(minor, currency = 'SEK', opts = {}) {
  if (minor == null || Number.isNaN(minor)) return '–';
  const hasOre = minor % 100 !== 0;
  const key = currency + (hasOre || opts.decimals ? '2' : '0');
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat('sv-SE', {
      style: 'currency', currency,
      minimumFractionDigits: hasOre || opts.decimals ? 2 : 0,
      maximumFractionDigits: hasOre || opts.decimals ? 2 : 0,
    }));
  }
  return nfCache.get(key).format(minor / 100);
}

/** 123450 → "1234,50" (för inputfält). */
export function moneyInput(minor) {
  if (minor == null) return '';
  const neg = minor < 0; const a = Math.abs(minor);
  const s = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (a % 100 ? ',' + String(a % 100).padStart(2, '0') : '');
  return (neg ? '-' : '') + s;
}

export function qtyInput(milli) {
  if (milli == null) return '';
  const i = Math.floor(milli / 1000), f = milli % 1000;
  return f ? `${i},${String(f).padStart(3, '0').replace(/0+$/, '')}` : String(i);
}

export function percentInput(bp) {
  if (!bp) return '';
  return (bp / 100).toString().replace('.', ',');
}
