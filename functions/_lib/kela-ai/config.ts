// KELA AI – tenantkonfiguration. Allt som kan styras från adminpanelen bor här, med säkra standardvärden.
// Multi-tenant: varje tenant har en egen konfiguration. Kärnreglerna (säkerhet, ärlighet) ligger i prompt.ts och kan inte ändras.
import { Env, HttpError, now, parseJson } from '../core';
import { KELA_KNOWLEDGE } from './knowledge';

export interface Starter { id: string; icon: string; title: string; text: string; prompt: string }
export interface PageRule { match: string; tip: string; prompt: string }
export interface KnowledgeItem { title: string; body: string }

export interface TenantConfig {
  brand: { name: string; tagline: string; wordmark: string; accent: string; accent_soft: string; ink: string };
  status_text: string;
  welcome: string;
  starters: Starter[];
  hover_texts: string[];
  page_rules: PageRule[];
  persona: string;            // personlighet och ton (redigerbar)
  extra_instructions: string; // extra instruktioner (redigerbar)
  knowledge_base: string;     // grundkunskap om företaget (redigerbar)
  knowledge: KnowledgeItem[]; // extra kunskapsavsnitt (redigerbara)
  cal_link: string;           // Cal.com-länk, t.ex. "kela/30min". Tom = mötesförfrågan i stället för direktbokning.
  formspree_id: string;       // aviseringar till e-post via Formspree (befintligt flöde på sajten)
  contact_email: string;
  privacy_url: string;
  retention_days: number;
  features: { voice: boolean; images: boolean; booking_demo: boolean; savings: boolean; integration_demo: boolean; solution_flow: boolean; brief: boolean; meeting: boolean };
}

