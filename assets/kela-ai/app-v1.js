// KELA AI – själva assistenten. Laddas av loader-v1.js först när besökaren visar intresse.
// Presentation här; AI-logik, verktyg, affärsregler och data ligger på servern (/api/ai).
import { h, svg, orbEl, RENDERERS, UI_LABEL } from './ui-v1.js';

const T = {
  sv: { placeholder: 'Fråga vad som helst…', challenge: 'Beskriv ett problem i ert företag…', human: 'Skriv till Kela-teamet…', send: 'Skicka', stop: 'Stoppa', close: 'Stäng', menu: 'Meny', mem: 'Det här vet jag', expand: 'Bredare vy', mic: 'Prata med Kela AI', attach: 'Bifoga bild',
    foot: 'Kela AI är en AI och kan göra fel. ', footLink: 'AI & integritet', ready: 'AI-assistenten är redo', demo: 'Demoläge – AI ej ansluten', humanOn: 'Kela-teamet är med i chatten', waiting: 'Väntar på Kela-teamet',
    journey: 'Visat', newChat: 'Ny konversation', lang: 'In English', download: 'Ladda ner samtalet', del: 'Radera samtalet', about: 'Om Kela AI & integritet', copy: 'Kopiera', good: 'Bra svar', bad: 'Dåligt svar', retry: 'Försök igen' },
  en: { placeholder: 'Ask me anything…', challenge: 'Describe a problem in your business…', human: 'Write to the Kela team…', send: 'Send', stop: 'Stop', close: 'Close', menu: 'Menu', mem: 'What I know', expand: 'Wider view', mic: 'Talk to Kela AI', attach: 'Attach image',
    foot: 'Kela AI is an AI and can make mistakes. ', footLink: 'AI & privacy', ready: 'The AI assistant is ready', demo: 'Demo mode – AI not connected', humanOn: 'The Kela team is in the chat', waiting: 'Waiting for the Kela team',
    journey: 'Shown', newChat: 'New conversation', lang: 'På svenska', download: 'Download conversation', del: 'Delete conversation', about: 'About Kela AI & privacy', copy: 'Copy', good: 'Good answer', bad: 'Bad answer', retry: 'Try again' },
};
const EN_STARTERS = { surprise: ['Surprise me', 'Show me something really cool AI can do.', 'Surprise me – show me something really cool AI can do.'], automate: ['Automate my business', 'Discover what you could stop doing by hand.', 'I want to see what we could automate in our business.'], build: ['What can Kela build?', 'Explore websites, apps, AI and business systems.', 'What can Kela build?'], talk: ['Talk to Kela', 'Tell us your idea and book a meeting.', 'I want to tell you about my idea and book a meeting.'] };
const CHALLENGES = ['Vi får 200 mejl om dagen och hinner inte svara.', 'Vår personal rapporterar fortfarande timmar i Excel.', 'Våra kunder ringer hela tiden och frågar om sina bokningar.', 'Vi har fem olika system som inte pratar med varandra.'];
const MEM_LABEL = { company: 'Företag', industry: 'Bransch', needs: 'Behov', current_systems: 'System i dag', problem: 'Problem', scope: 'Omfattning', timeline: 'Tidsram', budget: 'Budget', name: 'Namn', language: 'Språk' };
const I = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>', menu: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', brain: '<path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 13a3 3 0 0 0 2 5 3 3 0 0 0 6 0V5a1.5 1.5 0 0 0-3-1zM15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 5.5 3 3 0 0 1-2 5 3 3 0 0 1-6 0"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>', send: '<path d="M5 12h14M13 6l6 6-6 6"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  up: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7"/>', down: '<path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.3-6A2 2 0 0 1 6.3 4H17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>', dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
};
const ic = (n, w = 19) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const ss = { get: (k) => { try { return sessionStorage.getItem('kelaai:' + k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem('kelaai:' + k) : sessionStorage.setItem('kelaai:' + k, v); } catch {} } };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 640px)').matches;

// ---------- Säker markdown-lite: escape först, sedan bara fetstil, kursiv, listor och interna länkar ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]{1,80})\]\(((?:\/|https:\/\/(?:www\.)?kelagroup\.se\/|mailto:)[^)\s]{0,200})\)/g, (_, t, u) => `<a href="${u.replace(/"/g, '')}"${u.startsWith('/') || u.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
}
export function md(src) {
  const out = []; let list = null;
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!list) { list = /^\s*\d/.test(line) ? 'ol' : 'ul'; out.push(`<${list}>`); } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    if (!line.trim()) { out.push(''); continue; }
    out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('').replace(/<\/p><p>/g, '</p><p>');
}
const plain = (s) => s.replace(/\*\*|\*|\[|\]\([^)]*\)/g, '').replace(/^\s*[-•]\s+/gm, '');

