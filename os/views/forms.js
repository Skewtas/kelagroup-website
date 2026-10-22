// Återanvändbara formulär (sidopaneler/modaler) för kunder, kontakter, affärer, leads och nya offerter.
import { html, ico, modal, formData, showErrors, withBusy, toast, $, esc, DEAL_STAGES, LOST_REASONS, CUSTOMER_STATUS, setHTML, money, debounce } from '../lib/ui.js';
import { get, post, patch } from '../lib/api.js';
import { parseMoney, moneyInput } from '../lib/calc.js';

let usersCache;
export async function users() {
  usersCache ??= get('/users').then((r) => r.users.filter((u) => u.status === 'active')).catch(() => []);
  return usersCache;
}
const opt = (v, l, sel) => html`<option value="${v}" ${sel ? 'selected' : ''}>${l}</option>`;
const ownerSelect = (list, cur, name = 'owner_user_id') => html`<select class="sel" name="${name}">${opt('', '– Ingen –', !cur)}${list.map((u) => opt(u.id, u.name, u.id === cur))}</select>`;

/** Gör om belopp i kronor (text) till öre innan det skickas. */
function moneyFields(o, keys) {
  for (const k of keys) {
    if (!(k in o)) continue;
    const v = parseMoney(o[k]);
    if (Number.isNaN(v)) throw Object.assign(new Error('Ogiltigt belopp'), { details: { [k]: 'Ange ett belopp, t.ex. 12 500.' } });
    o[k] = v;
  }
  return o;
}

async function submit(form, btn, fn) {
  return withBusy(btn, async () => {
    try { return await fn(); } catch (err) { showErrors(form, err); return undefined; }
  });
}

// ---------- Kund ----------
export async function customerForm(existing, { onSaved } = {}) {
  const us = await users();
  const c = existing || {};
  modal({
    drawer: true, title: existing ? 'Redigera kund' : 'Ny kund',
    body: html`<div class="form">
      <label class="field"><span>Företagsnamn</span><input class="in" name="name" value="${c.name || ''}" required autofocus></label>
      <div class="fr"><label class="field"><span>Organisationsnummer</span><input class="in" name="org_number" value="${c.org_number || ''}" placeholder="556xxx-xxxx"></label>
        <label class="field"><span>Status</span><select class="sel" name="status">${Object.entries(CUSTOMER_STATUS).map(([k, [l]]) => opt(k, l, (c.status || 'prospect') === k))}</select></label></div>
      <div class="fr"><label class="field"><span>Bransch</span><input class="in" name="industry" value="${c.industry || ''}" placeholder="t.ex. Städ, Skönhet"></label>
        <label class="field"><span>Webbplats</span><input class="in" name="website" value="${c.website || ''}" placeholder="exempel.se"></label></div>
      <div class="fr"><label class="field"><span>E-post</span><input class="in" name="email" type="email" value="${c.email || ''}"></label>
        <label class="field"><span>Telefon</span><input class="in" name="phone" value="${c.phone || ''}"></label></div>
      <label class="field"><span>Fakturaadress</span><textarea class="ta" name="billing_address" rows="2">${c.billing_address || ''}</textarea></label>
      <label class="field"><span>Besöksadress</span><textarea class="ta" name="visiting_address" rows="2">${c.visiting_address || ''}</textarea></label>
      <div class="fr"><label class="field"><span>Ansvarig säljare</span>${ownerSelect(us, existing ? c.owner_user_id : window.__kelaOS?.me?.user?.id)}</label>
        <label class="field"><span>Förväntat affärsvärde</span><div class="in-wrap"><input class="in r has-suf" name="expected_value_minor" value="${moneyInput(c.expected_value_minor)}" inputmode="decimal"><span class="in-suf">kr</span></div></label></div>
      ${existing ? '' : html`<div class="divider"></div><div class="lbl">Kontaktperson <span class="faint">(valfritt)</span></div>
        <div class="fr"><label class="field"><span>Namn</span><input class="in" name="contact_name"></label><label class="field"><span>Titel</span><input class="in" name="contact_title"></label></div>
        <div class="fr"><label class="field"><span>E-post</span><input class="in" name="contact_email" type="email"></label><label class="field"><span>Telefon</span><input class="in" name="contact_phone"></label></div>`}
      <label class="field"><span>Anteckningar</span><textarea class="ta" name="notes" rows="3" placeholder="Inga lösenord eller API-nycklar här.">${c.notes || ''}</textarea></label>
    </div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">${existing ? 'Spara' : 'Skapa kund'}</button>`,
    onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      await submit(f, f.querySelector('[type=submit]'), async () => {
        const o = moneyFields(formData(f), ['expected_value_minor']);
        if (!existing && o.contact_name) o.contact = { name: o.contact_name, title: o.contact_title, email: o.contact_email, phone: o.contact_phone };
        ['contact_name', 'contact_title', 'contact_email', 'contact_phone'].forEach((k) => delete o[k]);
        const r = existing ? await patch(`/customers/${existing.id}`, o) : await post('/customers', o);
        toast(existing ? 'Kunden är sparad' : 'Kunden är skapad');
        close(); onSaved?.(existing ? existing.id : r.id);
      });
    }),
  });
}

