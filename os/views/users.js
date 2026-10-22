// Användare och behörigheter – roller, inbjudningar, MFA-status. Allt verkställs på servern.
import { html, ico, setHTML, $, $$, ago, modal, formData, showErrors, withBusy, toast, copy, confirmDialog, initials, date } from '../lib/ui.js';
import { get, post, patch, del } from '../lib/api.js';

const PERM_LABEL = {
  'dashboard:read': 'Dashboard', 'customers:read': 'Se kunder', 'customers:write': 'Ändra kunder', 'customers:export': 'Exportera persondata', 'leads:read': 'Se leads', 'leads:write': 'Ändra leads',
  'deals:read': 'Se affärer', 'deals:write': 'Ändra affärer', 'quotes:read': 'Se offerter', 'quotes:write': 'Skapa/ändra offerter', 'quotes:send': 'Skicka offerter',
  'services:read': 'Se tjänster', 'services:write': 'Ändra tjänster & priser', 'services:costs': 'Se interna kostnader', 'tasks:read': 'Se uppgifter', 'tasks:write': 'Ändra uppgifter',
  'users:read': 'Se användare', 'users:manage': 'Hantera användare', 'audit:read': 'Aktivitetslogg', 'settings:write': 'Inställningar',
};

export default async function users(view, _p, app) {
  app.setCrumbs([{ label: 'Användare och behörigheter' }]);
  const r = await get('/users');
  const manage = app.can('users:manage');
  const reload = () => users(view, _p, app);
  setHTML(view, html`<div class="page-h"><div><h1>Användare och behörigheter</h1><div class="sub">${r.users.length} användare · rollbaserad åtkomst som kontrolleras på servern</div></div>
    <div class="act">${manage ? html`<button class="btn primary" id="invite">${ico('plus')} Bjud in</button>` : ''}</div></div>
    <section class="card mb16"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Namn</th><th>Roll</th><th>MFA</th><th>Status</th>${manage ? html`<th class="r">Senast inloggad</th><th></th>` : ''}</tr></thead><tbody>
      ${r.users.map((u) => html`<tr><td><div class="flex"><span class="av">${initials(u.name)}</span><div><div class="t-main">${u.name}${u.id === app.me.user.id ? html` <span class="tag">Du</span>` : ''}</div><div class="t-sub">${u.email}</div></div></div></td>
        <td>${manage && u.id !== app.me.user.id && (u.role !== 'superadmin' || app.me.user.role === 'superadmin') ? html`<select class="sel" data-role="${u.id}">${r.roles.filter((x) => x.id !== 'superadmin' || app.me.user.role === 'superadmin').map((x) => html`<option value="${x.id}" ${x.id === u.role ? 'selected' : ''}>${x.label}</option>`)}</select>` : u.role_label}</td>
        <td>${u.totp_enabled ? html`<span class="badge green">${ico('shieldCheck')} Aktiv</span>` : ['superadmin', 'admin'].includes(u.role) ? html`<span class="badge amber">Krävs vid inloggning</span>` : html`<span class="badge">Av</span>`}</td>
        <td>${u.status === 'active' ? html`<span class="badge green plain">Aktiv</span>` : html`<span class="badge red plain">Inaktiverad</span>`}</td>
        ${manage ? html`<td class="r small faint">${u.last_login_at ? ago(u.last_login_at) : 'Aldrig'}</td><td class="r">${u.id !== app.me.user.id ? html`<button class="btn sm" data-toggle="${u.id}" data-st="${u.status}">${u.status === 'active' ? 'Inaktivera' : 'Aktivera'}</button>
          ${app.me.user.role === 'superadmin' && u.totp_enabled ? html`<button class="btn sm ghost" data-mfa="${u.id}">Återställ MFA</button>` : ''}` : ''}</td>` : ''}</tr>`)}</tbody></table></div></section>
    ${manage && r.invites.length ? html`<section class="card mb16"><div class="card-h"><h3>Väntande inbjudningar</h3></div><div class="list mt8">${r.invites.map((i) => html`<div class="li"><span class="li-ico">${ico('mail')}</span><span class="li-b"><div class="li-t">${i.name} · ${i.email}</div><div class="li-s">${r.roles.find((x) => x.id === i.role)?.label} · går ut ${date(i.expires_at)}</div></span><button class="btn sm ghost danger" data-revoke="${i.id}">Återkalla</button></div>`)}</div></section>` : ''}
    <section class="card"><div class="card-h"><h3>Roller och behörigheter</h3><span class="faint small">Kundrollen ger bara åtkomst till kundportalen (fas 2).</span></div><div class="card-b flush mt8"><div class="tbl-wrap"><table class="tbl matrix"><thead><tr><th>Behörighet</th>${r.roles.map((x) => html`<th>${x.label}</th>`)}</tr></thead>
      <tbody>${r.permissions.map((p) => html`<tr><td>${PERM_LABEL[p] || p}</td>${r.roles.map((x) => html`<td>${x.permissions.includes(p) ? html`<span class="yes">${ico('check')}</span>` : html`<span class="no">–</span>`}</td>`)}</tr>`)}</tbody></table></div></div></section>`);

  $$('[data-role]').forEach((s) => s.addEventListener('change', async () => {
    try { await patch(`/users/${s.dataset.role}`, { role: s.value }); toast('Rollen är ändrad – användaren loggas ut och får nya behörigheter vid nästa inloggning'); reload(); } catch (e) { toast(e.message, 'err'); reload(); }
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const off = b.dataset.st === 'active';
    if (off && !(await confirmDialog({ title: 'Inaktivera användare?', text: 'Användaren loggas ut direkt och kan inte logga in igen förrän kontot aktiveras.', ok: 'Inaktivera', danger: true }))) return;
    try { await patch(`/users/${b.dataset.toggle}`, { status: off ? 'disabled' : 'active' }); toast(off ? 'Användaren är inaktiverad' : 'Användaren är aktiverad'); reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  $$('[data-mfa]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Återställa MFA?', text: 'Användaren loggas ut och måste koppla en ny autentiseringsapp vid nästa inloggning. Gör detta bara efter att du verifierat personens identitet.', ok: 'Återställ', danger: true }))) return;
    try { await post(`/users/${b.dataset.mfa}/reset-mfa`); toast('MFA återställd'); reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', async () => { await del(`/invites/${b.dataset.revoke}`); toast('Inbjudan återkallad'); reload(); }));
  $('#invite')?.addEventListener('click', () => modal({
    title: 'Bjud in användare',
    body: html`<div class="form"><div class="fr"><label class="field"><span>Namn</span><input class="in" name="name" required autofocus></label><label class="field"><span>E-post</span><input class="in" type="email" name="email" required></label></div>
      <label class="field"><span>Roll</span><select class="sel" name="role">${r.roles.filter((x) => x.id !== 'superadmin' || app.me.user.role === 'superadmin').map((x) => html`<option value="${x.id}" ${x.id === 'sales' ? 'selected' : ''}>${x.label}</option>`)}</select></label>
      <div class="notice">${ico('info')}<div>Du får en personlig länk som gäller i 48 timmar. Dela den med personen – inget mejl skickas automatiskt.</div></div></div>`,
    footer: html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">Skapa inbjudan</button>`,
    onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.currentTarget;
      await withBusy(f.querySelector('[type=submit]'), async () => {
        try {
          const res = await post('/users/invite', formData(f)); close();
          modal({ title: 'Inbjudan skapad', body: html`<p class="muted mb12">Skicka länken till personen. Den kan bara användas en gång.</p><div class="linkbox"><code>${res.invite_url}</code><button type="button" class="btn sm" id="cpi">${ico('copy')} Kopiera</button></div>`,
            footer: html`<button type="button" class="btn primary" data-close>Klar</button>`, onMount: (d2) => $('#cpi', d2).addEventListener('click', () => copy(res.invite_url)), onClose: reload });
        } catch (err) { showErrors(f, err); }
      });
    }),
  }));
}
