// KELA OS – applikationsskal: autentisering, layout, navigation, router, global sökning.
import { html, raw, ico, $, $$, setHTML, toast, showErrors, formData, withBusy, debounce, initials, esc, errorBox, copy } from './lib/ui.js';
import { WORDMARK } from './lib/icons.js';
import { api, get, post, setAuthLostHandler } from './lib/api.js';

// ---------- Tema ----------
const THEME_KEY = 'kela-os-theme';
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function readTheme() { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } }
function saveTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch { /* privat läge */ } applyTheme(t); }
applyTheme(readTheme());

// ---------- Navigation ----------
// phase: 1 = byggt nu, 2/3 = planerat. perm styr synlighet (servern verkställer ändå behörigheten).
const NAV = [
  { g: 'Översikt', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', href: '#/', perm: 'dashboard:read' },
    { id: 'notiser', label: 'Notiser', icon: 'bell', href: '#/notiser', perm: 'dashboard:read' },
    { id: 'kalender', label: 'Kalender', icon: 'calendar', href: '#/kalender', perm: 'tasks:read' },
    { id: 'uppgifter', label: 'Mina uppgifter', icon: 'checkSquare', href: '#/uppgifter', perm: 'tasks:read', count: 'tasks' },
  ] },
  { g: 'Försäljning', items: [
    { id: 'leads', label: 'Leads', icon: 'inbox', href: '#/leads', perm: 'leads:read', count: 'leads' },
    { id: 'kunder', label: 'CRM / Kunder', icon: 'building', href: '#/kunder', perm: 'customers:read' },
    { id: 'affarer', label: 'Affärsmöjligheter', icon: 'target', href: '#/affarer', perm: 'deals:read' },
    { id: 'offerter', label: 'Offerter', icon: 'file', href: '#/offerter', perm: 'quotes:read' },
    { id: 'avtal', label: 'Avtal', icon: 'signature', phase: 2 },
    { id: 'tjanster', label: 'Tjänster och prislista', icon: 'tag', href: '#/tjanster', perm: 'services:read' },
  ] },
  { g: 'Leverans', items: [
    { id: 'projekt', label: 'Projekt', icon: 'folder', href: '#/projekt', perm: 'projects:read' },
    { id: 'projektuppgifter', label: 'Uppgifter', icon: 'listChecks', href: '#/uppgifter?typ=projekt', perm: 'tasks:read' },
    { id: 'feedback', label: 'Kundfeedback', icon: 'message', phase: 2 },
    { id: 'support', label: 'Supportärenden', icon: 'buoy', phase: 2 },
    { id: 'portaler', label: 'Kundportaler', icon: 'layout', phase: 2 },
  ] },
  { g: 'Ekonomi', items: [
    { id: 'fakturor', label: 'Fakturor', icon: 'receipt', phase: 2 },
    { id: 'abonnemang', label: 'Abonnemang', icon: 'repeat', phase: 2 },
    { id: 'intakter', label: 'Intäkter', icon: 'trending', phase: 2 },
    { id: 'kostnader', label: 'Kostnader', icon: 'wallet', phase: 2 },
    { id: 'rapporter', label: 'Rapporter', icon: 'chart', phase: 3 },
  ] },
  { g: 'Marknadsföring', items: [
    { id: 'cms', label: 'Hemsidans CMS', icon: 'globe', phase: 3 },
    { id: 'formular', label: 'Formulär', icon: 'clipboard', phase: 3 },
    { id: 'kampanjer', label: 'Kampanjer', icon: 'megaphone', phase: 3 },
    { id: 'nyhetsbrev', label: 'Nyhetsbrev', icon: 'mail', phase: 3 },
    { id: 'seo', label: 'SEO', icon: 'search', phase: 3 },
  ] },
  { g: 'KELA Systems', items: [
    { id: 'hemsidor', label: 'Kundernas hemsidor', icon: 'server', phase: 3 },
    { id: 'ai-chattar', label: 'AI-chattar', icon: 'bot', phase: 3 },
    { id: 'bokning', label: 'Bokningssystem', icon: 'calCheck', phase: 3 },
    { id: 'integrationer', label: 'Integrationer', icon: 'plug', phase: 3 },
    { id: 'drift', label: 'Driftstatus', icon: 'activity', phase: 3 },
    { id: 'licenser', label: 'Licenser', icon: 'key', phase: 3 },
  ] },
  { g: 'Administration', items: [
    { id: 'anvandare', label: 'Användare och behörigheter', icon: 'users', href: '#/anvandare', perm: 'users:read' },
    { id: 'automatiseringar', label: 'Automatiseringar', icon: 'zap', phase: 2 },
    { id: 'ai', label: 'AI-assistent', icon: 'sparkles', phase: 3 },
    { id: 'installningar', label: 'Inställningar', icon: 'settings', href: '#/installningar' },
    { id: 'logg', label: 'Säkerhet och aktivitetslogg', icon: 'shield', href: '#/logg', perm: 'audit:read' },
  ] },
];

