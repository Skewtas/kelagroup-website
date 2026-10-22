// KELA Intelligence – AI-utkast till digitaliseringsplan. Utkastet sparas aldrig automatiskt:
// det returneras till redigeraren, markeras som AI-utkast och måste granskas innan offerten kan skickas.
import Anthropic from '@anthropic-ai/sdk';
import { Env, HttpError } from './core';

const SYSTEM = `Du är digitaliseringsrådgivare på KELA Group AB, en svensk byrå som bygger hemsidor, bokningssystem, AI-chattar, appar, automationer och integrationer åt små och medelstora företag.

Din uppgift: skriv ett första utkast till en digitaliseringsplan som inleder en offert. Planen ska hjälpa kunden att förstå sitt nuläge, vad som går att förbättra, i vilken ordning, och vad det är värt.

Regler:
- Skriv på svenska, med "ni/er" till kunden. Konkret, varmt och affärsmässigt. Inga modeord.
- Bygg på mötesanteckningarna. Hitta inte på fakta om kunden. Där siffror saknas (timmar, kostnader) gör du en försiktig uppskattning och skriver den som ett antagande i "assumptions".
- Nuläget: 3–7 processer. "hours_month" är timmar per månad som processen tar i dag. "automation_pct" är hur stor andel KELA:s lösning realistiskt tar bort (var hellre försiktig än optimistisk).
- Mål: 2–5 mätbara mål kopplade till nuläget.
- Färdplan: 2–4 faser i rimlig ordning. Koppla faserna till tjänsterna i offerten. "actions" är punkter, en per rad.
- "hourly_cost_sek" är kundens kostnad per arbetstimme inklusive sociala avgifter (normalt 350–550 kr för SMB om inget annat framgår).
- "removed_costs" bara om anteckningarna nämner system eller kostnader som försvinner.
- "summary" är 2–4 meningar om rekommendationen och vad den ger.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'current', 'hourly_cost_sek', 'removed_costs', 'goals', 'phases', 'assumptions'],
  properties: {
    summary: { type: 'string' },
    current: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['process', 'today', 'problem', 'hours_month', 'automation_pct'],
        properties: { process: { type: 'string' }, today: { type: 'string' }, problem: { type: 'string' }, hours_month: { type: 'number' }, automation_pct: { type: 'integer' } },
      },
    },
    hourly_cost_sek: { type: 'integer' },
    removed_costs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'monthly_sek'], properties: { label: { type: 'string' }, monthly_sek: { type: 'integer' } } } },
    goals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['goal', 'metric', 'today', 'target'], properties: { goal: { type: 'string' }, metric: { type: 'string' }, today: { type: 'string' }, target: { type: 'string' } } } },
    phases: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'period', 'actions', 'effect'], properties: { title: { type: 'string' }, period: { type: 'string' }, actions: { type: 'string' }, effect: { type: 'string' } } } },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
} as const;

const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : 0));
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export async function draftDigitalPlan(env: Env, input: { customer: string; industry?: string | null; title: string; items: { name: string; billing: string }[]; notes: string }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(501, 'ai_not_configured', 'AI är inte aktiverat. Lägg till ANTHROPIC_API_KEY i Cloudflare för att använda KELA Intelligence.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: 1, timeout: 120_000 });
  const user = [
    `Kund: ${input.customer}${input.industry ? ` (bransch: ${input.industry})` : ''}`,
    `Offertens rubrik: ${input.title}`,
    `Tjänster i offerten: ${input.items.length ? input.items.map((i) => `${i.name} (${i.billing === 'monthly' ? 'löpande' : 'engång'})`).join('; ') : 'inga rader ännu'}`,
    '',
    'Mötesanteckningar:',
    input.notes,
  ].join('\n');

  let res;
  try {
    res = await client.beta.messages.create({
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_rate_limited', 'AI-tjänsten är tillfälligt överbelastad. Försök igen om en minut.');
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'ai_auth', 'AI-nyckeln är ogiltig. Kontrollera ANTHROPIC_API_KEY.');
    if (e instanceof Anthropic.APIError) throw new HttpError(502, 'ai_error', 'AI-tjänsten svarade inte som väntat. Försök igen.');
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'ai_refused', 'AI:n kunde inte skriva ett utkast utifrån anteckningarna. Formulera om dem och försök igen.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'ai_truncated', 'AI-svaret blev för långt. Korta ner anteckningarna och försök igen.');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let d: any;
  try { d = JSON.parse(text); } catch { throw new HttpError(502, 'ai_bad_output', 'AI-svaret gick inte att läsa. Försök igen.'); }

  // Normalisera och begränsa – AI-svar behandlas som osäker indata.
  return {
    enabled: true,
    ai_draft: true,
    summary: cut(d.summary, 4000),
    current: (Array.isArray(d.current) ? d.current : []).slice(0, 12).map((r: any) => ({
      process: cut(r.process, 160), today: cut(r.today, 1000), problem: cut(r.problem, 1000),
      hours_month: Math.round(clamp(r.hours_month, 0, 2000) * 10) / 10, automation_pct: Math.round(clamp(r.automation_pct, 0, 100)),
    })).filter((r: any) => r.process),
    hourly_cost_minor: Math.round(clamp(d.hourly_cost_sek, 0, 5000)) * 100,
    removed_costs: (Array.isArray(d.removed_costs) ? d.removed_costs : []).slice(0, 10).map((c: any) => ({ label: cut(c.label, 160), monthly_minor: Math.round(clamp(c.monthly_sek, 0, 1e7)) * 100 })).filter((c: any) => c.label),
    goals: (Array.isArray(d.goals) ? d.goals : []).slice(0, 8).map((g: any) => ({ goal: cut(g.goal, 200), metric: cut(g.metric, 200), today: cut(g.today, 100), target: cut(g.target, 100) })).filter((g: any) => g.goal),
    phases: (Array.isArray(d.phases) ? d.phases : []).slice(0, 6).map((p: any) => ({ title: cut(p.title, 160), period: cut(p.period, 80), actions: cut(p.actions, 3000), effect: cut(p.effect, 600) })).filter((p: any) => p.title),
    assumptions: (Array.isArray(d.assumptions) ? d.assumptions : []).slice(0, 12).map((a: unknown) => cut(a, 400)).filter(Boolean),
    model: res.model,
  };
}