export const DEFAULT_CONFIG: TenantConfig = {
  brand: { name: 'KELA AI', tagline: 'Din genväg till smartare business.', wordmark: 'KELA', accent: '#5C1A26', accent_soft: '#F3D3D7', ink: '#2E0C12' },
  status_text: 'AI-assistenten är redo',
  welcome: 'Hej! 👋\nJag är Kelas AI. Vad vill du utforska?',
  starters: [
    { id: 'surprise', icon: 'spark', title: 'Överraska mig', text: 'Visa något riktigt häftigt som AI kan göra.', prompt: 'Överraska mig – visa något riktigt häftigt som AI kan göra.' },
    { id: 'automate', icon: 'bolt', title: 'Automatisera mitt företag', text: 'Upptäck vad ni skulle kunna slippa göra manuellt.', prompt: 'Jag vill se vad vi skulle kunna automatisera i vårt företag.' },
    { id: 'build', icon: 'diamond', title: 'Vad kan Kela bygga?', text: 'Utforska hemsidor, appar, AI och affärssystem.', prompt: 'Vad kan Kela bygga?' },
    { id: 'talk', icon: 'calendar', title: 'Prata med Kela', text: 'Berätta om din idé och boka ett möte.', prompt: 'Jag vill berätta om min idé och boka ett möte med Kela.' },
  ],
  hover_texts: ['Fråga mig vad som helst. Eller utmana mig.', 'Nyfiken på vad AI kan göra för ditt företag?', 'Jag är mer än en vanlig chatbot.', 'Har ni något som borde automatiseras?'],
  page_rules: [
    { match: '/bygga-hemsida', tip: 'Funderar ni på att bygga en ny hemsida? Jag kan hjälpa dig hitta rätt upplägg.', prompt: 'Vi funderar på en ny hemsida. Hjälp mig hitta rätt upplägg.' },
    { match: '/billig-hemsida', tip: 'Vill du se hur en prisvärd hemsida kan byggas för just er?', prompt: 'Vi vill ha en prisvärd hemsida. Vad behöver vi tänka på?' },
    { match: '/hemsida-smaforetag', tip: 'Ska jag hjälpa dig hitta rätt upplägg för en småföretagssida?', prompt: 'Vi är ett litet företag och behöver en hemsida. Hur skulle ni göra?' },
    { match: '/bygga-automationer', tip: 'Vill du se ett exempel på en arbetsuppgift vi kan automatisera?', prompt: 'Visa ett exempel på en arbetsuppgift ni kan automatisera.' },
    { match: '/bokningssystem', tip: 'Vill du testa en liten bokningsdemo?', prompt: 'Jag vill testa bokningsdemon.' },
    { match: '/produkter/bokis', tip: 'Vill du testa hur en bokning flyter i ett städbolag?', prompt: 'Visa bokningsdemon för ett städbolag.' },
    { match: '/ai-agenter', tip: 'Vill du se vad som händer när AI kopplas till ett affärssystem?', prompt: 'Visa vad som händer när en AI kopplas direkt till ett affärssystem.' },
    { match: '/produkter/chattis', tip: 'Vill du se Chattis flytta en bokning – live?', prompt: 'Visa hur en AI-chatt kopplad till affärssystemet flyttar en bokning.' },
    { match: '/case', tip: 'Vill du veta hur en liknande lösning skulle fungera hos er?', prompt: 'Hur skulle en lösning liknande Stodonas fungera hos oss?' },
    { match: '/bransch-stad', tip: 'Driver ni städbolag? Jag kan räkna på vad ni kan spara.', prompt: 'Vi driver ett städbolag. Vad kan vi automatisera?' },
    { match: '/stadbolag', tip: 'Driver ni städbolag? Jag kan räkna på vad ni kan spara.', prompt: 'Vi driver ett städbolag. Vad kan vi automatisera?' },
    { match: '/bransch-skonhet', tip: 'Vill du testa hur onlinebokning för en salong kan kännas?', prompt: 'Jag driver en skönhetssalong och behöver ett bokningssystem.' },
    { match: '/bransch-harstylist', tip: 'Vill du testa hur onlinebokning per stylist kan kännas?', prompt: 'Jag är frisör och vill se hur onlinebokning kan fungera.' },
    { match: '/integrationer', tip: 'Har ni system som inte pratar med varandra? Utmana mig.', prompt: 'Vi har flera system som inte pratar med varandra. Hur skulle ni lösa det?' },
    { match: '/bygga-system', tip: 'Berätta vad som strular – så skissar jag ett system.', prompt: 'Vi behöver ett eget system. Kan du skissa hur det skulle kunna se ut?' },
    { match: '/bygga-app', tip: 'Har ni en app-idé? Jag kan hjälpa dig rama in den.', prompt: 'Vi har en idé till en app. Hjälp mig rama in den.' },
    { match: '/priskalkylator', tip: 'Vill du att jag sammanfattar ert behov till en projektbrief?', prompt: 'Hjälp mig sammanfatta vårt behov till en projektbrief.' },
  ],
  persona: 'Smart, snabb, varm och lite lekfull. Teknisk när det behövs, alltid affärsorienterad. Professionell utan att vara stel. Proaktiv utan att bli påträngande. Pratar som en riktigt duktig digital rådgivare – aldrig som en generisk kundtjänstbot.',
  extra_instructions: '',
  knowledge_base: KELA_KNOWLEDGE,
  knowledge: [],
  cal_link: '',
  formspree_id: 'xojkdewo',
  contact_email: 'hej@kelagroup.se',
  privacy_url: '/integritetspolicy#kela-ai',
  retention_days: 90,
  features: { voice: true, images: true, booking_demo: true, savings: true, integration_demo: true, solution_flow: true, brief: true, meeting: true },
};

const str = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const color = (v: unknown, fb: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fb);