const ROUTES = [
  [/^$/, 'dashboard', () => import('./views/dashboard.js')],
  [/^notiser$/, 'notiser', () => import('./views/notifications.js')],
  [/^kalender$/, 'kalender', () => import('./views/calendar.js')],
  [/^uppgifter$/, 'uppgifter', () => import('./views/tasks.js')],
  [/^leads$/, 'leads', () => import('./views/leads.js')],
  [/^leads\/(?<id>lead_[0-9a-z]+)$/, 'leads', () => import('./views/leads.js')],
  [/^kunder$/, 'kunder', () => import('./views/customers.js')],
  [/^kunder\/(?<id>cus_[0-9a-z]+)(?:\/(?<tab>[a-z]+))?$/, 'kunder', () => import('./views/customer.js')],
  [/^affarer$/, 'affarer', () => import('./views/pipeline.js')],
  [/^affarer\/(?<id>deal_[0-9a-z]+)$/, 'affarer', () => import('./views/deal.js')],
  [/^offerter$/, 'offerter', () => import('./views/quotes.js')],
  [/^offerter\/(?<id>quo_[0-9a-z]+)(?:\/(?<tab>[a-z]+))?$/, 'offerter', () => import('./views/quote-editor.js')],
  [/^tjanster$/, 'tjanster', () => import('./views/services.js')],
  [/^projekt$/, 'projekt', () => import('./views/projects.js')],
  [/^projekt\/(?<id>prj_[0-9a-z]+)(?:\/(?<tab>[a-z]+))?$/, 'projekt', () => import('./views/project.js')],
  [/^anvandare$/, 'anvandare', () => import('./views/users.js')],
  [/^installningar$/, 'installningar', () => import('./views/settings.js')],
  [/^logg$/, 'logg', () => import('./views/audit.js')],
  [/^p\/(?<key>[a-z-]+)$/, null, () => import('./views/planned.js')],
];

// ---------- Tillstånd ----------
const app = {
  me: null,
  can(p) { return !!this.me?.permissions?.includes(p); },
  navigate(path) { location.hash = path.startsWith('#') ? path : '#' + path; },
  setCrumbs(list) {
    const el = $('#crumbs'); if (!el) return;
    setHTML(el, html`${list.map((c, i) => i < list.length - 1
      ? html`<a href="${c.href}">${c.label}</a>${ico('chevRight')}`
      : html`<span class="cur">${c.label}</span>`)}`);
    document.title = `${list[list.length - 1]?.label || 'KELA OS'} · KELA OS`;
  },
  setActions(h) { const el = $('#top-act'); if (el) setHTML(el, h || ''); },
  async refreshCounts() {
    try {
      const d = await get('/dashboard');
      const set = (k, n) => { const el = $(`[data-count="${k}"]`); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); } };
      set('leads', d.kpis.leads?.uncontacted || 0);
      set('tasks', d.kpis.tasks?.overdue || 0);
    } catch { /* inte kritiskt */ }
  },
};
window.__kelaOS = app; // underlättar felsökning i konsolen