// ---------- Kontakt ----------
export function contactForm(customerId, existing, { onSaved } = {}) {
  const k = existing || {};
  modal({
    title: existing ? 'Redigera kontakt' : 'Ny kontaktperson',
    body: html`<div class="form">
      <div class="fr"><label class="field"><span>Namn</span><input class="in" name="name" value="${k.name || ''}" required autofocus></label><label class="field"><span>Titel</span><input class="in" name="title" value="${k.title || ''}"></label></div>
      <div class="fr"><label class="field"><span>E-post</span><input class="in" name="email" type="email" value="${k.email || ''}"></label><label class="field"><span>Telefon</span><input class="in" name="phone" value="${k.phone || ''}"></label></div>
      <label class="chk"><input type="checkbox" name="is_primary" ${k.is_primary ? 'checked' : ''}> Primär kontakt</label></div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">Spara</button>`,
    onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.currentTarget;
      await submit(f, f.querySelector('[type=submit]'), async () => {
        const o = formData(f);
        if (existing) await patch(`/contacts/${existing.id}`, o); else await post(`/customers/${customerId}/contacts`, o);
        toast('Kontakten är sparad'); close(); onSaved?.();
      });
    }),
  });
}

// ---------- Affär ----------
export async function dealForm(existing, { customerId, onSaved } = {}) {
  const us = await users();
  const dd = existing || { stage: 'new' };
  const customers = existing || customerId ? null : (await get('/customers')).customers;
  modal({
    drawer: true, title: existing ? 'Redigera affär' : 'Ny affärsmöjlighet',
    body: html`<div class="form">
      <label class="field"><span>Namn på affären</span><input class="in" name="title" value="${dd.title || ''}" placeholder="t.ex. Ny hemsida + AI-chatt" required autofocus></label>
      ${customers ? html`<label class="field"><span>Kund</span><select class="sel" name="customer_id">${opt('', '– Välj kund –', true)}${customers.map((c) => opt(c.id, c.name, false))}</select></label>` : ''}
      <div class="fr"><label class="field"><span>Steg</span><select class="sel" name="stage" id="stage">${DEAL_STAGES.map(([k, l]) => opt(k, l, dd.stage === k))}</select></label>
        <label class="field"><span>Sannolikhet</span><div class="in-wrap"><input class="in r has-suf" name="probability" value="${dd.probability ?? ''}" inputmode="numeric" placeholder="auto"><span class="in-suf">%</span></div></label></div>
      <div class="fr"><label class="field"><span>Förväntat engångsvärde</span><div class="in-wrap"><input class="in r has-suf" name="value_minor" value="${moneyInput(dd.value_minor)}" inputmode="decimal"><span class="in-suf">kr</span></div></label>
        <label class="field"><span>Förväntat månadsvärde</span><div class="in-wrap"><input class="in r has-suf" name="monthly_value_minor" value="${moneyInput(dd.monthly_value_minor)}" inputmode="decimal"><span class="in-suf">kr/mån</span></div></label></div>
      <div class="fr"><label class="field"><span>Ansvarig</span>${ownerSelect(us, existing ? dd.owner_user_id : window.__kelaOS?.me?.user?.id)}</label>
        <label class="field"><span>Förväntat avslut</span><input class="in" type="date" name="expected_close_date" value="${dd.expected_close_date || ''}"></label></div>
      <div class="fr"><label class="field"><span>Nästa steg</span><input class="in" name="next_step" value="${dd.next_step || ''}" placeholder="t.ex. Skicka offert"></label>
        <label class="field"><span>Datum för nästa steg</span><input class="in" type="date" name="next_step_date" value="${dd.next_step_date || ''}"></label></div>
      <div id="lost" class="${dd.stage === 'lost' ? '' : 'hidden'} form">
        <label class="field"><span>Varför förlorades affären?</span><select class="sel" name="lost_reason">${opt('', '– Välj –', !dd.lost_reason)}${Object.entries(LOST_REASONS).map(([k, l]) => opt(k, l, dd.lost_reason === k))}</select></label>
        <label class="field"><span>Kommentar</span><textarea class="ta" name="lost_note" rows="2">${dd.lost_note || ''}</textarea></label></div>
    </div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">${existing ? 'Spara' : 'Skapa affär'}</button>`,
    onMount: (d, close) => {
      $('#stage', d).addEventListener('change', (e) => $('#lost', d).classList.toggle('hidden', e.target.value !== 'lost'));
      d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await submit(f, f.querySelector('[type=submit]'), async () => {
          const o = moneyFields(formData(f), ['value_minor', 'monthly_value_minor']);
          if (o.probability === '') delete o.probability;
          if (o.stage !== 'lost') { delete o.lost_reason; delete o.lost_note; }
          if (customerId) o.customer_id = customerId;
          if (existing && !o.customer_id) delete o.customer_id;
          const r = existing ? await patch(`/deals/${existing.id}`, o) : await post('/deals', o);
          toast('Affären är sparad'); close(); onSaved?.(existing ? existing.id : r.id);
        });
      });
    },
  });
}