/** Slår ihop sparad konfiguration med standardvärden och tvättar allt (används både vid läsning och sparning). */
export function normalizeConfig(raw: any): TenantConfig {
  const d = DEFAULT_CONFIG;
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = r.brand || {};
  const f = r.features || {};
  const list = <T>(v: unknown, max: number, map: (x: any) => T | null): T[] | null => (Array.isArray(v) ? v.slice(0, max).map(map).filter((x): x is T => !!x) : null);
  return {
    brand: { name: str(b.name, 40, d.brand.name), tagline: str(b.tagline, 80, d.brand.tagline), wordmark: str(b.wordmark, 16, d.brand.wordmark), accent: color(b.accent, d.brand.accent), accent_soft: color(b.accent_soft, d.brand.accent_soft), ink: color(b.ink, d.brand.ink) },
    status_text: str(r.status_text, 60, d.status_text),
    welcome: str(r.welcome, 800, d.welcome),
    starters: list<Starter>(r.starters, 6, (x) => (x && x.title ? { id: str(x.id, 24, 'custom').replace(/[^a-z0-9_-]/gi, '') || 'custom', icon: ['spark', 'bolt', 'diamond', 'calendar', 'chat', 'chart', 'flow'].includes(x.icon) ? x.icon : 'spark', title: str(x.title, 40, ''), text: str(x.text, 90, ''), prompt: str(x.prompt, 300, x.title) } : null)) ?? d.starters,
    hover_texts: list<string>(r.hover_texts, 8, (x) => (typeof x === 'string' && x.trim() ? str(x, 80, '') : null)) ?? d.hover_texts,
    page_rules: list<PageRule>(r.page_rules, 40, (x) => (x && typeof x.match === 'string' && /^\/[a-z0-9/_-]*$/i.test(x.match) ? { match: x.match.slice(0, 80), tip: str(x.tip, 120, ''), prompt: str(x.prompt, 300, '') } : null)) ?? d.page_rules,
    persona: str(r.persona, 1500, d.persona),
    extra_instructions: str(r.extra_instructions, 4000, d.extra_instructions),
    knowledge_base: str(r.knowledge_base, 40000, d.knowledge_base),
    knowledge: list<KnowledgeItem>(r.knowledge, 30, (x) => (x && x.title ? { title: str(x.title, 120, ''), body: str(x.body, 6000, '') } : null)) ?? d.knowledge,
    cal_link: typeof r.cal_link === 'string' && /^[a-z0-9_-]+(\/[a-z0-9_-]+)?$/i.test(r.cal_link) ? r.cal_link : '',
    formspree_id: typeof r.formspree_id === 'string' && /^[a-z0-9]{0,20}$/i.test(r.formspree_id) ? r.formspree_id : d.formspree_id,
    contact_email: typeof r.contact_email === 'string' && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(r.contact_email) ? r.contact_email : d.contact_email,
    privacy_url: typeof r.privacy_url === 'string' && /^\/[a-z0-9/#_-]*$/i.test(r.privacy_url) ? r.privacy_url : d.privacy_url,
    retention_days: Number.isInteger(r.retention_days) && r.retention_days >= 7 && r.retention_days <= 730 ? r.retention_days : d.retention_days,
    features: Object.fromEntries(Object.entries(d.features).map(([k, v]) => [k, bool(f[k], v)])) as TenantConfig['features'],
  };
}

/** Det som är säkert att visa publikt i widgeten (inga instruktioner, ingen kunskapsbas). */
export function publicConfig(t: { id: string; config: TenantConfig }, aiReady: boolean) {
  const c = t.config;
  return {
    tenant: t.id, ai_ready: aiReady, brand: c.brand, status_text: c.status_text, welcome: c.welcome, starters: c.starters,
    hover_texts: c.hover_texts, page_rules: c.page_rules, cal_link: c.cal_link, formspree_id: c.formspree_id,
    contact_email: c.contact_email, privacy_url: c.privacy_url, retention_days: c.retention_days, features: c.features,
  };
}

export interface Tenant { id: string; org_id: string; name: string; active: number; allowed_origins: string[]; config: TenantConfig; updated_at: string }

/** Hämtar tenant. Kelas egen tenant ('kela') skapas automatiskt första gången, kopplad till första företaget i KELA OS. */
export async function loadTenant(env: Env, id: string): Promise<Tenant> {
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new HttpError(404, 'unknown_tenant', 'Okänd assistent.');
  if (!env.DB) throw new HttpError(503, 'no_db', 'Databasen är inte kopplad.');
  let row = await env.DB.prepare('SELECT * FROM ai_tenants WHERE id = ?').bind(id).first<any>();
  if (!row && id === 'kela') {
    const org = await env.DB.prepare('SELECT id FROM organizations ORDER BY created_at LIMIT 1').first<any>();
    if (!org) throw new HttpError(503, 'not_setup', 'KELA OS är inte installerat ännu.');
    const t = now();
    await env.DB.prepare("INSERT OR IGNORE INTO ai_tenants (id, org_id, name, config_json, created_at, updated_at) VALUES ('kela', ?, 'Kela Group – kelagroup.se', '{}', ?, ?)").bind(org.id, t, t).run();
    row = await env.DB.prepare('SELECT * FROM ai_tenants WHERE id = ?').bind(id).first<any>();
  }
  if (!row || !row.active) throw new HttpError(404, 'unknown_tenant', 'Okänd assistent.');
  return { id: row.id, org_id: row.org_id, name: row.name, active: row.active, allowed_origins: parseJson<string[]>(row.allowed_origins, []), config: normalizeConfig(parseJson(row.config_json, {})), updated_at: row.updated_at };
}