setAuthLostHandler((err) => {
  if (err.code === 'mfa_required') return boot();
  toast('Din session har gått ut. Logga in igen.', 'err');
  boot();
});

// ---------- Autentiseringsskärmar ----------
function authLayout(inner) {
  return html`<div class="auth">
    <aside class="auth-art">
      ${raw(WORDMARK)}
      <div><h2>Operativsystemet för KELA.</h2><p>Kunder, affärer, offerter och leveranser – samlat på ett ställe, byggt för att växa.</p></div>
      <div class="foot"><span>KELA Group AB</span><span>Skyddad inloggning · MFA</span></div>
    </aside>
    <main class="auth-main"><div class="auth-box">${inner}</div></main>
  </div>`;
}
const root = () => $('#root');

function renderLogin() {
  setHTML(root(), authLayout(html`
    <h1>Logga in</h1><p class="sub">Välkommen tillbaka till KELA OS.</p>
    <form class="form" id="login" novalidate>
      <label class="field"><span>E-post</span><input class="in" name="email" type="email" autocomplete="username" required autofocus></label>
      <label class="field"><span>Lösenord</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Logga in</button>
      <p class="small faint">Endast för behörig personal. Alla inloggningar loggas.</p>
    </form>`));
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await withBusy(f.querySelector('button'), async () => {
      try { await post('/auth/login', formData(f)); boot(); }
      catch (err) { showErrors(f, err); }
    });
  });
}

async function renderSetup(status) {
  if (!status.setup_enabled) {
    setHTML(root(), authLayout(html`<h1>Installera KELA OS</h1><p class="sub">Installationen är inte aktiverad.</p>
      <div class="notice">${ico('info')}<div>Sätt miljövariabeln <strong>OS_SETUP_TOKEN</strong> i Cloudflare Pages och ladda om sidan. Se <span class="mono">docs/KELA-OS.md</span>.</div></div>`));
    return;
  }
  setHTML(root(), authLayout(html`
    <h1>Installera KELA OS</h1><p class="sub">Skapa företaget och det första superadmin-kontot.</p>
    <form class="form" id="setup" novalidate>
      <label class="field"><span>Installationsnyckel</span><input class="in" name="setup_token" type="password" autocomplete="off" required><span class="hint">Värdet av OS_SETUP_TOKEN.</span></label>
      <div class="fr"><label class="field"><span>Företag</span><input class="in" name="org_name" value="KELA Group AB" required></label>
      <label class="field"><span>Org.nr</span><input class="in" name="org_number" placeholder="559xxx-xxxx"></label></div>
      <label class="field"><span>Ditt namn</span><input class="in" name="name" autocomplete="name" required></label>
      <label class="field"><span>E-post</span><input class="in" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Lösenord</span><input class="in" name="password" type="password" autocomplete="new-password" required minlength="12"><span class="hint">Minst 12 tecken. Du aktiverar tvåstegsverifiering i nästa steg.</span></label>
      <button class="btn primary" type="submit">Skapa och fortsätt</button>
    </form>`));
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    await withBusy(f.querySelector('button'), async () => {
      try { await post('/auth/setup', formData(f)); boot(); } catch (err) { showErrors(f, err); }
    });
  });
}

