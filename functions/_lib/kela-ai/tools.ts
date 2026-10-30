// KELA AI – godkända verktyg. Varje verktyg returnerar en strukturerad UI-komponent som klienten renderar
// med egna, fördefinierade komponenter. AI-text exekveras aldrig som kod och HTML från modellen renderas aldrig.
// Alla verktygsanrop valideras och tvättas här på servern innan något skickas till webbläsaren.
import type Anthropic from '@anthropic-ai/sdk';
import type { TenantConfig } from './config';

// Strikta scheman stöder inte maxLength/minimum – längder och intervall kontrolleras i runTool() nedan.
const S = (description: string, _maxLength?: number) => ({ type: 'string', description });
const NS = (description: string) => ({ anyOf: [{ type: 'string' }, { type: 'null' }], description });
const NN = (t: 'integer' | 'number', description: string) => ({ anyOf: [{ type: t }, { type: 'null' }], description });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });

export const INDUSTRIES = ['skonhet', 'frisor', 'stad', 'halsa', 'restaurang', 'konsult', 'generell'] as const;
export const TASKS = ['mejl_kundtjanst', 'bokningar', 'fakturering', 'offerter', 'schema_personal', 'rapporter', 'dataregistrering', 'uppfoljning'] as const;
export const STEP_KINDS = ['trigger', 'ai', 'check', 'system', 'action', 'human', 'notify', 'log'] as const;
export const CARD_KEYS = ['hemsida', 'system', 'bokning', 'automation', 'ai', 'app', 'integration', 'seo_geo', 'marknad', 'bokis', 'chattis', 'feedis', 'paminnis', 'headof', 'personalapp', 'kundapp', 'rekrytering', 'case_stodona'] as const;

type ToolDef = Anthropic.Messages.Tool & { feature?: keyof TenantConfig['features'] };

