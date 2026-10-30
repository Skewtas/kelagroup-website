// Kela AI – AI-assistenten på hemsidan: statistik, samtal (ta över som människa) och inställningar per assistent.
import { html, ico, raw, setHTML, $, $$, ago, dateTime, empty, modal, toast, withBusy, confirmDialog, debounce, formData, showErrors, copy, esc } from '../lib/ui.js';
import { get, post, patch, del, qs } from '../lib/api.js';

const STATUS = { ai: ['AI svarar', ''], handoff: ['Vill prata med människa', 'amber'], human: ['Personal har tagit över', 'blue'], closed: ['Avslutat', ''] };
const st = (s) => { const [l, c] = STATUS[s] || [s, '']; return html`<span class="badge ${c}">${l}</span>`; };
const DEMO = { booking_demo: 'Bokningsdemo', integration_demo: 'AI + affärssystem', savings: 'Besparingskalkyl', solution_flow: 'Lösningsskiss (Utmana)', brief: 'Projektbrief', meeting: 'Mötesbokning', handoff: 'Människa', cards: 'Tjänstekort' };
const UI = { cards: 'Tjänstekort', booking_demo: 'Bokningsdemo', savings: 'Besparingskalkyl', integration_demo: 'AI + affärssystem', solution_flow: 'Lösningsskiss', project_brief: 'Projektbrief', meeting: 'Mötesbokning', handoff: 'Människa' };
const MEM = { company: 'Företag', industry: 'Bransch', needs: 'Behov', current_systems: 'System i dag', problem: 'Problem', scope: 'Omfattning', timeline: 'Tidsram', budget: 'Budget', name: 'Namn', language: 'Språk' };
const usd = (n) => n == null ? '–' : `$${n.toLocaleString('en-US', { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
const num = (n) => (n ?? 0).toLocaleString('sv-SE');

export default async function kelaAi(view, p, app) {
  const tab = p.tab || 'oversikt';
  app.setCrumbs([{ label: 'Kela AI', href: '#/kela-ai' }, { label: { oversikt: 'Översikt', samtal: 'Samtal', installningar: 'Inställningar' }[tab] || 'Översikt' }]);
  setHTML(view, html`<div class="page-h"><div><h1>Kela AI</h1><div class="sub">AI-assistenten på hemsidan – konversationer, leads och inställningar</div></div>
      <div class="act"><a class="btn" href="/" target="_blank" rel="noopener">${ico('external')} Öppna hemsidan</a></div></div>
    <nav class="tabs">${[['oversikt', 'Översikt', 'chart'], ['samtal', 'Samtal', 'message'], ['installningar', 'Inställningar', 'settings']]
      .filter(([k]) => k !== 'installningar' || app.can('ai:configure') || app.can('ai:read'))
      .map(([k, l, i]) => html`<a href="#/kela-ai/${k}" class="${tab === k ? 'on' : ''}">${ico(i)}${l}</a>`)}</nav>
    <div id="ai-body"></div>`);
  const body = $('#ai-body');
  if (tab === 'samtal') return conversations(body, p, app);
  if (tab === 'installningar') return settings(body, app);
  return overview(body, app);
}

// ---------------------------------------------------------------- Översikt
async function overview(body, app) {
  let days = 30;
  async function load() {
    const d = await get('/ai/overview' + qs({ days }));
    const cfg = await get('/ai/tenants').then((t) => t.tenants[0] ? get(`/ai/tenants/${t.tenants[0].id}/config`) : null).catch(() => null);
    const k = d.kpis;
    const kpi = (icon, label, value, sub, cls = '') => html`<div class="kpi ${cls}"><div class="kpi-l">${ico(icon)}${label}</div><div class="kpi-v">${value}</div><div class="kpi-s">${sub}</div></div>`;
    const max = Math.max(1, ...d.daily.map((x) => x.n));
    const W = 600, H = 120, bw = W / Math.max(1, d.daily.length);
    setHTML(body, html`
      ${cfg && !cfg.ai_ready ? html`<div class="notice amber mb16">${ico('alert')}<div><strong>AI:n är inte ansluten.</strong> Widgeten körs i demoläge (färdiga demos utan fria svar) tills <code>ANTHROPIC_API_KEY</code> läggs in i Cloudflare Pages → Settings → Variables and Secrets.</div></div>` : ''}
      <div class="filters mb12"><div class="seg" id="days">${[[7, '7 dagar'], [30, '30 dagar'], [90, '90 dagar'], [365, '12 månader']].map(([n, l]) => html`<button type="button" data-d="${n}" class="${days === n ? 'on' : ''}">${l}</button>`)}</div>
        <span class="faint small ml-auto">Modell: ${cfg?.model || '–'}</span></div>
      <div class="kpis">
        ${kpi('message', 'Konversationer', num(k.conversations), `${num(k.sessions)} unika sessioner · ${num(k.opens)} öppningar`)}
        ${kpi('inbox', 'Leads från chatten', num(k.leads + k.meetings), `${num(k.meetings)} mötesförfrågningar · ${num(k.leads)} övriga`)}
        ${kpi('percent', 'Konverteringsgrad', k.conversion_pct == null ? '–' : `${k.conversion_pct.toLocaleString('sv-SE')} %`, 'leads + möten / konversationer')}
        ${kpi('users', 'Överlämningar till människa', num(k.handoffs), 'besökare som bett om personal')}
        ${kpi('coins', 'AI-kostnad per konversation', usd(k.cost_per_conv_usd), `${usd(k.cost_usd)} totalt · uppskattning från tokens`)}
        ${kpi('checkCircle', 'Kundnöjdhet', k.satisfaction_pct == null ? '–' : `${k.satisfaction_pct} %`, `${num(k.rating_up)} 👍 · ${num(k.rating_down)} 👎`)}
        ${kpi('alert', 'Fel', num(k.errors), `${num(k.fallbacks)} svar i demoläge`, k.errors ? 'alert' : '')}
        ${kpi('activity', 'AI-svar', num(k.turns), `${num(k.tokens_in)} in / ${num(k.tokens_out)} ut (tokens)`)}
      </div>
      <div class="split">
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Konversationer per dag</h3></div><div class="card-b">
            ${d.daily.length ? raw(`<svg class="ai-chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Konversationer per dag">${d.daily.map((x, i) => { const h = Math.max(2, (x.n / max) * H); return `<rect x="${(i * bw + 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(2, bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(x.d)}: ${x.n}</title></rect>`; }).join('')}<text x="0" y="${H + 14}">${esc(d.daily[0].d)}</text><text x="${W}" y="${H + 14}" text-anchor="end">${esc(d.daily.at(-1).d)}</text></svg>`)
              : empty({ icon: 'chart', title: 'Inga konversationer ännu', text: 'När besökare pratar med Kela AI syns det här.' })}
          </div></section>
          <section class="card"><div class="card-h"><h3>Vanligaste första frågorna</h3></div>
            ${d.top_questions.length ? html`<div class="list mt8">${d.top_questions.map((q) => html`<div class="li"><span class="li-b"><div class="li-t">${q.q}</div></span><span class="li-r">${q.n}×</span></div>`)}</div>` : html`<div class="card-b faint small">Inga frågor ännu.</div>`}
          </section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Demos</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Demo</th><th class="r">Visade</th><th class="r">Genomförda</th></tr></thead><tbody>
            ${d.demos.map((x) => html`<tr><td>${DEMO[x.name] || x.name}</td><td class="r">${num(x.started)}</td><td class="r">${x.name === 'savings' ? '–' : num(x.completed)}</td></tr>`)}</tbody></table></div></section>
          <section class="card"><div class="card-h"><h3>Populärast i chatten</h3></div>
            ${d.services.length ? html`<div class="list mt8">${d.services.map((x) => html`<div class="li"><span class="li-b"><div class="li-t">${DEMO[x.name] || x.name}</div></span><span class="li-r">${x.n}</span></div>`)}</div>` : html`<div class="card-b faint small">Inget ännu.</div>`}
          </section>
          <section class="card"><div class="card-h"><h3>Startkort som klickats</h3></div>
            ${d.starters.length ? html`<div class="list mt8">${d.starters.map((x) => html`<div class="li"><span class="li-b"><div class="li-t">${x.name}</div></span><span class="li-r">${x.n}</span></div>`)}</div>` : html`<div class="card-b faint small">Inget ännu.</div>`}
          </section>
          ${d.errors.length ? html`<section class="card"><div class="card-h"><h3>Fel och obesvarat</h3></div><div class="list mt8">${d.errors.map((x) => html`<div class="li"><span class="li-ico red">${ico('alert')}</span><span class="li-b"><div class="li-t">${x.type === 'fallback' ? 'Demoläge' : 'Fel'}: ${x.name || '–'}</div></span><span class="li-r">${x.n}</span></div>`)}</div></section>` : ''}
        </div>
      </div>
      <p class="faint small mt16">Kostnaden är en uppskattning utifrån antal tokens och Anthropics listpris – faktisk faktura finns i Anthropic Console. Statistiken bygger på anonyma händelser utan personuppgifter.</p>`);
    $$('#days button', body).forEach((b) => b.addEventListener('click', () => { days = +b.dataset.d; load(); }));
  }
  await load();
}

// ---------------------------------------------------------------- Samtal
async function conversations(body, p, app) {
  const state = { status: p.query.get('status') || '', q: '', lead: false };
  setHTML(body, html`<div class="filters">
      <div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök i samtal…"></div>
      <div class="seg" id="st">${[['', 'Alla'], ['attention', 'Behöver människa'], ['human', 'Tagna av personal'], ['ai', 'AI'], ['closed', 'Avslutade']].map(([k, l]) => html`<button type="button" data-s="${k}" class="${state.status === k ? 'on' : ''}">${l}</button>`)}</div>
      <label class="chk"><input type="checkbox" id="lead"> Bara med lead</label>
      <a class="btn ml-auto" href="/api/os/ai/export" download>${ico('download')} Exportera (CSV)</a>
    </div><div class="card" id="list"></div>`);
  async function load() {
    const r = await get('/ai/conversations' + qs({ status: state.status, q: state.q, lead: state.lead ? '1' : '' }));
    const list = $('#list', body);
    if (!r.conversations.length) { setHTML(list, empty({ icon: 'message', title: 'Inga samtal här', text: 'Samtal med Kela AI på hemsidan visas här. De raderas automatiskt efter lagringstiden.' })); return; }
    setHTML(list, html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Samtal</th><th>Status</th><th class="hide-sm">Bransch / behov</th><th class="hide-sm">Sida</th><th class="r hide-sm">Svar</th><th class="r">Senast</th></tr></thead><tbody>
      ${r.conversations.map((c) => html`<tr class="click" data-id="${c.id}"><td><div class="t-main">${c.lead_company || c.lead_name || c.profile.company || (c.first_message || '(utan text)').slice(0, 70)}</div>
          <div class="t-sub">${c.lead_id ? html`<span class="badge green plain">Lead</span> ` : ''}${c.staff_unread ? html`<span class="badge red plain">${c.staff_unread} nya</span> ` : ''}${c.first_message ? c.first_message.slice(0, 90) : ''}</div></td>
        <td>${st(c.status)}</td><td class="hide-sm small">${[c.profile.industry, ...(c.profile.needs || [])].filter(Boolean).join(' · ') || '–'}</td>
        <td class="hide-sm small faint">${c.first_page || '–'}</td><td class="r hide-sm">${c.turns}</td><td class="r faint small nowrap">${ago(c.updated_at)}</td></tr>`)}</tbody></table></div>`);
    $$('tr[data-id]', list).forEach((tr) => tr.addEventListener('click', () => open(tr.dataset.id)));
  }
  $('#q', body).addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }, 250));
  $$('#st button', body).forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.s; $$('#st button', body).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  $('#lead', body).addEventListener('change', (e) => { state.lead = e.target.checked; load(); });

  async function open(id) {
    history.replaceState(null, '', `#/kela-ai/samtal?id=${id}`);
    let timer = 0;
    const m = modal({ drawer: true, wide: true, title: 'Samtal med Kela AI', body: html`<div id="conv">Laddar…</div>`,
      onClose: () => { clearTimeout(timer); history.replaceState(null, '', '#/kela-ai/samtal'); load(); } });
    const host = $('#conv', m.el);
    async function paint(scrollDown) {
      const d = await get(`/ai/conversations/${id}`);
      const c = d.conversation; const w = app.can('ai:write');
      const prof = Object.entries(c.profile || {}).filter(([k]) => MEM[k]);
      setHTML(host, html`
        <div class="flex wrap mb12">${st(c.status)}<span class="faint small">Startade ${dateTime(c.created_at)} på ${c.first_page || '–'} · ${c.turns} AI-svar · ${usd(c.cost_micro_usd / 1e6)}</span></div>
        ${c.lead_id ? html`<div class="notice green mb12">${ico('inbox')}<div>Kopplat till lead <strong>${c.lead_company || c.lead_name}</strong>${c.lead_email ? ` (${c.lead_email})` : ''}. <a href="#/leads/${c.lead_id}" data-close>Öppna lead →</a></div></div>` : ''}
        ${prof.length ? html`<dl class="dl mb12">${prof.map(([k, v]) => html`<dt>${MEM[k]}</dt><dd>${Array.isArray(v) ? v.join(', ') : v}</dd>`)}</dl>` : ''}
        <div class="ai-tr" id="tr">${d.messages.map((x) => html`<div class="ai-m ${x.role}"><div class="ai-who">${x.role === 'user' ? 'Besökare' : x.role === 'staff' ? (x.staff_name || 'Personal') : 'Kela AI'} · <span class="faint">${dateTime(x.created_at)}</span>${x.rating === 1 ? ' 👍' : x.rating === -1 ? ' 👎' : ''}</div>
          ${x.display_text ? html`<div class="ai-bubble">${x.display_text}</div>` : ''}${x.ui ? html`<div class="ai-uis">${x.ui.map((u) => html`<span class="tag">${ico('sparkles')} Visade: ${UI[u.type] || u.type}</span>`)}</div>` : ''}</div>`)}</div>
        ${w ? html`<div class="divider"></div>
          ${c.status === 'human' ? html`<form class="ai-reply" id="reply" novalidate><textarea class="ta" name="text" placeholder="Skriv till besökaren… (visas direkt i chatten)" maxlength="2000"></textarea>
              <div class="row-act"><button type="button" class="btn ghost" id="release">${ico('bot')} Lämna tillbaka till AI</button><button type="button" class="btn ghost" id="close">Avsluta samtalet</button><button class="btn primary" type="submit">${ico('send')} Skicka</button></div></form>`
            : html`<div class="flex wrap"><button type="button" class="btn primary" id="take">${ico('user')} Ta över samtalet</button><span class="faint small">Besökaren ser att någon från Kela har anslutit. AI:n pausas tills du lämnar tillbaka samtalet.</span></div>`}` : ''}
        ${app.can('ai:configure') ? html`<div class="row-act mt16"><button type="button" class="btn danger sm" id="del">${ico('trash')} Radera samtalet</button></div>` : ''}`);
      const tr = $('#tr', host); if (scrollDown) tr.scrollTop = tr.scrollHeight;
      $('#take', host)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await post(`/ai/conversations/${id}/takeover`); toast('Du har tagit över samtalet'); paint(true); }));
      $('#release', host)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await post(`/ai/conversations/${id}/release`, {}); toast('Kela AI svarar igen'); paint(true); }));
      $('#close', host)?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => { await post(`/ai/conversations/${id}/release`, { close: true }); paint(true); }));
      $('#reply', host)?.addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await withBusy(f.querySelector('[type=submit]'), async () => { try { await post(`/ai/conversations/${id}/message`, formData(f)); paint(true); } catch (err) { showErrors(f, err); } });
      });
      $('#reply textarea', host)?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form.requestSubmit(); });
      $('#del', host)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Radera samtalet?', text: 'Hela samtalet raderas permanent (t.ex. vid en begäran om radering enligt GDPR). Leads som skapats påverkas inte.', ok: 'Radera', danger: true }))) return;
        await del(`/ai/conversations/${id}`); toast('Samtalet är raderat'); m.close();
      });
      if (c.staff_unread) post(`/ai/conversations/${id}/seen`).catch(() => {});
      clearTimeout(timer);
      if (['human', 'handoff'].includes(c.status) && m.el.open && !$('#reply textarea', host)?.value) timer = setTimeout(() => paint(true), 5000);
    }
    await paint(true);
  }
  await load();
  const pre = p.query.get('id'); if (pre) open(pre);
}