async function renderMfa(me) {
  const enroll = me.mfa === 'enroll';
  let setup = null;
  if (enroll) {
    try { setup = await post('/auth/mfa/setup'); } catch (e) { setHTML(root(), authLayout(errorBox(e))); return; }
  }
  setHTML(root(), authLayout(html`
    <h1>${enroll ? 'Aktivera tvåstegsverifiering' : 'Tvåstegsverifiering'}</h1>
    <p class="sub">${enroll ? 'Krävs för administratörer. Använd en app som Google Authenticator, 1Password eller Microsoft Authenticator.' : `Ange koden från din autentiseringsapp för ${me.user.email}.`}</p>
    ${enroll ? html`<ol class="steps">
      <li>Öppna din autentiseringsapp och välj att lägga till konto med nyckel.</li>
      <li><div>Ange kontonamn <strong>KELA OS</strong> och nyckeln:<div class="secret" id="secret">${setup.secret.replace(/(.{4})/g, '$1 ').trim()}</div>
        <div class="pill-row mt8"><button type="button" class="btn sm" id="cp">${ico('copy')} Kopiera nyckel</button><a class="btn sm" href="${setup.uri}">${ico('external')} Öppna i app</a></div></div></li>
      <li>Skriv in den sexsiffriga koden som visas.</li></ol>` : ''}
    <form class="form" id="mfa" novalidate>
      <label class="field"><span>Kod</span><input class="in code-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus></label>
      <button class="btn primary" type="submit">${enroll ? 'Aktivera och fortsätt' : 'Verifiera'}</button>
      <button class="btn ghost" type="button" id="logout">Logga ut</button>
    </form>`));
  $('#cp')?.addEventListener('click', () => copy(setup.secret));
  $('#logout').addEventListener('click', async () => { await post('/auth/logout').catch(() => {}); boot(); });
  const f = $('#mfa');
  f.code.addEventListener('input', () => { f.code.value = f.code.value.replace(/\D/g, '').slice(0, 6); if (f.code.value.length === 6) f.requestSubmit(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(f.querySelector('button[type=submit]'), async () => {
      try { await post('/auth/mfa/verify', { code: f.code.value }); toast(enroll ? 'Tvåstegsverifiering aktiverad' : 'Verifierad'); boot(); }
      catch (err) { showErrors(f, err); f.code.select(); }
    });
  });
}

async function renderInvite(token) {
  let inv;
  try { inv = await get('/auth/invite/' + encodeURIComponent(token)); }
  catch (e) { setHTML(root(), authLayout(html`<h1>Inbjudan</h1><p class="sub">${e.message}</p><a class="btn" href="#/">Till inloggningen</a>`)); return; }
  setHTML(root(), authLayout(html`
    <h1>Välkommen, ${inv.name.split(' ')[0]}</h1><p class="sub">Du är inbjuden till ${inv.org_name} som <strong>${inv.role_label}</strong>.</p>
    <form class="form" id="inv" novalidate>
      <label class="field"><span>E-post</span><input class="in" value="${inv.email}" disabled></label>
      <label class="field"><span>Välj lösenord</span><input class="in" name="password" type="password" autocomplete="new-password" required minlength="12"><span class="hint">Minst 12 tecken.</span></label>
      <button class="btn primary" type="submit">Skapa konto</button>
    </form>`));
  $('#inv').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget;
    await withBusy(f.querySelector('button'), async () => {
      try { await post('/auth/invite/' + encodeURIComponent(token), formData(f)); location.hash = '#/'; boot(); } catch (err) { showErrors(f, err); }
    });
  });
}

// ---------- Layout ----------
function navHtml() {
  let closed = [];
  try { closed = JSON.parse(localStorage.getItem('kela-os-nav') || '[]'); } catch { /* */ }
  return NAV.map((g) => {
    const items = g.items.filter((i) => i.phase || !i.perm || app.can(i.perm));
    if (!items.length) return '';
    return html`<div class="nav-g ${closed.includes(g.g) ? 'closed' : ''}" data-g="${g.g}">
      <button class="nav-gh" type="button" aria-expanded="${!closed.includes(g.g)}">${g.g}${ico('chevDown')}</button>
      <div class="nav-items">${items.map((i) => html`<a class="nav-i ${i.phase ? 'soon' : ''}" data-nav="${i.id}" href="${i.href || '#/p/' + i.id}">
        ${ico(i.icon)}<span>${i.label}</span>${i.phase ? html`<span class="ph">Fas ${i.phase}</span>` : ''}${i.count ? html`<span class="cnt hidden" data-count="${i.count}"></span>` : ''}</a>`)}</div>
    </div>`;
  });
}

