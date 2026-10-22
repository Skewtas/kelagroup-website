// Tjänster och prislista – redigerbar katalog. Prisändringar sparas som nya versioner; skickade offerter påverkas aldrig.
import { html, ico, setHTML, $, $$, money, empty, modal, formData, showErrors, withBusy, toast, pct, dateTime } from '../lib/ui.js';
import { get, post, patch } from '../lib/api.js';
import { parseMoney, moneyInput, margin } from '../lib/calc.js';

const VAT = [[2500, '25 %'], [1200, '12 %'], [600, '6 %'], [0, '0 %']];

export default async function services(view, _p, app) {
  app.setCrumbs([{ label: 'Tjänster och prislista' }]);
  const w = app.can('services:write');
  const r = await get('/services?all=1');
  const costs = r.costs_visible;
  const missing = r.services.filter((s) => s.active && !s.price).length;
  const cats = [...new Set(r.services.map((s) => s.category || 'Övrigt'))];

  setHTML(view, html`
    <div class="page-h"><div><h1>Tjänster och prislista</h1><div class="sub">Tjänstekatalogen som offerterna byggs av</div></div>
      <div class="act">${w ? html`<button class="btn" id="import">${ico('download')} Importera KELA-produkter</button><button class="btn primary" id="new">${ico('plus')} Ny tjänst</button>` : ''}</div></div>
    ${missing ? html`<div class="notice amber mb16">${ico('info')}<div><strong>${missing} tjänster saknar pris.</strong> Inga exempelpriser är inlagda – sätt era egna priser innan de används i offerter.</div></div>` : ''}
    <div class="notice mb16">${ico('history')}<div>Varje prisändring sparas som en ny version. Skickade och accepterade offerter behåller alltid priset de skickades med.</div></div>
    ${r.services.length ? cats.map((cat) => html`<section class="card mb16"><div class="card-h"><h3>${cat}</h3></div><div class="card-b flush mt8"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Tjänst</th><th class="r">Engångspris</th><th class="r">Månadspris</th><th class="r hide-sm">Moms</th>${costs ? html`<th class="r hide-sm">Intern kostnad</th><th class="r hide-sm">Marginal</th>` : ''}<th class="hide-sm">Leveranstid</th><th></th></tr></thead>
      <tbody>${r.services.filter((s) => (s.category || 'Övrigt') === cat).map((s) => {
        const pr = s.price;
        const m = pr && (pr.once_margin || pr.monthly_margin);
        return html`<tr class="click ${s.active ? '' : 'faint'}" data-id="${s.id}">
          <td><div class="t-main">${s.name}</div><div class="t-sub">${s.description ? s.description.slice(0, 90) : s.includes.length ? s.includes.length + ' punkter ingår' : ''}</div></td>
          <td class="r num">${pr?.once_price_minor != null ? money(pr.once_price_minor) : html`<span class="faint">–</span>`}</td>
          <td class="r num">${pr?.monthly_price_minor != null ? money(pr.monthly_price_minor) + '/mån' : html`<span class="faint">–</span>`}</td>
          <td class="r hide-sm">${pr ? pct(pr.vat_bp) : '–'}</td>
          ${costs ? html`<td class="r num hide-sm">${pr && (pr.internal_once_cost_minor != null || pr.internal_monthly_cost_minor != null) ? [pr.internal_once_cost_minor != null ? money(pr.internal_once_cost_minor) : null, pr.internal_monthly_cost_minor != null ? money(pr.internal_monthly_cost_minor) + '/mån' : null].filter(Boolean).join(' + ') : html`<span class="faint">–</span>`}</td>
            <td class="r num hide-sm">${m ? html`<span class="${m.bp < 3000 ? 'err' : ''}">${pct(m.bp)}</span>` : html`<span class="faint">–</span>`}</td>` : ''}
          <td class="hide-sm small">${s.delivery_time || html`<span class="faint">–</span>`}</td>
          <td class="r">${!pr ? html`<span class="badge amber">Pris saknas</span>` : !s.active ? html`<span class="badge">Inaktiv</span>` : ''}</td></tr>`;
      })}</tbody></table></div></div></section>`)
      : html`<div class="card">${empty({ icon: 'tag', title: 'Katalogen är tom', text: 'Lägg till tjänsterna ni säljer med priser och vad som ingår.' })}</div>`}`);

  $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => edit(r.services.find((s) => s.id === tr.dataset.id))));
  $('#new')?.addEventListener('click', () => edit(null));
  $('#import')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.classList.add('loading');
    try {
      const res = await post('/services/import-kela');
      toast(res.added.length + res.priced.length ? `${res.added.length} produkter tillagda, ${res.priced.length} befintliga fick pris` : 'Alla KELA-produkter finns redan med pris');
      services(view, _p, app);
    } catch (err) { toast(err.message, 'err'); } finally { b.classList.remove('loading'); }
  });

  async function edit(s) {
    const hist = s ? (await get(`/services/${s.id}`)).price_history : [];
    const pr = s?.price || {};
    const ro = !w;
    modal({
      drawer: true, title: s ? s.name : 'Ny tjänst',
      body: html`<div class="form">
        <label class="field"><span>Namn</span><input class="in" name="name" value="${s?.name || ''}" required ${ro ? 'disabled' : ''}></label>
        <div class="fr"><label class="field"><span>Kategori</span><input class="in" name="category" value="${s?.category || ''}" list="cats" ${ro ? 'disabled' : ''}><datalist id="cats">${cats.map((c) => html`<option value="${c}">`)}</datalist></label>
          <label class="field"><span>Leveranstid</span><input class="in" name="delivery_time" value="${s?.delivery_time || ''}" placeholder="t.ex. 4–6 veckor" ${ro ? 'disabled' : ''}></label></div>
        <label class="field"><span>Beskrivning</span><textarea class="ta" name="description" rows="3" ${ro ? 'disabled' : ''}>${s?.description || ''}</textarea></label>
        <label class="field"><span>Vad som ingår <span class="hint">en punkt per rad</span></span><textarea class="ta" name="includes" rows="4" ${ro ? 'disabled' : ''}>${(s?.includes || []).join('\n')}</textarea></label>
        <label class="field"><span>Tillval <span class="hint">en per rad</span></span><textarea class="ta" name="addons" rows="2" ${ro ? 'disabled' : ''}>${(s?.addons || []).join('\n')}</textarea></label>
        <div class="divider"></div><div class="lbl">Pris</div>
        <div class="fr"><label class="field"><span>Engångspris exkl. moms</span><div class="in-wrap"><input class="in r has-suf" name="once_price_minor" value="${moneyInput(pr.once_price_minor)}" inputmode="decimal" ${ro ? 'disabled' : ''}><span class="in-suf">kr</span></div></label>
          <label class="field"><span>Månadskostnad exkl. moms</span><div class="in-wrap"><input class="in r has-suf" name="monthly_price_minor" value="${moneyInput(pr.monthly_price_minor)}" inputmode="decimal" ${ro ? 'disabled' : ''}><span class="in-suf">kr/mån</span></div></label></div>
        <label class="field"><span>Moms</span><select class="sel" name="vat_bp" ${ro ? 'disabled' : ''}>${VAT.map(([v, l]) => html`<option value="${v}" ${(pr.vat_bp ?? 2500) === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${costs ? html`<div class="fr"><label class="field"><span>Intern kostnad, engång</span><div class="in-wrap"><input class="in r has-suf" name="internal_once_cost_minor" value="${moneyInput(pr.internal_once_cost_minor)}" inputmode="decimal" ${ro ? 'disabled' : ''}><span class="in-suf">kr</span></div></label>
          <label class="field"><span>Intern kostnad, månad</span><div class="in-wrap"><input class="in r has-suf" name="internal_monthly_cost_minor" value="${moneyInput(pr.internal_monthly_cost_minor)}" inputmode="decimal" ${ro ? 'disabled' : ''}><span class="in-suf">kr/mån</span></div></label></div>
          <div class="notice" id="margin"></div>` : ''}
        ${s ? html`<label class="chk"><input type="checkbox" name="active" ${s.active ? 'checked' : ''} ${ro ? 'disabled' : ''}> Aktiv (visas i offertbyggaren)</label>` : ''}
        ${hist.length ? html`<div class="divider"></div><div class="lbl">Prishistorik</div><div class="list">${hist.map((h, i) => html`<div class="li"><span class="li-ico ${i === 0 ? 'accent' : ''}">${ico('history')}</span><span class="li-b">
          <div class="li-t">${h.once_price_minor != null ? money(h.once_price_minor) : '–'}${h.monthly_price_minor != null ? ` · ${money(h.monthly_price_minor)}/mån` : ''}</div>
          <div class="li-s">${dateTime(h.created_at)}${h.created_by_name ? ' · ' + h.created_by_name : ''}${i === 0 ? ' · gällande' : ''}</div></span></div>`)}</div>` : ''}
      </div>`,
      footer: w ? html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">${s ? 'Spara' : 'Skapa tjänst'}</button>` : html`<button type="button" class="btn" data-close>Stäng</button>`,
      onMount: (d, close) => {
        const f = d.querySelector('form');
        const upd = () => {
          const box = $('#margin', d); if (!box) return;
          const row = (l, p, c) => { const m = margin(parseMoney(p), parseMoney(c) || 0); return m ? html`<div>${l}: <strong>${money(m.amount)}</strong> (${pct(m.bp)})</div>` : ''; };
          const a = row('Marginal engång', f.once_price_minor.value, f.internal_once_cost_minor.value), b = row('Marginal per månad', f.monthly_price_minor.value, f.internal_monthly_cost_minor.value);
          setHTML(box, html`${ico('percent')}<div>${a}${b}${!String(a) && !String(b) ? 'Fyll i pris och intern kostnad för att se beräknad marginal.' : ''}</div>`);
        };
        f.addEventListener('input', upd); upd();
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          await withBusy(f.querySelector('[type=submit]'), async () => {
            try {
              const o = formData(f);
              const price = {};
              for (const k of ['once_price_minor', 'monthly_price_minor', 'internal_once_cost_minor', 'internal_monthly_cost_minor']) {
                if (!(k in o)) continue;
                const v = parseMoney(o[k]);
                if (Number.isNaN(v)) throw { details: { [k]: 'Ange ett belopp, t.ex. 12 500.' } };
                price[k] = v; delete o[k];
              }
              price.vat_bp = Number(o.vat_bp); delete o.vat_bp;
              o.includes = o.includes.split('\n').map((x) => x.trim()).filter(Boolean);
              o.addons = o.addons.split('\n').map((x) => x.trim()).filter(Boolean);
              if (s) await patch(`/services/${s.id}`, { ...o, price }); else await post('/services', { ...o, price });
              toast('Tjänsten är sparad'); close(); services(view, _p, app);
            } catch (err) { showErrors(f, err); }
          });
        });
      },
    });
  }
}
