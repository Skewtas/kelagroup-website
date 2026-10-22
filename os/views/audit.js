// Säkerhet och aktivitetslogg – revisionslogg över inloggningar och alla ändringar.
import { html, ico, setHTML, $, $$, dateTime, empty, debounce } from '../lib/ui.js';
import { get, qs } from '../lib/api.js';

const TYPES = [['', 'Allt'], ['user', 'Inloggning & användare'], ['customer', 'Kunder'], ['lead', 'Leads'], ['deal', 'Affärer'], ['quote', 'Offerter'], ['service', 'Tjänster']];
const ico4 = (a) => a.startsWith('auth.login_failed') || a.includes('rate_limited') || a.includes('mfa_failed') ? ['alert', 'red'] : a.startsWith('auth') ? ['lock', 'blue'] : a.startsWith('user') ? ['users', ''] : a.startsWith('quote') ? ['file', 'accent'] : ['activity', ''];

export default async function audit(view, _p, app) {
  app.setCrumbs([{ label: 'Säkerhet och aktivitetslogg' }]);
  const state = { entity_type: '', q: '', before: '' };
  let rows = [];
  setHTML(view, html`<div class="page-h"><div><h1>Säkerhet och aktivitetslogg</h1><div class="sub">Vem gjorde vad, när och varifrån</div></div></div>
    <div class="filters"><div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök i loggen…"></div>
      <select class="sel" id="type">${TYPES.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
    <div class="card" id="list"></div><div class="row-act mt12"><button class="btn hidden" id="more">Visa äldre</button></div>`);
  async function load(append = false) {
    const r = await get('/audit' + qs(state));
    rows = append ? rows.concat(r.entries) : r.entries;
    setHTML($('#list'), rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Händelse</th><th>Användare</th><th class="hide-sm">IP</th><th class="r">Tid</th></tr></thead><tbody>
      ${rows.map((x) => { const [i, c] = ico4(x.action); return html`<tr><td><div class="flex"><span class="li-ico ${c}">${ico(i)}</span><div><div class="t-main">${x.summary}</div><div class="t-sub mono">${x.action}</div></div></div></td>
        <td>${x.actor_name || html`<span class="faint">System / extern</span>`}</td><td class="hide-sm mono faint">${x.ip || '–'}</td><td class="r small nowrap">${dateTime(x.created_at)}</td></tr>`; })}</tbody></table></div>`
      : empty({ icon: 'shield', title: 'Inga loggposter' }));
    $('#more').classList.toggle('hidden', r.entries.length < 100);
  }
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.before = ''; load(); }, 250));
  $('#type').addEventListener('change', (e) => { state.entity_type = e.target.value; state.before = ''; load(); });
  $('#more').addEventListener('click', () => { state.before = rows[rows.length - 1]?.created_at || ''; load(true); });
  await load();
  void $$;
}