function renderShell() {
  const me = app.me;
  setHTML(root(), html`<div class="app">
    <aside class="side" id="side">
      <div class="side-top"><a href="#/" class="brand" aria-label="KELA OS – startsida">${raw(WORDMARK)}<span class="os">OS</span></a><div class="side-org">${me.org?.name || ''}</div></div>
      <button class="searchbtn" id="open-search" type="button">${ico('search')}<span>Sök…</span><kbd>⌘K</kbd></button>
      <nav class="nav" aria-label="Huvudmeny">${navHtml()}</nav>
      <div class="side-foot"><button class="me" id="me-btn" type="button"><span class="av">${initials(me.user.name)}</span><span><div class="me-n">${me.user.name}</div><div class="me-r">${me.user.role_label}</div></span></button></div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top" id="top">
        <button class="btn ghost icon burger" id="burger" aria-label="Meny">${ico('menu')}</button>
        <div class="crumbs" id="crumbs"></div>
        <div class="top-act" id="top-act"></div>
      </header>
      <div class="content" id="view"></div>
    </div>
  </div>`);
  $$('.nav-gh').forEach((b) => b.addEventListener('click', () => {
    const g = b.closest('.nav-g'); g.classList.toggle('closed');
    b.setAttribute('aria-expanded', String(!g.classList.contains('closed')));
    try { localStorage.setItem('kela-os-nav', JSON.stringify($$('.nav-g.closed').map((x) => x.dataset.g))); } catch { /* */ }
  }));
  const side = $('#side'), scrim = $('#scrim');
  const closeSide = () => { side.classList.remove('open'); scrim.classList.remove('on'); };
  $('#burger').addEventListener('click', () => { side.classList.add('open'); scrim.classList.add('on'); });
  scrim.addEventListener('click', closeSide);
  side.addEventListener('click', (e) => { if (e.target.closest('.nav-i')) closeSide(); });
  $('#open-search').addEventListener('click', openSearch);
  $('#me-btn').addEventListener('click', openMeMenu);
  addEventListener('scroll', () => $('#top')?.classList.toggle('scrolled', scrollY > 4), { passive: true });
  app.refreshCounts();
}

function openMeMenu() {
  import('./lib/ui.js').then(({ modal }) => {
    const theme = readTheme();
    modal({
      title: app.me.user.name,
      body: html`<p class="muted mb12">${app.me.user.email} · ${app.me.user.role_label}</p>
        <div class="field"><span>Utseende</span><div class="seg" id="theme">
          ${[['system', 'Auto', 'monitor'], ['light', 'Ljust', 'sun'], ['dark', 'Mörkt', 'moon']].map(([k, l, i]) => html`<button type="button" data-t="${k}" class="${theme === k ? 'on' : ''}">${ico(i)} ${l}</button>`)}
        </div></div>
        <div class="divider"></div>
        <div class="list"><a class="li" href="#/installningar" data-close>${ico('settings')}<span class="li-b">Profil och säkerhet</span></a>
        <button type="button" class="li click btn ghost jc-start h-auto w100" id="lo">${ico('logout')}<span>Logga ut</span></button></div>`,
      onMount: (d, close) => {
        $$('[data-t]', d).forEach((b) => b.addEventListener('click', () => { saveTheme(b.dataset.t); $$('[data-t]', d).forEach((x) => x.classList.toggle('on', x === b)); }));
        $('#lo', d).addEventListener('click', async () => { await post('/auth/logout').catch(() => {}); close(); boot(); });
      },
    });
  });
}