/** Kräver förlustorsak när en affär flyttas till "Förlorad" (t.ex. i kanban). */
export function lostReasonDialog() {
  return new Promise((resolve) => {
    let out = null;
    modal({
      title: 'Varför förlorades affären?',
      body: html`<div class="form"><label class="field"><span>Anledning</span><select class="sel" name="lost_reason" required>${opt('', '– Välj –', true)}${Object.entries(LOST_REASONS).map(([k, l]) => opt(k, l, false))}</select></label>
        <label class="field"><span>Kommentar <span class="faint">(valfritt)</span></span><textarea class="ta" name="lost_note" rows="3"></textarea></label></div>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">Markera som förlorad</button>`,
      onMount: (d, close) => d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault(); const o = formData(e.currentTarget);
        if (!o.lost_reason) { showErrors(e.currentTarget, { details: { lost_reason: 'Välj en anledning.' } }); return; }
        out = o; close();
      }),
      onClose: () => resolve(out),
    });
  });
}

// ---------- Lead ----------
export async function leadForm({ onSaved } = {}) {
  const us = await users();
  modal({
    drawer: true, title: 'Nytt lead',
    body: html`<div class="form">
      <div class="fr"><label class="field"><span>Namn</span><input class="in" name="name" required autofocus></label><label class="field"><span>Företag</span><input class="in" name="company"></label></div>
      <div class="fr"><label class="field"><span>E-post</span><input class="in" name="email" type="email"></label><label class="field"><span>Telefon</span><input class="in" name="phone"></label></div>
      <div class="fr"><label class="field"><span>Källa</span><select class="sel" name="source">${['manual:Manuellt', 'hemsida:Hemsidan', 'telefon:Telefon', 'mejl:Mejl', 'rekommendation:Rekommendation', 'event:Event/mässa', 'annons:Annons', 'social:Sociala medier']
        .map((x) => { const [v, l] = x.split(':'); return opt(v, l, v === 'manual'); })}</select></label><label class="field"><span>Ansvarig</span>${ownerSelect(us, window.__kelaOS?.me?.user?.id)}</label></div>
      <label class="field"><span>Förfrågan / behov</span><textarea class="ta tall" name="message" placeholder="Vad vill de ha hjälp med?"></textarea></label>
    </div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">Skapa lead</button>`,
    onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.currentTarget;
      await submit(f, f.querySelector('[type=submit]'), async () => {
        const r = await post('/leads', formData(f)); toast('Leadet är skapat'); close(); onSaved?.(r.id);
      });
    }),
  });
}