const ALL_TOOLS: ToolDef[] = [
  {
    name: 'remember_visitor',
    description: 'Spara det besökaren berättat om sig själv och sitt företag (sessionsminne). Anropa tyst när ny information dyker upp – t.ex. bransch, behov, nuvarande system eller tidsram. Fält som inte är kända sätts till null. Visas för besökaren i panelen "Det här vet jag", där hen kan rensa det.',
    input_schema: obj({
      company: NS('Företagsnamn'), industry: NS('Bransch med egna ord, t.ex. "skönhetssalong"'),
      needs: { type: 'array', items: S('Ett behov, kort', 60), description: 'Vad de behöver hjälp med, t.ex. "bokningssystem"' },
      current_systems: NS('System de använder i dag'), problem: NS('Problemet som ska lösas'), scope: NS('Ungefärlig omfattning, t.ex. antal anställda'),
      timeline: NS('Tidsram'), budget: NS('Budget om den nämnts – fråga aldrig påträngande'), name: NS('Besökarens förnamn om hen sagt det'), language: { type: 'string', enum: ['sv', 'en'] },
    }) as any,
  },
  {
    name: 'show_booking_demo', feature: 'booking_demo',
    description: 'Visa en interaktiv bokningsdemo i chatten: besökaren väljer behandling/tjänst, personal och tid, bekräftar en simulerad bokning och ser den automatiska bekräftelsen. Tydligt märkt som demo. Välj bransch som matchar besökaren ("stad" för städbolag = Bokis).',
    input_schema: obj({ industry: { type: 'string', enum: [...INDUSTRIES] }, business_name: NS('Besökarens företagsnamn om det är känt, annars null') }) as any,
  },
  {
    name: 'show_savings_calculator', feature: 'savings',
    description: 'Visa en kalkylator för potentiell tidsbesparing med animerad graf och tydliga antaganden som besökaren kan ändra. Fyll i de svar du redan fått (annars null). Ställ hellre 1–3 enkla frågor först (antal anställda, timmar admin per vecka, vilka uppgifter) och visa sedan kalkylatorn. Hitta aldrig på siffror åt besökaren.',
    input_schema: obj({
      employees: NN('integer', 'Antal anställda'),
      admin_hours_week: NN('number', 'Timmar administration per vecka totalt i företaget'),
      tasks: { type: 'array', items: { type: 'string', enum: [...TASKS] }, description: 'Uppgifter som tar mest tid' },
    }) as any,
  },
  {
    name: 'show_integration_demo', feature: 'integration_demo',
    description: 'Visa en simulerad demo där en AI-assistent kopplad till ett affärssystem hanterar "Kan du flytta min bokning till fredag?": identifierar kunden säkert, hämtar bokningen, kontrollerar tillgänglighet, föreslår tid, begär bekräftelse, genomför ändringen och skickar bekräftelse. Fiktiva data. Använd när besökaren vill se en AI-chatt/AI-agent, Chattis eller "vad AI kan göra".',
    input_schema: obj({ industry: { type: 'string', enum: [...INDUSTRIES] } }) as any,
  },
  {
    name: 'show_solution_flow', feature: 'solution_flow',
    description: 'Visa en interaktiv lösningsskiss (flödesdiagram) för ett problem besökaren beskrivit – "Utmana Kela AI". 4–8 konkreta steg från utlösare till uppföljning, med en kort förklaring per steg som visas när besökaren klickar. Ta med var en människa kopplas in. Var realistisk – lova inget som kräver integrationer kunden inte har utan att nämna det.',
    input_schema: obj({
      title: S('Rubrik, t.ex. "Så skulle vi automatisera ert kundflöde"', 90),
      problem: S('Problemet med besökarens egna ord, kort', 200),
      steps: { type: 'array', items: obj({ title: S('Stegets namn, 2–5 ord', 50), detail: S('Vad som händer i steget, 1–2 meningar', 260), kind: { type: 'string', enum: [...STEP_KINDS] } }), description: '4–8 steg i ordning' },
      gains: { type: 'array', items: S('En konkret vinst, kort', 90), description: '2–4 vinster. Inga påhittade exakta siffror.' },
      systems: { type: 'array', items: S('System/kanal som berörs', 40), description: 'Berörda system, t.ex. "Gmail", "Fortnox"' },
    }) as any,
  },
  {
    name: 'show_project_brief', feature: 'brief',
    description: 'Visa ett exklusivt projektkort "Ert framtida system" som sammanfattar besökarens behov. Använd när du vet bransch och behov (minst) – besökaren kan redigera, skicka som förfrågan, boka möte eller kopiera. Okända fält = null.',
    input_schema: obj({
      company: NS('Företag'), industry: NS('Bransch'),
      needs: { type: 'array', items: S('Behov, kort', 60) },
      current_systems: NS('Nuvarande system'), problem: NS('Problemet som ska lösas'), scope: NS('Omfattning'), timeline: NS('Tidsram'), budget: NS('Budget'),
      recommendation: S('Rekommenderad lösning, 1–3 meningar', 500),
      modules: { type: 'array', items: { type: 'string', enum: [...CARD_KEYS] }, description: 'Relevanta Kela-tjänster/moduler' },
    }) as any,
  },
  {
    name: 'show_meeting_booking', feature: 'meeting',
    description: 'Visa mötesbokning direkt i chatten (video, fysiskt i Stockholm eller telefon). Använd när besökaren vill prata med Kela, boka möte eller bli kontaktad. Bekräfta aldrig en tid själv – komponenten visar vad som faktiskt registrerats.',
    input_schema: obj({ reason: S('Kort om vad mötet gäller', 160) }) as any,
  },
  {
    name: 'show_cards',
    description: 'Visa 1–4 snygga kort om Kela-tjänster, färdiga moduler eller kundcaset Stodona, med länk till rätt sida. Använd för "vad kan Kela bygga?" eller när en tjänst/modul eller case är relevant.',
    input_schema: obj({ items: { type: 'array', items: { type: 'string', enum: [...CARD_KEYS] }, description: '1–4 kort' } }) as any,
  },
  {
    name: 'handoff_to_human',
    description: 'Använd när besökaren vill prata med en människa, är missnöjd, eller frågan kräver personligt omdöme. Visar ett kort där besökaren kan lämna kontaktuppgifter och där personal kan ta över chatten. Låtsas aldrig vara människa.',
    input_schema: obj({ reason: S('Varför, kort', 200), summary: S('Sammanfattning av ärendet för personalen', 600) }) as any,
  },
];

export function toolsFor(cfg: TenantConfig): Anthropic.Messages.Tool[] {
  return ALL_TOOLS.filter((t) => !t.feature || cfg.features[t.feature]).map(({ feature, ...t }) => ({ ...t, strict: true }) as Anthropic.Messages.Tool);
}

// ---------- Validering (modellens utdata behandlas som osäker indata) ----------
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').trim().slice(0, max);
  return s || null;
};
const oneOf = <T extends readonly string[]>(v: unknown, list: T, fb: T[number]): T[number] => (list.includes(v as any) ? (v as T[number]) : fb);
const strList = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter((x): x is string => !!x).slice(0, n) : []);
const enumList = <T extends readonly string[]>(v: unknown, list: T, n: number) => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))].slice(0, n) as T[number][] : []);
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export interface UiComponent { type: string; id: string; props: Record<string, unknown> }
export interface ToolOutcome { ui?: UiComponent; profile?: Record<string, unknown>; result: string; isError?: boolean; event?: string }