// ---------- Global sökning ----------
function openSearch() {
  if ($('dialog.cmd-d')) return;
  const d = document.createElement('dialog');
  d.className = 'cmd-d';
  setHTML(d, html`<div class="cmd"><div class="cmd-in">${ico('search', 'lg')}<input placeholder="Sök kunder, kontakter, offerter, affärer, leads…" aria-label="Sök" id="cmd-q"><kbd>Esc</kbd></div><div class="cmd-res" id="cmd-res"></div></div>`);
  document.body.append(d); d.showModal();
  const input = $('#cmd-q', d), res = $('#cmd-res', d);
  let items = [], idx = 0;
  const quick = [
    { title: 'Ny offert', sub: 'Skapa', link: '#/offerter?ny=1', type: 'action' },
    { title: 'Ny kund', sub: 'Skapa', link: '#/kunder?ny=1', type: 'action' },
    { title: 'Nytt lead', sub: 'Skapa', link: '#/leads?ny=1', type: 'action' },
  ].filter((q) => app.can(q.link.includes('offert') ? 'quotes:write' : q.link.includes('kund') ? 'customers:write' : 'leads:write'));
  const TYPE_ICON = { customer: 'building', contact: 'user', quote: 'file', deal: 'target', lead: 'inbox', project: 'folder', action: 'plus' };
  const draw = () => {
    setHTML(res, items.length ? html`${items.map((r, i) => html`<a class="cmd-i ${i === idx ? 'on' : ''}" href="${r.link}" data-i="${i}">${ico(TYPE_ICON[r.type] || 'arrowRight')}<span class="li-t">${r.title}</span><span class="li-s">${r.sub}</span></a>`)}`
      : html`<div class="empty sm"><p>${input.value.trim().length < 2 ? 'Skriv minst två tecken.' : 'Inga träffar.'}</p></div>`);
  };
  const search = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { items = quick; idx = 0; return draw(); }
    try { items = (await get('/search?q=' + encodeURIComponent(q))).results; idx = 0; draw(); } catch { /* */ }
  }, 160);
  items = quick; draw();
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[idx]) { location.hash = items[idx].link; d.close(); }
  });
  res.addEventListener('click', (e) => { if (e.target.closest('a')) d.close(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  input.focus();
}
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && app.me?.mfa === 'ok') { e.preventDefault(); openSearch(); }
});

// ---------- Router ----------
let renderSeq = 0;
async function route() {
  const full = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = full.split('?');
  if (path.startsWith('inbjudan/')) return renderInvite(path.slice(9));
  if (!app.me || app.me.mfa !== 'ok') return;
  if (!$('#view')) renderShell();
  const seq = ++renderSeq;
  const view = $('#view');
  const match = ROUTES.map(([re, nav, load]) => ({ m: path.match(re), nav, load })).find((r) => r.m);
  const navId = path === 'uppgifter' && query.includes('typ=projekt') ? 'projektuppgifter' : match && (match.nav || match.m.groups?.key);
  $$('.nav-i').forEach((a) => a.classList.toggle('on', !!match && a.dataset.nav === navId));
  app.setActions('');
  view.classList.remove('wide');
  if (!match) { setHTML(view, html`<div class="empty"><h3>Sidan finns inte</h3><a class="btn" href="#/">Till dashboard</a></div>`); return; }
  setHTML(view, html`<div class="sk sk-block mt16"></div>`);
  try {
    const mod = await match.load();
    if (seq !== renderSeq) return;
    window.scrollTo(0, 0);
    await mod.default(view, { ...(match.m.groups || {}), query: new URLSearchParams(query) }, app);
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    if (e.status === 403) setHTML(view, html`<div class="empty"><div class="empty-ico">${ico('lock', 'lg')}</div><h3>Ingen behörighet</h3><p>Din roll har inte åtkomst till den här delen.</p></div>`);
    else if (e.status !== 401) setHTML(view, errorBox(e));
  }
}
addEventListener('hashchange', route);

// ---------- Start ----------
async function boot() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('inbjudan/')) { app.me = null; return renderInvite(hash.slice(9)); }
  try {
    app.me = await api('/auth/me');
  } catch (e) {
    app.me = null;
    if (e.status === 401) {
      try {
        const st = await get('/auth/setup-status');
        return st.needs_setup ? renderSetup(st) : renderLogin();
      } catch (e2) { return setHTML(root(), authLayout(errorBox(e2))); }
    }
    return setHTML(root(), authLayout(errorBox(e)));
  }
  if (app.me.mfa !== 'ok') return renderMfa(app.me);
  setHTML(root(), '');
  renderShell();
  route();
}
boot();
void esc;
