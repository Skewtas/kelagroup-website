// Planerade moduler (fas 2 och 3). Visar ärligt vad som kommer och vad det kräver – inga påhittade data.
import { html, ico, setHTML } from '../lib/ui.js';

const P = {
  avtal: [2, 'signature', 'Avtal', 'Avtal skapas från accepterade offerter och signeras via en etablerad e-signeringstjänst.', ['Avtalsmallar per tjänst', 'E-signering med bevarat signeringsbevis', 'Koppling till offertversion och kund'], 'Konto hos e-signeringstjänst (t.ex. Scrive, Oneflow eller Visma Sign) + API-nyckel'],
  feedback: [2, 'message', 'Kundfeedback', 'Feedback på leveranser direkt från kundportalen.', ['Kommentarer på specifik leverans', 'Godkännande av milstolpar'], null],
  support: [2, 'buoy', 'Supportärenden', 'Ärenden per kund med prioritet och ansvarig.', ['Ärenden från kundportal och mejl', 'Notis till ansvarig'], 'E-postintegration för inkommande ärenden'],
  portaler: [2, 'layout', 'Kundportaler', 'En separat portal där kunden bara ser sina egna projekt, offerter, avtal och fakturor.', ['Mina projekt och tidsplan', 'Leveranser och designförslag', 'Feedback och godkännanden', 'Offerter, avtal, fakturor'], null],
  fakturor: [2, 'receipt', 'Fakturor', 'Fakturaöversikt och betalningsstatus hämtas från Fortnox. KELA OS bygger ingen egen bokföring.', ['Fakturautkast från accepterade offerter', 'Betalningsstatus och förfallna fakturor', 'Fakturerat, betalt och bokfört hålls isär'], 'Fortnox-integration (OAuth2) – app-registrering i Fortnox Developer Portal'],
  abonnemang: [2, 'repeat', 'Abonnemang', 'Återkommande intäkter med förnyelser och uppsägningar.', ['MRR och ARR från verkliga abonnemang', 'Påminnelse inför förnyelse'], 'Fortnox-integration'],
  intakter: [2, 'trending', 'Intäkter', 'Intäkter per kund, tjänst och månad – från Fortnox.', ['Intäkter per kund och tjänst', 'Projektlönsamhet', 'Prognoser'], 'Fortnox-integration'],
  kostnader: [2, 'wallet', 'Kostnader', 'Kostnader per projekt och leverantör.', ['Kostnader från Fortnox', 'Marginal per projekt'], 'Fortnox-integration'],
  rapporter: [3, 'chart', 'Rapporter', 'Avancerade rapporter över försäljning, leverans och ekonomi.', ['Säljrapporter', 'Konvertering per källa', 'Lönsamhet'], null],
  cms: [3, 'globe', 'Hemsidans CMS', 'Redigera kelagroup.se utan att ändra kod – med förhandsgranskning, utkast och versioner.', ['Texter, bilder, tjänster, kundcase, FAQ, blogg', 'SEO-titlar och metabeskrivningar', 'Publicera och återställ tidigare versioner'], 'Beslut om innehållsmodell för den statiska sajten'],
  formular: [3, 'clipboard', 'Formulär', 'Hemsidans formulär som skapar leads direkt i KELA OS.', ['API:et /api/os/public/lead är redan förberett', 'Spamskydd och rate limiting'], 'Beslut om att ersätta Formspree'],
  kampanjer: [3, 'megaphone', 'Kampanjer', 'Kampanjer och annonsering samlat.', ['Google Ads och Meta Ads', 'Resultat per kampanj'], 'Google Ads- och Meta-API'],
  nyhetsbrev: [3, 'mail', 'Nyhetsbrev', 'Nyhetsbrev och SMS med segmentering.', ['Segment från CRM', 'Samtycken (GDPR)'], 'E-post-/SMS-leverantör'],
  seo: [3, 'search', 'SEO', 'SEO-översikt för KELA och kundernas sajter.', ['Search Console', 'Analytics'], 'Google Search Console- och Analytics-API'],
  hemsidor: [3, 'server', 'Kundernas hemsidor', 'Alla kundsajter: domän, hosting, SSL och senaste uppdatering.', ['Domän- och SSL-förnyelser', 'Backupstatus'], 'Cloudflare-API'],
  'ai-chattar': [3, 'bot', 'AI-chattar', 'Översikt över levererade AI-chattar (t.ex. Chattis).', ['Status och användning per kund'], null],
  bokning: [3, 'calCheck', 'Bokningssystem', 'Levererade bokningssystem (t.ex. Bokis) per kund.', ['Status och licenser'], null],
  integrationer: [3, 'plug', 'Integrationer', 'Webhooks och externa integrationer.', ['Webhooks', 'API-hälsa'], null],
  drift: [3, 'activity', 'Driftstatus', 'Endast verifierad driftinformation från en riktig övervakningstjänst.', ['Uptime', 'Felrapporter', 'SSL-giltighet', 'API-hälsa'], 'Övervakningstjänst (t.ex. Better Stack eller UptimeRobot)'],
  licenser: [3, 'key', 'Licenser', 'Licenser och abonnemang per kund och system.', ['Licensstatus', 'Kommande förnyelser'], null],
  automatiseringar: [2, 'zap', 'Automatiseringar', 'När X händer → gör Y. Med testläge, körningshistorik och felstatus.', ['Redan inbyggt: accepterad offert → affär vunnen + uppgifter (projekt, avtal, fakturering)', 'Redan inbyggt: skickad offert → uppföljningsuppgift om 3 dagar', 'Byggare för egna regler, webhooks, idempotenta körningar'], null],
  ai: [3, 'sparkles', 'AI-assistent – KELA Intelligence', 'AI som skriver utkast, sammanfattar och föreslår nästa steg. Skickar aldrig något bindande på egen hand.', ['Offertutkast och mejl', 'Sammanfattning av kundanteckningar', 'Förslag på nästa steg och merförsäljning', 'Bara data som användaren har behörighet till'], 'Anthropic API-nyckel (finns redan för hemsidans chatt)'],
};

export default async function planned(view, p, app) {
  const x = P[p.key];
  if (!x) { setHTML(view, html`<div class="empty"><h3>Sidan finns inte</h3></div>`); return; }
  const [phase, icon, title, text, list, need] = x;
  app.setCrumbs([{ label: title }]);
  setHTML(view, html`<div class="planned"><div class="page-h"><div><h1>${title}</h1><div class="sub">Planerad i fas ${phase}</div></div></div>
    <section class="card"><div class="card-b"><div class="flex mb12"><span class="empty-ico">${ico(icon, 'lg')}</span><div><strong>${text}</strong><div class="muted small">Modulen är inte byggd ännu – här visas inga påhittade siffror.</div></div></div>
      <div class="lbl mt12">Det här ingår</div><ul>${list.map((l) => html`<li>${l}</li>`)}</ul>
      ${need ? html`<div class="notice amber mt16">${ico('plug')}<div><strong>Kräver:</strong> ${need}</div></div>` : ''}</div></section></div>`);
}