// ---------- Demoläge: lokala svar när AI:n inte är ansluten (t.ex. ingen nyckel eller ingen server) ----------
const FLOWS = {
  mejl: { title: 'Så skulle vi automatisera er inkorg', steps: [['Mejlet kommer in', 'Varje mejl till info@ eller kundtjänst fångas direkt – dygnet runt.', 'trigger'], ['AI läser och sorterar', 'AI:n förstår ärendet: bokning, fråga, reklamation, faktura eller annat – och hur brådskande det är.', 'ai'], ['Kontrollerar kunden', 'Avsändaren matchas mot kundregistret. Känsliga ändringar kräver verifiering.', 'check'], ['Hämtar rätt information', 'Bokningar, fakturor och historik hämtas från affärssystemet via API.', 'system'], ['Svarar eller agerar', 'Vanliga ärenden besvaras direkt, och tillåtna åtgärder (t.ex. ombokning) genomförs.', 'action'], ['Eskalerar vid behov', 'Svåra eller känsliga ärenden går till rätt person – med en färdig sammanfattning och svarsförslag.', 'human'], ['Loggar och följer upp', 'Allt loggas. Ni ser svarstider och ärendetyper i en dashboard.', 'log']], gains: ['Snabba svar även kvällar och helger', 'Personalen får bara ärenden som kräver en människa', 'Full spårbarhet på varje ärende'], systems: ['E-post', 'Affärssystem', 'Kundregister'] },
  excel: { title: 'Så skulle vi ersätta Excel-tidrapporterna', steps: [['Incheckning i appen', 'Personalen checkar in och ut i en personalapp – med GPS om ni vill.', 'trigger'], ['Kontroll mot schemat', 'Tiderna jämförs automatiskt med schema och bokningar.', 'check'], ['AI flaggar avvikelser', 'Glömda utcheckningar, övertid eller orimliga tider markeras direkt.', 'ai'], ['Attest', 'Arbetsledaren godkänner med ett klick – bara avvikelser kräver eftertanke.', 'human'], ['Löneunderlag', 'Godkända tider skickas som löneunderlag till t.ex. Fortnox eller Visma.', 'system'], ['Rapport live', 'Timmar per kund, projekt och person syns i en dashboard.', 'log']], gains: ['Ingen manuell sammanställning i slutet av månaden', 'Färre fel i lönen', 'Koll på lönsamhet per uppdrag'], systems: ['Personalapp', 'Fortnox / Visma', 'Dashboard'] },
  ringer: { title: 'Så skulle vi minska samtalen om bokningar', steps: [['Kunden frågar', 'Via chatt på hemsidan, sms eller mejl – när som helst.', 'trigger'], ['AI tolkar ärendet', 'Ombokning, avbokning, fråga om tid eller faktura.', 'ai'], ['Verifierar kunden', 'Engångskod till registrerat nummer innan något ändras.', 'check'], ['Hämtar bokningen', 'Direkt från bokningssystemet via API.', 'system'], ['Föreslår och genomför', 'Lediga tider med samma personal – ändras först efter kundens ja.', 'action'], ['Bekräftar', 'Sms och mejl till kunden, notis till personalen.', 'notify'], ['Människa vid behov', 'Allt utöver det vanliga går till kontoret med en sammanfattning.', 'human']], gains: ['Färre samtal till kontoret', 'Kunden får svar direkt', 'Kundappen låter dem sköta mycket själva'], systems: ['Bokningssystem', 'Sms', 'Kundapp'] },
  system: { title: 'Så skulle vi få era system att prata med varandra', steps: [['Något händer', 'En ny kund, bokning, order eller faktura skapas i något av systemen.', 'trigger'], ['Integration via API', 'Händelsen fångas och skickas vidare – utan dubbelregistrering.', 'system'], ['Validering', 'Data kontrolleras och dubbletter stoppas innan något skrivs.', 'check'], ['AI matchar och berikar', 'Kunder och artiklar matchas mellan systemen, även när namnen skiljer sig.', 'ai'], ['Uppdaterar överallt', 'Rätt information hamnar i rätt system automatiskt.', 'action'], ['Avvikelser till ansvarig', 'Det som inte kan matchas säkert går till en person.', 'human'], ['Logg och översikt', 'Allt syns i en dashboard med full historik.', 'log']], gains: ['En sanning i stället för fem', 'Ingen dubbelregistrering', 'Ni byter inte system – de pratar med varandra'], systems: ['Fortnox', 'Visma', 'Timewave', 'Shopify', '+ allt med API'] },
};
function localReply(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  const flow = (k, problem) => ({ text: 'Utmaningen antagen! Så här skulle vi kunna lösa det – klicka på stegen för detaljer:', ui: { type: 'solution_flow', props: { ...FLOWS[k], problem, steps: FLOWS[k].steps.map(([title, detail, kind]) => ({ title, detail, kind })) } } });
  if (has('mejl', 'mail', 'inkorg', 'e-post')) return flow('mejl', text);
  if (has('excel', 'tidrapport', 'timmar i', 'rapporterar')) return flow('excel', text);
  if (has('ringer', 'samtal', 'telefon')) return flow('ringer', text);
  if (has('system som inte', 'pratar inte', 'inte pratar', 'olika system', 'integration')) return flow('system', text);
  if (has('överrask', 'surprise', 'häftig', 'cool')) return { text: 'Okej, håll i dig. Så här ser det ut när en AI är **kopplad direkt till ett affärssystem** – den verifierar kunden, hittar bokningen och flyttar den. Du styr kunden:', ui: { type: 'integration_demo', props: { industry: 'stad' } } };
  if (has('städ', 'stad', 'cleaning')) return { text: 'Städbranschen är vår hemmaplan – vi kör vårt eget städbolag Stodona på systemen. Testa **Bokis**, bokningen som räknar pris, restid och schema själv:', ui: { type: 'booking_demo', props: { industry: 'stad' } } };
  if (has('bokning', 'boka tid', 'booking', 'salong', 'frisör', 'skönhet')) return { text: 'Perfekt! Vi bygger bokningssystem som gör jobbet åt dig. Testa själv – välj behandling, person och tid:', ui: { type: 'booking_demo', props: { industry: has('frisör') ? 'frisor' : has('salong', 'skönhet') ? 'skonhet' : 'generell' } } };
  if (has('automat', 'spara tid', 'admin', 'besparing', 'save time')) return { text: 'Det där låter som något ni lägger alldeles för mycket tid på idag. Fyll i tre snabba uppgifter så räknar jag – med alla antaganden synliga:', ui: { type: 'savings', props: { employees: null, admin_hours_week: null, tasks: [] } } };
  if (has('chatbot', 'chattbot', 'ai-chatt', 'ai chatt', 'agent', 'chattis')) return { text: 'Du använder faktiskt en av våra lösningar just nu. Men titta vad som händer när vi kopplar en AI **direkt till ett affärssystem**:', ui: { type: 'integration_demo', props: { industry: 'stad' } } };
  if (has('möte', 'boka ett', 'prata med kela', 'kontakt', 'meeting', 'idé')) return { text: 'Gärna! Välj hur du vill ses och vilka dagar som passar, så bekräftar vi en tid:', ui: { type: 'meeting', props: { reason: '' } } };
  if (has('människa', 'person', 'human', 'riktig')) return { text: 'Självklart – jag är en AI, så här kommer du till en människa:', ui: { type: 'handoff', props: { reason: '' } } };
  if (has('pris', 'kostar', 'kostnad', 'price', 'cost')) return { text: 'Vi visar inga fasta priser – varje lösning offereras efter era behov, kostnadsfritt och utan förpliktelse. Hittar vi inget att spara åt er kostar genomgången ingenting. Vill du boka en kort genomgång?' };
  if (has('case', 'stodona', 'kund')) return { text: 'Vårt tydligaste exempel är vårt eget städbolag:', ui: { type: 'cards', props: { items: ['case_stodona', 'bokis', 'chattis'] } } };
  if (has('bygga', 'bygger', 'vad kan', 'tjänst', 'build', 'hemsida', 'app', 'system')) return { text: 'Allt från hemsidor till hela affärssystem – och AI som binder ihop det. Ett urval:', ui: { type: 'cards', props: { items: ['hemsida', 'system', 'ai', 'app'] } } };
  if (t.length > 40) return flow('system', text);
  return { text: 'Jag kör i **demoläge** just nu, så jag kan inte svara fritt – men jag kan visa det mesta. Välj något nedan, eller beskriv ett problem i ert företag så skissar jag en lösning.' };
}