export function runTool(name: string, input: any, id: string): ToolOutcome {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'remember_visitor': {
      const p: Record<string, unknown> = {};
      for (const k of ['company', 'industry', 'current_systems', 'problem', 'scope', 'timeline', 'budget', 'name'] as const) { const s = clean(i[k], 200); if (s) p[k] = s; }
      const needs = strList(i.needs, 8, 60); if (needs.length) p.needs = needs;
      if (i.language === 'sv' || i.language === 'en') p.language = i.language;
      return { profile: p, result: 'Sparat i sessionsminnet. Fortsätt samtalet naturligt – nämn inte att du sparade något.' };
    }
    case 'show_booking_demo':
      return { ui: { type: 'booking_demo', id, props: { industry: oneOf(i.industry, INDUSTRIES, 'generell'), business_name: clean(i.business_name, 60) } }, result: 'Bokningsdemon visas nu interaktivt för besökaren. Skriv inget mer om demons steg – besökaren klickar själv.', event: 'booking_demo' };
    case 'show_savings_calculator':
      return { ui: { type: 'savings', id, props: { employees: num(i.employees, 1, 100000), admin_hours_week: num(i.admin_hours_week, 0, 5000), tasks: enumList(i.tasks, TASKS, 8) } }, result: 'Kalkylatorn visas med besökarens uppgifter och redovisade antaganden. Besökaren kan ändra värdena själv.', event: 'savings' };
    case 'show_integration_demo':
      return { ui: { type: 'integration_demo', id, props: { industry: oneOf(i.industry, INDUSTRIES, 'stad') } }, result: 'Den simulerade integrationsdemon spelas upp för besökaren.', event: 'integration_demo' };
    case 'show_solution_flow': {
      const steps = (Array.isArray(i.steps) ? i.steps : []).slice(0, 8).map((s: any) => ({ title: clean(s?.title, 50), detail: clean(s?.detail, 260) || '', kind: oneOf(s?.kind, STEP_KINDS, 'action') })).filter((s: any) => s.title);
      if (steps.length < 3) return { result: 'Lösningsskissen behöver minst 3 steg med titel. Försök igen.', isError: true };
      return { ui: { type: 'solution_flow', id, props: { title: clean(i.title, 90) || 'Så skulle vi lösa det', problem: clean(i.problem, 200), steps, gains: strList(i.gains, 4, 90), systems: strList(i.systems, 6, 40) } }, result: 'Lösningsskissen visas som ett interaktivt flöde. Avsluta gärna med en kort fråga om de vill att Kela bygger något liknande.', event: 'solution_flow' };
    }
    case 'show_project_brief':
      return { ui: { type: 'project_brief', id, props: {
        company: clean(i.company, 100), industry: clean(i.industry, 80), needs: strList(i.needs, 8, 60), current_systems: clean(i.current_systems, 200), problem: clean(i.problem, 300),
        scope: clean(i.scope, 160), timeline: clean(i.timeline, 120), budget: clean(i.budget, 120), recommendation: clean(i.recommendation, 500) || '', modules: enumList(i.modules, CARD_KEYS, 6),
      } }, result: 'Projektkortet visas. Besökaren kan redigera det, skicka det som förfrågan, boka möte eller kopiera det.', event: 'brief' };
    case 'show_meeting_booking':
      return { ui: { type: 'meeting', id, props: { reason: clean(i.reason, 160) } }, result: 'Mötesbokningen visas. Bekräfta ingen tid själv – komponenten visar om något har registrerats.', event: 'meeting' };
    case 'show_cards': {
      const items = enumList(i.items, CARD_KEYS, 4);
      if (!items.length) return { result: 'Ange minst ett giltigt kort.', isError: true };
      return { ui: { type: 'cards', id, props: { items } }, result: 'Korten visas.' };
    }
    case 'handoff_to_human':
      return { ui: { type: 'handoff', id, props: { reason: clean(i.reason, 200) } }, result: 'Kortet för att prata med en människa visas. Säg ärligt att Kela inte har bemanning dygnet runt, och att en person svarar här i chatten eller via e-post så snart som möjligt (inom 24 h på vardagar).', event: 'handoff' };
    default:
      return { result: `Okänt verktyg: ${name}`, isError: true };
  }
}
