// Inställningar – profil, lösenord, tvåstegsverifiering och systemstatus för integrationer.
import { html, ico, setHTML, $, formData, showErrors, withBusy, toast } from '../lib/ui.js';
import { post } from '../lib/api.js';

export default async function settings(view, _p, app) {
  app.setCrumbs([{ label: 'Inställningar' }]);
  const u = app.me.user;
  const INTEG = [
    ['Cloudflare D1 (databas)', 'Ansluten', 'green', 'All data i KELA OS lagras här. Skapa databasen med EU-jurisdiktion i produktion.'],
    ['E-post (utskick av offerter, inbjudningar)', 'Ej konfigurerad', 'amber', 'Länkar delas manuellt tills en EU-baserad e-posttjänst kopplas in.'],
    ['E-signering', 'Ej konfigurerad', 'amber', 'Offerter godkänns i dag med digitalt klick. Etablerad e-signeringstjänst kopplas i fas 2.'],
    ['Fortnox (fakturering)', 'Ej konfigurerad', 'amber', 'Fas 2. OAuth-tokens lagras krypterat på serversidan.'],
    ['Filer (Cloudflare R2)', 'Ej konfigurerad', 'amber', 'Fas 2 – dokument och designförslag per kund.'],
    ['Driftövervakning', 'Ej konfigurerad', 'amber', 'Fas 3 – visar bara verifierad driftinformation när en integration finns.'],
  ];
  setHTML(view, html`<div class="page-h"><div><h1>Inställningar</h1><div class="sub">${app.me.org?.name || ''}</div></div></div>
    <div class="split"><div class="stack">
      <section class="card"><div class="card-h"><h3>Profil</h3></div><div class="card-b"><dl class="dl"><dt>Namn</dt><dd>${u.name}</dd><dt>E-post</dt><dd>${u.email}</dd><dt>Roll</dt><dd>${u.role_label}</dd>
        <dt>Tvåstegsverifiering</dt><dd>${u.totp_enabled ? html`<span class="badge green">${ico('shieldCheck')} Aktiv</span>` : html`<span class="badge amber">Inte aktiverad</span>`}</dd></dl></div></section>
      <section class="card"><div class="card-h"><h3>Byt lösenord</h3></div><div class="card-b"><form class="form" id="pw" novalidate>
        <label class="field"><span>Nuvarande lösenord</span><input class="in" type="password" name="current_password" autocomplete="current-password" required></label>
        <label class="field"><span>Nytt lösenord</span><input class="in" type="password" name="new_password" autocomplete="new-password" required minlength="12"><span class="hint">Minst 12 tecken. Övriga inloggade sessioner loggas ut.</span></label>
        <div class="row-act"><button class="btn primary" type="submit">Byt lösenord</button></div></form></div></section>
    </div><div class="stack">
      <section class="card"><div class="card-h"><h3>Integrationer</h3></div><div class="list mt8">${INTEG.map(([n, s, c, d]) => html`<div class="li"><span class="li-b"><div class="li-t">${n}</div><div class="li-s">${d}</div></span><span class="badge ${c}">${s}</span></div>`)}</div></section>
      <section class="card"><div class="card-h"><h3>Säkerhet</h3></div><div class="card-b"><ul class="small muted">
        <li>Sessioner: HttpOnly-kaka (SameSite=Strict), max 12 h, utloggning efter 4 h inaktivitet.</li>
        <li>MFA (TOTP) krävs för superadmin och administratörer.</li><li>Inloggning begränsas efter upprepade felförsök.</li>
        <li>Alla ändringar och inloggningar loggas i aktivitetsloggen.</li></ul></div></section>
    </div></div>`);
  $('#pw').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    await withBusy(f.querySelector('[type=submit]'), async () => { try { await post('/auth/password', formData(f)); f.reset(); toast('Lösenordet är bytt'); } catch (err) { showErrors(f, err); } });
  });
}