export function create({ api, tenant, base, config, launcher, onState }) {
  const cfg = config && !config.offline ? config : { tenant, ai_ready: false, offline: true, starters: null, welcome: null, features: { voice: true, images: true }, contact_email: 'hej@kelagroup.se', privacy_url: '/integritetspolicy#kela-ai', retention_days: 90, brand: { name: 'KELA AI', tagline: 'Din genväg till smartare business.', wordmark: 'KELA' } };
  const features = cfg.features || {};
  const state = { open: false, busy: false, conv: null, profile: {}, status: 'ai', lang: ss.get('lang') || 'sv', challenge: false, image: null, unread: 0, seen: new Set(), lastSeq: 0, aborter: null, lastUser: '', voice: null, journey: [] };
  const offline = () => !cfg.ai_ready;
  const t = (k) => (T[state.lang] || T.sv)[k];
  let session = ss.get('session'); if (!session) { session = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/[^a-z0-9-]/gi, ''); ss.set('session', session); }
  try { const c = JSON.parse(ss.get('conv') || 'null'); if (c && c.id && c.token) state.conv = c; } catch {}

  // ---------- DOM ----------
  const hdOrb = orbEl('kai-hd-orb'); const orbCore = hdOrb.firstChild;
  const statusEl = h('span', { class: 'kai-status' }, h('b'), h('span'));
  const memBtn = h('button', { type: 'button', class: 'kai-ib', hidden: true, onclick: () => openSheet('mem') });
  const wideBtn = h('button', { type: 'button', class: 'kai-ib wide-t', onclick: () => setWide(!panel.classList.contains('wide')) });
  const menuBtn = h('button', { type: 'button', class: 'kai-ib', onclick: () => openSheet('menu') });
  const closeBtn = h('button', { type: 'button', class: 'kai-ib', onclick: () => close() });
  const journey = h('nav', { class: 'kai-journey', hidden: true });
  const scroller = h('div', { class: 'kai-scroll' });
  const live = h('div', { class: 'kai-sr', 'aria-live': 'polite' });
  const sugg = h('div', { class: 'kai-sugg' });
  const ta = h('textarea', { rows: '1', enterkeyhint: 'send', maxlength: '2000' });
  const sendBtn = h('button', { type: 'submit', class: 'kai-send', disabled: true });
  const micBtn = h('button', { type: 'button', class: 'kai-ib', onclick: () => startVoice() });
  const imgBtn = h('button', { type: 'button', class: 'kai-ib', onclick: () => fileIn.click() });
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  const attachPrev = h('div', { class: 'kai-attach-prev', hidden: true });
  const composer = h('form', { class: 'kai-composer', novalidate: true }, features.images !== false ? imgBtn : null, fileIn, ta, (features.voice !== false && (window.SpeechRecognition || window.webkitSpeechRecognition)) ? micBtn : null, sendBtn);
  const foot = h('div', { class: 'kai-foot' });
  const sheet = h('div', { class: 'kai-sheet', onclick: (e) => { if (e.target === sheet) closeSheet(); } }, h('div', { class: 'kai-sheet-in', role: 'dialog', 'aria-modal': 'true' }));
  const voiceEl = h('div', { class: 'kai-voice', role: 'dialog', 'aria-label': 'Röstläge' });
  const titleId = 'kai-title-' + Math.random().toString(36).slice(2, 7);
  const panel = h('section', { class: 'kai-panel', role: 'dialog', 'aria-labelledby': titleId, 'aria-hidden': 'true' },
    h('div', { class: 'kai-bg', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('header', { class: 'kai-hd' }, hdOrb, h('div', { class: 'kai-id' }, h('h2', { id: titleId, tabindex: '-1' }, cfg.brand?.name || 'KELA AI'), h('p', null, cfg.brand?.tagline || ''), statusEl), h('div', { class: 'kai-hd-act' }, memBtn, wideBtn, menuBtn, closeBtn)),
    journey, scroller, live, sugg, attachPrev, composer, foot, sheet, voiceEl);
  if (cfg.brand?.accent) { panel.style.setProperty('--k-wine', cfg.brand.accent); panel.style.setProperty('--k-pink', cfg.brand.accent_soft || '#F3D3D7'); panel.style.setProperty('--k-ink', cfg.brand.ink || '#2E0C12'); }
  document.body.append(panel);

  function applyLang() {
    panel.lang = state.lang;
    memBtn.innerHTML = ic('brain'); memBtn.setAttribute('aria-label', t('mem')); memBtn.title = t('mem');
    wideBtn.innerHTML = ic('expand'); wideBtn.setAttribute('aria-label', t('expand')); wideBtn.title = t('expand');
    menuBtn.innerHTML = ic('menu'); menuBtn.setAttribute('aria-label', t('menu')); menuBtn.title = t('menu');
    closeBtn.innerHTML = ic('close'); closeBtn.setAttribute('aria-label', t('close')); closeBtn.title = t('close') + ' (Esc)';
    micBtn.innerHTML = ic('mic'); micBtn.setAttribute('aria-label', t('mic')); micBtn.title = t('mic');
    imgBtn.innerHTML = ic('img'); imgBtn.setAttribute('aria-label', t('attach')); imgBtn.title = t('attach');
    ta.setAttribute('aria-label', t('placeholder'));
    foot.replaceChildren(t('foot'), h('a', { href: '#', onclick: (e) => { e.preventDefault(); openSheet('about'); } }, t('footLink')));
    setPlaceholder(); paintStatus(); paintSend();
  }
  function setPlaceholder() { ta.placeholder = state.status === 'human' ? t('human') : state.challenge ? t('challenge') : t('placeholder'); }
  function paintStatus() {
    statusEl.className = 'kai-status' + (state.status === 'human' || state.status === 'handoff' ? ' human' : offline() ? ' demo' : '');
    statusEl.lastChild.textContent = state.status === 'human' ? t('humanOn') : state.status === 'handoff' ? t('waiting') : offline() ? t('demo') : (state.lang === 'sv' && cfg.status_text) || t('ready');
  }
  function paintSend() {
    sendBtn.classList.toggle('stop', state.busy);
    sendBtn.innerHTML = ic(state.busy ? 'stop' : 'send', 18);
    sendBtn.setAttribute('aria-label', state.busy ? t('stop') : t('send'));
    sendBtn.disabled = !state.busy && !ta.value.trim() && !state.image;
  }
  function setOrb(s) {
    orbCore.dataset.s = s;
    panel.querySelectorAll('.kai-msg.bot:last-of-type .kai-o, .kai-live-orb').forEach((o) => { o.dataset.s = s; });
    onState({ open: state.open, busy: s !== 'idle' && s !== 'done', unread: state.unread });
    if (s === 'done') setTimeout(() => { if (orbCore.dataset.s === 'done') setOrb('idle'); }, 900);
  }
  function setWide(on) { if (mobile()) return; panel.classList.toggle('wide', on); wideBtn.setAttribute('aria-pressed', String(on)); }
  const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
  function scroll(force) { if (force || atBottom()) { const go = () => { scroller.scrollTop = scroller.scrollHeight; }; go(); setTimeout(go, 80); } }

  // ---------- Hjälpare mot servern ----------
  async function call(path, opts = {}) {
    const headers = { 'x-kela-ai': '1', ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(state.conv ? { 'x-kela-ai-token': state.conv.token } : {}) };
    const r = await fetch(`${api}${path}${path.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(tenant)}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, keepalive: !!opts.keepalive, credentials: 'omit' });
    let data = null; try { data = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((data && data.message) || 'Fel'); e.status = r.status; e.code = data && data.error; e.details = data && data.details; throw e; }
    return data;
  }
  function event(type, name) { if (cfg.offline) return; call('/event', { method: 'POST', keepalive: true, body: { type, name, session, conversation_id: state.conv?.id, page: location.pathname } }).catch(() => {}); }
  function saveConv() { ss.set('conv', state.conv ? JSON.stringify(state.conv) : null); }

  async function lead(payload) {
    const body = { ...payload, conversation_id: state.conv?.id, token: state.conv?.token };
    let res = null, serverErr = null;
    if (!cfg.offline) {
      try { res = await call('/lead', { method: 'POST', body }); } catch (e) { if (e.status === 422 || e.status === 429) throw e; serverErr = e; }
    }
    // Avisering via e-post (samma Formspree-flöde som sajtens övriga formulär).
    const fs = cfg.formspree_id || 'xojkdewo';
    const lines = [`Källa: Kela AI (${payload.kind})`, `Sida: ${location.pathname}`];
    const b = payload.brief || {};
    for (const [k, l] of Object.entries(MEM_LABEL)) if (b[k]) lines.push(`${l}: ${Array.isArray(b[k]) ? b[k].join(', ') : b[k]}`);
    if (b.recommendation) lines.push(`Rekommendation: ${b.recommendation}`);
    if (payload.meeting) lines.push(`Möte: ${payload.meeting.type} · ${payload.meeting.days.join(', ') || 'valfri dag'} · ${payload.meeting.time}`);
    if (payload.message) lines.push(`Meddelande: ${payload.message}`);
    lines.push(`Marknadsföring: ${payload.marketing ? 'ja' : 'nej'}`);
    if (res?.lead_id) lines.push(`Lead i KELA OS: ${res.lead_id}`);
    const notify = fetch(`https://formspree.io/f/${fs}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ _subject: `Kela AI: ${payload.kind === 'meeting' ? 'mötesförfrågan' : payload.kind === 'handoff' ? 'vill prata med en människa' : 'ny projektbrief'} – ${payload.company || payload.name}`, name: payload.name, email: payload.email, phone: payload.phone, company: payload.company, message: lines.join('\n') }) }).then((r) => r.ok).catch(() => false);
    if (res) { notify; return res; }
    if (await notify) return { ok: true, via: 'email' };
    const e = new Error(`Det gick inte att skicka just nu. Mejla oss gärna på ${cfg.contact_email || 'hej@kelagroup.se'}.`); e.cause = serverErr; throw e;
  }

  // ---------- Meddelanden ----------
  function addUser(text, imgUrl) {
    const m = h('div', { class: 'kai-msg me' }, h('div', { class: 'kai-txt' }, imgUrl ? h('img', { class: 'kai-img', src: imgUrl, alt: 'Bifogad bild' }) : null, text));
    scroller.append(m); scroll(true); return m;
  }
  function addBot(text = '', streaming = false) {
    const txt = h('div', { class: 'kai-txt' });
    const body = h('div', { class: 'kai-body' }, txt);
    const m = h('div', { class: 'kai-msg bot' }, orbEl(), body);
    scroller.append(m);
    const o = { el: m, body, txt, text, id: null, uiCount: 0 };
    if (streaming) txt.append(h('span', { class: 'kai-typing', 'aria-label': 'Kela AI tänker' }, h('i'), h('i'), h('i')), h('span', { class: 'kai-phase' }));
    else { txt.innerHTML = md(text); }
    scroll(true); return o;
  }
  function addStaff(text) {
    const m = h('div', { class: 'kai-msg staff' }, h('span', { class: 'kai-av' }, 'K'), h('div', { class: 'kai-body' }, h('div', { class: 'kai-txt' }, h('div', { class: 'kai-who' }, 'Kela-teamet'), text)));
    scroller.append(m); scroll(); live.textContent = 'Kela-teamet: ' + text;
    if (!state.open) { state.unread++; onState({ open: false, busy: false, unread: state.unread }); }
  }
  function addSys(text) { scroller.append(h('div', { class: 'kai-msg sys' }, h('div', { class: 'kai-txt' }, text))); scroll(); }
  function actions(o) {
    if (o.el.querySelector('.kai-acts') || !o.text) return;
    const up = h('button', { type: 'button', 'aria-label': t('good'), title: t('good'), 'aria-pressed': 'false', html: ic('up', 15) });
    const down = h('button', { type: 'button', 'aria-label': t('bad'), title: t('bad'), 'aria-pressed': 'false', html: ic('down', 15) });
    const wrap = h('div', { class: 'kai-acts' }, h('button', { type: 'button', 'aria-label': t('copy'), title: t('copy'), html: ic('copy', 15), onclick: () => { navigator.clipboard?.writeText(plain(o.text)); event('copy', 'message'); } }), o.id ? up : null, o.id ? down : null);
    const rate = (v, btn, other) => { const on = btn.getAttribute('aria-pressed') !== 'true'; btn.setAttribute('aria-pressed', String(on)); other.setAttribute('aria-pressed', 'false'); wrap.classList.add('rated'); call('/rate', { method: 'POST', body: { conversation_id: state.conv?.id, message_id: o.id, rating: on ? v : 0 } }).catch(() => {}); };
    up.onclick = () => rate(1, up, down); down.onclick = () => rate(-1, down, up);
    o.body.append(wrap);
  }
  function renderUi(ui, host, o) {
    const fn = RENDERERS[ui.type]; if (!fn) return;
    const wrap = h('div', { class: 'kai-ui', id: 'kai-' + (ui.id || Math.random().toString(36).slice(2)) });
    try { wrap.append(fn(ui.props || {}, ctx)); } catch (e) { console.warn('Kela AI: komponent', e); return; }
    host.append(wrap);
    if (o) o.uiCount++;
    state.journey.push({ label: UI_LABEL[ui.type] || ui.type, el: wrap, type: ui.type });
    paintJourney(); suggestFor(ui.type);
    setOrb('building'); setTimeout(() => setOrb('done'), 700);
    scroll(true);
  }
  function paintJourney() {
    if (!state.journey.length) { journey.hidden = true; return; }
    journey.hidden = false;
    journey.replaceChildren(h('span', null, t('journey')), ...state.journey.map((j) => h('button', { type: 'button', onclick: () => j.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }) }, h('i'), j.label)));
    journey.scrollLeft = journey.scrollWidth;
  }
  const SUGG = {
    booking_demo: ['Hur kopplas det till vårt system?', 'Räkna på besparingen', 'Boka ett möte'],
    savings: ['Vad skulle ni automatisera först?', 'Gör en projektbrief', 'Visa ett kundcase'],
    integration_demo: ['Kan ni koppla det till vårt system?', 'Vad kostar en sådan lösning?', 'Utmana Kela AI'],
    solution_flow: ['Gör en projektbrief', 'Hur lång tid tar det att bygga?', 'Boka ett möte'],
    cards: ['Visa en bokningsdemo', 'Räkna på besparingen', 'Utmana Kela AI'],
    project_brief: ['Vad händer efter att jag skickat?', 'Hur ser första mötet ut?'],
  };
  function suggestFor(type) { chips(SUGG[type] || []); }
  function chips(list, hot) {
    sugg.replaceChildren(...list.slice(0, 4).map((x, i) => h('button', { type: 'button', class: 'kai-chip' + (hot && i === 0 ? ' hot' : ''), style: `animation-delay:${i * 60}ms`, onclick: () => { if (x === 'Utmana Kela AI') return challenge(); send(x); } }, x)));
  }

  // ---------- Välkomst ----------
  function welcome(tipPrompt) {
    const starters = (cfg.starters && cfg.starters.length ? cfg.starters : ['surprise', 'automate', 'build', 'talk'].map((id) => ({ id, icon: { surprise: 'spark', automate: 'bolt', build: 'diamond', talk: 'calendar' }[id], title: EN_STARTERS[id][0], text: EN_STARTERS[id][1], prompt: EN_STARTERS[id][2] })))
      .map((s) => (state.lang === 'en' && EN_STARTERS[s.id] ? { ...s, title: EN_STARTERS[s.id][0], text: EN_STARTERS[s.id][1], prompt: EN_STARTERS[s.id][2] } : s));
    const wtext = state.lang === 'en' ? "Hi there! 👋\nI'm Kela's AI. I can show you what we build, help you find smarter solutions for your business, or calculate how much time you could save.\n\nWhat would you like to explore?" : (cfg.welcome || 'Hej där! 👋\nJag är Kelas AI. Jag kan visa vad vi bygger, hjälpa dig hitta smartare lösningar för ditt företag eller räkna på hur mycket tid ni skulle kunna spara.\n\nVad vill du utforska?');
    const hello = h('div', { class: 'kai-txt' });
    const wrap = h('div', { class: 'kai-welcome' },
      h('div', { class: 'kai-hello' }, orbEl(), hello),
      h('div', { class: 'kai-starters' }, starters.map((s, i) => {
        const b = h('button', { type: 'button', class: 'kai-starter', onpointermove: (e) => { const r = b.getBoundingClientRect(); b.style.setProperty('--px', `${e.clientX - r.left}px`); b.style.setProperty('--py', `${e.clientY - r.top}px`); },
          onclick: (e) => { ripple(b, e); event('starter', s.id); setTimeout(() => send(s.prompt), reduce ? 0 : 180); } },
          h('span', { class: 'kai-st-top' }, h('span', { class: 'kai-n' }, String(i + 1).padStart(2, '0')), h('span', { class: 'kai-ic', html: svg(s.icon, 18) })), h('b', null, s.title), h('span', null, s.text));
        return b;
      })),
      h('button', { type: 'button', class: 'kai-challenge', onclick: () => challenge() }, orbEl(), h('div', null, h('small', null, state.lang === 'en' ? 'CHALLENGE OUR AI' : 'UTMANA VÅR AI'), h('b', null, state.lang === 'en' ? 'Give me a problem in your business.' : 'Ge mig ett problem i ditt företag.'), h('span', null, state.lang === 'en' ? "I'll show how we could solve it." : 'Jag visar hur vi skulle kunna lösa det.')), h('span', { class: 'kai-go', html: ic('send', 16) })));
    scroller.append(wrap);
    // Välkomsttexten "skrivs" fram – snabbt, och utan att blockera något.
    const paras = wtext;
    if (reduce) hello.innerHTML = md(paras);
    else { let i = 0; const tick = () => { i = Math.min(paras.length, i + 4); hello.innerHTML = md(paras.slice(0, i)); if (i < paras.length) setTimeout(tick, 16); }; setTimeout(tick, 120); }
    if (tipPrompt) chips([tipPrompt], true);
  }
  function ripple(el, e) {
    if (reduce) return;
    const r = el.getBoundingClientRect(); const s = Math.max(r.width, r.height) * 2;
    const x = h('span', { class: 'kai-ripple', style: `width:${s}px;height:${s}px;left:${(e.clientX || r.left + r.width / 2) - r.left - s / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - s / 2}px` });
    el.append(x); setTimeout(() => x.remove(), 700);
  }
  function challenge() {
    state.challenge = true; setPlaceholder(); ta.focus();
    chips(state.lang === 'en' ? ['We get 200 emails a day and can’t keep up.', 'Our staff still report hours in Excel.', 'Customers keep calling about their bookings.', 'We have five systems that don’t talk to each other.'] : CHALLENGES);
    event('starter', 'challenge');
  }

  // ---------- Skicka och strömma ----------
  async function send(text) {
    text = String(text || '').trim();
    if (state.busy || (!text && !state.image)) return;
    if (state.challenge && text && !/^utmaning/i.test(text)) text = (state.lang === 'en' ? 'Challenge: ' : 'Utmaning: ') + text;
    state.challenge = false; setPlaceholder();
    const img = state.image; clearImage();
    ta.value = ''; autosize(); sugg.replaceChildren();
    state.lastUser = text;
    addUser(text, img?.url);
    if (offline() || state.forceLocal) return replyLocally(text, img);
    state.busy = true; paintSend(); setOrb('thinking');
    const o = addBot('', true);
    const phase = o.txt.querySelector('.kai-phase');
    state.aborter = new AbortController();
    let rendered = false, raf = 0, gotText = false, delegated = false;
    const paint = () => { raf = 0; o.txt.innerHTML = md(o.text) + '<span class="kai-caret" aria-hidden="true"></span>'; scroll(); };
    try {
      const res = await fetch(`${api}/chat?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST', signal: state.aborter.signal, credentials: 'omit',
        headers: { 'content-type': 'application/json', 'x-kela-ai': '1' },
        body: JSON.stringify({ message: text, page: location.pathname, session, lang: state.lang, conversation_id: state.conv?.id, token: state.conv?.token, image: img ? { media_type: img.type, data: img.data } : undefined }),
      });
      if (!res.ok || !res.body) {
        let d = null; try { d = await res.json(); } catch {}
        if (res.status === 404 && d?.error === 'no_conversation') { state.conv = null; saveConv(); }
        const e = new Error(d?.message || 'Fel'); e.code = d?.error; e.status = res.status; throw e;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1]; const dataLine = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || dataLine == null) continue;
          let d; try { d = JSON.parse(dataLine); } catch { continue; }
          if (ev === 'meta') { if (d.token) { state.conv = { id: d.conversation_id, token: d.token }; saveConv(); } }
          else if (ev === 'state') {
            setOrb(d.phase === 'building' ? 'building' : d.phase === 'writing' ? 'writing' : 'thinking');
            if (!gotText && phase) phase.textContent = d.phase === 'image' ? 'Tittar på bilden…' : d.phase === 'building' ? 'Bygger något åt dig…' : '';
          } else if (ev === 'text') {
            if (!gotText) { gotText = true; o.txt.replaceChildren(); }
            o.text += d.t; if (!raf) raf = setTimeout(paint, 32);
          } else if (ev === 'ui') { if (!gotText) { o.txt.replaceChildren(); gotText = true; } renderUi(d, o.body, o); }
          else if (ev === 'profile') { state.profile = d; paintMem(); }
          else if (ev === 'human') { o.el.remove(); rendered = true; addSys('Ditt meddelande har skickats till Kela-teamet.'); }
          else if (ev === 'error') {
            if (d.code === 'ai_not_configured') { state.forceLocal = true; o.el.remove(); rendered = true; paintStatus(); delegated = true; state.busy = false; return replyLocally(text, img, true); }
            throw Object.assign(new Error(d.message), { code: d.code });
          } else if (ev === 'done') { o.id = d.message_id || null; rendered = true; }
        }
      }
      if (raf) clearTimeout(raf);
      if (o.el.isConnected) {
        if (o.text) o.txt.innerHTML = md(o.text); else if (!o.uiCount) { o.txt.replaceChildren(); o.el.remove(); }
        actions(o);
        live.textContent = plain(o.text).slice(0, 600);
      }
      if (!rendered) throw new Error('Svaret avbröts.');
      setOrb('done');
    } catch (e) {
      if (raf) clearTimeout(raf);
      if (e.name === 'AbortError') { if (o.text) { o.txt.innerHTML = md(o.text); actions(o); } else o.el.remove(); setOrb('idle'); }
      else {
        if (!o.text && !o.uiCount) o.el.remove(); else o.txt.innerHTML = md(o.text);
        if (e.status === undefined && !e.code) {
          // Nätverksfel eller ingen server: fortsätt i demoläge.
          if (!state.conv) { state.forceLocal = true; paintStatus(); delegated = true; state.busy = false; return replyLocally(text, img, true); }
        }
        errorLine(e.message && e.code !== 'ai_error' ? e.message : 'Något gick fel när jag skulle svara.', () => { scroller.lastChild?.remove(); send(text); });
        event('error', e.code || 'client');
        setOrb('idle');
      }
    } finally {
      state.aborter = null;
      if (!delegated) {
      state.busy = false; paintSend();
      if (state.status !== 'ai') poll();
      if (state.voice?.on) speak(o.text);
      }
    }
  }
  function errorLine(msg, retry) {
    const el = h('div', { class: 'kai-err', role: 'alert' }, h('span', null, msg), retry ? h('button', { type: 'button', onclick: () => { el.remove(); retry(); } }, t('retry')) : null);
    scroller.append(el); scroll(true);
  }
  async function replyLocally(text, img, fellBack) {
    state.busy = true; paintSend(); setOrb('thinking');
    const o = addBot('', true);
    await new Promise((r) => setTimeout(r, reduce ? 50 : 650));
    const r = img && !text ? { text: 'I demoläget kan jag tyvärr inte analysera bilder – men beskriv gärna vad den visar, så hjälper jag dig vidare.' } : localReply(text);
    if (fellBack && !state.toldDemo) { state.toldDemo = true; r.text = '*(Jag kör i demoläge just nu.)* ' + r.text; }
    o.txt.replaceChildren(); setOrb('writing');
    if (reduce) { o.text = r.text; o.txt.innerHTML = md(o.text); }
    else for (let i = 0; i <= r.text.length; i += 4) { o.text = r.text.slice(0, i); o.txt.innerHTML = md(o.text); scroll(); await new Promise((res) => setTimeout(res, 12)); }
    o.text = r.text; o.txt.innerHTML = md(o.text);
    if (r.ui) renderUi({ ...r.ui, id: 'l' + Date.now() }, o.body, o); else chips(['Överraska mig', 'Visa en bokningsdemo', 'Räkna på besparingen', 'Utmana Kela AI']);
    actions(o); live.textContent = plain(o.text);
    state.busy = false; paintSend(); setOrb('done');
    event('fallback', 'local');
    if (state.voice?.on) speak(o.text);
  }

  // ---------- Komponentkontext ----------
  const ctx = {
    cfg, send: (x) => send(x), event, lead,
    wide: (on) => setWide(on), scroll: () => scroll(), done: () => setOrb('done'),
    profile: () => state.profile,
    append: (ui) => { const o = addBot(''); o.txt.remove(); renderUi(ui, o.body, o); },
    canHuman: () => !!state.conv && !cfg.offline,
    requestHuman: async () => { await call('/conversation/handoff', { method: 'POST', body: { conversation_id: state.conv.id } }); state.status = 'handoff'; paintStatus(); poll(); },
  };

  // ---------- Personal tar över: hämta nya meddelanden ----------
  let pollTimer = 0;
  async function poll() {
    clearTimeout(pollTimer);
    if (!state.conv || cfg.offline) return;
    try {
      const d = await call(`/conversation?id=${state.conv.id}&since=${state.lastSeq}`);
      const prev = state.status; state.status = d.status;
      for (const m of d.messages) {
        state.lastSeq = Math.max(state.lastSeq, m.seq);
        if (m.role === 'staff' && !state.seen.has(m.id)) { state.seen.add(m.id); addStaff(m.text); }
      }
      if (prev !== state.status) { paintStatus(); setPlaceholder(); }
    } catch (e) { if (e.status === 404) { state.conv = null; saveConv(); return; } }
    if (state.status === 'handoff' || state.status === 'human') pollTimer = setTimeout(poll, state.open && !document.hidden ? 4000 : 20000);
  }

  // ---------- Återställ ett pågående samtal ----------
  async function restore() {
    if (!state.conv || cfg.offline) return false;
    try {
      const d = await call(`/conversation?id=${state.conv.id}`);
      state.status = d.status; state.profile = d.profile || {}; paintMem();
      for (const m of d.messages) {
        state.lastSeq = Math.max(state.lastSeq, m.seq);
        if (m.role === 'user') addUser(m.text.replace(/^🖼 \[Bild\] /, '🖼 '));
        else if (m.role === 'staff') { state.seen.add(m.id); addStaff(m.text); }
        else { const o = addBot(m.text); o.id = m.id; if (!m.text) o.txt.remove(); for (const ui of m.ui || []) renderUi(ui, o.body, o); actions(o); }
      }
      state.unread = 0;
      if (!d.messages.length) return false;
      paintStatus(); setPlaceholder(); poll(); scroll(true);
      return true;
    } catch { state.conv = null; saveConv(); return false; }
  }

  // ---------- Ark: meny, minne, om ----------
  let lastFocus = null;
  function openSheet(kind) {
    const inner = sheet.firstChild; lastFocus = document.activeElement;
    if (kind === 'menu') {
      inner.setAttribute('aria-label', t('menu'));
      inner.replaceChildren(h('div', { class: 'kai-menu' },
        h('button', { type: 'button', onclick: () => { closeSheet(); reset(); } }, h('span', { html: ic('plus', 18) }), t('newChat')),
        h('button', { type: 'button', onclick: () => { state.lang = state.lang === 'sv' ? 'en' : 'sv'; ss.set('lang', state.lang); closeSheet(); applyLang(); if (!scroller.querySelector('.kai-msg')) { scroller.replaceChildren(); welcome(); } } }, h('span', { html: ic('globe', 18) }), t('lang')),
        Object.keys(state.profile || {}).length ? h('button', { type: 'button', onclick: () => openSheet('mem') }, h('span', { html: ic('brain', 18) }), t('mem')) : null,
        h('button', { type: 'button', onclick: () => { download(); closeSheet(); } }, h('span', { html: ic('dl', 18) }), t('download')),
        h('button', { type: 'button', onclick: () => openSheet('about') }, h('span', { html: ic('shield', 18) }), t('about')),
        state.conv ? h('button', { type: 'button', class: 'danger', onclick: () => openSheet('delete') }, h('span', { html: ic('trash', 18) }), t('del')) : null));
    } else if (kind === 'mem') {
      const p = state.profile || {};
      inner.setAttribute('aria-label', t('mem'));
      inner.replaceChildren(h('h3', null, 'Det här vet jag om er'), h('p', null, 'Jag minns det här under samtalet för att ge bättre förslag. Inget sparas i din webbläsare utöver samtalets id.'),
        h('dl', { class: 'kai-mem' }, Object.entries(p).filter(([k]) => MEM_LABEL[k] && k !== 'language').map(([k, v]) => [h('dt', null, MEM_LABEL[k]), h('dd', null, Array.isArray(v) ? v.join(', ') : String(v))])),
        h('div', { class: 'kai-btnrow' }, h('button', { type: 'button', class: 'kai-btn', onclick: async () => { try { if (state.conv) await call('/conversation/profile', { method: 'POST', body: { conversation_id: state.conv.id } }); } catch {} state.profile = {}; paintMem(); closeSheet(); addSys('Minnet är rensat.'); } }, 'Rensa minnet'), h('button', { type: 'button', class: 'kai-btn pri', onclick: closeSheet }, 'Klar')));
    } else if (kind === 'about') {
      inner.setAttribute('aria-label', t('about'));
      inner.replaceChildren(h('h3', null, 'Om Kela AI & integritet'),
        h('p', null, `${cfg.brand?.name || 'Kela AI'} är en AI-assistent – inte en människa. Svaren skapas av AI-modellen Claude från Anthropic och kan innehålla fel. Demos använder fiktiva data.`),
        h('p', null, `Det du skriver sparas för att kunna svara dig och för att förbättra tjänsten, och raderas automatiskt efter ${cfg.retention_days || 90} dagar. Samtalen används inte för att träna AI-modeller. Bilder sparas inte – bara AI:ns textbeskrivning av dem.`),
        h('p', null, 'Kontaktuppgifter sparas bara om du själv skickar dem och kryssar i samtycket. Nyhetsbrev är ett separat, frivilligt val. Röstinmatning startar bara när du trycker på mikrofonen, och taligenkänningen sköts av din webbläsare.'),
        h('p', null, 'Du kan när som helst ladda ner eller radera samtalet i menyn. '), h('div', { class: 'kai-btnrow' }, h('a', { class: 'kai-btn', href: cfg.privacy_url || '/integritetspolicy', target: '_blank', rel: 'noopener' }, 'Integritetspolicy'), h('button', { type: 'button', class: 'kai-btn pri', onclick: closeSheet }, 'Okej')));
    } else if (kind === 'delete') {
      inner.replaceChildren(h('h3', null, 'Radera samtalet?'), h('p', null, 'Hela samtalet tas bort från våra servrar direkt. Det går inte att ångra. (Förfrågningar du redan skickat till oss påverkas inte – be oss radera dem via e-post.)'),
        h('div', { class: 'kai-btnrow' }, h('button', { type: 'button', class: 'kai-btn', onclick: closeSheet }, 'Avbryt'), h('button', { type: 'button', class: 'kai-btn pri', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await call(`/conversation?id=${state.conv.id}`, { method: 'DELETE' }); closeSheet(); reset(); addSys('Samtalet är raderat.'); } catch { e.currentTarget.disabled = false; e.currentTarget.textContent = 'Försök igen'; }
        } }, 'Radera')));
    }
    sheet.classList.add('kai-on'); setTimeout(() => inner.querySelector('button,a')?.focus(), 50);
  }
  function closeSheet() { sheet.classList.remove('kai-on'); lastFocus?.focus?.(); }
  function paintMem() { const n = Object.keys(state.profile || {}).filter((k) => MEM_LABEL[k] && k !== 'language').length; memBtn.hidden = !n; if (n) memBtn.dataset.badge = n; }
  function download() {
    const lines = [`${cfg.brand?.name || 'Kela AI'} – samtal ${new Date().toLocaleString('sv-SE')}`, ''];
    scroller.querySelectorAll('.kai-msg').forEach((m) => { const who = m.classList.contains('me') ? 'Du' : m.classList.contains('staff') ? 'Kela-teamet' : m.classList.contains('sys') ? '—' : 'Kela AI'; const txt = m.querySelector('.kai-txt')?.innerText.trim(); if (txt) lines.push(`${who}: ${txt}`, ''); });
    const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })), download: 'kela-ai-samtal.txt' });
    document.body.append(a); a.click(); a.remove();
  }
  function reset() {
    state.aborter?.abort(); state.conv = null; saveConv(); state.profile = {}; state.status = 'ai'; state.journey = []; state.lastSeq = 0; state.seen.clear(); state.forceLocal = false; clearTimeout(pollTimer);
    scroller.replaceChildren(); sugg.replaceChildren(); paintJourney(); paintMem(); paintStatus(); setPlaceholder(); setWide(false); welcome();
  }

  // ---------- Bild ----------
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; fileIn.value = ''; if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.84);
      if (url.length > 2_000_000) throw new Error('size');
      state.image = { type: 'image/jpeg', data: url.split(',')[1], url };
      attachPrev.hidden = false;
      attachPrev.replaceChildren(h('img', { src: url, alt: '' }), h('span', null, 'Bilden skickas med ditt nästa meddelande.'), h('button', { type: 'button', onclick: clearImage }, 'Ta bort'));
      paintSend(); ta.focus(); event('image', 'attached');
    } catch { errorLine('Bilden kunde inte läsas. Prova en JPG eller PNG.'); }
  });
  function clearImage() { state.image = null; attachPrev.hidden = true; attachPrev.replaceChildren(); paintSend(); }

  // ---------- Röst ----------
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const v = state.voice = { on: true, speakOut: true, rec: null, stream: null, ctx: null, raf: 0 };
    event('voice', 'start');
    const big = orbEl('kai-vorb'); big.firstChild.classList.add('kai-live-orb');
    const canvas = h('canvas', { width: '480', height: '112', 'aria-hidden': 'true' });
    const st = h('div', { class: 'st' }, 'Startar mikrofonen…');
    const tr = h('div', { class: 'tr', 'aria-live': 'polite' });
    const speakBox = h('input', { type: 'checkbox', checked: true, onchange: (e) => { v.speakOut = e.target.checked; } });
    voiceEl.replaceChildren(big, canvas, st, tr,
      h('label', null, speakBox, 'Läs upp svaren'),
      h('div', { class: 'kai-row' }, h('button', { type: 'button', class: 'kai-btn light', onclick: () => stopVoice(true) }, 'Skriv i stället'), h('button', { type: 'button', class: 'kai-btn', onclick: () => stopVoice() }, 'Avsluta')),
      h('p', { class: 'fine' }, 'Mikrofonen är bara på när orben lyssnar. Taligenkänningen sköts av din webbläsare (i Chrome av Google, i Safari av Apple).'));
    voiceEl.classList.add('kai-on');
    const g = canvas.getContext('2d');
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      if (!v.on) { stream.getTracks().forEach((x) => x.stop()); return; }
      v.stream = stream; v.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = v.ctx.createAnalyser(); an.fftSize = 256; v.ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const draw = () => {
        an.getByteFrequencyData(data); g.clearRect(0, 0, 480, 112);
        let sum = 0; const bars = 48;
        for (let i = 0; i < bars; i++) { const val = data[Math.floor(i * data.length / bars / 1.6)] / 255; sum += val; const bh = 6 + val * 96; const x = i * 10 + 2;
          const grd = g.createLinearGradient(0, 56 - bh / 2, 0, 56 + bh / 2); grd.addColorStop(0, '#F3BFC9'); grd.addColorStop(1, '#B84E66'); g.fillStyle = grd; g.beginPath(); g.roundRect ? g.roundRect(x, 56 - bh / 2, 6, bh, 3) : g.rect(x, 56 - bh / 2, 6, bh); g.fill(); }
        big.firstChild.style.setProperty('--lvl', String(1 + Math.min(0.25, sum / bars * 0.9)));
        v.raf = requestAnimationFrame(draw);
      };
      draw();
    }).catch(() => {});
    const listen = () => {
      if (!v.on) return;
      const rec = v.rec = new SR(); rec.lang = state.lang === 'en' ? 'en-US' : 'sv-SE'; rec.interimResults = true; rec.continuous = false;
      let finalText = '';
      big.firstChild.dataset.s = 'listening'; st.textContent = 'Lyssnar…'; tr.replaceChildren(h('i', null, 'Prata på – jag lyssnar.'));
      rec.onresult = (e) => { let interim = ''; finalText = ''; for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript)); tr.replaceChildren(finalText, h('i', null, interim)); };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { st.textContent = 'Mikrofonen är blockerad'; tr.textContent = 'Tillåt mikrofonen i webbläsaren, eller skriv i stället.'; v.on = false; } };
      rec.onend = () => {
        if (!v.on) return;
        if (finalText.trim()) { st.textContent = 'Tänker…'; big.firstChild.dataset.s = 'thinking'; v.waiting = true; send(finalText.trim()); }
        else setTimeout(listen, 300);
      };
      try { rec.start(); } catch { setTimeout(listen, 500); }
    };
    v.listen = listen;
    listen();
  }
  function speak(text) {
    const v = state.voice; if (!v || !v.on) return;
    const vs = voiceEl.querySelector('.st'); const orb = voiceEl.querySelector('.kai-live-orb');
    if (!v.speakOut || !window.speechSynthesis || !text) { v.waiting = false; v.listen(); return; }
    const u = new SpeechSynthesisUtterance(plain(text).slice(0, 900)); u.lang = state.lang === 'en' ? 'en-US' : 'sv-SE';
    const voice = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(state.lang === 'en' ? 'en' : 'sv')); if (voice) u.voice = voice;
    u.rate = 1.04; vs.textContent = 'Svarar…'; orb.dataset.s = 'writing'; voiceEl.querySelector('.tr').textContent = plain(text).slice(0, 220) + (text.length > 220 ? '…' : '');
    u.onend = () => { v.waiting = false; if (v.on) v.listen(); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function stopVoice(focusText) {
    const v = state.voice; if (!v) return; v.on = false; state.voice = null;
    try { v.rec?.abort(); } catch {} v.stream?.getTracks().forEach((x) => x.stop()); v.ctx?.close?.(); cancelAnimationFrame(v.raf); window.speechSynthesis?.cancel();
    voiceEl.classList.remove('kai-on'); if (focusText) ta.focus(); else micBtn.focus();
  }

  // ---------- Inmatning ----------
  function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; paintSend(); }
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); } });
  composer.addEventListener('submit', (e) => { e.preventDefault(); if (state.busy) state.aborter?.abort(); else send(ta.value); });
  ta.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f && features.images !== false) { const dt = new DataTransfer(); dt.items.add(f); fileIn.files = dt.files; fileIn.dispatchEvent(new Event('change')); } });

  // ---------- Öppna/stäng ----------
  function placeOrigin() {
    const r = launcher.getBoundingClientRect(); const p = panel.getBoundingClientRect();
    if (p.width) { panel.style.setProperty('--k-ox', `${r.left + r.width / 2 - p.left}px`); panel.style.setProperty('--k-oy', `${r.top + r.height / 2 - p.top}px`); }
  }
  const vv = window.visualViewport;
  function fitViewport() { if (!vv || !mobile()) { panel.style.removeProperty('--kai-vh'); panel.style.top = ''; return; } panel.style.setProperty('--kai-vh', `${vv.height}px`); panel.style.top = `${vv.offsetTop}px`; scroll(); }
  vv?.addEventListener('resize', fitViewport); vv?.addEventListener('scroll', fitViewport);
  let booted = false;
  async function open(opts = {}) {
    if (!booted) { booted = true; applyLang(); const had = await restore(); if (!had) welcome(opts.source === 'tip' ? opts.prompt : null); }
    if (!state.open) {
      state.open = true; state.unread = 0;
      panel.setAttribute('aria-hidden', 'false'); placeOrigin(); fitViewport();
      if (mobile()) { panel.setAttribute('aria-modal', 'true'); document.documentElement.style.overflow = 'hidden'; }
      requestAnimationFrame(() => panel.classList.add('open'));
      onState({ open: true, busy: false, unread: 0 });
      event('open', opts.source || 'orb');
      setTimeout(() => (mobile() ? panel.querySelector('h2').focus() : ta.focus()), reduce ? 0 : 420);
      setOrb('done');
      if (state.status !== 'ai') poll();
    }
    if (opts.prompt && opts.source !== 'tip') { if (opts.send) send(opts.prompt); else { ta.value = opts.prompt; autosize(); } }
    if (opts.source === 'select_ask') event('select_ask', 'page');
    if (opts.source === 'tip') event('tip_click', location.pathname.split('/')[1] || 'home');
  }
  function close() {
    if (!state.open) return;
    stopVoice(); closeSheet();
    state.open = false; panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); panel.removeAttribute('aria-modal');
    document.documentElement.style.overflow = '';
    onState({ open: false, busy: false, unread: state.unread });
    event('close', 'x');
    setTimeout(() => launcher.focus(), 50);
  }
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (state.voice) stopVoice(); else if (sheet.classList.contains('kai-on')) closeSheet(); else close(); }
    if (e.key === 'Tab' && mobile()) { // fokusfälla i helskärmsläge
      const f = [...panel.querySelectorAll('button:not([disabled]),a[href],textarea,input:not([hidden]):not(.kai-hp),[tabindex="0"]')].filter((x) => x.offsetParent);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Fokus på element långt ner kan få webbläsaren att skrolla själva panelen (trots overflow:hidden) – nollställ.
  panel.addEventListener('scroll', () => { if (panel.scrollTop) panel.scrollTop = 0; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.status !== 'ai') poll(); });
  if (state.conv && !cfg.offline) { booted = true; applyLang(); restore().then((had) => { if (!had) welcome(); }); }

  return { open, close, send };
}