// ---------- Ny offert ----------
export async function newQuoteDialog({ customerId, dealId, onCreated } = {}) {
  const [cr, tr] = await Promise.all([get('/customers'), get('/quote-templates')]);
  const customers = cr.customers;
  let contacts = [];
  modal({
    title: 'Ny offert',
    body: html`<div class="form">
      <label class="field"><span>Kund</span>
        <select class="sel" name="customer_id" id="q-cust" required>${opt('', '– Välj kund –', !customerId)}${customers.map((c) => opt(c.id, c.name, c.id === customerId))}<option value="__new">+ Ny kund…</option></select></label>
      <div id="q-new" class="hidden form"><div class="fr"><label class="field"><span>Företagsnamn</span><input class="in" name="new_name"></label><label class="field"><span>Org.nr</span><input class="in" name="new_org"></label></div>
        <div class="fr"><label class="field"><span>Kontaktperson</span><input class="in" name="new_contact"></label><label class="field"><span>E-post</span><input class="in" type="email" name="new_email"></label></div></div>
      <label class="field" id="q-contact-f"><span>Kontaktperson</span><select class="sel" name="contact_id" id="q-contact"><option value="">– Ingen –</option></select></label>
      <label class="field"><span>Rubrik</span><input class="in" name="title" placeholder="t.ex. Ny hemsida och bokningssystem" required></label>
      <div class="fr"><label class="field"><span>Utgå från mall</span><select class="sel" name="template_id">${opt('', 'Tom offert', true)}${tr.templates.map((t) => opt(t.id, `${t.name} (${t.item_count} rader)`, false))}</select></label>
        <label class="field"><span>Giltig i</span><select class="sel" name="valid_days">${[14, 30, 45, 60, 90].map((n) => opt(n, `${n} dagar`, n === 30))}</select></label></div>
    </div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary">Skapa och öppna</button>`,
    onMount: (d, close) => {
      const sel = $('#q-cust', d), csel = $('#q-contact', d);
      const loadContacts = async () => {
        const id = sel.value;
        $('#q-new', d).classList.toggle('hidden', id !== '__new');
        $('#q-contact-f', d).classList.toggle('hidden', id === '__new' || !id);
        if (!id || id === '__new') return;
        contacts = (await get(`/customers/${id}`)).contacts;
        setHTML(csel, html`<option value="">– Ingen –</option>${contacts.map((k, i) => opt(k.id, `${k.name}${k.title ? ' · ' + k.title : ''}`, i === 0))}`);
      };
      sel.addEventListener('change', loadContacts);
      loadContacts();
      d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await submit(f, f.querySelector('[type=submit]'), async () => {
          const o = formData(f);
          if (o.customer_id === '__new') {
            if (!o.new_name) throw { details: { new_name: 'Ange företagsnamn.' } };
            const r = await post('/customers', { name: o.new_name, org_number: o.new_org, contact: o.new_contact ? { name: o.new_contact, email: o.new_email } : undefined });
            o.customer_id = r.id;
            const c = await get(`/customers/${r.id}`);
            o.contact_id = c.contacts[0]?.id || '';
          }
          if (!o.customer_id) throw { details: { customer_id: 'Välj en kund.' } };
          const r = await post('/quotes', { customer_id: o.customer_id, contact_id: o.contact_id, title: o.title, template_id: o.template_id, valid_days: Number(o.valid_days), deal_id: dealId });
          toast(`Offert #${r.number} skapad`); close(); onCreated?.(r.id);
        });
      });
    },
  });
}

void ico; void esc; void money; void debounce;