// ---------------------------------------------------------------- Inställningar
const ICONS = [['spark', 'Gnista'], ['bolt', 'Blixt'], ['diamond', 'Diamant'], ['calendar', 'Kalender'], ['chat', 'Chatt'], ['chart', 'Diagram'], ['flow', 'Flöde']];
async function settings(body, app) {
  const w = app.can('ai:configure');
  const { tenants } = await get('/ai/tenants');
  if (!tenants.length) { setHTML(body, empty({ icon: 'bot', title: 'Ingen assistent ännu', text: 'Kelas egen assistent skapas automatiskt första gången hemsidan används.' })); return; }
  let current = tenants[0].id;
  async function load() {
    const d = await get(`/ai/tenants/${current}/config`);
    const c = d.config; const t = d.tenant;
    const row = (i, s) => html`<div class="ai-row g4" data-starter><select class="sel" name="s_icon_${i}">${ICONS.map(([k, l]) => html`<option value="${k}" ${s.icon === k ? 'selected' : ''}>${l}</option>`)}</select>
      <input class="in" name="s_title_${i}" value="${s.title}" placeholder="Rubrik" maxlength="40"><input class="in" name="s_text_${i}" value="${s.text}" placeholder="Undertext" maxlength="90"><input class="in" name="s_prompt_${i}" value="${s.prompt}" placeholder="Meddelande som skickas" maxlength="300"><input type="hidden" name="s_id_${i}" value="${s.id}"></div>`;
    const rule = (r) => html`<div class="ai-row g3x" data-rule><input class="in" data-k="match" value="${r.match}" placeholder="/sida"><input class="in" data-k="tip" value="${r.tip}" placeholder="Tips som visas vid orben" maxlength="120"><input class="in" data-k="prompt" value="${r.prompt}" placeholder="Förslag när chatten öppnas" maxlength="300"><button type="button" class="btn ghost icon sm" data-rm aria-label="Ta bort">${ico('x')}</button></div>`;
    const kn = (k) => html`<div class="ai-kn" data-kn><div class="flex"><input class="in" data-k="title" value="${k.title}" placeholder="Rubrik (t.ex. Nytt kundcase)"><button type="button" class="btn ghost icon sm" data-rm aria-label="Ta bort">${ico('x')}</button></div><textarea class="ta" data-k="body" placeholder="Fakta som AI:n får använda">${k.body}</textarea></div>`;
    const embed = `<script src="${location.origin}/assets/kela-ai/loader-v1.js" data-tenant="${t.id}" defer></script>`;
    setHTML(body, html`
      ${tenants.length > 1 || w ? html`<div class="filters mb12"><label class="lbl">Assistent</label><select class="sel w-auto" id="tenant">${tenants.map((x) => html`<option value="${x.id}" ${x.id === current ? 'selected' : ''}>${x.name} (${x.id})</option>`)}</select>
        ${w ? html`<button type="button" class="btn" id="new-t">${ico('plus')} Ny assistent för kund</button>` : ''}</div>` : ''}
      ${!d.ai_ready ? html`<div class="notice amber mb16">${ico('alert')}<div><strong>Demoläge.</strong> Lägg in <code>ANTHROPIC_API_KEY</code> i Cloudflare Pages för fria AI-svar. Modell: ${d.model}.</div></div>` : ''}
      <form class="form" id="cfg" novalidate>
        <div class="split"><div class="stack">
          <section class="card"><div class="card-h"><h3>Välkomstupplevelse</h3></div><div class="card-b form">
            <div class="grid g2"><label class="field"><span>Namn i chatten</span><input class="in" name="brand_name" value="${c.brand.name}" maxlength="40"></label><label class="field"><span>Undertitel</span><input class="in" name="brand_tagline" value="${c.brand.tagline}" maxlength="80"></label></div>
            <label class="field"><span>Statusrad</span><input class="in" name="status_text" value="${c.status_text}" maxlength="60"><span class="hint">Påstå aldrig att en människa är online.</span></label>
            <label class="field"><span>Välkomstmeddelande</span><textarea class="ta" name="welcome" maxlength="800">${c.welcome}</textarea><span class="hint">Första raden visas som rubrik.</span></label>
            <div class="lbl">Startkort (01–04)</div>${c.starters.map((s, i) => row(i, s))}
            <label class="field"><span>Texter vid orben (en per rad)</span><textarea class="ta" name="hover_texts">${c.hover_texts.join('\n')}</textarea></label>
          </div></section>
          <section class="card"><div class="card-h"><h3>Personlighet och instruktioner</h3></div><div class="card-b form">
            <div class="notice accent">${ico('shieldCheck')}<div>Kärnreglerna (ärlighet, inga priser, säkerhet mot prompt injection, integritet) är fasta och kan inte skrivas över här.</div></div>
            <label class="field"><span>Personlighet och ton</span><textarea class="ta" name="persona" maxlength="1500">${c.persona}</textarea></label>
            <label class="field"><span>Extra instruktioner</span><textarea class="ta" name="extra_instructions" maxlength="4000" placeholder="T.ex. Nämn vår höstkampanj när någon frågar om hemsidor.">${c.extra_instructions}</textarea></label>
          </div></section>
          <section class="card"><div class="card-h"><h3>Kunskap</h3></div><div class="card-b form">
            <label class="field"><span>Grundkunskap om företaget</span><textarea class="ta tall ai-mono" name="knowledge_base" maxlength="40000">${c.knowledge_base}</textarea><span class="hint">Tjänster, produkter, case och FAQ. AI:n hittar aldrig på utanför detta.</span></label>
            <div class="lbl">Extra kunskapsavsnitt</div><div id="kn">${c.knowledge.map(kn)}</div>
            <div><button type="button" class="btn sm" id="add-kn">${ico('plus')} Lägg till avsnitt</button></div>
          </div></section>
        </div><div class="stack">
          <section class="card"><div class="card-h"><h3>Sidor och kontextuella tips</h3></div><div class="card-b form">
            <span class="hint">Ett tips per besök visas diskret vid orben på matchande sida.</span>
            <div id="rules">${c.page_rules.map(rule)}</div><div><button type="button" class="btn sm" id="add-rule">${ico('plus')} Lägg till sida</button></div>
          </div></section>
          <section class="card"><div class="card-h"><h3>Möten och leads</h3></div><div class="card-b form">
            <label class="field"><span>Cal.com-länk (valfritt)</span><input class="in" name="cal_link" value="${c.cal_link}" placeholder="t.ex. kela/30min"><span class="hint">Med länk bokas tider direkt i chatten. Utan länk skickas en mötesförfrågan och ni bekräftar tiden.</span></label>
            <label class="field"><span>Formspree-ID för e-postnotis</span><input class="in" name="formspree_id" value="${c.formspree_id}"></label>
            <label class="field"><span>Kontakt-e-post</span><input class="in" name="contact_email" value="${c.contact_email}"></label>
          </div></section>
          <section class="card"><div class="card-h"><h3>Funktioner</h3></div><div class="card-b form">
            ${[['booking_demo', 'Bokningsdemo'], ['savings', 'Besparingskalkylator'], ['integration_demo', 'Demo: AI + affärssystem'], ['solution_flow', 'Utmana Kela AI (lösningsskiss)'], ['brief', 'Projektbrief'], ['meeting', 'Mötesbokning'], ['voice', 'Röst'], ['images', 'Bilduppladdning']]
              .map(([k, l]) => html`<label class="chk"><input type="checkbox" name="f_${k}" ${c.features[k] ? 'checked' : ''}> ${l}</label>`)}
          </div></section>
          <section class="card"><div class="card-h"><h3>Integritet</h3></div><div class="card-b form">
            <label class="field"><span>Lagringstid för samtal (dagar)</span><input class="in" type="number" name="retention_days" min="7" max="730" value="${c.retention_days}"><span class="hint">Samtal raderas automatiskt därefter. Leads sparas i CRM enligt er vanliga rutin.</span></label>
            <label class="field"><span>Länk till integritetsinformation</span><input class="in" name="privacy_url" value="${c.privacy_url}"></label>
          </div></section>
          <section class="card"><div class="card-h"><h3>Varumärke och inbäddning</h3></div><div class="card-b form">
            <div class="grid g3"><label class="field"><span>Accent</span><input class="in" type="color" name="brand_accent" value="${c.brand.accent}"></label><label class="field"><span>Mjuk ton</span><input class="in" type="color" name="brand_accent_soft" value="${c.brand.accent_soft}"></label><label class="field"><span>Mörk</span><input class="in" type="color" name="brand_ink" value="${c.brand.ink}"></label></div>
            <label class="field"><span>Ordmärke</span><input class="in" name="brand_wordmark" value="${c.brand.wordmark}" maxlength="16"></label>
            <label class="field"><span>Tillåtna webbplatser (en per rad, https://…)</span><textarea class="ta" name="allowed_origins" placeholder="https://kundensajt.se">${t.allowed_origins.join('\n')}</textarea><span class="hint">Krävs för att bädda in assistenten på en annan domän.</span></label>
            <div class="lbl">Inbäddningskod</div><div class="ai-embed"><code>${embed}</code><button type="button" class="btn sm" id="copy-embed">${ico('copy')} Kopiera</button></div>
          </div></section>
        </div></div>
        ${w ? html`<div class="row-act ai-save"><button type="button" class="btn ghost danger" id="reset">Återställ till standard</button><button class="btn primary" type="submit">${ico('check')} Spara ändringar</button></div>` : ''}
      </form>`);
    if (!w) $$('#cfg input, #cfg textarea, #cfg select', body).forEach((x) => { x.disabled = true; });
    const f = $('#cfg', body);
    const bindRm = (root) => $$('[data-rm]', root).forEach((b) => { b.onclick = () => b.closest('[data-rule],[data-kn]').remove(); });
    bindRm(f);
    $('#add-rule', body)?.addEventListener('click', () => { $('#rules', body).insertAdjacentHTML('beforeend', String(rule({ match: '/', tip: '', prompt: '' }))); bindRm($('#rules', body)); });
    $('#add-kn', body)?.addEventListener('click', () => { $('#kn', body).insertAdjacentHTML('beforeend', String(kn({ title: '', body: '' }))); bindRm($('#kn', body)); });
    $('#copy-embed', body).addEventListener('click', () => copy(embed));
    $('#tenant', body)?.addEventListener('change', (e) => { current = e.target.value; load(); });
    $('#new-t', body)?.addEventListener('click', () => newTenant());
    $('#reset', body)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Återställ till standard?', text: 'Alla texter, kunskap och sidregler återställs till standardvärdena.', ok: 'Återställ', danger: true }))) return;
      await patch(`/ai/tenants/${current}/config`, { reset: true }); toast('Återställt'); load();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formData(f);
      const config = {
        brand: { name: v.brand_name, tagline: v.brand_tagline, wordmark: v.brand_wordmark, accent: v.brand_accent, accent_soft: v.brand_accent_soft, ink: v.brand_ink },
        status_text: v.status_text, welcome: v.welcome, persona: v.persona, extra_instructions: v.extra_instructions, knowledge_base: v.knowledge_base,
        hover_texts: v.hover_texts.split('\n').map((x) => x.trim()).filter(Boolean),
        starters: c.starters.map((_, i) => ({ id: v[`s_id_${i}`], icon: v[`s_icon_${i}`], title: v[`s_title_${i}`], text: v[`s_text_${i}`], prompt: v[`s_prompt_${i}`] })),
        page_rules: $$('[data-rule]', f).map((r) => Object.fromEntries($$('[data-k]', r).map((x) => [x.dataset.k, x.value.trim()]))).filter((r) => r.match),
        knowledge: $$('[data-kn]', f).map((r) => Object.fromEntries($$('[data-k]', r).map((x) => [x.dataset.k, x.value.trim()]))).filter((r) => r.title),
        cal_link: v.cal_link.trim(), formspree_id: v.formspree_id.trim(), contact_email: v.contact_email.trim(), privacy_url: v.privacy_url.trim(), retention_days: parseInt(v.retention_days, 10),
        features: Object.fromEntries(['booking_demo', 'savings', 'integration_demo', 'solution_flow', 'brief', 'meeting', 'voice', 'images'].map((k) => [k, !!v[`f_${k}`]])),
      };
      await withBusy(f.querySelector('[type=submit]'), async () => {
        try {
          const r = await patch(`/ai/tenants/${current}/config`, { config, allowed_origins: v.allowed_origins.split('\n').map((x) => x.trim()).filter(Boolean) });
          toast(r.changed.length ? `Sparat (${r.changed.length} ändringar). Syns på hemsidan inom en minut.` : 'Inga ändringar');
        } catch (err) { showErrors(f, err); }
      });
    });
  }
  function newTenant() {
    modal({ title: 'Ny AI-assistent för kund', body: html`<div class="form"><p class="muted small">Skapar en separat assistent med egen konfiguration och egen statistik. All data isoleras per assistent.</p>
        <label class="field"><span>Kundens namn</span><input class="in" name="name" placeholder="Salong Exempel AB" required></label>
        <label class="field"><span>Nyckel (används i inbäddningskoden)</span><input class="in" name="id" placeholder="salong-exempel" required pattern="[a-z0-9-]{2,40}"></label></div>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="button" class="btn primary" data-ok>Skapa</button>`,
      onMount: (d, close) => d.querySelector('[data-ok]').addEventListener('click', async (e) => {
        const f = d.querySelector('form');
        await withBusy(e.currentTarget, async () => { try { const r = await post('/ai/tenants', formData(f)); toast('Assistenten är skapad'); close(); const t = await get('/ai/tenants'); tenants.splice(0, tenants.length, ...t.tenants); current = r.id; load(); } catch (err) { showErrors(f, err); } });
      }) });
  }
  await load();
}
